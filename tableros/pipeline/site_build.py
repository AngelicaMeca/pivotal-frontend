"""Build de los tableros: specs + marts -> contenido que dibuja el sitio Next.js.

Lo corre el agente constructor-dashboards. Es la etapa `site` de pipeline/cli.py.

    specs/modelos/*.yaml  +  marts/*.parquet
              |
              v
    public/plataforma/data/<slug>.json           un JSON por vista, con TODOS los textos resueltos
    src/tableros/contenido/paginas/<ruta>.json   una pagina por ruta: lo que antes se volcaba en
                                                 un template Jinja ahora lo dibuja el sitio, con un
                                                 componente por template (src/tableros/paginas/)
    src/tableros/estilos/pivotal.css             CSS generado desde el theme
    public/plataforma/geo, iconos, logo          assets copiados
(rutas relativas a la raiz del sitio, pivotal-landing-front, que contiene a tableros/)

Desde septiembre de 2026 los tableros viven dentro del sitio institucional, bajo /plataforma
(decision de Francisco). Este archivo sigue componiendo TODO el contenido; el sitio solo lo
dibuja. /plataforma/tableros es la home, /plataforma/<seccion> el tablero de cada base y
/plataforma/<seccion>/<slug> cada vista.

Reglas que este archivo hace cumplir (si alguna falla, el build corta):
  - todo cuadro tiene titulo de protocolo completo y pie de fuente
  - el titulo generado con los defaults coincide con el `titulo_protocolo_ejemplo` del spec
  - el organismo del pie coincide con la columna `fuente` del mart
  - todo eje vertical tiene 5 marcas o mas
  - las vistas `sensibilidad: comparativo` sin `aprobado_por` van a _privado/ y no se enlazan

Determinismo: sin timestamps, sin locale, sin azar. Todo diccionario que va a JSON sale
ordenado y todo listado del disco se lee con sorted(). Dos corridas dan bytes identicos.
"""
import argparse
import hashlib
import itertools
import json
import os
import shutil
import sys

import duckdb
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from pipeline import hacienda as hac
from pipeline import precios as pc
from pipeline import presentacion as pr
from pipeline import stock as stk
from pipeline import vegetales as veg

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MODELOS = os.path.join(RAIZ, "specs", "modelos")
DIR_MARTS = os.path.join(RAIZ, "marts")
DIR_SITE = os.path.join(RAIZ, "site")
DIR_TEMPLATES = os.path.join(DIR_SITE, "templates")
DIR_ASSETS = os.path.join(DIR_SITE, "assets")
# El sitio Next.js que dibuja los tableros es la carpeta que contiene a tableros/
DIR_SITIO_WEB = os.path.dirname(RAIZ)
DIR_PUBLICO = os.path.join(DIR_SITIO_WEB, "public", "plataforma")
DIR_CONTENIDO = os.path.join(DIR_SITIO_WEB, "src", "tableros", "contenido")
DIR_ESTILOS = os.path.join(DIR_SITIO_WEB, "src", "tableros", "estilos")
# Lo que el build genera dentro de public/plataforma (todo, salvo lo que no genera el build)
GENERADOS_PUBLICOS = ("data", "geo", "iconos", "_privado")

# Donde quedan montados los tableros dentro del sitio. Toda URL que escribe este archivo lleva
# el prefijo, y ninguna termina en barra (el sitio no usa trailingSlash).
PREFIJO = "/plataforma"
INICIO = PREFIJO + "/tableros"          # la home de los tableros
GEOJSON = PREFIJO + "/geo/sde-departamentos.geojson"
DIR_CONFIGS = os.path.join(RAIZ, "configs")

MEDIDAS = ["sup_sembrada_ha", "sup_cosechada_ha", "produccion_tn", "rendimiento_kg_ha"]
UNIDAD = {"sup_sembrada_ha": "ha", "sup_cosechada_ha": "ha",
          "produccion_tn": "tn", "rendimiento_kg_ha": "kg/ha"}
ETIQUETA_COLUMNA = {"sup_sembrada_ha": "Sup. sembrada (ha)",
                    "sup_cosechada_ha": "Sup. cosechada (ha)",
                    "produccion_tn": "Producción (tn)",
                    "rendimiento_kg_ha": "Rendimiento (kg/ha)"}
ETIQUETA_VARIABLE = {"sup_sembrada_ha": "Superficie sembrada",
                     "sup_cosechada_ha": "Superficie cosechada",
                     "produccion_tn": "Producción",
                     "rendimiento_kg_ha": "Rendimiento"}
# Version corta para los toggles que van adentro de un panel del tablero, donde el rotulo
# largo le come el lugar al titulo del cuadro.
ETIQUETA_CORTA = {"sup_sembrada_ha": "Sembrada", "sup_cosechada_ha": "Cosechada",
                  "produccion_tn": "Prod.", "rendimiento_kg_ha": "Rend."}
NOMBRE_EJE = {"ha": "Hectáreas", "tn": "Toneladas", "kg/ha": "Kilos por hectárea", "%": "Porcentaje"}
ESTACIONES = {"verano": "Cultivos de verano", "invierno": "Cultivos de invierno",
              "todos": "Todos los cultivos"}

# Estados en los que un cero NO es un cero (ver _comunes-base-9.estados_sin_dato).
NO_APLICA = {
    "sin_datos": set(MEDIDAS),
    "sembrado_sin_cosechar": {"sup_cosechada_ha", "produccion_tn", "rendimiento_kg_ha"},
    "produccion_no_informada": {"produccion_tn", "rendimiento_kg_ha"},
    "ok": set(),
}
DISPLAY_ESTADO = {"sin_datos": "Sin datos", "sembrado_sin_cosechar": "Sembrado sin cosechar",
                  "produccion_no_informada": "Sin dato", "ok": None}


# ===========================================================================
# Carga de specs
# ===========================================================================
def cargar_specs():
    """Specs que este build sabe renderizar.

    `construir: false` es la compuerta entre los dos agentes: constructor-reglas escribe el
    spec (que es la regla de negocio ya traducida y verificada) y constructor-dashboards lo
    prende cuando implementa el render de esa familia. Sin la compuerta, escribir un spec
    nuevo rompe el build hasta que alguien escriba el HTML, y las dos tareas no siempre pasan
    el mismo dia.
    """
    crudos, diferidos = {}, []
    for nombre in sorted(os.listdir(DIR_MODELOS)):
        if not nombre.endswith(".yaml") or nombre.startswith("_"):
            continue
        spec = pr.cargar_yaml(os.path.join(DIR_MODELOS, nombre))
        if not isinstance(spec, dict) or ("tipo" not in spec and "igual_que" not in spec):
            continue
        if spec.get("construir") is False:
            diferidos.append(nombre[:-5])
            continue
        crudos[nombre[:-5]] = spec
    if diferidos:
        print("[site] %d spec(s) escritos y todavia sin render (construir: false): %s"
              % (len(diferidos), ", ".join(diferidos)))
    resueltos, cache = {}, {}
    for id_spec in sorted(crudos):
        resueltos[id_spec] = resolver_herencia(id_spec, crudos, cache)
    return resueltos


def combinar(padre, hijo):
    salida = dict(padre)
    for clave, valor in hijo.items():
        if isinstance(valor, dict) and isinstance(salida.get(clave), dict):
            salida[clave] = combinar(salida[clave], valor)
        else:
            salida[clave] = valor
    return salida


def resolver_herencia(id_spec, crudos, cache):
    """Orden del protocolo: comunes -> igual_que -> el propio spec."""
    if id_spec in cache:
        return cache[id_spec]
    spec = crudos[id_spec]
    base = {}
    if spec.get("igual_que"):
        padre = spec["igual_que"]
        if padre not in crudos:
            raise pr.ErrorDeProtocolo("%s hereda de %s, que no existe" % (id_spec, padre))
        base = resolver_herencia(padre, crudos, cache)
    resuelto = combinar(base, spec)
    resuelto["slug_vista"] = id_spec
    cache[id_spec] = resuelto
    return resuelto


# ===========================================================================
# Hechos (marts)
# ===========================================================================
SQL_HECHOS = """
    SELECT ambito, provincia, geo_id, nivel_geo, campania,
           cultivo, cultivo_grupo, cultivo_rol, medida, valor, fuente
    FROM read_parquet('%s')
    ORDER BY ambito, provincia, geo_id, campania, cultivo, medida
"""


class Hechos:
    def __init__(self, con):
        ruta = os.path.join(DIR_MARTS, "hecho_cultivos.parquet")
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/hecho_cultivos.parquet. Corre antes: make ingest && make marts")
        self.sde_depto, self.sde_prov = {}, {}
        self.comp_depto, self.pais = {}, {}
        self.fuentes = set()
        self.rol, self.grupo = {}, {}
        for fila in con.execute(SQL_HECHOS % ruta.replace("'", "''")).fetchall():
            (ambito, provincia, geo_id, nivel, campania, cultivo,
             grupo, rol, medida, valor, fuente) = fila
            self.fuentes.add(fuente)
            self.rol[cultivo] = rol
            self.grupo[cultivo] = grupo
            if ambito == "sde" and nivel == "departamento":
                destino = self.sde_depto.setdefault((geo_id, campania, cultivo), {})
            elif ambito == "sde" and nivel == "provincia":
                destino = self.sde_prov.setdefault((campania, cultivo), {})
            elif ambito == "comparativo":
                destino = self.comp_depto.setdefault((provincia, geo_id, campania, cultivo), {})
            elif ambito == "pais":
                destino = self.pais.setdefault((campania, cultivo), {})
            else:
                continue
            destino[medida] = valor

        self.nombre, self.deptos = {}, []
        for geo_id, nivel, nombre, provincia in con.execute(
                "SELECT geo_id, nivel_geo, nombre, provincia FROM read_parquet('%s') ORDER BY geo_id"
                % os.path.join(DIR_MARTS, "dim_geo.parquet")).fetchall():
            self.nombre[geo_id] = nombre
            if nivel == "departamento" and provincia == "sde":
                self.deptos.append(geo_id)
        self.orden_campania = {}
        for campania, orden in con.execute(
                "SELECT campania, orden FROM read_parquet('%s') ORDER BY orden"
                % os.path.join(DIR_MARTS, "dim_tiempo_campania.parquet")).fetchall():
            self.orden_campania[campania] = orden

        dim = pr.cargar_yaml(os.path.join(DIR_MODELOS, "dim-cultivos.yaml"))
        self.estacion = {c["cultivo"]: c["estacion"] for c in dim["cultivos"]}
        self.estacion_provisoria = {c["cultivo"] for c in dim["cultivos"] if c.get("a_confirmar")}

    # -- accesos ---------------------------------------------------------
    def medidas(self, geo, campania, cultivo):
        if geo == "provincia":
            return self.sde_prov.get((campania, cultivo))
        return self.sde_depto.get((geo, campania, cultivo))

    def nivel(self, geo):
        return "provincia" if geo == "provincia" else "departamento"


    def cultivo_para_titulo(self, cultivo):
        """Protocolo: rol agregado -> el grupo ('Soja total' -> 'Soja')."""
        if self.rol.get(cultivo) == "agregado":
            return self.grupo[cultivo]
        return cultivo


def estado_de(medidas):
    if not medidas:
        return "sin_datos"
    sembrada = medidas.get("sup_sembrada_ha") or 0.0
    cosechada = medidas.get("sup_cosechada_ha") or 0.0
    produccion = medidas.get("produccion_tn") or 0.0
    if sembrada <= 0 and cosechada <= 0 and produccion <= 0:
        return "sin_datos"
    if sembrada > 0 and cosechada == 0:
        return "sembrado_sin_cosechar"
    if cosechada > 0 and produccion == 0:
        return "produccion_no_informada"
    return "ok"


def valor_util(medidas, medida):
    """Devuelve (valor, estado). valor None = no se puede mostrar ni promediar."""
    estado = estado_de(medidas)
    if medida in NO_APLICA[estado]:
        return None, estado
    return medidas.get(medida), estado


# ===========================================================================
# Contexto de presentacion
# ===========================================================================
class Contexto:
    def __init__(self, hechos):
        self.protocolo = pr.cargar_protocolo()
        self.comunes = pr.cargar_comunes(9)
        self.theme = pr.cargar_theme()
        self.navegacion = pr.cargar_yaml(os.path.join(DIR_SITE, "navegacion.yaml"))
        self.hechos = hechos
        self.precision = pr.Precision(self.comunes)
        self.colores = pr.Colores(self.protocolo, self.comunes, self.theme)
        self.titulador = pr.Titulador(self.protocolo, self.comunes, 9)
        ventana = self.comunes["ventana_campanias"]
        self.ventana = list(ventana["resueltas_2026_07_30"])
        self.campania_defecto = ventana["campania_por_defecto"]
        self.ventanas = {"ventana_campanias": self.ventana}
        self.notas = self.comunes["notas_metodologicas"]
        self.color_cultivo = self.colores.por_categoria(sorted(hechos.rol))
        self.departamento_defecto = departamento_de_mayor_produccion(self)
        # Asignacion icono -> cultivo (site/iconos-cultivo.yaml, habilitada el 10-ago-2026).
        # Un cultivo puede declarar null (sin icono, ej. Lenteja); uno AUSENTE es un error:
        # obliga a decidir el icono de cada cultivo nuevo en vez de dejarlo caer en silencio.
        self.iconos_cultivo = pr.cargar_yaml(
            os.path.join(DIR_SITE, "iconos-cultivo.yaml"))["cultivos"]

    # -- textos ---------------------------------------------------------
    def pie(self, spec):
        esperado = (spec.get("fuente") or {}).get("organismo_esperado")
        reales = sorted(self.hechos.fuentes)
        if esperado and reales != [esperado]:
            raise pr.ErrorDeProtocolo(
                "%s espera fuente %r y el mart trae %r" % (spec["slug_vista"], esperado, reales))
        publicacion = (spec.get("fuente") or {}).get("publicacion")
        # Forma literal del mockup de JC para la base 9 (tercera tanda del 10-ago-2026):
        # "Fuente: MAGyP (Ministerio de Agricultura, Ganadería y Pesca)". La declara el
        # protocolo (pie_de_fuente.aclaracion_base_9; backlog 14, respondida) y solo aplica
        # cuando el organismo del mart es exactamente MAGyP: SENASA y las demas no cambian.
        aclaracion = self.protocolo["pie_de_fuente"]["publicacion"].get("aclaracion_base_9")
        if aclaracion and reales == ["MAGyP"] and not publicacion:
            return (aclaracion["plantilla"]
                    .replace("{organismo}", "MAGyP")
                    .replace("{aclaracion}", aclaracion["texto"]))
        return pr.pie_de_fuente(self.protocolo, reales, publicacion)

    def subtitulo_unidad(self, unidad):
        return pr.subtitulo_por_unidad(self.protocolo, unidad)

    def eje(self, valores, unidad, decimales=0, sufijo=""):
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje(min(limpios + [0.0]), max(limpios + [0.0]))
        return self._con_etiquetas(marcas, unidad, decimales, sufijo)

    def _con_etiquetas(self, marcas, unidad, decimales, sufijo):
        etiquetas = {clave_js(m): pr.fmt_numero(m, decimales) + sufijo for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": NOMBRE_EJE[unidad]}

    def eje_secundario(self, valores, unidad, intervalos):
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje_secundario(min(limpios + [0.0]), max(limpios + [0.0]), intervalos)
        return self._con_etiquetas(marcas, unidad, 0, "")

    def titulo(self, spec, valores, campanias=None, tipo=None, grafico=None):
        return self.titulador.componer(
            spec, valores, self.hechos.nombre, campanias_efectivas=campanias,
            ventanas=self.ventanas, tipo=tipo, grafico=grafico)

    def notas_de(self, spec, extra=()):
        ids = list(spec.get("notas_metodologicas") or []) + list(extra)
        vistas, salida = set(), []
        for nota_id in ids:
            if nota_id in vistas or nota_id not in self.notas:
                continue
            vistas.add(nota_id)
            nota = self.notas[nota_id]
            salida.append({"titulo": nota["titulo"], "texto": " ".join(nota["texto"].split())})
        return salida


def clave_js(valor):
    """Misma representacion que String(n) en el navegador, para poder indexar por el valor."""
    numero = float(valor)
    return str(int(numero)) if numero.is_integer() else repr(numero)


def limpiar(texto):
    return " ".join(str(texto).split())


# ===========================================================================
# Opciones de filtros
# ===========================================================================
def cultivos_con_datos(ctx, roles=("agregado", "simple"), en_departamento=True):
    """TODOS los cultivos de la fuente con datos en la ventana. Es la lista de los AGREGADOS
    (total "fina y gruesa", anillo de participacion y su "Resto", ranking total): del calculo
    no se oculta ningun dato. Para lo que se DIBUJA por cultivo, ver cultivos_visibles."""
    hechos = ctx.hechos
    encontrados = set()
    fuente = hechos.sde_depto if en_departamento else hechos.sde_prov
    for clave in fuente:
        cultivo = clave[-1]
        campania = clave[-2]
        if campania in ctx.ventana and hechos.rol.get(cultivo) in roles:
            encontrados.add(cultivo)
    return sorted(encontrados, key=pr.clave_alfabetica)


# Aviso unico por build de los cultivos con datos que quedan fuera del catalogo de JC.
_FUERA_DE_CATALOGO_AVISADOS = set()


def cultivos_visibles(ctx, roles=("agregado", "simple"), en_departamento=True):
    """Catalogo de JC ∩ con datos en la ventana (formato_v1.selectores.cultivo.universo_visible).

    Es el universo de lo ELEGIBLE y lo DIBUJADO por cultivo: chips del selector, series
    individuales, filas y porciones con nombre propio. Un cultivo con datos pero sin icono
    asignado en site/iconos-cultivo.yaml (null o ausente; hoy Lenteja y Alpiste) NO se dibuja,
    y no es un error: sus datos siguen adentro de los agregados (cultivos_con_datos). Alta:
    JC manda el icono y se agrega al catalogo (backlog 37). Correccion de Facu, 10-ago-2026:
    "Los datos que NO ESTAN no se ponen en los graficos, ej. la lenteja".
    """
    con_datos = cultivos_con_datos(ctx, roles, en_departamento)
    visibles = [c for c in con_datos if ctx.iconos_cultivo.get(c)]
    for cultivo in con_datos:
        if cultivo not in visibles and cultivo not in _FUERA_DE_CATALOGO_AVISADOS:
            _FUERA_DE_CATALOGO_AVISADOS.add(cultivo)
            print("[site] %r tiene datos pero esta fuera del catalogo de JC "
                  "(site/iconos-cultivo.yaml): sin chip ni serie propia; "
                  "sus datos siguen en los agregados." % cultivo)
    return visibles


def opciones(valores, etiquetas=None):
    return [{"v": v, "t": (etiquetas or {}).get(v, v)} for v in valores]


# Iconos que el sitio realmente usa: se llenan al armar los filtros y escribir_sitio escribe
# SOLO estos en public/plataforma/iconos/ del sitio.
# Es un set de pares (variante, nombre); ordenado al escribir, para determinismo.
_ICONOS_USADOS = set()

# Que color toma el trazo del icono en cada variante. Sale del theme: el icono acompaña al
# texto que tiene al lado (marron sobre la caja clara, cocoa sobre el chip elegido).
COLOR_ICONO = {"bn": "texto_apoyo", "color": "texto"}


def ruta_icono(variante, nombre):
    """Ruta publica del icono, verificando que el dibujo exista en site/assets/iconos/trazo/."""
    origen = os.path.join(DIR_ASSETS, "iconos", "trazo", nombre + ".svg")
    if not os.path.exists(origen):
        raise pr.ErrorDeProtocolo(
            "No hay dibujo para el icono %r (falta site/assets/iconos/trazo/%s.svg). "
            "Revisar site/iconos-cultivo.yaml." % (nombre, nombre))
    if variante not in COLOR_ICONO:
        raise pr.ErrorDeProtocolo("Variante de icono desconocida: %r" % variante)
    _ICONOS_USADOS.add((variante, nombre))
    return "%s/iconos/%s/%s.svg" % (PREFIJO, variante, nombre)


# Acciones que el sitio sabe hacer desde el panel de UTILIDADES y desde el pie de cada cuadro
# (las engancha src/tableros/cliente/comun.js). Un spec que declare otra cosa es un error de
# protocolo: la regla es que no se dibujan botones que no hacen nada.
#   exportar-pdf  imprime el tablero entero con la seleccion vigente (el PDF lo arma el navegador)
#   zoom          abre ESE cuadro a pantalla completa, con sus controles en grande
ACCIONES_UTILIDAD = ("exportar-pdf", "zoom")


def item_utilidad(item):
    """Un item del panel UTILIDADES, con su icono resuelto.

    El item que declara `accion` se dibuja como boton de verdad; el que no la declara sigue
    deshabilitado con "Proximamente" (excepcion acotada del backlog 33, hoy solo el Asistente
    IA). El nombre de la accion se valida aca para que un spec no pueda pedir un boton que el
    cliente no sabe atender.
    """
    accion = item.get("accion")
    if accion is not None and accion not in ACCIONES_UTILIDAD:
        raise pr.ErrorDeProtocolo(
            "La utilidad %r declara la accion %r, que el sitio no sabe hacer. "
            "Acciones disponibles: %s" % (item["id"], accion, ", ".join(ACCIONES_UTILIDAD)))
    return dict(item, icono=ruta_icono("color", item["icono"]))


# Paneles que NO llevan el pie de acciones aunque el tablero lo declare: los estaticos, que
# no son cuadros de datos (la tira de utilidades y la lista de informacion relacionada).
PANELES_SIN_PIE_DE_ACCIONES = ("utilidades", "informacion-relacionada")


def accion_de_cuadro(item, destino, url_de, slug_tablero, id_panel):
    """Un item del pie de un cuadro: "Más información →" o "Generar PDF".

    Es la tira que JC dibuja al pie de cada cuadro de la maqueta "Agri 2" (celdas H54/AX54 y
    BF32/AA54/BF54) y que Francisco fijo como regla del tablero el 23-sep-2026, en lugar de
    un panel de utilidades unico al final.

    Dos formas, igual que en el panel UTILIDADES:
      - con `accion`, es un boton de verdad y la engancha comun.js por su data-utilidad;
      - con `destino`, es un link a una vista publicada;
      - sin ninguna de las dos, queda deshabilitado con "Próximamente". Nunca se dibuja un
        boton que no hace nada sin decirlo.
    """
    accion = item.get("accion")
    if accion is not None and accion not in ACCIONES_UTILIDAD:
        raise pr.ErrorDeProtocolo(
            "El pie del panel %s del tablero %s pide la accion %r, que el sitio no sabe "
            "hacer. Acciones disponibles: %s"
            % (id_panel, slug_tablero, accion, ", ".join(ACCIONES_UTILIDAD)))
    if destino is not None and destino not in url_de:
        raise pr.ErrorDeProtocolo(
            "El 'Más información' del panel %s del tablero %s apunta a la vista %s, que no "
            "esta en ninguna seccion de site/navegacion.yaml"
            % (id_panel, slug_tablero, destino))
    salida = {"id": item["id"], "etiqueta": item["etiqueta"],
              "flecha": bool(item.get("flecha")),
              "href": url_de[destino] if destino else None,
              "accion": accion,
              "rotulo": item.get("rotulo", "Próximamente")}
    if item.get("icono"):
        salida["icono"] = ruta_icono("color", item["icono"])
    return salida


# ---------------------------------------------------------------------------
# CRUZAR DATOS: la comparacion del zoom (Francisco, 24-sep-2026)
# ---------------------------------------------------------------------------
# Francisco eligio DOS formas de cruce y descarto la tercera (unir bases distintas):
#   - dos valores del mismo filtro (dos cultivos, dos productos, dos anios);
#   - dos medidas de la misma base, con dos ejes si no comparten unidad.
#
# Va ADENTRO DEL ZOOM y en ningun otro lado: el tablero es la maqueta literal de JC -cuatro
# cuadros, una pantalla- y meterle selectores de comparacion rompe justo lo que el pidio que
# se respetara. Al cerrar el zoom la comparacion se apaga.
#
# Solo la ofrecen las formas de SERIE TEMPORAL, que son las unicas donde una segunda serie se
# lee sin mentir. En el mapa no (un mapa no admite dos cultivos encima), en el anillo tampoco
# (dos anillos superpuestos no son nada), en el ranking tampoco (dos ordenes distintos en la
# misma tabla) y en las barras apiladas tampoco: el alto de la pila es un total, y dos totales
# encimados dejan de poder leerse. El cuadro de precios del MCBA queda afuera por payload, y
# esta escrito en su spec.
FORMAS_QUE_COMPARAN = ("tendencia", "combo")


def opciones_de_comparacion(filtro):
    """Las opciones del filtro que se compara, sin el cromo que no hace falta en un <select>.

    No se duplica ningun catalogo: son las mismas opciones que ya viajan en el filtro. La que
    este puesta en el tablero la esconde el navegador (comparar un valor consigo mismo son dos
    lineas identicas), y por eso la lista viaja entera.
    """
    return [{"v": opcion["v"], "t": opcion["t"]} for opcion in filtro["opciones"]]


def bloque_comparacion(definicion, filtros, id_panel, slug):
    """El bloque `comparacion` de un panel para el JSON de la pagina, o None si no compara.

    Todos los textos salen del spec. Las plantillas llevan slots que sustituye el navegador
    ({valor} y {medida} para la leyenda, {titulo} y {otro} para el titulo, {nota} y {otra}
    para el pie): el sitio no compone frases, solo reemplaza.
    """
    declarada = definicion.get("comparacion")
    if not declarada:
        return None
    forma = definicion.get("forma", id_panel)
    if forma not in FORMAS_QUE_COMPARAN:
        raise pr.ErrorDeProtocolo(
            "El panel %s del tablero %s declara comparacion y su forma es %r. Solo comparan "
            "las formas de serie temporal %s: en las demas una segunda serie no se lee sin "
            "mentir" % (id_panel, slug, forma, ", ".join(FORMAS_QUE_COMPARAN)))
    filtro = next((f for f in filtros if f["id"] == declarada["filtro"]), None)
    if filtro is None:
        raise pr.ErrorDeProtocolo(
            "El panel %s del tablero %s compara por el filtro %r, que el tablero no tiene"
            % (id_panel, slug, declarada["filtro"]))
    medidas = declarada.get("medidas")
    return {
        "filtro": filtro["id"],
        "rotulo": declarada["rotulo"],
        "ninguno": declarada["ninguno"],
        "opciones": opciones_de_comparacion(filtro),
        "plantilla_serie": declarada["plantilla_serie"],
        "plantilla_titulo": declarada["plantilla_titulo"],
        "plantilla_titulo_medida": declarada["plantilla_titulo_medida"],
        "plantilla_nota": declarada["plantilla_nota"],
        "nota": limpiar(declarada["nota"]),
        "medidas": {"rotulo": medidas["rotulo"], "ninguna": medidas["ninguna"],
                    "opciones": [{"v": o["v"], "t": o["t"]} for o in medidas["opciones"]]}
                   if medidas else None,
    }


def medida_extra(ctx, medida, nombre, puntos, textos, eje=None, eje2=None):
    """Una serie de SEGUNDA MEDIDA para un cuadro que la ofrece en el zoom.

    `eje` reemplaza a la escala principal del cuadro (cuando la medida comparte unidad con lo
    que ya esta dibujado y las dos entran en un eje) y `eje2` es una escala nueva a la derecha
    (cuando no la comparte). Va una de las dos y nunca las dos: es la regla 3 de JC, "si
    comparten unidad, un solo eje; si no, dos ejes con su unidad rotulada".
    """
    return {"id": medida, "nombre": nombre,
            "color": ctx.colores.solido(medida), "color_comp": ctx.colores.comparacion(medida),
            "puntos": puntos, "textos": textos, "eje": eje, "eje2": eje2}


def filtros_por_panel(filtros):
    """Que filtro se dibuja dentro de que panel del tablero.

    Un filtro de zona `panel` puede declarar UN panel (`panel`, el caso de siempre: el toggle
    de variable del mapa) o VARIOS (`paneles`, cada uno con sus propias etiquetas). El segundo
    caso es el de la maqueta "Agri 2": el producto se dibuja dos veces, rotulado "DTV Cebolla"
    en el cuadro de DTV y "Cebolla" en el de estimaciones, y es UN SOLO filtro. La clave de la
    combinacion lo nombra una sola vez y comun.js mantiene los dos dibujos en sincronia.
    """
    salida = {}
    for filtro in filtros:
        if filtro.get("zona") != "panel":
            continue
        if filtro.get("paneles"):
            for destino in filtro["paneles"]:
                copia = {clave: valor for clave, valor in filtro.items() if clave != "paneles"}
                copia["panel"] = destino["panel"]
                copia["opciones"] = destino["opciones"]
                salida[destino["panel"]] = copia
        else:
            salida[filtro["panel"]] = filtro
    return salida


def iconos_de_cultivo(ctx, cultivo):
    """Par (bn, color) de rutas publicas del icono del cultivo, o (None, None) si no tiene.

    La asignacion vive en site/iconos-cultivo.yaml (decision del 10-ago-2026, backlog 26).
    Un cultivo sin icono (null o ausente) NO es un error: queda fuera del universo visible
    (cultivos_visibles) y no llega a dibujarse. El unico error que corta el build es un
    cultivo DEL catalogo cuyo archivo de icono falta (lo verifica ruta_icono).
    """
    nombre = ctx.iconos_cultivo.get(cultivo)
    if not nombre:
        return None, None
    return ruta_icono("bn", nombre), ruta_icono("color", nombre)


def con_iconos_de_cultivo(ctx, lista_opciones):
    """Anota cada opcion de un filtro de cultivo con sus dos variantes de icono.

    B&W en reposo y color en el seleccionado: asi se ve en la captura del 10-ago; el cambio
    lo hace el CSS, aca solo viajan las dos rutas.
    """
    for opcion in lista_opciones:
        if opcion["v"] == TODOS:
            continue
        bn, color = iconos_de_cultivo(ctx, opcion["v"])
        if bn:
            opcion["icono"], opcion["icono_color"] = bn, color
    return lista_opciones


def filtro_cultivo(ctx, cultivos, defecto):
    return {"id": "cultivo", "etiqueta": "Cultivo",
            "opciones": con_iconos_de_cultivo(ctx, opciones(cultivos)), "defecto": defecto}


def filtro_campania(ctx):
    """El periodo vive en la barra verde de la cabecera (zona `periodo`) y en chips cortos.

    `corto` es el rotulo del chip: "24/25" en vez de "2024/25". Entran las diez campañas de la
    ventana en una fila sin apretarlas, que es como esta en el mockup.
    """
    return {"id": "campania", "etiqueta": "Campaña", "zona": "periodo",
            "opciones": [{"v": c, "t": c, "corto": c[2:4] + "/" + c[5:7]} for c in ctx.ventana],
            "defecto": ctx.campania_defecto}


def filtro_variable(ctx, variables):
    return {"id": "variable", "etiqueta": "Variable",
            "opciones": opciones(variables, ETIQUETA_VARIABLE), "defecto": variables[0]}


def filtro_geo(ctx):
    valores = ["provincia"] + ctx.hechos.deptos
    etiquetas = {"provincia": "Total provincia"}
    for geo in ctx.hechos.deptos:
        etiquetas[geo] = ctx.hechos.nombre[geo]
    return {"id": "geo", "etiqueta": "Ámbito", "opciones": opciones(valores, etiquetas),
            "defecto": "provincia"}


def filtro_departamento(ctx):
    etiquetas = {geo: ctx.hechos.nombre[geo] for geo in ctx.hechos.deptos}
    return {"id": "departamento", "etiqueta": "Departamento",
            "opciones": opciones(ctx.hechos.deptos, etiquetas),
            "defecto": ctx.departamento_defecto}


def departamento_de_mayor_produccion(ctx):
    """Default de las vistas por departamento: el de mas produccion de la ultima campaña.

    Se calcula, no se hardcodea: si cambia el dato, cambia el default. Cualquier otro criterio
    (el primero alfabetico) abriria la pagina en un departamento sin interes.
    """
    hechos = ctx.hechos
    totales = []
    for geo in hechos.deptos:
        suma = 0.0
        for (otro, campania, cultivo), medidas in hechos.sde_depto.items():
            if otro != geo or campania != ctx.campania_defecto:
                continue
            if hechos.rol.get(cultivo) not in ("agregado", "simple"):
                continue
            valor, _ = valor_util(medidas, "produccion_tn")
            suma += valor or 0.0
        totales.append((geo, hechos.nombre[geo], suma))
    return ordenar_desc(totales)[0][0]


def filtro_estacion(ctx, valores):
    return {"id": "estacion", "etiqueta": "Temporada",
            "opciones": opciones(valores, ESTACIONES), "defecto": valores[0]}


# ===========================================================================
# Calculos reutilizables
# ===========================================================================
def serie_por_campania(ctx, geo, cultivo, medida, campanias):
    valores, estados = [], []
    for campania in campanias:
        medidas = ctx.hechos.medidas(geo, campania, cultivo)
        valor, estado = valor_util(medidas, medida)
        valores.append(valor)
        estados.append(estado)
    return valores, estados


def extremos(valores):
    """Primer y ultimo valor no nulo, con la distancia en intervalos entre ellos."""
    indices = [i for i, v in enumerate(valores) if v is not None]
    if len(indices) < 2:
        return None
    primero, ultimo = indices[0], indices[-1]
    return valores[primero], valores[ultimo], ultimo - primero


def variacion_total(valores):
    datos = extremos(valores)
    if not datos or datos[0] == 0:
        return None
    return datos[1] / datos[0] - 1


def variacion_anual_promedio(valores):
    datos = extremos(valores)
    if not datos or datos[0] <= 0 or datos[1] <= 0 or datos[2] == 0:
        return None
    return (datos[1] / datos[0]) ** (1.0 / datos[2]) - 1


def texto_variacion(valor):
    if valor is None:
        return "S/D"
    return pr.fmt_pct(valor * 100, 1, signo=True)




def puestos(pares):
    """pares: [(clave, valor)] ya ordenados desc. Competition ranking: empate = mismo puesto."""
    salida, anterior, puesto = {}, None, 0
    for i, (clave, valor) in enumerate(pares, start=1):
        if valor != anterior:
            puesto = i
            anterior = valor
        salida[clave] = puesto
    return salida


def ordenar_desc(items):
    """items: [(clave, nombre, valor)]. Desempata por nombre para que sea deterministico."""
    return sorted(items, key=lambda t: (-t[2], pr.clave_alfabetica(t[1])))


# ===========================================================================
# VISTAS
# ===========================================================================
def url_de_vista(ctx, slug, consulta=""):
    """URL absoluta de la pagina de una vista, con la consulta pegada al final.

    Las fichas que abre el clic en el mapa eran relativas ("x.html?departamento="). Se
    escriben absolutas (con el prefijo del sitio), buscando la seccion en site/navegacion.yaml.
    """
    for seccion in ctx.navegacion["secciones"]:
        slugs = [v for g in seccion["grupos"] for v in g["vistas"]]
        slugs += seccion.get("vistas_sueltas") or []
        if slug in slugs:
            return "%s/%s/%s%s" % (PREFIJO, seccion["url"], slug, consulta)
    if slug in ctx.navegacion["privadas"]["vistas"]:
        return "%s/_privado/%s%s" % (PREFIJO, slug, consulta)
    raise pr.ErrorDeProtocolo(
        "La vista %s no esta en ninguna seccion de site/navegacion.yaml" % slug)


def vista_base(ctx, spec, template, filtros, notas_extra=()):
    return {
        "slug": spec["slug_vista"],
        "tipo": spec["tipo"],
        "template": template,
        "titulo": spec["titulo"],
        "subtitulo_pagina": limpiar(spec["subtitulo"]),
        "filtros": filtros,
        "combos": {},
        "notas": ctx.notas_de(spec, notas_extra),
        "advertencias": [],
        "enlaces": [],
        "publicable": spec.get("publicable", True) is not False,
        "motivo_reserva": None,
        "spec": spec,
    }


def clave_de(vista, valores):
    return "|".join(str(valores[f["id"]]) for f in vista["filtros"])


def defaults_de(vista):
    return {f["id"]: f["defecto"] for f in vista["filtros"]}


# --------------------------------------------------------------------------
# 09-cultivo-mapa-sup-sembrada  (mapa + ranking vinculado)
# --------------------------------------------------------------------------
def construir_mapa(ctx, spec):
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    variables = spec["variables"]
    vista = vista_base(ctx, spec, "mapa.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
        filtro_campania(ctx),
        filtro_variable(ctx, variables),
    ])
    vista["particion"] = "cultivo"      # 600 combinaciones: el JSON se parte por cultivo
    vista["enlaces"] = [
        {"texto": "Ver todas las campañas", "href": "09-cultivo-evolucion-sup-sembrada.html"},
        {"texto": "Ranking completo", "href": "09-ranking-cultivo-produccion.html"},
    ]
    pie = ctx.pie(spec)
    advertencia = limpiar(ctx.protocolo["mapa"]["escala"]["advertencia_obligatoria_en_pantalla"]["texto"])
    geojson = GEOJSON

    nombres_mapa = dict(hechos.nombre)
    for geo_id, nombre in nombres_extra_geojson().items():
        nombres_mapa.setdefault(geo_id, nombre)
    todos_los_deptos = sorted(nombres_mapa_solo_deptos(nombres_mapa))

    for cultivo in cultivos:
        etiqueta_cultivo = hechos.cultivo_para_titulo(cultivo)
        for campania in ctx.ventana:
            for variable in variables:
                valores_filtro = {"cultivo": cultivo, "campania": campania, "variable": variable,
                                  "cultivo_para_titulo": etiqueta_cultivo}
                deptos, con_dato = [], []
                for geo in todos_los_deptos:
                    medidas = hechos.medidas(geo, campania, cultivo)
                    valor, estado = valor_util(medidas, variable)
                    fila = {"id": geo, "nombre": nombres_mapa[geo], "estado": estado, "v": valor}
                    fila["tooltip"] = tooltip_departamento(ctx, medidas)
                    deptos.append(fila)
                    if valor is not None:
                        con_dato.append((geo, nombres_mapa[geo], valor))
                if not con_dato:
                    continue
                escala = pr.quintiles([v for _, _, v in con_dato])
                rampa = ctx.colores.rampa(variable)
                for fila in deptos:
                    if fila["v"] is None:
                        fila["color"] = ctx.colores.sin_dato
                        fila["borde"] = ctx.protocolo["mapa"]["sin_dato"]["borde"]
                    else:
                        clase = pr.clase_de(fila["v"], escala["cortes"])
                        fila["color"] = rampa[min(clase, len(rampa)) - 1]

                ordenados = ordenar_desc(con_dato)
                puesto_de = puestos([(g, v) for g, _, v in ordenados])
                total_medidas = hechos.sde_prov.get((campania, cultivo)) or {}
                total_valor, _ = valor_util(total_medidas, variable)

                elemento_mapa = {
                    "clase": "mapa",
                    "titulo": ctx.titulo(spec, valores_filtro),
                    "subtitulo": ctx.subtitulo_unidad(UNIDAD[variable]),
                    "unidad": UNIDAD[variable],
                    "pie": pie,
                    "geojson": geojson,
                    "aspecto": aspecto_mapa(), "relacion": relacion_mapa(),
                    "advertencia": advertencia,
                    "deptos": [{"id": f["id"], "nombre": f["nombre"], "v": f["v"],
                                "color": f["color"], "borde": f.get("borde"),
                                "tooltip": f["tooltip"]} for f in deptos],
                    "leyenda": leyenda_mapa(ctx, deptos, escala, variable, rampa),
                    # JC f16: al hacer clic en un departamento se abre su ficha.
                    "ficha": url_de_vista(ctx, "09-departamento-ficha-cultivos",
                                          "?departamento="),
                    "total": ("Total de la provincia: %s %s"
                              % (ctx.precision.texto(total_valor, variable, "provincia"),
                                 UNIDAD[variable])) if total_valor is not None
                             else "Total de la provincia: sin dato informado",
                }
                filas_tabla = []
                for geo, nombre, valor in ordenados:
                    filas_tabla.append({
                        "id": geo,
                        "celdas": ["%d°" % puesto_de[geo], nombre,
                                   ctx.precision.texto(valor, variable, "departamento"),
                                   participacion_texto(valor, total_valor)],
                    })
                sin_dato = [f["nombre"] for f in deptos if f["v"] is None]
                elemento_tabla = {
                    "clase": "tabla",
                    "titulo": ctx.titulo(spec, valores_filtro, tipo="ranking", grafico=None),
                    "subtitulo": ctx.subtitulo_unidad(UNIDAD[variable]),
                    "unidad": UNIDAD[variable],
                    "pie": pie,
                    "columnas": [{"etiqueta": "Puesto", "num": False},
                                 {"etiqueta": "Departamento", "num": False},
                                 {"etiqueta": ETIQUETA_COLUMNA[variable], "num": True},
                                 {"etiqueta": "% de la provincia", "num": True}],
                    "filas": filas_tabla,
                    "nota": nota_sin_dato(sin_dato),
                }
                clave = "|".join([cultivo, campania, variable])
                vista["combos"][clave] = {"elementos": [elemento_mapa, elemento_tabla]}
    return vista


def nombres_extra_geojson():
    """Departamentos que estan en el mapa pero no en dim_geo (no tienen ni una fila de datos).

    Hoy es SALAVINA. Se dibuja igual, en gris: un hueco en el mapa se lee como un error de la
    provincia y no como ausencia de dato. El nombre se toma del GeoJSON del IGN y se escribe con
    el mismo criterio que dim_geo (mayusculas, sin tildes).
    """
    ruta = os.path.join(DIR_CONFIGS, "dims", "sde-departamentos.geojson")
    with open(ruta, encoding="utf-8") as f:
        geo = json.load(f)
    salida = {}
    for feature in geo["features"]:
        propiedades = feature["properties"]
        salida[propiedades["geo_id"]] = sin_tildes_mayuscula(propiedades["nombre"])
    return salida


def sin_tildes_mayuscula(texto):
    import unicodedata
    plano = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in plano if not unicodedata.combining(c)).upper()


_ASPECTO_MAPA = None
_RELACION_MAPA = None
_EXTREMOS_GEOJSON = None


def _extremos_geojson():
    """(min_lon, max_lon), (min_lat, max_lat) del GeoJSON de la provincia."""
    global _EXTREMOS_GEOJSON
    if _EXTREMOS_GEOJSON is None:
        ruta = os.path.join(DIR_CONFIGS, "dims", "sde-departamentos.geojson")
        with open(ruta, encoding="utf-8") as f:
            geo = json.load(f)
        lons, lats = [], []

        def juntar(coordenadas):
            if isinstance(coordenadas[0], (int, float)):
                lons.append(coordenadas[0])
                lats.append(coordenadas[1])
            else:
                for parte in coordenadas:
                    juntar(parte)

        for feature in geo["features"]:
            juntar(feature["geometry"]["coordinates"])
        _EXTREMOS_GEOJSON = ((min(lons), max(lons)), (min(lats), max(lats)))
    return _EXTREMOS_GEOJSON


def aspecto_mapa():
    """Factor de aspecto para que el mapa se dibuje con la proporcion geografica correcta
    (JC, tercera tanda: "El mapa es una miniatura y está deformado").

    Es el coseno de la latitud media de la provincia, calculado del propio GeoJSON (nada
    hardcodeado a SDE): a esa latitud, un grado de longitud mide cos(lat) de lo que mide un
    grado de latitud, y ese es el `aspectScale` que ECharts necesita para no achatar el mapa
    (su default, 0.75, es una aproximacion generica).
    """
    global _ASPECTO_MAPA
    if _ASPECTO_MAPA is None:
        import math
        _, (lat_min, lat_max) = _extremos_geojson()
        _ASPECTO_MAPA = round(math.cos(math.radians((lat_min + lat_max) / 2.0)), 3)
    return _ASPECTO_MAPA


def relacion_mapa():
    """Relacion ancho/alto del mapa dibujado (km/km), para que ocupe todo el panel sin deformarse.

    Es (delta de longitud x coseno de la latitud media) / delta de latitud, del propio GeoJSON.
    La usa el JS para pedirle a ECharts el tamaño exacto que entra en la caja: con el default,
    el mapa se dibujaba bastante mas chico que su panel.
    """
    global _RELACION_MAPA
    if _RELACION_MAPA is None:
        lons, lats = _extremos_geojson()
        ancho = (lons[1] - lons[0]) * aspecto_mapa()
        alto = lats[1] - lats[0]
        _RELACION_MAPA = round(ancho / alto, 3)
    return _RELACION_MAPA


def nombres_mapa_solo_deptos(nombres):
    return [g for g in nombres if len(g) == 5 and g.startswith("86")]


def tooltip_departamento(ctx, medidas):
    filas = []
    for medida in MEDIDAS:
        valor, estado = valor_util(medidas, medida)
        if valor is None:
            filas.append([ETIQUETA_COLUMNA[medida], DISPLAY_ESTADO[estado] or "S/D"])
        else:
            filas.append([ETIQUETA_COLUMNA[medida],
                          ctx.precision.texto(valor, medida, "departamento")])
    return filas


def leyenda_mapa(ctx, deptos, escala, variable, rampa):
    """Color, minimo y maximo de cada subescala, de la clase mas alta a la mas baja.

    Se muestran el menor y el mayor de los departamentos QUE ESTAN en la clase, no los puntos
    de corte. Si el redondeo de pantalla hace que una clase termine donde empieza la de arriba,
    esas dos se muestran sin redondear: una leyenda donde 26.200 es el techo de una clase y el
    piso de la siguiente se lee como un error.
    """
    plantilla = ctx.protocolo["mapa"]["leyenda"]["plantilla_de_clase"]
    por_clase = {}
    for fila in deptos:
        if fila["v"] is None:
            continue
        por_clase.setdefault(pr.clase_de(fila["v"], escala["cortes"]), []).append(fila["v"])

    clases = []
    for clase in sorted(por_clase, reverse=True):
        crudos = sorted(por_clase[clase])
        clases.append({
            "color": rampa[min(clase, len(rampa)) - 1],
            "conteo": "(%d)" % len(crudos),
            "crudo_desde": crudos[0], "crudo_hasta": crudos[-1],
            "redondear": True,
        })
    for arriba, abajo in zip(clases, clases[1:]):
        techo_de_abajo = ctx.precision.valor(abajo["crudo_hasta"], variable, "departamento")
        piso_de_arriba = ctx.precision.valor(arriba["crudo_desde"], variable, "departamento")
        if techo_de_abajo == piso_de_arriba:
            arriba["redondear"] = abajo["redondear"] = False
    for clase in clases:
        if clase["redondear"]:
            desde = ctx.precision.valor(clase["crudo_desde"], variable, "departamento")
            hasta = ctx.precision.valor(clase["crudo_hasta"], variable, "departamento")
        else:
            desde, hasta = clase["crudo_desde"], clase["crudo_hasta"]
        clase["texto"] = (plantilla.replace("{minimo}", pr.fmt_numero(desde))
                                   .replace("{maximo}", pr.fmt_numero(hasta)))
        for interno in ("crudo_desde", "crudo_hasta", "redondear"):
            clase.pop(interno)

    sin_dato = [f for f in deptos if f["v"] is None]
    if sin_dato:
        clases.append({"color": ctx.colores.sin_dato,
                       "texto": ctx.protocolo["mapa"]["sin_dato"]["etiqueta_en_leyenda"],
                       "conteo": "(%d)" % len(sin_dato)})
    return {"encabezado": NOMBRE_EJE[UNIDAD[variable]], "clases": clases}


def participacion_texto(valor, total):
    if valor is None or not total:
        return "S/D"
    return pr.fmt_pct(valor / total * 100, 1)


def nota_sin_dato(nombres):
    if not nombres:
        return ""
    return ("Sin datos de este cultivo en esta campaña: %s. No informar no es lo mismo que "
            "producir cero, por eso no entran al ranking ni al cálculo de la escala."
            % pr.unir_lista(sorted(nombres, key=pr.clave_alfabetica),
                            {"separador_lista": ", ", "ultimo_de_lista": " y "}))


# --------------------------------------------------------------------------
# Series
# --------------------------------------------------------------------------
def construir_evolucion_simple(ctx, spec):
    """09-cultivo-evolucion-sup-sembrada: barras de una sola medida."""
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    medida = spec["variables"][0]
    vista = vista_base(ctx, spec, "serie.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
        filtro_geo(ctx),
    ], notas_extra=("estimacion-departamental",))
    pie = ctx.pie(spec)
    for cultivo in cultivos:
        etiqueta = hechos.cultivo_para_titulo(cultivo)
        for geo in ["provincia"] + hechos.deptos:
            valores, estados = serie_por_campania(ctx, geo, cultivo, medida, ctx.ventana)
            if all(v is None for v in valores):
                continue
            nivel = hechos.nivel(geo)
            textos, extras = [], []
            anterior = None
            for valor in valores:
                textos.append(ctx.precision.texto(valor, medida, nivel))
                if valor is not None and anterior:
                    extras.append(texto_variacion(valor / anterior - 1))
                else:
                    extras.append("")
                if valor is not None:
                    anterior = valor
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, {"cultivo": cultivo, "geo": geo,
                                            "cultivo_para_titulo": etiqueta}, ctx.ventana),
                "subtitulo": limpiar(spec["subtitulo"]),
                "unidad": UNIDAD[medida],
                "pie": pie,
                "grafico": spec["grafico"],
                "x": list(ctx.ventana),
                "series": [{"nombre": ETIQUETA_VARIABLE[medida], "tipo": "bar",
                            "color": ctx.colores.solido(medida), "eje": 0, "apilado": False,
                            "v": valores, "t": textos, "extra": extras}],
                "eje": ctx.eje(valores, UNIDAD[medida]),
                "eje2": None,
                "resumen": [
                    {"etiqueta": "Variación del período", "valor": texto_variacion(variacion_total(valores))},
                    {"etiqueta": "Var. anual promedio", "valor": texto_variacion(variacion_anual_promedio(valores))},
                ],
                "nota": "",
            }
            vista["combos"]["|".join([cultivo, geo])] = {"elementos": [elemento]}
    return vista


def construir_evolucion_doble(ctx, spec):
    """09-cultivo-evolucion-prod-rendimiento: barras de produccion + linea de rendimiento."""
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "serie.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
        filtro_geo(ctx),
    ], notas_extra=("estimacion-departamental",))
    pie = ctx.pie(spec)
    for cultivo in cultivos:
        etiqueta = hechos.cultivo_para_titulo(cultivo)
        for geo in ["provincia"] + hechos.deptos:
            produccion, _ = serie_por_campania(ctx, geo, cultivo, "produccion_tn", ctx.ventana)
            rendimiento, _ = serie_por_campania(ctx, geo, cultivo, "rendimiento_kg_ha", ctx.ventana)
            if all(v is None for v in produccion) and all(v is None for v in rendimiento):
                continue
            nivel = hechos.nivel(geo)
            eje_izq = ctx.eje(produccion, "tn")
            intervalos = len(eje_izq["etiquetas"]) - 1
            eje_der = ctx.eje_secundario(rendimiento, "kg/ha", intervalos)
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, {"cultivo": cultivo, "geo": geo,
                                            "cultivo_para_titulo": etiqueta}, ctx.ventana),
                "subtitulo": limpiar(spec["subtitulo"]),
                "unidad": ["tn", "kg/ha"],
                "pie": pie,
                "grafico": spec["grafico"],
                "x": list(ctx.ventana),
                "series": [
                    {"nombre": "Producción", "tipo": "bar", "eje": 0, "apilado": False,
                     "color": ctx.colores.solido("produccion_tn"), "v": produccion,
                     "t": [ctx.precision.texto(v, "produccion_tn", nivel) + " tn" for v in produccion],
                     "extra": [""] * len(produccion)},
                    {"nombre": "Rendimiento", "tipo": "line", "eje": 1, "apilado": False,
                     "color": ctx.colores.solido("rendimiento_kg_ha"), "v": rendimiento,
                     "t": [ctx.precision.texto(v, "rendimiento_kg_ha", nivel) + " kg/ha" for v in rendimiento],
                     "extra": [""] * len(rendimiento)},
                ],
                "eje": eje_izq,
                "eje2": eje_der,
                "resumen": [
                    {"etiqueta": "Variación del período", "valor": texto_variacion(variacion_total(produccion))},
                    {"etiqueta": "Var. anual promedio", "valor": texto_variacion(variacion_anual_promedio(produccion))},
                    {"etiqueta": "Variación del rendimiento entre extremos",
                     "valor": texto_variacion(variacion_total(rendimiento))},
                    {"etiqueta": "Var. anual promedio del rendimiento",
                     "valor": texto_variacion(variacion_anual_promedio(rendimiento))},
                ],
                "nota": "",
            }
            vista["combos"]["|".join([cultivo, geo])] = {"elementos": [elemento]}
    return vista


def construir_evolucion_cosecha_produccion(ctx, spec):
    """09-cultivo-evolucion-cosecha-produccion: el grafico de lineas del mockup de JC.

    Dos lineas (superficie cosechada + produccion) sobre dos ejes con la misma cantidad de
    intervalos: JC las dibuja sobre un eje unico "Millones" pese a ser ha y tn, y esa
    ambiguedad esta preguntada (backlog 31). Mientras tanto, eje secundario del protocolo.
    """
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "serie.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
        filtro_geo(ctx),
    ], notas_extra=("estimacion-departamental",))
    pie = ctx.pie(spec)
    for cultivo in cultivos:
        etiqueta = hechos.cultivo_para_titulo(cultivo)
        for geo in ["provincia"] + hechos.deptos:
            cosechada, _ = serie_por_campania(ctx, geo, cultivo, "sup_cosechada_ha", ctx.ventana)
            produccion, _ = serie_por_campania(ctx, geo, cultivo, "produccion_tn", ctx.ventana)
            if all(v is None for v in cosechada) and all(v is None for v in produccion):
                continue
            nivel = hechos.nivel(geo)
            eje_izq = ctx.eje(cosechada, "ha")
            eje_der = ctx.eje_secundario(produccion, "tn", len(eje_izq["etiquetas"]) - 1)
            # Mouseover del spec: la variacion de la produccion contra la campaña anterior.
            extras_produccion, anterior = [], None
            for valor in produccion:
                if valor is not None and anterior:
                    extras_produccion.append(texto_variacion(valor / anterior - 1))
                else:
                    extras_produccion.append("")
                if valor is not None:
                    anterior = valor
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, {"cultivo": cultivo, "geo": geo,
                                            "cultivo_para_titulo": etiqueta}, ctx.ventana),
                "subtitulo": limpiar(spec["subtitulo"]),
                "unidad": ["ha", "tn"],
                "pie": pie,
                "grafico": spec["grafico"],
                "x": list(ctx.ventana),
                "series": [
                    {"nombre": "Superficie cosechada", "tipo": "line", "eje": 0,
                     "apilado": False, "color": ctx.colores.solido("sup_cosechada_ha"),
                     "v": cosechada,
                     "t": [ctx.precision.texto(v, "sup_cosechada_ha", nivel) + " ha"
                           for v in cosechada],
                     "extra": [""] * len(cosechada)},
                    {"nombre": "Producción", "tipo": "line", "eje": 1, "apilado": False,
                     "color": ctx.colores.solido("produccion_tn"), "v": produccion,
                     "t": [ctx.precision.texto(v, "produccion_tn", nivel) + " tn"
                           for v in produccion],
                     "extra": extras_produccion},
                ],
                "eje": eje_izq,
                "eje2": eje_der,
                "resumen": [
                    {"etiqueta": "Variación de la producción",
                     "valor": texto_variacion(variacion_total(produccion))},
                    {"etiqueta": "Var. anual promedio",
                     "valor": texto_variacion(variacion_anual_promedio(produccion))},
                    {"etiqueta": "Variación de la cosecha",
                     "valor": texto_variacion(variacion_total(cosechada))},
                    {"etiqueta": "Var. anual promedio de la cosecha",
                     "valor": texto_variacion(variacion_anual_promedio(cosechada))},
                ],
                "nota": "",
            }
            vista["combos"]["|".join([cultivo, geo])] = {"elementos": [elemento]}
    return vista


def construir_cartera_participacion(ctx, spec):
    """09-cartera-participacion-produccion: el anillo del mockup de JC, como vista completa.

    La UNICA participacion de la base que junta verano e invierno, y es legal porque es
    produccion en toneladas y va rotulada "(fina y gruesa)" (formato_v1.agregacion). Top 5 +
    Resto, sobre las filas provinciales de la fuente.
    """
    hechos = ctx.hechos
    vista = vista_base(ctx, spec, "torta.html", [filtro_campania(ctx)])
    pie = ctx.pie(spec)
    # AGREGADO: la participacion se calcula sobre TODOS los cultivos con datos, tambien los
    # que no tienen chip (Lenteja, Alpiste), que caen adentro de "Resto". Universo_visible
    # recorta lo elegible, nunca la cuenta.
    cultivos = cultivos_con_datos(ctx)
    for campania in ctx.ventana:
        # Suma departamental, no fila provincial: 'Poroto total' no tiene fila 'Total
        # provincia' en la fuente y quedaria fuera de la participacion. Asi contado, la
        # participacion de soja 2024/25 da 48,1%, igual que el anillo del mockup de JC
        # (la verificacion que exige el propio spec).
        partes = []
        for cultivo in cultivos:
            valor = total_provincia_cultivos(ctx, campania, [cultivo], "produccion_tn")
            if valor:
                partes.append((cultivo, valor))
        if not partes:
            continue
        partes.sort(key=lambda t: (-t[1], pr.clave_alfabetica(t[0])))
        total = sum(v for _, v in partes)
        principales = partes[:spec["top_n"]]
        resto = partes[spec["top_n"]:]
        porciones = [
            {"n": hechos.cultivo_para_titulo(cultivo), "v": valor,
             "t": ctx.precision.texto(valor, "produccion_tn", "provincia") + " tn",
             "pct": pr.fmt_pct(valor / total * 100, 1),
             "color": ctx.color_cultivo[cultivo]}
            for cultivo, valor in principales]
        nota = ("Única participación de la base que junta verano e invierno: es producción en "
                "toneladas, que sí se puede sumar entre estaciones.")
        if resto:
            suma_resto = sum(v for _, v in resto)
            porciones.append({
                "n": spec["resto"], "v": suma_resto,
                "t": ctx.precision.texto(suma_resto, "produccion_tn", "provincia") + " tn",
                "pct": pr.fmt_pct(suma_resto / total * 100, 1),
                "color": ctx.theme["colores"]["texto_apoyo"]})
            nota += " «%s» agrupa los %d cultivos restantes." % (spec["resto"], len(resto))
        elemento = {
            "clase": "grafico",
            "titulo": ctx.titulo(spec, {"campania": campania}),
            "subtitulo": "En porcentaje de la producción total de la campaña, cultivos de "
                         "verano e invierno juntos",
            "unidad": "%",
            "pie": pie,
            "grafico": spec.get("grafico"),
            "vacio": False,
            "leyenda_vacia": "",
            "porciones": porciones,
            "total": "Producción total (fina y gruesa): %s tn"
                     % ctx.precision.texto(total, "produccion_tn", "provincia"),
            "nota": nota,
        }
        vista["combos"][campania] = {"elementos": [elemento]}
    return vista


def construir_cartera(ctx, spec, porcentual):
    """09-cartera-evolucion-absoluta / -porcentual: barras apiladas por cultivo."""
    hechos = ctx.hechos
    variables = spec["universo"]["variables_habilitadas"]
    vista = vista_base(ctx, spec, "serie.html", [
        filtro_estacion(ctx, ["verano", "invierno"]),
        filtro_geo(ctx),
        filtro_variable(ctx, variables),
    ], notas_extra=("estimacion-departamental",))
    pie = ctx.pie(spec)
    # El TOTAL de la pila (el denominador de las participaciones y el eje) se calcula sobre
    # TODOS los cultivos con datos: es un agregado y los agregados no se recortan
    # (formato_v1.selectores.cultivo.universo_visible). Como serie DIBUJADA solo entran los
    # del catalogo de JC (`visibles`): un cultivo fuera del catalogo suma al total pero no
    # aparece como barra propia, asi los porcentajes de los demas no cambian.
    cultivos = cultivos_con_datos(ctx)
    visibles = set(cultivos_visibles(ctx))
    por_estacion = {}
    for cultivo in cultivos:
        por_estacion.setdefault(hechos.estacion.get(cultivo, "verano"), []).append(cultivo)

    for estacion in ["verano", "invierno"]:
        lista = por_estacion.get(estacion, [])
        for geo in ["provincia"] + hechos.deptos:
            for variable in variables:
                nivel = hechos.nivel(geo)
                series, totales = [], [0.0] * len(ctx.ventana)
                crudos = {}
                for cultivo in lista:
                    valores, _ = serie_por_campania(ctx, geo, cultivo, variable, ctx.ventana)
                    if all(v is None for v in valores):
                        continue
                    crudos[cultivo] = valores
                    for i, valor in enumerate(valores):
                        totales[i] += valor or 0.0
                if not crudos:
                    continue
                for cultivo in sorted(crudos, key=pr.clave_alfabetica):
                    if cultivo not in visibles:
                        continue
                    valores = crudos[cultivo]
                    if porcentual:
                        graficados = [None if v is None or not totales[i] else v / totales[i] * 100
                                      for i, v in enumerate(valores)]
                        textos = [pr.fmt_pct(v, 1) if v is not None else "S/D" for v in graficados]
                        extras = [ctx.precision.texto(v, variable, nivel) + " " + UNIDAD[variable]
                                  if v is not None else "" for v in valores]
                    else:
                        graficados = valores
                        textos = [ctx.precision.texto(v, variable, nivel) + " " + UNIDAD[variable]
                                  for v in valores]
                        extras = [None if not totales[i] or v is None
                                  else pr.fmt_pct(v / totales[i] * 100, 1)
                                  for i, v in enumerate(valores)]
                        extras = [e or "" for e in extras]
                    series.append({"nombre": cultivo, "tipo": "bar", "eje": 0, "apilado": True,
                                   "color": ctx.color_cultivo[cultivo], "v": graficados,
                                   "t": textos, "extra": extras})
                if not series:
                    continue
                if porcentual:
                    eje = ctx._con_etiquetas(pr.marcas_eje(0, 100), "%", 0, "%")
                    subtitulo = limpiar(spec["subtitulo"])
                else:
                    eje = ctx.eje(totales, UNIDAD[variable])
                    subtitulo = ctx.subtitulo_unidad(UNIDAD[variable])
                elemento = {
                    "clase": "grafico",
                    "titulo": ctx.titulo(spec, {"estacion": estacion, "geo": geo,
                                                "variable": variable}, ctx.ventana),
                    "subtitulo": subtitulo,
                    "unidad": "%" if porcentual else UNIDAD[variable],
                    "pie": pie,
                    "grafico": spec["grafico"],
                    "x": list(ctx.ventana),
                    "series": series,
                    "eje": eje,
                    "eje2": None,
                    "resumen": [],
                    "nota": nota_provisorios(ctx, [s["nombre"] for s in series]),
                }
                vista["combos"]["|".join([estacion, geo, variable])] = {"elementos": [elemento]}
    return vista


def nota_provisorios(ctx, cultivos):
    provisorios = sorted([c for c in cultivos if c in ctx.hechos.estacion_provisoria],
                         key=pr.clave_alfabetica)
    if not provisorios:
        return ""
    return ("Clasificación de temporada provisoria, a confirmar por Juan Carlos Antuña: %s."
            % pr.unir_lista(provisorios, {"separador_lista": ", ", "ultimo_de_lista": " y "}))


def construir_detalle_componentes(ctx, spec):
    """09-cultivo-detalle-componentes: la unica vista con cultivos rol `componente`."""
    hechos = ctx.hechos
    grupos = spec["grupos_habilitados"]
    variables = spec["variables"]
    etiquetas_grupo = {g["grupo"]: g["grupo"] for g in grupos}
    vista = vista_base(ctx, spec, "serie.html", [
        {"id": "cultivo_grupo", "etiqueta": "Cultivo",
         "opciones": opciones([g["grupo"] for g in grupos], etiquetas_grupo),
         "defecto": spec["defaults"]["cultivo_grupo"]},
        filtro_geo(ctx),
        filtro_variable(ctx, variables),
    ], notas_extra=("estimacion-departamental",))
    pie = ctx.pie(spec)
    for grupo in grupos:
        campanias = [c for c in ctx.ventana
                     if not grupo.get("desde_campania") or c >= grupo["desde_campania"]]
        componentes = [c for c in grupo["componentes"] if c in hechos.rol]
        for geo in ["provincia"] + hechos.deptos:
            for variable in variables:
                nivel = hechos.nivel(geo)
                crudos, totales = {}, [0.0] * len(campanias)
                for componente in componentes:
                    valores, _ = serie_por_campania(ctx, geo, componente, variable, campanias)
                    if all(v is None for v in valores):
                        continue
                    crudos[componente] = valores
                    for i, valor in enumerate(valores):
                        totales[i] += valor or 0.0
                if not crudos:
                    continue
                series = []
                for componente in sorted(crudos, key=pr.clave_alfabetica):
                    valores = crudos[componente]
                    series.append({
                        "nombre": componente, "tipo": "bar", "eje": 0, "apilado": True,
                        "color": ctx.color_cultivo[componente], "v": valores,
                        "t": [ctx.precision.texto(v, variable, nivel) + " " + UNIDAD[variable]
                              for v in valores],
                        "extra": [pr.fmt_pct(v / totales[i] * 100, 1)
                                  if v is not None and totales[i] else ""
                                  for i, v in enumerate(valores)],
                    })
                elemento = {
                    "clase": "grafico",
                    "titulo": ctx.titulo(spec, {"cultivo_grupo": grupo["grupo"], "geo": geo,
                                                "variable": variable}, campanias),
                    "subtitulo": ctx.subtitulo_unidad(UNIDAD[variable]),
                    "unidad": UNIDAD[variable],
                    "pie": pie,
                    "grafico": spec["grafico"],
                    "x": list(campanias),
                    "series": series,
                    "eje": ctx.eje(totales, UNIDAD[variable]),
                    "eje2": None,
                    "resumen": [],
                    "nota": limpiar(grupo.get("nota_en_pantalla") or ""),
                }
                vista["combos"]["|".join([grupo["grupo"], geo, variable])] = {"elementos": [elemento]}
    return vista


def construir_rendimientos_departamento(ctx, spec):
    """09-departamento-evolucion-rendimientos: lineas + linea punteada de la provincia."""
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    ultima = ctx.campania_defecto
    principales = {}
    for geo in hechos.deptos:
        ordenados = ordenar_desc([
            (c, c, (hechos.medidas(geo, ultima, c) or {}).get("sup_sembrada_ha") or 0.0)
            for c in cultivos])
        principales[geo] = [c for c, _, v in ordenados if v > 0][:3]

    etiquetas = {"__varios__": "Los 3 principales del departamento"}
    for cultivo in cultivos:
        etiquetas[cultivo] = cultivo
    vista = vista_base(ctx, spec, "serie.html", [
        filtro_departamento(ctx),
        {"id": "cultivo", "etiqueta": "Cultivo",
         "opciones": opciones(["__varios__"] + cultivos, etiquetas), "defecto": "__varios__"},
    ])
    pie = ctx.pie(spec)
    for geo in hechos.deptos:
        for seleccion in ["__varios__"] + cultivos:
            elegidos = principales[geo] if seleccion == "__varios__" else [seleccion]
            elegidos = [c for c in elegidos if c]
            series, todos = [], []
            for cultivo in sorted(elegidos, key=pr.clave_alfabetica):
                valores, _ = serie_por_campania(ctx, geo, cultivo, "rendimiento_kg_ha", ctx.ventana)
                if all(v is None for v in valores):
                    continue
                todos.extend([v for v in valores if v is not None])
                series.append({
                    "nombre": cultivo, "tipo": "line", "eje": 0, "apilado": False,
                    "color": ctx.color_cultivo[cultivo], "v": valores,
                    "t": [ctx.precision.texto(v, "rendimiento_kg_ha", "departamento") + " kg/ha"
                          for v in valores],
                    "extra": [""] * len(valores),
                })
                provincia, _ = serie_por_campania(ctx, "provincia", cultivo,
                                                  "rendimiento_kg_ha", ctx.ventana)
                if any(v is not None for v in provincia):
                    todos.extend([v for v in provincia if v is not None])
                    series.append({
                        "nombre": "%s · provincia" % cultivo, "tipo": "line", "eje": 0,
                        "apilado": False, "punteada": True,
                        "color": ctx.color_cultivo[cultivo], "v": provincia,
                        "t": [ctx.precision.texto(v, "rendimiento_kg_ha", "provincia") + " kg/ha"
                              for v in provincia],
                        "extra": [""] * len(provincia),
                    })
            if not series:
                continue
            valores_depto = series[0]["v"]
            valores_filtro = {"departamento": geo, "cultivo": seleccion,
                              "cultivo_para_titulo": hechos.cultivo_para_titulo(seleccion)
                              if seleccion != "__varios__" else None}
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, valores_filtro, ctx.ventana),
                "subtitulo": limpiar(spec["subtitulo"]),
                "unidad": "kg/ha",
                "pie": pie,
                "grafico": spec["grafico"],
                "x": list(ctx.ventana),
                "series": series,
                "eje": ctx.eje(todos, "kg/ha"),
                "eje2": None,
                "resumen": [
                    {"etiqueta": "Variación del rendimiento entre extremos",
                     "valor": texto_variacion(variacion_total(valores_depto))},
                    {"etiqueta": "Var. anual promedio",
                     "valor": texto_variacion(variacion_anual_promedio(valores_depto))},
                ],
                "nota": ("La línea punteada es el rendimiento de toda la provincia para el mismo "
                         "cultivo. Las campañas sin cosecha no se grafican: cortan la línea."),
            }
            vista["combos"]["|".join([geo, seleccion])] = {"elementos": [elemento]}
    return vista


# --------------------------------------------------------------------------
# Rankings
# --------------------------------------------------------------------------
def construir_ranking_cultivo(ctx, spec):
    """09-ranking-cultivo-produccion y 09-ranking-cultivo-rendimiento."""
    hechos = ctx.hechos
    medida = spec["variables"][0]
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "ranking.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
        filtro_campania(ctx),
    ])
    pie = ctx.pie(spec)
    columnas = columnas_de(spec)
    for cultivo in cultivos:
        etiqueta = hechos.cultivo_para_titulo(cultivo)
        for campania in ctx.ventana:
            con_dato, sin_dato = [], []
            for geo in hechos.deptos:
                medidas = hechos.medidas(geo, campania, cultivo)
                valor, estado = valor_util(medidas, medida)
                if valor is None:
                    if estado != "sin_datos" or medidas:
                        sin_dato.append(hechos.nombre[geo])
                    continue
                con_dato.append((geo, hechos.nombre[geo], valor))
            faltan = [hechos.nombre[g] for g in hechos.deptos
                      if not hechos.medidas(g, campania, cultivo)]
            if not con_dato:
                continue
            ordenados = ordenar_desc(con_dato)
            puesto_de = puestos([(g, v) for g, _, v in ordenados])
            total_medidas = hechos.sde_prov.get((campania, cultivo)) or {}
            total_valor, _ = valor_util(total_medidas, medida)
            filas = []
            if total_valor is not None:
                filas.append({"total": True,
                              "celdas": fila_total(ctx, spec, hechos, total_valor, medida,
                                                   total_medidas, len(columnas))})
            for geo, nombre, valor in ordenados:
                filas.append({"id": geo,
                              "celdas": celdas_ranking(ctx, spec, hechos, geo, campania, cultivo,
                                                       medida, valor, puesto_de[geo], total_valor)})
            con_participacion = any(c["campo"] == "participacion_provincial_pct"
                                    for c in spec["columnas_tabla"])
            barras = [{"n": nombre,
                       "v": ctx.precision.valor(valor, medida, "departamento"),
                       "t": ctx.precision.texto(valor, medida, "departamento") + " " + UNIDAD[medida],
                       "extra": participacion_texto(valor, total_valor) + " de la provincia"
                                if con_participacion else ""}
                      for _, nombre, valor in ordenados]
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, {"cultivo": cultivo, "campania": campania,
                                            "cultivo_para_titulo": etiqueta}),
                "subtitulo": limpiar(spec["subtitulo"]),
                "unidad": UNIDAD[medida],
                "pie": pie,
                "columnas": columnas,
                "filas": filas,
                "barras": barras,
                "color": ctx.colores.solido(medida),
                "eje": ctx.eje([b["v"] for b in barras], UNIDAD[medida]),
                "nota": nota_ranking(spec, nota_sin_dato(sorted(set(sin_dato + faltan)))),
            }
            vista["combos"]["|".join([cultivo, campania])] = {"elementos": [elemento]}
    return vista


def columnas_de(spec):
    columnas = []
    for columna in spec["columnas_tabla"]:
        etiqueta = columna["etiqueta"]
        columnas.append({"etiqueta": etiqueta,
                         "num": columna["campo"] not in ("departamento", "cultivo", "puesto")})
    return columnas


def fila_total(ctx, spec, hechos, total_valor, medida, medidas, ancho):
    celdas = ["", "Total provincia"]
    for columna in spec["columnas_tabla"][2:]:
        campo = columna["campo"]
        if campo == medida:
            celdas.append(ctx.precision.texto(total_valor, medida, "provincia"))
        elif campo == "participacion_provincial_pct":
            celdas.append("100,0%")
        elif campo in MEDIDAS:
            valor, _ = valor_util(medidas, campo)
            celdas.append(ctx.precision.texto(valor, campo, "provincia"))
        else:
            celdas.append("")
    return celdas[:ancho]


def celdas_ranking(ctx, spec, hechos, geo, campania, cultivo, medida, valor, puesto, total):
    medidas = hechos.medidas(geo, campania, cultivo) or {}
    celdas = ["%d°" % puesto, hechos.nombre[geo]]
    for columna in spec["columnas_tabla"][2:]:
        campo = columna["campo"]
        if campo == medida:
            celdas.append(ctx.precision.texto(valor, medida, "departamento"))
        elif campo == "participacion_provincial_pct":
            celdas.append(participacion_texto(valor, total))
        elif campo in MEDIDAS:
            otro, _ = valor_util(medidas, campo)
            celdas.append(ctx.precision.texto(otro, campo, "departamento"))
        else:
            celdas.append("")
    return celdas


def nota_ranking(spec, nota_faltantes):
    partes = []
    aviso = (spec.get("protocolo_tablas") or {}).get("advertencia")
    if aviso:
        partes.append(limpiar(aviso))
    if nota_faltantes:
        partes.append(nota_faltantes)
    return " ".join(partes)


def construir_ranking_total(ctx, spec):
    """09-ranking-total-producido: suma de todos los cultivos de la campaña."""
    hechos = ctx.hechos
    # AGREGADO: suma TODOS los cultivos con datos, tengan chip o no (universo_visible).
    cultivos = cultivos_con_datos(ctx)
    vista = vista_base(ctx, spec, "ranking.html", [
        filtro_campania(ctx),
        filtro_estacion(ctx, spec["opciones_estacion"]),
    ])
    vista["advertencias"] = [limpiar(a["texto_en_pantalla"]) for a in spec["advertencias"]]
    pie = ctx.pie(spec)
    for campania in ctx.ventana:
        for estacion in spec["opciones_estacion"]:
            lista = [c for c in cultivos
                     if estacion == "todos" or hechos.estacion.get(c) == estacion]
            con_dato, total_provincia = [], 0.0
            for geo in hechos.deptos:
                suma, informados = 0.0, 0
                for cultivo in lista:
                    valor, _ = valor_util(hechos.medidas(geo, campania, cultivo), "produccion_tn")
                    if valor is not None:
                        suma += valor
                        informados += 1
                if informados:
                    con_dato.append((geo, hechos.nombre[geo], suma, informados))
                    total_provincia += suma
            if not con_dato:
                continue
            ordenados = sorted(con_dato, key=lambda t: (-t[2], pr.clave_alfabetica(t[1])))
            puesto_de = puestos([(g, v) for g, _, v, _ in ordenados])
            filas = [{"total": True,
                      "celdas": ["", "Total provincia",
                                 ctx.precision.texto(total_provincia, "produccion_tn", "provincia"),
                                 str(len(lista)), "100,0%"]}]
            for geo, nombre, suma, informados in ordenados:
                filas.append({"id": geo, "celdas": [
                    "%d°" % puesto_de[geo], nombre,
                    ctx.precision.texto(suma, "produccion_tn", "departamento"),
                    str(informados), participacion_texto(suma, total_provincia)]})
            barras = [{"n": nombre,
                       "v": ctx.precision.valor(suma, "produccion_tn", "departamento"),
                       "t": ctx.precision.texto(suma, "produccion_tn", "departamento") + " tn",
                       "extra": participacion_texto(suma, total_provincia) + " de la provincia"}
                      for _, nombre, suma, _ in ordenados]
            sin_dato = [hechos.nombre[g] for g in hechos.deptos
                        if g not in {t[0] for t in con_dato}]
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, {"campania": campania, "estacion": estacion}),
                "subtitulo": limpiar(spec["subtitulo"]),
                "unidad": "tn",
                "pie": pie,
                "columnas": columnas_de(spec),
                "filas": filas,
                "barras": barras,
                "color": ctx.colores.solido("produccion_tn"),
                "eje": ctx.eje([b["v"] for b in barras], "tn"),
                "nota": nota_sin_dato(sin_dato),
            }
            vista["combos"]["|".join([campania, estacion])] = {"elementos": [elemento]}
    return vista


def construir_ranking_promedio3(ctx, spec):
    """09-ranking-rendimiento-promedio-3: promedio simple de las ultimas 3 campañas."""
    hechos = ctx.hechos
    campanias = spec["ventana_propia"]["resueltas_2026_07_30"]
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "ranking.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
    ])
    pie = ctx.pie(spec)
    columnas = ([{"etiqueta": "Departamento", "num": False}]
                + [{"etiqueta": c, "num": True} for c in campanias]
                + [{"etiqueta": "Promedio 3 campañas", "num": True},
                   {"etiqueta": "Ranking", "num": False}])
    for cultivo in cultivos:
        etiqueta = hechos.cultivo_para_titulo(cultivo)
        completos, parciales = [], []
        for geo in hechos.deptos:
            valores = [valor_util(hechos.medidas(geo, c, cultivo), "rendimiento_kg_ha")[0]
                       for c in campanias]
            presentes = [v for v in valores if v is not None]
            if len(presentes) == len(campanias):
                completos.append((geo, hechos.nombre[geo], sum(presentes) / len(presentes), valores))
            elif presentes:
                parciales.append((hechos.nombre[geo], len(presentes)))
        if not completos:
            continue
        ordenados = sorted(completos, key=lambda t: (-t[2], pr.clave_alfabetica(t[1])))
        puesto_de = puestos([(g, v) for g, _, v, _ in ordenados])
        filas = []
        for geo, nombre, promedio, valores in ordenados:
            celdas = [nombre]
            celdas += [ctx.precision.texto(v, "rendimiento_kg_ha", "departamento") for v in valores]
            celdas.append(ctx.precision.texto(promedio, "rendimiento_kg_ha", "departamento"))
            celdas.append("%d°" % puesto_de[geo])
            filas.append({"id": geo, "celdas": celdas})
        barras = [{"n": nombre,
                   "v": ctx.precision.valor(promedio, "rendimiento_kg_ha", "departamento"),
                   "t": ctx.precision.texto(promedio, "rendimiento_kg_ha", "departamento") + " kg/ha",
                   "extra": ""}
                  for _, nombre, promedio, _ in ordenados]
        nota = ("El promedio es simple, no ponderado por superficie cosechada, tal como lo calcula "
                "Juan Carlos Antuña. Los cálculos usan el valor sin redondear.")
        if parciales:
            nota += (" Fuera del ranking por no tener rendimiento en las 3 campañas: %s."
                     % pr.unir_lista(["%s (%d de 3)" % (n, c) for n, c in
                                      sorted(parciales, key=lambda t: pr.clave_alfabetica(t[0]))],
                                     {"separador_lista": ", ", "ultimo_de_lista": " y "}))
        elemento = {
            "clase": "grafico",
            "titulo": ctx.titulo(spec, {"cultivo": cultivo, "cultivo_para_titulo": etiqueta},
                                 campanias),
            "subtitulo": limpiar(spec["subtitulo"]),
            "unidad": "kg/ha",
            "pie": pie,
            "columnas": columnas,
            "filas": filas,
            "barras": barras,
            "color": ctx.colores.solido("rendimiento_kg_ha"),
            "eje": ctx.eje([b["v"] for b in barras], "kg/ha"),
            "nota": nota,
        }
        vista["combos"][cultivo] = {"elementos": [elemento]}
    ctx.ventanas["ventana_propia"] = list(campanias)
    return vista


# --------------------------------------------------------------------------
# Tortas
# --------------------------------------------------------------------------
def construir_cartera_departamento(ctx, spec):
    """09-departamento-cartera: dos tortas, verano e invierno, cada una suma 100% aparte."""
    hechos = ctx.hechos
    variables = spec["variables"]
    vista = vista_base(ctx, spec, "torta.html", [
        filtro_departamento(ctx),
        filtro_campania(ctx),
        filtro_variable(ctx, variables),
    ])
    pie = ctx.pie(spec)
    # Total y porcentajes sobre TODOS los cultivos con datos (agregado); como porcion con
    # nombre propio solo se dibujan los del catalogo de JC (universo_visible). Un cultivo
    # fuera del catalogo suma al total sin aparecer, y los porcentajes de los demas no cambian.
    cultivos = cultivos_con_datos(ctx)
    visibles = set(cultivos_visibles(ctx))
    for geo in hechos.deptos:
        for campania in ctx.ventana:
            for variable in variables:
                elementos = []
                for estacion in ["verano", "invierno"]:
                    lista = [c for c in cultivos if hechos.estacion.get(c) == estacion]
                    partes = []
                    for cultivo in lista:
                        valor, _ = valor_util(hechos.medidas(geo, campania, cultivo), variable)
                        if valor:
                            partes.append((cultivo, valor))
                    total = sum(v for _, v in partes)
                    partes = sorted(partes, key=lambda t: (-t[1], pr.clave_alfabetica(t[0])))
                    dibujadas = [(c, v) for c, v in partes if c in visibles]
                    elementos.append({
                        "clase": "grafico",
                        "titulo": ctx.titulo(spec, {"departamento": geo, "campania": campania,
                                                    "variable": variable, "estacion": estacion}),
                        "subtitulo": limpiar(spec["subtitulo"]),
                        "unidad": "%",
                        "pie": pie,
                        "vacio": not dibujadas,
                        "leyenda_vacia": "Sin cultivos de %s en esta campaña" % estacion,
                        "porciones": [
                            {"n": cultivo, "v": valor,
                             "t": ctx.precision.texto(valor, variable, "departamento") + " " + UNIDAD[variable],
                             "pct": pr.fmt_pct(valor / total * 100, 1),
                             "color": ctx.color_cultivo[cultivo]}
                            for cultivo, valor in dibujadas],
                        "total": ("Total de %s: %s %s" % (
                            ESTACIONES[estacion].lower(),
                            ctx.precision.texto(total, variable, "departamento"),
                            UNIDAD[variable])) if dibujadas else "",
                        "nota": nota_provisorios(ctx, [c for c, _ in dibujadas]),
                    })
                pr.numerar(ctx.protocolo, elementos)
                for elemento in elementos:
                    if elemento["rotulo"]:
                        elemento["titulo"] = (elemento["rotulo"]
                                              + ctx.protocolo["tipografia"]["separador_titulo"]
                                              + elemento["titulo"])
                if all(e["vacio"] for e in elementos):
                    continue
                vista["combos"]["|".join([geo, campania, variable])] = {"elementos": elementos}
    return vista


def construir_torta_noa(ctx, spec):
    """09-noa-participacion-provincia: RESERVADA. Compara provincias entre si."""
    hechos = ctx.hechos
    campania = spec["defaults"]["campania"]
    provincias = sorted({clave[0] for clave in hechos.comp_depto} | {"sde"})
    nombres = {"sde": "Santiago del Estero", "salta": "Salta", "tucuman": "Tucumán",
               "catamarca": "Catamarca", "jujuy": "Jujuy"}
    # Mismo universo visible que el resto del sitio: el cultivo es una opcion elegible, asi
    # que ademas de datos en la comparacion tiene que estar en el catalogo de JC.
    cultivos = sorted({clave[-1] for clave in hechos.comp_depto
                       if clave[-2] == campania and hechos.rol.get(clave[-1]) in ("agregado", "simple")
                       and ctx.iconos_cultivo.get(clave[-1])},
                      key=pr.clave_alfabetica)
    vista = vista_base(ctx, spec, "torta.html", [
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
        {"id": "campania", "etiqueta": "Campaña", "opciones": opciones([campania]),
         "defecto": campania},
    ])
    vista["advertencias"] = [limpiar(a["texto_en_pantalla"]) for a in spec["advertencias"]]
    pie = ctx.pie(spec)
    # El primario queda reservado para Santiago del Estero (protocolo, comparaciones_geograficas).
    colores = ctx.colores.por_categoria([p for p in provincias if p != "sde"],
                                        excluir=(ctx.theme["colores"]["primario"],))
    for cultivo in cultivos:
        partes = []
        for provincia in provincias:
            suma = 0.0
            for clave, medidas in hechos.comp_depto.items():
                if clave[0] == provincia and clave[2] == campania and clave[3] == cultivo:
                    valor, _ = valor_util(medidas, "produccion_tn")
                    suma += valor or 0.0
            if provincia == "sde":
                suma = 0.0
                for geo in hechos.deptos:
                    valor, _ = valor_util(hechos.medidas(geo, campania, cultivo), "produccion_tn")
                    suma += valor or 0.0
            if suma:
                partes.append((provincia, suma))
        if not partes:
            continue
        total = sum(v for _, v in partes)
        partes = sorted(partes, key=lambda t: (-t[1], nombres.get(t[0], t[0])))
        elemento = {
            "clase": "grafico",
            "titulo": ctx.titulo(spec, {"cultivo": cultivo, "campania": campania,
                                        "cultivo_para_titulo": hechos.cultivo_para_titulo(cultivo)}),
            "subtitulo": limpiar(spec["subtitulo"]),
            "unidad": "%",
            "pie": pie,
            "vacio": False,
            "leyenda_vacia": "",
            "porciones": [
                {"n": nombres.get(p, p), "v": v,
                 "t": pr.fmt_numero(v) + " tn",
                 "pct": pr.fmt_pct(v / total * 100, 1),
                 "color": ctx.theme["colores"]["primario"] if p == "sde" else colores[p]}
                for p, v in partes],
            "total": "Total del NOA: %s tn" % pr.fmt_numero(total),
            "nota": ("Los totales por provincia se arman sumando los departamentos que informaron "
                     "el cultivo: la fuente no trae fila de total provincial para el NOA."),
        }
        vista["combos"]["|".join([cultivo, campania])] = {"elementos": [elemento]}
    return vista


# --------------------------------------------------------------------------
# Lista y tabla
# --------------------------------------------------------------------------
def construir_ficha_departamento(ctx, spec):
    """09-departamento-ficha-cultivos: la tabla que se abre al hacer clic en el mapa."""
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "lista.html", [
        filtro_departamento(ctx),
        filtro_campania(ctx),
    ])
    pie = ctx.pie(spec)
    columnas = [{"etiqueta": c["etiqueta"],
                 "num": c["campo"] not in ("cultivo", "estacion")}
                for c in spec["columnas"]]
    for geo in hechos.deptos:
        for campania in ctx.ventana:
            filas = []
            candidatos = []
            for cultivo in cultivos:
                medidas = hechos.medidas(geo, campania, cultivo)
                if not medidas:
                    continue
                produccion, _ = valor_util(medidas, "produccion_tn")
                candidatos.append((cultivo, medidas, produccion or 0.0))
            if not candidatos:
                continue
            for cultivo, medidas, _ in sorted(candidatos,
                                              key=lambda t: (-t[2], pr.clave_alfabetica(t[0]))):
                celdas = [cultivo, ESTACIONES[hechos.estacion.get(cultivo, "verano")].split()[-1].capitalize()]
                for medida in MEDIDAS:
                    valor, estado = valor_util(medidas, medida)
                    if valor is None:
                        celdas.append({"t": DISPLAY_ESTADO[estado] or "S/D", "c": "sd"})
                    else:
                        celdas.append(ctx.precision.texto(valor, medida, "departamento"))
                provincial = hechos.sde_prov.get((campania, cultivo)) or {}
                total, _ = valor_util(provincial, "produccion_tn")
                propio, _ = valor_util(medidas, "produccion_tn")
                celdas.append(participacion_texto(propio, total))
                filas.append({"celdas": celdas})
            elemento = {
                "clase": "tabla",
                "titulo": ctx.titulo(spec, {"departamento": geo, "campania": campania}),
                "subtitulo": limpiar(spec["subtitulo"]),
                "pie": pie,
                "columnas": columnas,
                "filas": filas,
                "nota": ("La participación se calcula sobre la producción de la fila 'Total "
                         "provincia' del mismo cultivo y campaña. Es participación dentro de la "
                         "provincia, no comparación entre provincias."),
            }
            vista["combos"]["|".join([geo, campania])] = {"elementos": [elemento]}
    vista["enlaces"] = [
        {"texto": "Cartera de cultivos", "href": "09-departamento-cartera.html"},
        {"texto": "Evolución de rendimientos", "href": "09-departamento-evolucion-rendimientos.html"},
        {"texto": "Posición en el ranking", "href": "09-departamento-posicion-ranking.html"},
    ]
    return vista


def construir_datos_departamento(ctx, spec):
    """09-departamento-datos: la puerta del area territorial (boton 'Datos por Departamento').

    Habilitada el 10-ago-2026 (segunda tanda, Facu con JC presente). Se elige un departamento
    y un cultivo del catalogo de JC y se ven: los KPIs de la ultima campaña (secuencia fija,
    campaña escrita en el rotulo: parametros_explicitos), la evolucion de cosecha y produccion
    (el grafico del mockup, a grano departamento) y la tabla por campaña. Dos cuadros, cada
    uno con su titulo de protocolo: el de la tabla se compone con
    `tabla_por_campania.titulo_componentes` y la plantilla del tipo `lista`, igual que
    mapa.html compone el de su ranking vinculado con la plantilla `ranking`.
    """
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "serie.html", [
        filtro_departamento(ctx),
        filtro_cultivo(ctx, cultivos, spec["defaults"]["cultivo"]),
    ], notas_extra=("estimacion-departamental",))
    vista["particion"] = "departamento"
    vista["enlaces"] = [{"texto": destino["accion"], "href": destino["va_a"] + ".html"}
                        for destino in spec["navegacion"]]
    pie = ctx.pie(spec)
    ultima = ctx.campania_defecto
    spec_tabla = dict(spec, titulo_componentes=spec["tabla_por_campania"]["titulo_componentes"])
    columnas = [{"etiqueta": c["etiqueta"], "num": c["campo"] != "campania"}
                for c in spec["tabla_por_campania"]["columnas"]]
    medidas_tabla = [c["campo"] for c in spec["tabla_por_campania"]["columnas"]
                     if c["campo"] != "campania"]
    for geo in hechos.deptos:
        for cultivo in cultivos:
            cosechada, _ = serie_por_campania(ctx, geo, cultivo, "sup_cosechada_ha", ctx.ventana)
            produccion, _ = serie_por_campania(ctx, geo, cultivo, "produccion_tn", ctx.ventana)
            if all(v is None for v in cosechada) and all(v is None for v in produccion):
                continue
            valores_filtro = {"departamento": geo, "cultivo": cultivo,
                              "cultivo_para_titulo": hechos.cultivo_para_titulo(cultivo)}
            # KPIs de la ultima campaña: secuencia fija de JC, con la campaña en el rotulo.
            medidas_kpi = hechos.medidas(geo, ultima, cultivo)
            resumen = []
            for medida in spec["indicadores"]["medidas"]:
                valor, _ = valor_util(medidas_kpi, medida)
                resumen.append({
                    "etiqueta": "%s · campaña %s" % (ETIQUETA_VARIABLE[medida], ultima),
                    "valor": (ctx.precision.texto(valor, medida, "departamento")
                              + " " + UNIDAD[medida]) if valor is not None else "S/D",
                })
            eje_izq = ctx.eje(cosechada, "ha")
            eje_der = ctx.eje_secundario(produccion, "tn", len(eje_izq["etiquetas"]) - 1)
            elemento_grafico = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, valores_filtro, ctx.ventana),
                "subtitulo": "Superficie cosechada en hectáreas y producción en toneladas, por campaña",
                "unidad": ["ha", "tn"],
                "pie": pie,
                "grafico": spec["grafico"],
                "x": list(ctx.ventana),
                "series": [
                    {"nombre": "Superficie cosechada", "tipo": "line", "eje": 0,
                     "apilado": False, "color": ctx.colores.solido("sup_cosechada_ha"),
                     "v": cosechada,
                     "t": [ctx.precision.texto(v, "sup_cosechada_ha", "departamento") + " ha"
                           for v in cosechada],
                     "extra": [""] * len(cosechada)},
                    {"nombre": "Producción", "tipo": "line", "eje": 1, "apilado": False,
                     "color": ctx.colores.solido("produccion_tn"), "v": produccion,
                     "t": [ctx.precision.texto(v, "produccion_tn", "departamento") + " tn"
                           for v in produccion],
                     "extra": [""] * len(produccion)},
                ],
                "eje": eje_izq,
                "eje2": eje_der,
                "resumen": resumen,
                "nota": "Las campañas sin cosecha no se grafican: cortan la línea.",
            }
            filas = []
            for campania in ctx.ventana:
                medidas = hechos.medidas(geo, campania, cultivo)
                celdas = [campania]
                for medida in medidas_tabla:
                    valor, estado = valor_util(medidas, medida)
                    if valor is None:
                        celdas.append({"t": DISPLAY_ESTADO[estado] or "S/D", "c": "sd"})
                    else:
                        celdas.append(ctx.precision.texto(valor, medida, "departamento"))
                filas.append({"celdas": celdas})
            elemento_tabla = {
                "clase": "tabla",
                "titulo": ctx.titulo(spec_tabla, valores_filtro, ctx.ventana, tipo="lista"),
                "subtitulo": limpiar(spec["subtitulo"]),
                "pie": pie,
                "columnas": columnas,
                "filas": filas,
                "nota": ("Cada estado se muestra tal cual ('Sembrado sin cosechar', 'Sin "
                         "datos'): un departamento sin dato no es un departamento con cero."),
            }
            vista["combos"]["|".join([geo, cultivo])] = {
                "elementos": [elemento_grafico, elemento_tabla]}
    return vista


def construir_posicion_ranking(ctx, spec):
    """09-departamento-posicion-ranking: cultivo por fila, campaña por columna, puesto en la celda."""
    hechos = ctx.hechos
    variables = ["produccion_tn", "rendimiento_kg_ha"]
    cultivos = cultivos_visibles(ctx)
    vista = vista_base(ctx, spec, "tabla-variaciones.html", [
        filtro_departamento(ctx),
        filtro_variable(ctx, variables),
    ])
    pie = ctx.pie(spec)
    campanias = list(reversed(ctx.ventana))
    columnas = [{"etiqueta": "Cultivo", "num": False}] + [{"etiqueta": c, "num": True}
                                                          for c in campanias]
    tabla_puestos = {}
    for variable in variables:
        for cultivo in cultivos:
            for campania in ctx.ventana:
                con_dato = []
                for geo in hechos.deptos:
                    valor, _ = valor_util(hechos.medidas(geo, campania, cultivo), variable)
                    if valor is not None:
                        con_dato.append((geo, hechos.nombre[geo], valor))
                ordenados = ordenar_desc(con_dato)
                tabla_puestos[(variable, cultivo, campania)] = puestos(
                    [(g, v) for g, _, v in ordenados])

    for geo in hechos.deptos:
        for variable in variables:
            filas = []
            for cultivo in cultivos:
                celdas, mejor, alguno = [cultivo], None, False
                for campania in campanias:
                    puesto = tabla_puestos[(variable, cultivo, campania)].get(geo)
                    if puesto is None:
                        celdas.append({"t": "S/D", "c": "sd"})
                    else:
                        alguno = True
                        celdas.append({"t": "%d°" % puesto, "c": ""})
                        mejor = puesto if mejor is None else min(mejor, puesto)
                if not alguno:
                    continue
                for celda in celdas[1:]:
                    if isinstance(celda, dict) and celda["t"] == "%d°" % mejor:
                        celda["c"] = "destacada"
                filas.append({"celdas": celdas, "_mejor": mejor})
            if not filas:
                continue
            filas = sorted(filas, key=lambda f: (f["_mejor"], pr.clave_alfabetica(f["celdas"][0])))
            for fila in filas:
                fila.pop("_mejor")
            elemento = {
                "clase": "tabla",
                "titulo": ctx.titulo(spec, {"departamento": geo, "variable": variable}, ctx.ventana),
                "subtitulo": limpiar(spec["subtitulo"]),
                "pie": pie,
                "columnas": columnas,
                "filas": filas,
                "nota": ("El puesto se calcula entre los departamentos que informaron ese cultivo "
                         "en esa campaña. Los empates comparten puesto y el siguiente salta. "
                         "En negrita, el mejor puesto de cada cultivo. S/D = el departamento no "
                         "informó ese cultivo esa campaña."),
            }
            vista["combos"]["|".join([geo, variable])] = {"elementos": [elemento]}
    return vista


def construir_participacion_pais(ctx, spec):
    """09-pais-participacion-sde: RESERVADA. Santiago contra el total del pais."""
    hechos = ctx.hechos
    campania = spec["defaults"]["campania"]
    variables = ["sup_sembrada_ha", "produccion_tn"]
    excluidos = {e["cultivo"]: limpiar(e["leyenda_en_pantalla"])
                 for e in spec["exclusiones_visibles"]["cultivos"]}
    vista = vista_base(ctx, spec, "ranking.html", [
        {"id": "campania", "etiqueta": "Campaña", "opciones": opciones([campania]),
         "defecto": campania},
        filtro_variable(ctx, variables),
    ])
    pie = ctx.pie(spec)
    for variable in variables:
        filas_datos, sin_pais = [], []
        for (camp, cultivo), medidas in sorted(hechos.sde_prov.items()):
            if camp != campania:
                continue
            propio, _ = valor_util(medidas, variable)
            if propio is None:
                continue
            del_pais = hechos.pais.get((campania, cultivo))
            if not del_pais:
                sin_pais.append(cultivo)
                continue
            nacional, _ = valor_util(del_pais, variable)
            if not nacional:
                sin_pais.append(cultivo)
                continue
            filas_datos.append((cultivo, propio, nacional, propio / nacional * 100))
        if not filas_datos:
            continue
        filas_datos.sort(key=lambda t: (-t[3], pr.clave_alfabetica(t[0])))
        columnas = [{"etiqueta": "Cultivo", "num": False},
                    {"etiqueta": "Santiago del Estero (%s)" % UNIDAD[variable], "num": True},
                    {"etiqueta": "Total país (%s)" % UNIDAD[variable], "num": True},
                    {"etiqueta": "% del país", "num": True}]
        filas = [{"celdas": [cultivo, pr.fmt_numero(propio), pr.fmt_numero(nacional),
                             pr.fmt_pct(pct, 1)]}
                 for cultivo, propio, nacional, pct in filas_datos]
        # Los cultivos sin fila nacional NO se borran en silencio: van listados con la leyenda
        # en lugar del porcentaje (spec, `exclusiones_visibles`).
        for cultivo in sorted(set(sin_pais), key=pr.clave_alfabetica):
            leyenda = excluidos.get(cultivo, "La fuente no informa este cultivo en el total del país.")
            propio, _ = valor_util(hechos.sde_prov.get((campania, cultivo)) or {}, variable)
            filas.append({"celdas": [cultivo, pr.fmt_numero(propio), "—",
                                     {"t": leyenda, "c": "sd"}]})
        barras = [{"n": cultivo, "v": float(pr.redondear(pct, 1)), "t": pr.fmt_pct(pct, 1),
                   "extra": "%s de %s %s" % (pr.fmt_numero(propio), pr.fmt_numero(nacional),
                                             UNIDAD[variable])}
                  for cultivo, propio, nacional, pct in filas_datos]
        elemento = {
            "clase": "grafico",
            "titulo": ctx.titulo(spec, {"campania": campania, "variable": variable}),
            "subtitulo": limpiar(spec["subtitulo"]),
            "unidad": "%",
            "pie": pie,
            "columnas": columnas,
            "filas": filas,
            "barras": barras,
            "color": ctx.theme["colores"]["primario"],
            "eje": ctx._con_etiquetas(pr.marcas_eje(0, max(b["v"] for b in barras)), "%", 0, "%"),
            "nota": ("Cada cultivo se compara contra su equivalente exacto del país: nunca un "
                     "total contra una variedad. Si la fuente no trae la fila nacional de ese "
                     "cultivo, la fila queda sin porcentaje, con la aclaración al lado. "
                     "\"Poroto total\" no figura en este cuadro porque la fuente tampoco informa "
                     "un total provincial de poroto para Santiago del Estero: solo trae las "
                     "variedades por separado, y no armamos un total que la fuente no trajo."),
        }
        vista["combos"]["|".join([campania, variable])] = {"elementos": [elemento]}
    return vista


# ===========================================================================
# BASE 85 - MOVIMIENTOS DE HACIENDA (familia dte)
# ===========================================================================
# La base 9 y la 85 no comparten ni el hecho, ni el grano temporal, ni las medidas, ni la regla
# de redondeo, asi que tampoco comparten contexto. Lo que SI comparten, y por eso vive una sola
# vez arriba, es el protocolo de presentacion, el theme, la navegacion, la cascara de la vista
# y las verificaciones sobre la vista terminada.

MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

ETIQUETA_APERTURA = {"total": "Total", "categoria": "Por categoría",
                     "departamento": "Por departamento"}

# Mensaje del combo vacio en las vistas que cruzan medida con categoria. No es un error: es que
# la fuente no abre los documentos por categoria. Ver hacienda.CATEGORIA_DE_DOCUMENTOS.
SIN_CATEGORIA_EN_DOCUMENTOS = (
    "Los documentos de tránsito no se abren por categoría: un mismo DTE puede amparar animales "
    "de varias. Elegí la categoría «Total», o cambiá la medida a cabezas.")


class ContextoHacienda:
    """El mismo papel que `Contexto`, para la base 85. Misma interfaz publica."""

    def __init__(self, hechos):
        self.protocolo = pr.cargar_protocolo()
        self.comunes = pr.cargar_comunes(85)
        self.theme = pr.cargar_theme()
        self.navegacion = pr.cargar_yaml(os.path.join(DIR_SITE, "navegacion.yaml"))
        self.hechos = hechos
        self.colores = pr.Colores(self.protocolo, self.comunes, self.theme)
        self.notas = self.comunes["notas_metodologicas"]

        universos = self.comunes["universos"]
        self.universos = {k: v for k, v in universos.items() if isinstance(v, dict)}
        self.etiqueta_universo = {k: v["etiqueta"] for k, v in self.universos.items()}
        self.titulador = pr.Titulador(
            self.protocolo, self.comunes, 85,
            recortes={k: v["etiqueta_corta"] for k, v in self.universos.items()})

        ventana = self.comunes["ventana_anios"]
        self.anios = [a for a in ventana["resueltos_2026_07_31"] if a in hechos.anios]
        self.anio_en_curso = self.comunes["anio_en_curso"]["anio"]
        # La ventana "cerrada" es la que usan los totales, los rankings y las variaciones. El año
        # en curso llega hasta mayo: en una comparacion anual apareceria como un derrumbe que no
        # existe (_comunes-base-85.anio_en_curso).
        self.anios_cerrados = [a for a in self.anios if a != self.anio_en_curso]
        self.anio_defecto = ventana["anio_por_defecto"]

        self.categorias = list(self.comunes["agregados"]["componentes"])
        self.color_categoria = self.colores.por_categoria(self.categorias)

    # -- textos ---------------------------------------------------------
    def pie(self, spec):
        esperado = (spec.get("fuente") or {}).get("organismo_esperado")
        reales = sorted(self.hechos.fuentes)
        if esperado and reales != [esperado]:
            raise pr.ErrorDeProtocolo(
                "%s espera fuente %r y el mart trae %r" % (spec["slug_vista"], esperado, reales))
        return pr.pie_de_fuente(self.protocolo, reales,
                                (spec.get("fuente") or {}).get("publicacion"))

    def subtitulo_unidad(self, unidad, categoria=None):
        """La unidad, y la categoria cuando la vista tiene selector.

        El protocolo pide que el subtitulo lleve "la unidad de medida, y cualquier recorte del
        universo que cambie como se lee el numero". La categoria es exactamente eso: el mismo
        cuadro con "Vacas" y con "Total" muestra dos cosas distintas, y el titulo no la nombra.
        """
        texto = pr.subtitulo_por_unidad(self.protocolo, unidad)
        if categoria and categoria != "Total":
            return "%s - categoría: %s" % (texto, pr.minuscula_inicial(categoria))
        return texto

    def titulo(self, spec, valores, anios=None, tipo=None, grafico=None):
        return self.titulador.componer(
            spec, valores, self.hechos.nombre, campanias_efectivas=anios,
            ventanas={"ventana_anios": self.anios_cerrados}, tipo=tipo, grafico=grafico)

    def notas_de(self, spec, extra=()):
        ids = list(spec.get("notas_metodologicas") or []) + list(extra)
        vistas, salida = set(), []
        for nota_id in ids:
            if nota_id in vistas or nota_id not in self.notas:
                continue
            vistas.add(nota_id)
            nota = self.notas[nota_id]
            salida.append({"titulo": nota["titulo"], "texto": " ".join(nota["texto"].split())})
        return salida

    # -- numeros ---------------------------------------------------------
    def texto(self, valor):
        """Cabezas y documentos son conteos exactos: se muestran completos, sin redondear
        (_comunes-base-85.precision_display). No hay `Precision` como en la base 9 porque no
        hay nada que redondear: el dato no es una estimacion."""
        return pr.fmt_numero(valor, 0)

    def eje(self, valores, unidad):
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje(min(limpios + [0.0]), max(limpios + [0.0]))
        etiquetas = {clave_js(m): pr.fmt_numero(m, 0) for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": hac.NOMBRE_EJE[unidad]}

    def eje_secundario(self, valores, unidad, intervalos):
        """Eje derecho con la MISMA cantidad de intervalos que el izquierdo: asi las marcas de
        los dos caen sobre las mismas lineas de grilla. Lo usa el cruce de medidas del zoom,
        donde cabezas y documentos comparten cuadro y no pueden compartir escala."""
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje_secundario(min(limpios + [0.0]), max(limpios + [0.0]), intervalos)
        etiquetas = {clave_js(m): pr.fmt_numero(m, 0) for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": hac.NOMBRE_EJE[unidad]}

    def eje_porcentual(self):
        marcas = pr.marcas_eje(0, 100)
        etiquetas = {clave_js(m): pr.fmt_numero(m, 0) + "%" for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": NOMBRE_EJE["%"]}


# --------------------------------------------------------------------------
# Filtros de la base 85
# --------------------------------------------------------------------------
def h_filtro_anio(ctx):
    """Igual que filtro_campania: el año es el periodo y va en la barra verde, en chips."""
    return {"id": "anio", "etiqueta": "Año", "zona": "periodo",
            "opciones": [{"v": str(a), "t": str(a), "corto": str(a)[2:]}
                         for a in ctx.anios_cerrados],
            "defecto": str(ctx.anio_defecto)}


def h_filtro_medida(ctx, spec):
    return {"id": "medida", "etiqueta": "Medida",
            "opciones": opciones(spec["opciones_medida"], hac.ETIQUETA_MEDIDA),
            "defecto": spec["defaults"]["medida"]}


def h_filtro_categoria(ctx, spec):
    return {"id": "categoria", "etiqueta": "Categoría",
            "opciones": opciones(spec["opciones_categoria"]),
            "defecto": spec["defaults"]["categoria"]}


def h_filtro_recorte(ctx, spec):
    return {"id": "recorte", "etiqueta": "Movimientos",
            "opciones": opciones(spec["opciones_recorte"], ctx.etiqueta_universo),
            "defecto": spec["defaults"]["recorte"]}


def h_filtro_apertura(ctx, spec, campo="apertura", etiqueta="Apertura"):
    return {"id": campo, "etiqueta": etiqueta,
            "opciones": opciones(spec["opciones_%s" % campo], ETIQUETA_APERTURA),
            "defecto": spec["defaults"][campo]}


def h_filtro_departamento(ctx, deptos, defecto):
    etiquetas = {geo: ctx.hechos.nombre[geo] for geo in deptos}
    return {"id": "departamento", "etiqueta": "Departamento",
            "opciones": opciones(deptos, etiquetas), "defecto": defecto}


def h_recorte_de(spec):
    return spec["universo"]["recorte"]


def h_categorias_visibles(ctx, medida):
    """Con medida = documentos no hay apertura por categoria: la fuente no la informa."""
    return [] if medida == "documentos" else ctx.categorias


def h_variaciones(ctx, valores):
    return [{"etiqueta": "Variación del período",
             "valor": texto_variacion(variacion_total(valores))},
            {"etiqueta": "Var. anual promedio",
             "valor": texto_variacion(variacion_anual_promedio(valores))}]


def h_textos_y_variacion(ctx, valores, unidad_texto):
    """Etiquetas del tooltip: el valor, y entre parentesis la variacion contra el año anterior."""
    textos, extras, anterior = [], [], None
    for valor in valores:
        textos.append(ctx.texto(valor) + " " + unidad_texto)
        if valor is not None and anterior:
            extras.append(texto_variacion(valor / anterior - 1))
        else:
            extras.append("")
        if valor is not None:
            anterior = valor
    return textos, extras


def h_unidad_texto(medida):
    return "cabezas" if hac.UNIDAD[medida] == "cabezas" else "DTE"


# --------------------------------------------------------------------------
# 85-evolucion-movimientos (+ internos, extraccion, introduccion)
# --------------------------------------------------------------------------
def construir_hacienda_evolucion(ctx, spec):
    """Los cuatro cuadros anuales de JC (Modelo Analisis f2, f10, f18, f27).

    Un solo constructor para las cuatro vistas: lo unico que cambia entre ellas es el universo,
    que sale del spec. Es la misma economia que hace JC en su planilla, donde los cuatro cuadros
    tienen exactamente la misma forma.
    """
    hechos = ctx.hechos
    recorte = h_recorte_de(spec)
    vista = vista_base(ctx, spec, "serie.html", [
        h_filtro_medida(ctx, spec),
        h_filtro_apertura(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    pie = ctx.pie(spec)
    anios = ctx.anios_cerrados

    for medida in spec["opciones_medida"]:
        unidad = hac.UNIDAD[medida]
        for apertura in spec["opciones_apertura"]:
            valores_filtro = {"medida": medida, "apertura": apertura}
            totales = [hechos.total_anual(recorte, a, "Total", medida) for a in anios]
            if all(v is None for v in totales):
                continue
            if apertura == "total":
                textos, extras = h_textos_y_variacion(ctx, totales, h_unidad_texto(medida))
                series = [{"nombre": hac.ETIQUETA_MEDIDA[medida], "tipo": "bar", "eje": 0,
                           "apilado": False, "color": ctx.colores.solido(medida),
                           "v": totales, "t": textos, "extra": extras}]
                resumen = h_variaciones(ctx, totales)
            else:
                categorias = h_categorias_visibles(ctx, medida)
                if not categorias:
                    continue
                series = []
                for categoria in categorias:
                    valores = [hechos.total_anual(recorte, a, categoria, medida) for a in anios]
                    if all(not v for v in valores):
                        continue
                    series.append({
                        "nombre": categoria, "tipo": "bar", "eje": 0, "apilado": True,
                        "color": ctx.color_categoria[categoria], "v": valores,
                        "t": [ctx.texto(v) + " " + h_unidad_texto(medida) for v in valores],
                        "extra": [participacion_texto(v, totales[i]) + " del total"
                                  for i, v in enumerate(valores)]})
                resumen = []
            # El eje se calcula sobre el TOTAL en los dos casos: con apertura por categoria las
            # barras estan apiladas, asi que la altura de la pila es el total, no el maximo de
            # una serie.
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, valores_filtro, anios),
                "subtitulo": ctx.subtitulo_unidad(unidad),
                "unidad": unidad,
                "pie": pie,
                "grafico": "barras-apiladas" if apertura == "categoria" else "barras",
                "x": [str(a) for a in anios],
                "series": series,
                "eje": ctx.eje(totales, unidad),
                "eje2": None,
                "resumen": resumen,
                "nota": nota_total_vs_categorias(ctx, apertura),
            }
            vista["combos"]["|".join([medida, apertura])] = {"elementos": [elemento]}
    return vista


def nota_total_vs_categorias(ctx, apertura):
    if apertura != "categoria":
        return ""
    return ("Las barras suman las ocho categorías que informa la fuente. El total de cada año "
            "puede quedar apenas por encima: hay movimientos donde el documento no clasifica "
            "todos los animales.")


# --------------------------------------------------------------------------
# 85-participacion-categorias
# --------------------------------------------------------------------------
def construir_hacienda_participacion(ctx, spec):
    """JC f2 y f17: 'Participación por categoría sobre total', con selector de universo."""
    hechos = ctx.hechos
    vista = vista_base(ctx, spec, "serie.html", [h_filtro_recorte(ctx, spec)])
    pie = ctx.pie(spec)
    anios = ctx.anios_cerrados

    for recorte in spec["opciones_recorte"]:
        totales = [hechos.total_anual(recorte, a, "Total", "cabezas") for a in anios]
        if all(not v for v in totales):
            continue
        series = []
        for categoria in ctx.categorias:
            crudos = [hechos.total_anual(recorte, a, categoria, "cabezas") for a in anios]
            if all(not v for v in crudos):
                continue
            porcentajes = [None if not totales[i] or v is None else v / totales[i] * 100
                           for i, v in enumerate(crudos)]
            series.append({
                "nombre": categoria, "tipo": "bar", "eje": 0, "apilado": True,
                "color": ctx.color_categoria[categoria], "v": porcentajes,
                "t": [pr.fmt_pct(p, 1) if p is not None else "S/D" for p in porcentajes],
                "extra": [ctx.texto(v) + " cabezas" if v is not None else "" for v in crudos]})
        elemento = {
            "clase": "grafico",
            "titulo": ctx.titulo(spec, {"recorte": recorte}, anios),
            "subtitulo": limpiar(spec["subtitulo"]),
            "unidad": "%",
            "pie": pie,
            "grafico": spec["grafico"],
            "x": [str(a) for a in anios],
            "series": series,
            "eje": ctx.eje_porcentual(),
            "eje2": None,
            "resumen": [],
            "nota": ("El denominador es el total que informa la fuente, no la suma de las ocho "
                     "categorías. Por eso la barra puede no llegar exactamente al 100%."),
        }
        vista["combos"][recorte] = {"elementos": [elemento]}
    return vista


# --------------------------------------------------------------------------
# 85-ranking-departamento-origen
# --------------------------------------------------------------------------
def construir_hacienda_ranking_depto(ctx, spec):
    """JC f48-f79: el ranking de los 27 departamentos por hacienda movida."""
    hechos = ctx.hechos
    recorte = h_recorte_de(spec)
    deptos = hechos.deptos_con_movimiento(recorte)
    vista = vista_base(ctx, spec, "ranking.html", [
        h_filtro_anio(ctx), h_filtro_medida(ctx, spec), h_filtro_categoria(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    vista["enlaces"] = [
        {"texto": "Ver el mapa", "href": "85-mapa-movimientos-departamento.html"},
        {"texto": "Evolución de un departamento", "href": "85-departamento-evolucion.html"},
    ]
    pie = ctx.pie(spec)

    for anio in ctx.anios_cerrados:
        for medida in spec["opciones_medida"]:
            for categoria in h_categorias_con_total(ctx, spec, medida):
                elemento = h_ranking(ctx, spec, pie,
                                     valores_filtro={"anio": str(anio), "medida": medida,
                                                     "categoria": categoria},
                                     anio=anio, medida=medida, categoria=categoria,
                                     items=[(g, hechos.nombre[g],
                                             hechos.total_depto(recorte, anio, g, categoria, medida),
                                             hechos.total_depto(recorte, anio, g, categoria,
                                                                otra_medida(medida)))
                                            for g in deptos],
                                     etiqueta_columna="Departamento",
                                     anterior=lambda g, c=categoria, m=medida:
                                         hechos.total_depto(recorte, anio - 1, g, c, m))
                if elemento is None:
                    continue
                clave = "|".join([str(anio), medida, categoria])
                vista["combos"][clave] = {"elementos": [elemento]}
    return vista


def otra_medida(medida):
    return "documentos" if medida == "cabezas" else "cabezas"


def h_categorias_con_total(ctx, spec, medida):
    """Las categorias que tiene sentido ofrecer para esa medida.

    Con `documentos` solo existe el total: el mismo DTE puede amparar varias categorias, asi que
    la fuente no lo abre. Las combinaciones que faltan las explica `sin_combinacion`, en vez de
    devolver los numeros del total con un rotulo que diria algo falso.
    """
    if medida == "documentos":
        return [c for c in spec["opciones_categoria"] if c == "Total"]
    return list(spec["opciones_categoria"])


def h_ranking(ctx, spec, pie, valores_filtro, anio, medida, categoria, items,
              etiqueta_columna, anterior=None):
    """Cuadro de ranking: barras horizontales + tabla. `items` = [(id, nombre, valor, otro)]."""
    con_dato = [(i, n, v, o) for i, n, v, o in items if v]
    if not con_dato:
        return None
    total = sum(v for _, _, v, _ in con_dato)
    ordenados = sorted(con_dato, key=lambda t: (-t[2], pr.clave_alfabetica(t[1])))
    puesto_de = puestos([(i, v) for i, _, v, _ in ordenados])
    unidad = hac.UNIDAD[medida]

    filas = [{"total": True, "celdas": h_celdas_fila(
        spec, "", "Total provincia",
        ctx.texto(sum(v for _, _, v, _ in con_dato)),
        ctx.texto(sum(o or 0 for _, _, _, o in con_dato)),
        medida, "100,0%", "")}]
    for ident, nombre, valor, otro in ordenados:
        variacion = ""
        if anterior is not None:
            previo = anterior(ident)
            variacion = texto_variacion(valor / previo - 1) if previo else "S/D"
        filas.append({"id": ident, "celdas": h_celdas_fila(
            spec, "%d°" % puesto_de[ident], nombre, ctx.texto(valor), ctx.texto(otro),
            medida, participacion_texto(valor, total), variacion)})
    barras = [{"n": nombre, "v": valor, "t": ctx.texto(valor) + " " + h_unidad_texto(medida),
               "extra": participacion_texto(valor, total) + " del total"}
              for _, nombre, valor, _ in ordenados]
    return {
        "clase": "grafico",
        "titulo": ctx.titulo(spec, valores_filtro),
        "subtitulo": ctx.subtitulo_unidad(unidad, categoria),
        "unidad": unidad,
        "pie": pie,
        "columnas": h_columnas(spec, etiqueta_columna),
        "filas": filas,
        "barras": barras,
        "color": ctx.colores.solido(medida),
        "eje": ctx.eje([b["v"] for b in barras], unidad),
        "nota": "",
    }


def h_columnas(spec, etiqueta_columna):
    columnas = []
    for columna in spec["columnas_tabla"]:
        campo = columna["campo"]
        etiqueta = etiqueta_columna if campo in H_CAMPOS_NOMBRE else columna["etiqueta"]
        columnas.append({"etiqueta": etiqueta,
                         "num": campo not in H_CAMPOS_NOMBRE and campo != "puesto"})
    return columnas


H_CAMPOS_NOMBRE = ("departamento", "motivo", "provincia_destino", "provincia_origen",
                   "categoria", "anio", "mes_etiqueta")


def h_celdas_fila(spec, puesto, nombre, texto_medida, texto_otra, medida, participacion,
                  variacion):
    """Arma la fila en el orden de columnas que declara el spec, sin adivinar."""
    celdas = []
    for columna in spec["columnas_tabla"]:
        campo = columna["campo"]
        if campo == "puesto":
            celdas.append(puesto)
        elif campo in H_CAMPOS_NOMBRE:
            celdas.append(nombre)
        elif campo == medida:
            celdas.append(texto_medida)
        elif campo in ("cabezas", "documentos"):
            celdas.append(texto_otra)
        elif campo.startswith("participacion"):
            celdas.append(participacion)
        elif campo.startswith("variacion"):
            celdas.append(h_celda_variacion(variacion))
        else:
            celdas.append("")
    return celdas


def h_celda_variacion(texto):
    if not texto or texto == "S/D":
        return {"t": texto or "", "c": "sd"}
    clase = "var-pos" if texto.startswith("+") else ("var-neg" if texto.startswith("-")
                                                     else "var-cero")
    return {"t": texto, "c": clase}


# --------------------------------------------------------------------------
# 85-mapa-movimientos-departamento
# --------------------------------------------------------------------------
def construir_hacienda_mapa(ctx, spec):
    """Coropleta departamental + ranking linkeado, igual que el mapa de cultivos."""
    hechos = ctx.hechos
    recorte = h_recorte_de(spec)
    vista = vista_base(ctx, spec, "mapa.html", [
        h_filtro_anio(ctx), h_filtro_medida(ctx, spec), h_filtro_categoria(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    vista["enlaces"] = [
        {"texto": "Ranking completo", "href": "85-ranking-departamento-origen.html"},
        {"texto": "Matriz de origen y destino", "href": "85-matriz-od-interna.html"},
    ]
    pie = ctx.pie(spec)
    advertencia = limpiar(
        ctx.protocolo["mapa"]["escala"]["advertencia_obligatoria_en_pantalla"]["texto"])

    nombres_mapa = dict(hechos.nombre)
    for geo_id, nombre in nombres_extra_geojson().items():
        nombres_mapa.setdefault(geo_id, nombre)
    todos = sorted(nombres_mapa_solo_deptos(nombres_mapa))

    for anio in ctx.anios_cerrados:
        for medida in spec["opciones_medida"]:
            for categoria in h_categorias_con_total(ctx, spec, medida):
                unidad = hac.UNIDAD[medida]
                deptos, con_dato = [], []
                for geo in todos:
                    valor = hechos.total_depto(recorte, anio, geo, categoria, medida)
                    otro = hechos.total_depto(recorte, anio, geo, categoria, otra_medida(medida))
                    fila = {"id": geo, "nombre": nombres_mapa[geo], "v": valor,
                            "tooltip": [[hac.ETIQUETA_MEDIDA[medida], ctx.texto(valor)],
                                        [hac.ETIQUETA_MEDIDA[otra_medida(medida)],
                                         ctx.texto(otro)]]}
                    deptos.append(fila)
                    if valor:
                        con_dato.append((geo, nombres_mapa[geo], valor))
                if not con_dato:
                    continue
                escala = pr.quintiles([v for _, _, v in con_dato])
                rampa = ctx.colores.rampa(medida)
                for fila in deptos:
                    if not fila["v"]:
                        fila["v"] = None
                        fila["color"] = ctx.colores.sin_dato
                        fila["borde"] = ctx.protocolo["mapa"]["sin_dato"]["borde"]
                    else:
                        fila["color"] = rampa[min(pr.clase_de(fila["v"], escala["cortes"]),
                                                  len(rampa)) - 1]

                valores_filtro = {"anio": str(anio), "medida": medida, "categoria": categoria}
                total = hechos.total_anual(recorte, anio, categoria, medida)
                ordenados = ordenar_desc(con_dato)
                puesto_de = puestos([(g, v) for g, _, v in ordenados])
                elemento_mapa = {
                    "clase": "mapa",
                    "titulo": ctx.titulo(spec, valores_filtro),
                    "subtitulo": ctx.subtitulo_unidad(unidad, categoria),
                    "unidad": unidad,
                    "pie": pie,
                    "geojson": GEOJSON,
                    "aspecto": aspecto_mapa(), "relacion": relacion_mapa(),
                    "advertencia": advertencia,
                    "deptos": [{"id": f["id"], "nombre": f["nombre"], "v": f["v"],
                                "color": f["color"], "borde": f.get("borde"),
                                "tooltip": f["tooltip"]} for f in deptos],
                    "leyenda": h_leyenda_mapa(ctx, deptos, escala, medida, rampa),
                    "ficha": url_de_vista(ctx, "85-departamento-evolucion", "?departamento="),
                    "total": "Total de la provincia: %s %s" % (ctx.texto(total),
                                                               h_unidad_texto(medida)),
                }
                elemento_tabla = {
                    "clase": "tabla",
                    "titulo": ctx.titulo(spec, valores_filtro, tipo="ranking", grafico=None),
                    "subtitulo": ctx.subtitulo_unidad(unidad, categoria),
                    "unidad": unidad,
                    "pie": pie,
                    "columnas": [{"etiqueta": "Puesto", "num": False},
                                 {"etiqueta": "Departamento", "num": False},
                                 {"etiqueta": hac.ETIQUETA_MEDIDA[medida], "num": True},
                                 {"etiqueta": "% de la provincia", "num": True}],
                    "filas": [{"id": g, "celdas": ["%d°" % puesto_de[g], n, ctx.texto(v),
                                                   participacion_texto(v, total)]}
                              for g, n, v in ordenados],
                    "nota": h_nota_sin_movimiento([f["nombre"] for f in deptos if f["v"] is None]),
                }
                clave = "|".join([str(anio), medida, categoria])
                vista["combos"][clave] = {"elementos": [elemento_mapa, elemento_tabla]}
    return vista


def h_leyenda_mapa(ctx, deptos, escala, medida, rampa):
    """Misma mecanica que la leyenda del mapa de cultivos, sin redondeo de pantalla: aca el
    dato es un conteo exacto y no hay dos clases que puedan solaparse por redondear."""
    plantilla = ctx.protocolo["mapa"]["leyenda"]["plantilla_de_clase"]
    por_clase = {}
    for fila in deptos:
        if fila["v"] is None:
            continue
        por_clase.setdefault(pr.clase_de(fila["v"], escala["cortes"]), []).append(fila["v"])
    clases = []
    for clase in sorted(por_clase, reverse=True):
        crudos = sorted(por_clase[clase])
        clases.append({
            "color": rampa[min(clase, len(rampa)) - 1],
            "conteo": "(%d)" % len(crudos),
            "texto": (plantilla.replace("{minimo}", pr.fmt_numero(crudos[0]))
                               .replace("{maximo}", pr.fmt_numero(crudos[-1]))),
        })
    sin_dato = [f for f in deptos if f["v"] is None]
    if sin_dato:
        clases.append({"color": ctx.colores.sin_dato,
                       "texto": ctx.protocolo["mapa"]["sin_dato"]["etiqueta_en_leyenda"],
                       "conteo": "(%d)" % len(sin_dato)})
    return {"encabezado": hac.NOMBRE_EJE[hac.UNIDAD[medida]], "clases": clases}


def h_nota_sin_movimiento(nombres):
    if not nombres:
        return ""
    return ("Sin movimientos registrados en esta combinación: %s."
            % pr.unir_lista(sorted(nombres, key=pr.clave_alfabetica),
                            {"separador_lista": ", ", "ultimo_de_lista": " y "}))


# --------------------------------------------------------------------------
# 85-departamento-evolucion
# --------------------------------------------------------------------------
def construir_hacienda_departamento(ctx, spec):
    """JC f80: 'HACER LOS 5 AÑOS POR DEPARTAMENTO', con variaciones (f81)."""
    hechos = ctx.hechos
    recorte = h_recorte_de(spec)
    deptos = hechos.deptos_con_movimiento(recorte)
    defecto = h_departamento_de_mas_movimiento(ctx, recorte, deptos)
    vista = vista_base(ctx, spec, "serie.html", [
        h_filtro_departamento(ctx, deptos, defecto),
        h_filtro_medida(ctx, spec),
        h_filtro_apertura(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    vista["enlaces"] = [{"texto": "Ranking de departamentos",
                         "href": "85-ranking-departamento-origen.html"}]
    pie = ctx.pie(spec)
    anios = ctx.anios_cerrados

    for geo in deptos:
        for medida in spec["opciones_medida"]:
            unidad = hac.UNIDAD[medida]
            for apertura in spec["opciones_apertura"]:
                totales = [hechos.total_depto(recorte, a, geo, "Total", medida) for a in anios]
                if all(not v for v in totales):
                    continue
                if apertura == "total":
                    textos, extras = h_textos_y_variacion(ctx, totales, h_unidad_texto(medida))
                    series = [{"nombre": hac.ETIQUETA_MEDIDA[medida], "tipo": "bar", "eje": 0,
                               "apilado": False, "color": ctx.colores.solido(medida),
                               "v": totales, "t": textos, "extra": extras}]
                    resumen = h_variaciones(ctx, totales) + [
                        {"etiqueta": "Participación provincial %d" % anios[-1],
                         "valor": participacion_texto(
                             totales[-1],
                             hechos.total_anual(recorte, anios[-1], "Total", medida))}]
                else:
                    categorias = h_categorias_visibles(ctx, medida)
                    if not categorias:
                        continue
                    series, resumen = [], []
                    for categoria in categorias:
                        valores = [hechos.total_depto(recorte, a, geo, categoria, medida)
                                   for a in anios]
                        if all(not v for v in valores):
                            continue
                        series.append({
                            "nombre": categoria, "tipo": "bar", "eje": 0, "apilado": True,
                            "color": ctx.color_categoria[categoria], "v": valores,
                            "t": [ctx.texto(v) + " " + h_unidad_texto(medida) for v in valores],
                            "extra": [participacion_texto(v, totales[i]) + " del departamento"
                                      for i, v in enumerate(valores)]})
                elemento = {
                    "clase": "grafico",
                    "titulo": ctx.titulo(spec, {"departamento": geo, "medida": medida,
                                                "apertura": apertura}, anios),
                    "subtitulo": ctx.subtitulo_unidad(unidad),
                    "unidad": unidad,
                    "pie": pie,
                    "grafico": "barras-apiladas" if apertura == "categoria" else "barras",
                    "x": [str(a) for a in anios],
                    "series": series,
                    "eje": ctx.eje(totales, unidad),
                    "eje2": None,
                    "resumen": resumen,
                    "nota": nota_total_vs_categorias(ctx, apertura),
                }
                vista["combos"]["|".join([geo, medida, apertura])] = {"elementos": [elemento]}
    return vista


def h_departamento_de_mas_movimiento(ctx, recorte, deptos):
    """Default calculado, no escrito: el que mas movio en el año por defecto. Si el dato cambia,
    cambia el default (mismo criterio que en la base 9)."""
    totales = [(g, ctx.hechos.nombre[g],
                ctx.hechos.total_depto(recorte, ctx.anio_defecto, g, "Total", "cabezas") or 0.0)
               for g in deptos]
    return ordenar_desc(totales)[0][0]


# --------------------------------------------------------------------------
# 85-estacionalidad-mensual
# --------------------------------------------------------------------------
def construir_hacienda_estacionalidad(ctx, spec):
    """JC f45: 'MENSUALIZAR LOS MISMOS CUADROS PARA ESTABLECER ESTACIONALIDAD'.

    Una linea por año y los 12 meses en el eje X. Si los 53 meses se apilaran en una sola linea
    corrida, el patron estacional se perderia adentro de la tendencia.
    """
    hechos = ctx.hechos
    vista = vista_base(ctx, spec, "serie.html", [
        h_filtro_medida(ctx, spec), h_filtro_recorte(ctx, spec), h_filtro_categoria(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    vista["advertencias"] = [limpiar(a["texto_en_pantalla"]) for a in spec["advertencias"]]
    pie = ctx.pie(spec)
    # Aca el año en curso SI entra: cada mes se compara contra el mismo mes de los otros años.
    anios = ctx.anios
    colores_anio = ctx.colores.por_categoria([str(a) for a in anios])

    for medida in spec["opciones_medida"]:
        unidad = hac.UNIDAD[medida]
        for recorte in spec["opciones_recorte"]:
            for categoria in h_categorias_con_total(ctx, spec, medida):
                series, todos = [], []
                for anio in anios:
                    valores = [hechos.total_mes(recorte, anio, m, categoria, medida)
                               for m in range(1, 13)]
                    if all(v is None for v in valores):
                        continue
                    total_anio = hechos.total_anual(recorte, anio, categoria, medida)
                    todos.extend(v for v in valores if v is not None)
                    series.append({
                        "nombre": str(anio) + (" (hasta mayo)" if anio == ctx.anio_en_curso
                                               else ""),
                        "tipo": "line", "eje": 0, "apilado": False,
                        "color": colores_anio[str(anio)],
                        "punteada": anio == ctx.anio_en_curso,
                        "v": valores,
                        "t": [ctx.texto(v) + " " + h_unidad_texto(medida) for v in valores],
                        "extra": [participacion_texto(v, total_anio) + " del año"
                                  for v in valores]})
                if not series:
                    continue
                elemento = {
                    "clase": "grafico",
                    "titulo": ctx.titulo(spec, {"medida": medida, "recorte": recorte},
                                         [str(a) for a in anios]),
                    "subtitulo": ctx.subtitulo_unidad(unidad, categoria),
                    "unidad": unidad,
                    "pie": pie,
                    "grafico": "lineas",
                    "x": list(MESES_CORTOS),
                    "series": series,
                    "eje": ctx.eje(todos, unidad),
                    "eje2": None,
                    "resumen": [],
                    "nota": "",
                }
                clave = "|".join([medida, recorte, categoria])
                vista["combos"][clave] = {"elementos": [elemento]}
    return vista


# --------------------------------------------------------------------------
# 85-movimientos-por-motivo
# --------------------------------------------------------------------------
def construir_hacienda_motivo(ctx, spec):
    """JC f156-f180: por que se mueve la hacienda, con el mismo cuadro para los tres recortes."""
    hechos = ctx.hechos
    vista = vista_base(ctx, spec, "ranking.html", [
        h_filtro_anio(ctx), h_filtro_recorte(ctx, spec), h_filtro_medida(ctx, spec),
    ])
    aviso = spec["advertencias"][0]
    pie = ctx.pie(spec)

    for anio in ctx.anios_cerrados:
        for recorte in spec["opciones_recorte"]:
            for medida in spec["opciones_medida"]:
                items = [(m, m, hechos.total_motivo(recorte, anio, m, "Total", medida),
                          hechos.total_motivo(recorte, anio, m, "Total", otra_medida(medida)))
                         for m in hechos.motivos[recorte]]
                elemento = h_ranking(
                    ctx, spec, pie,
                    valores_filtro={"anio": str(anio), "recorte": recorte, "medida": medida},
                    anio=anio, medida=medida, categoria="Total", items=items,
                    etiqueta_columna="Motivo")
                if elemento is None:
                    continue
                if recorte == aviso["aplica_cuando"].split("=")[-1].strip():
                    elemento["nota"] = limpiar(aviso["texto_en_pantalla"])
                clave = "|".join([str(anio), recorte, medida])
                vista["combos"][clave] = {"elementos": [elemento]}
    return vista


# --------------------------------------------------------------------------
# 85-extraccion-por-provincia-destino / 85-introduccion-por-provincia-origen
# --------------------------------------------------------------------------
def construir_hacienda_contraparte(ctx, spec):
    """A que provincias va la hacienda que sale, y de cuales viene la que entra.

    Las dos vistas son la misma con el universo cambiado. Las dos salen detras del gate hasta
    que Francisco decida: ver _comunes-base-85.sensibilidad.
    """
    hechos = ctx.hechos
    recorte = h_recorte_de(spec)
    vista = vista_base(ctx, spec, "ranking.html", [
        h_filtro_anio(ctx), h_filtro_medida(ctx, spec), h_filtro_categoria(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    otra = ("85-introduccion-por-provincia-origen" if recorte == "extraccion"
            else "85-extraccion-por-provincia-destino")
    vista["enlaces"] = [{"texto": "Ver el flujo en el otro sentido", "href": otra + ".html"}]
    pie = ctx.pie(spec)
    etiqueta = "Provincia de destino" if recorte == "extraccion" else "Provincia de origen"

    for anio in ctx.anios_cerrados:
        for medida in spec["opciones_medida"]:
            for categoria in h_categorias_con_total(ctx, spec, medida):
                items = [(p, p,
                          hechos.total_contraparte(recorte, anio, p, categoria, medida),
                          hechos.total_contraparte(recorte, anio, p, categoria,
                                                   otra_medida(medida)))
                         for p in hechos.contrapartes[recorte]]
                elemento = h_ranking(
                    ctx, spec, pie,
                    valores_filtro={"anio": str(anio), "medida": medida, "categoria": categoria},
                    anio=anio, medida=medida, categoria=categoria, items=items,
                    etiqueta_columna=etiqueta,
                    anterior=lambda p, c=categoria, m=medida:
                        hechos.total_contraparte(recorte, anio - 1, p, c, m))
                if elemento is None:
                    continue
                clave = "|".join([str(anio), medida, categoria])
                vista["combos"][clave] = {"elementos": [elemento]}
    return vista


# --------------------------------------------------------------------------
# 85-balance-introduccion-extraccion
# --------------------------------------------------------------------------
def construir_hacienda_balance(ctx, spec):
    """JC f36-f42: lo que entra menos lo que sale, por categoria.

    Se dibuja con dos series y no con una: una barra positiva y una negativa son dos lecturas
    distintas (la provincia recibio / la provincia entrego) y el color tiene que decirlo. Con
    una sola serie ECharts pinta todas las barras del mismo color y el signo hay que buscarlo
    en el eje.
    """
    hechos = ctx.hechos
    vista = vista_base(ctx, spec, "serie.html", [h_filtro_anio(ctx)])
    pie = ctx.pie(spec)
    colores = ctx.protocolo["tablas"]["colores_de_variacion"]
    categorias = ["Total"] + ctx.categorias

    for anio in ctx.anios_cerrados:
        entran, salen, balances = [], [], []
        for categoria in categorias:
            entra = hechos.total_anual("introduccion", anio, categoria, "cabezas") or 0.0
            sale = hechos.total_anual("extraccion", anio, categoria, "cabezas") or 0.0
            entran.append(entra)
            salen.append(sale)
            balances.append(entra - sale)
        if not any(balances):
            continue
        textos = [ctx.texto(b) + " cabezas" for b in balances]
        extras = ["entran %s, salen %s" % (ctx.texto(entran[i]), ctx.texto(salen[i]))
                  for i in range(len(categorias))]
        series = [
            # Las dos series se apilan aunque no se sumen nunca: cada categoria tiene valor en
            # una sola de las dos, y apilarlas hace que la barra quede centrada sobre su
            # etiqueta en vez de correrse a un costado dejando el hueco de la otra serie.
            {"nombre": "Entra más de lo que sale", "tipo": "bar", "eje": 0, "apilado": True,
             "color": colores["positivo"],
             "v": [b if b > 0 else None for b in balances], "t": textos, "extra": extras},
            {"nombre": "Sale más de lo que entra", "tipo": "bar", "eje": 0, "apilado": True,
             "color": colores["negativo"],
             "v": [b if b <= 0 else None for b in balances], "t": textos, "extra": extras},
        ]
        elemento = {
            "clase": "grafico",
            "titulo": ctx.titulo(spec, {"anio": str(anio)}),
            "subtitulo": ctx.subtitulo_unidad("cabezas"),
            "unidad": "cabezas",
            "pie": pie,
            "grafico": spec["grafico"],
            "x": list(categorias),
            "series": series,
            "eje": ctx.eje(balances, "cabezas"),
            "eje2": None,
            "resumen": [
                {"etiqueta": "Entraron a la provincia", "valor": ctx.texto(entran[0])},
                {"etiqueta": "Salieron de la provincia", "valor": ctx.texto(salen[0])},
                {"etiqueta": "Balance", "valor": ctx.texto(balances[0])},
            ],
            "nota": h_lectura_del_balance(ctx, categorias, balances),
        }
        vista["combos"][str(anio)] = {"elementos": [elemento]}
    return vista


def h_lectura_del_balance(ctx, categorias, balances):
    """El balance cuenta que tipo de provincia ganadera es Santiago. Vale la pena decirlo con
    palabras y no solo con barras, pero SIN inventar: las categorias salen del propio dato."""
    entran = [c for c, b in zip(categorias, balances) if c != "Total" and b > 0]
    salen = [c for c, b in zip(categorias, balances) if c != "Total" and b < 0]
    if not entran or not salen:
        return ""
    lista = lambda xs: pr.unir_lista([pr.minuscula_inicial(x) for x in xs],
                                     {"separador_lista": ", ", "ultimo_de_lista": " y "})
    return ("Entran más de las que salen: %s. Salen más de las que entran: %s."
            % (lista(entran), lista(salen)))


# --------------------------------------------------------------------------
# 85-matriz-od-interna
# --------------------------------------------------------------------------
def construir_hacienda_matriz(ctx, spec):
    """JC f84-f113: 'COMPLETAR TODA LA MATRIZ'. 27x27 celdas por año y por categoria.

    Se renderiza como MATRIZ con intensidad de color, no como diagrama de cintas: con 27
    origenes y 27 destinos un diagrama de flujos es ilegible, y ademas la matriz es la forma en
    que JC ya lo penso en su planilla.
    """
    hechos = ctx.hechos
    recorte = h_recorte_de(spec)
    presentacion = spec["presentacion_matriz"]
    deptos = sorted(hechos.deptos_con_movimiento(recorte),
                    key=lambda g: pr.clave_alfabetica(hechos.nombre[g]))
    vista = vista_base(ctx, spec, "flujo-od.html", [
        h_filtro_anio(ctx), h_filtro_medida(ctx, spec), h_filtro_categoria(ctx, spec),
    ])
    vista["sin_combinacion"] = SIN_CATEGORIA_EN_DOCUMENTOS
    # 729 celdas por combinacion y 40 combinaciones: el JSON entero pesa 800 KB y nadie mira
    # dos años a la vez. Se parte por año y la pagina baja el indice mas una parte.
    vista["particion"] = "anio"
    vista["enlaces"] = [{"texto": "Ver el mapa de salidas",
                         "href": "85-mapa-movimientos-departamento.html"}]
    pie = ctx.pie(spec)

    for anio in ctx.anios_cerrados:
        for medida in spec["opciones_medida"]:
            unidad = hac.UNIDAD[medida]
            for categoria in h_categorias_con_total(ctx, spec, medida):
                celdas = {}
                for origen in deptos:
                    for destino in deptos:
                        valor = hechos.total_od(anio, origen, destino, categoria, medida)
                        if valor:
                            celdas[(origen, destino)] = valor
                if not celdas:
                    continue
                escala = pr.quintiles(sorted(celdas.values()))
                rampa = ctx.colores.rampa(medida)
                filas = []
                for origen in deptos:
                    fila_celdas, suma = [], 0.0
                    for destino in deptos:
                        valor = celdas.get((origen, destino))
                        if valor is None:
                            fila_celdas.append(None)
                            continue
                        suma += valor
                        clase = min(pr.clase_de(valor, escala["cortes"]), len(rampa))
                        fila_celdas.append({
                            "t": ctx.texto(valor), "c": rampa[clase - 1],
                            "claro": clase >= 4,      # texto en blanco sobre los dos tonos oscuros
                            "d": "%s a %s" % (hechos.nombre[origen], hechos.nombre[destino]),
                            "diag": origen == destino})
                    filas.append({"n": hechos.nombre[origen], "celdas": fila_celdas,
                                  "total": ctx.texto(suma)})
                totales_columna = []
                for destino in deptos:
                    suma = sum(celdas.get((o, destino), 0.0) for o in deptos)
                    totales_columna.append(ctx.texto(suma))
                elemento = {
                    "clase": "tabla",
                    "titulo": ctx.titulo(spec, {"anio": str(anio), "medida": medida,
                                                "categoria": categoria}),
                    "subtitulo": ctx.subtitulo_unidad(unidad, categoria),
                    "unidad": unidad,
                    "pie": pie,
                    "esquina": "Sale de \\ Entra a",
                    "columnas": [hechos.nombre[g] for g in deptos],
                    "filas": filas,
                    "totales": {"n": "Total", "celdas": totales_columna,
                                "total": ctx.texto(sum(celdas.values()))},
                    "leyenda": h_leyenda_matriz(ctx, celdas, escala, medida, rampa),
                    "vacia": presentacion["celda_vacia"],
                    "nota": limpiar(presentacion["diagonal"]["nota"]),
                }
                clave = "|".join([str(anio), medida, categoria])
                vista["combos"][clave] = {"elementos": [elemento]}
    return vista


def h_leyenda_matriz(ctx, celdas, escala, medida, rampa):
    plantilla = ctx.protocolo["mapa"]["leyenda"]["plantilla_de_clase"]
    por_clase = {}
    for valor in celdas.values():
        por_clase.setdefault(min(pr.clase_de(valor, escala["cortes"]), len(rampa)), []).append(valor)
    clases = []
    for clase in sorted(por_clase, reverse=True):
        crudos = sorted(por_clase[clase])
        clases.append({"color": rampa[clase - 1], "conteo": "(%d)" % len(crudos),
                       "texto": (plantilla.replace("{minimo}", pr.fmt_numero(crudos[0]))
                                          .replace("{maximo}", pr.fmt_numero(crudos[-1])))})
    return {"encabezado": hac.NOMBRE_EJE[hac.UNIDAD[medida]], "clases": clases}


# --------------------------------------------------------------------------
# 85-tambos-engorde-corral
# --------------------------------------------------------------------------
def construir_hacienda_tambos(ctx, spec):
    """JC f214-f254. Con su advertencia en mayuscula: ya estan contados en los totales."""
    hechos = ctx.hechos
    vista = vista_base(ctx, spec, "serie.html", [
        {"id": "tipo_establecimiento", "etiqueta": "Establecimiento",
         "opciones": opciones(spec["opciones_tipo_establecimiento"]),
         "defecto": spec["defaults"]["tipo_establecimiento"]},
        h_filtro_apertura(ctx, spec, "desglose", "Apertura"),
    ])
    vista["advertencias"] = [limpiar(a["texto_en_pantalla"]) for a in spec["advertencias"]]
    pie = ctx.pie(spec)
    anios = ctx.anios_cerrados
    medidas = ["ingreso_establecimiento", "egreso_establecimiento"]

    for tipo in spec["opciones_tipo_establecimiento"]:
        for desglose in spec["opciones_desglose"]:
            if desglose == "total":
                eje_x = [str(a) for a in anios]
                columnas = [(a, None) for a in anios]
            else:
                # JC f250: solo las celdas con valor distinto de cero. Un eje con 20 barras en
                # cero no dice nada y ademas empuja el resto contra el margen.
                con_dato = [g for g in hechos.deptos
                            if any(hechos.establecimiento.get((a, tipo, g, m))
                                   for a in anios for m in medidas)]
                con_dato.sort(key=lambda g: (-sum(
                    hechos.establecimiento.get((a, tipo, g, m), 0.0)
                    for a in anios for m in medidas), pr.clave_alfabetica(hechos.nombre[g])))
                if not con_dato:
                    continue
                eje_x = [hechos.nombre[g] for g in con_dato]
                columnas = [(None, g) for g in con_dato]

            series, todos = [], []
            for medida in medidas:
                valores = []
                for anio, geo in columnas:
                    if anio is not None:
                        valores.append(hechos.establecimiento.get((anio, tipo, None, medida)))
                    else:
                        valores.append(sum(hechos.establecimiento.get((a, tipo, geo, medida), 0.0)
                                           for a in anios) or None)
                todos.extend(v for v in valores if v is not None)
                series.append({"nombre": hac.ETIQUETA_MEDIDA[medida], "tipo": "bar", "eje": 0,
                               "apilado": False, "color": ctx.colores.rampa(medida)[
                                   4 if medida == "egreso_establecimiento" else 2],
                               "v": valores,
                               "t": [ctx.texto(v) + " cabezas" for v in valores],
                               "extra": [""] * len(valores)})
            if not todos:
                continue
            elemento = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, {"tipo_establecimiento": tipo, "desglose": desglose},
                                     anios),
                "subtitulo": ctx.subtitulo_unidad("cabezas"),
                "unidad": "cabezas",
                "pie": pie,
                "grafico": "barras",
                "x": eje_x,
                "series": series,
                "eje": ctx.eje(todos, "cabezas"),
                "eje2": None,
                "resumen": h_resumen_establecimiento(ctx, tipo, anios, medidas),
                "nota": ("Suma de los %s años de la ventana." % len(anios)
                         if desglose != "total" else ""),
            }
            vista["combos"]["|".join([tipo, desglose])] = {"elementos": [elemento]}
    return vista


def h_resumen_establecimiento(ctx, tipo, anios, medidas):
    totales = {m: sum(ctx.hechos.establecimiento.get((a, tipo, None, m), 0.0) for a in anios)
               for m in medidas}
    return [{"etiqueta": "Ingresos del período", "valor": ctx.texto(totales[medidas[0]])},
            {"etiqueta": "Egresos del período", "valor": ctx.texto(totales[medidas[1]])},
            {"etiqueta": "Diferencia",
             "valor": ctx.texto(totales[medidas[0]] - totales[medidas[1]])}]


# ==========================================================================
# Familia DTV de hortalizas (bases 56 batata, 57 cebolla, 75 papa)
# Seccion Agricultura > Cultivos intensivos
# ==========================================================================
# Tres bases, un mart, una seccion: son la misma cosa contada por producto y el producto es un
# filtro. Las reglas de negocio viven en _comunes-dtv-hortalizas.yaml; los dos specs que se
# construyen aca son tablero-cultivos-intensivos y dtv-departamento-movimientos.
#
# Sobre `cantidad` (bultos): el mart la marca `agregable=false` y hasta el 23-sep-2026 no se
# sumaba en ningun lado. Desde esa fecha se suma en UN solo panel (el combo del tablero, que es
# lo que dibujo JC en su maqueta) y SIEMPRE junto con su composicion de acondicionamiento, que
# es la que decide si el eje puede decir "bolsas" o tiene que decir "bultos"
# (`composicion_de_bultos`). Fuera de ese panel sigue sin sumarse.
# La superficie estimada no es una medida del mart: es un calculo de JC sobre las toneladas
# (ver `dtv_valor`).

# La superficie estimada no es una medida del mart: es la formula de JC. Se trata como una
# medida mas en todo el resto del codigo, y el unico lugar donde existe la formula es
# `dtv_valor`.
SUPERFICIE_ESTIMADA = "superficie_estimada_ha"
DTV_UNIDAD = {"peso_tn": "tn", "movimientos": "dtv", SUPERFICIE_ESTIMADA: "ha"}
# Sufijo que se escribe al lado del numero en tooltips y celdas. No es la unidad del protocolo
# (esa es DTV_UNIDAD, la que nombra el subtitulo): es como lo escribe JC en su maqueta.
DTV_SUFIJO = {"peso_tn": "tn", "movimientos": "DTV", SUPERFICIE_ESTIMADA: "ha"}
DTV_ETIQUETA = {"peso_tn": "Toneladas movidas", "movimientos": "DTV emitidas",
                SUPERFICIE_ESTIMADA: "Superficie estimada"}
# `cantidad` (bultos) no entra en estos tres diccionarios a proposito: su rotulo NO es fijo,
# lo resuelve `composicion_de_bultos` contra el mart producto por producto. Un diccionario
# constante seria justamente el rotulo inventado que la fuente no sostiene.


class ContextoVegetales:
    """El mismo papel que `Contexto`, para la familia DTV de hortalizas. Misma interfaz publica.

    Se identifica por FAMILIA y no por numero de base: las tres bases comparten mart, modelo de
    analisis y titulos, asi que compartir contexto es lo que evita que se desincronicen.
    """

    familia = "dtv-hortalizas"

    def __init__(self, hechos, precios=None):
        # `precios` es el mart de la base 8 (precios mayoristas del MCBA). No es de esta
        # familia -son cotizaciones de un mercado, no declaraciones de transito- pero alimenta
        # UN panel de su tablero: el cuarto grafico de la maqueta "Agri 2". Viaja en este
        # contexto y no en uno propio porque no tiene pagina propia: sin el tablero de cultivos
        # intensivos, el panel de precios no existe.
        self.precios = precios
        self.protocolo = pr.cargar_protocolo()
        self.comunes = pr.cargar_comunes(self.familia)
        self.theme = pr.cargar_theme()
        self.navegacion = pr.cargar_yaml(os.path.join(DIR_SITE, "navegacion.yaml"))
        self.hechos = hechos
        self.colores = pr.Colores(self.protocolo, self.comunes, self.theme)
        self.notas = self.comunes["notas_metodologicas"]

        parametros = self.comunes["parametros"]
        self.productos = [p["valor"] for p in parametros["productos"]]
        self.etiqueta_producto = {p["valor"]: p["etiqueta"] for p in parametros["productos"]}
        self.producto_defecto = parametros["producto_por_defecto"]

        # La ventana se resuelve contra el mart, no contra una lista escrita a mano: los
        # Excels se rebajan de SharePoint en cada publicacion y una lista fija dejaria de
        # mostrar el año nuevo el dia que SENASA lo mande.
        ventana = self.comunes["ventana_anios"]
        self.anios = hechos.anios[-ventana["cantidad"]:]
        self.anio_defecto = self.anios[-1] if self.anios else None

        self.rendimientos = self.comunes["estimacion_superficie"]["rendimientos_kg_ha"]
        self.aclaracion_superficie = limpiar(
            self.comunes["estimacion_superficie"]["aclaracion_al_pie"])

        # Cobertura mensual por producto, resuelta contra el mart. La papa llega solo de
        # septiembre a diciembre (asi la entrega SENASA, no es un faltante) y eso cambia como
        # se lee CADA numero suyo: el rotulo viaja al titulo, a la tarjeta de contexto y a las
        # notas al pie. `recortes` es lo que el Titulador pone entre parentesis.
        self.meses_producto, self.cobertura = {}, {}
        for producto in self.productos:
            meses = hechos.meses_con_dato.get(producto) or []
            self.meses_producto[producto] = meses
            self.cobertura[producto] = rotulo_de_cobertura(meses)
        self.recortes = {p: ("(%s)" % r if r else None) for p, r in self.cobertura.items()}
        self._verificar_cobertura()

        self.titulador = pr.Titulador(self.protocolo, self.comunes, self.familia,
                                      recortes=self.recortes)

        # Como se rotula el eje de los bultos (la condicion con la que Francisco habilito
        # sumar `cantidad` el 23-sep-2026). El umbral y los nombres cortos son parametros de
        # negocio: viven en el spec de comunes, nunca en el codigo.
        self.rotulo_bultos = self.comunes["rotulo_de_bultos"]

        # Un color fijo por DEPARTAMENTO para las barras apiladas, asignado una sola vez sobre
        # los departamentos con movimiento de TODA la familia (no producto por producto): asi
        # ROBLES es del mismo color en cebolla, batata y papa. Es el caso
        # _protocolo-presentacion.colores.series_de_un_grafico (el color distingue categorias,
        # no magnitudes), con la paleta categorica del theme.
        con_dato = sorted({geo for producto in self.productos
                           for geo in hechos.deptos_con_movimiento(producto)})
        self.color_depto = self.colores.por_categoria(
            [hechos.nombre[geo] for geo in con_dato])

        self.iconos_cultivo = pr.cargar_yaml(
            os.path.join(DIR_SITE, "iconos-cultivo.yaml"))["cultivos"]

    def _verificar_cobertura(self):
        """Avisa (no corta) si el mart no coincide con la cobertura que declara el spec.

        No corta a proposito: el dia que SENASA mande los meses que faltan, el sitio tiene que
        publicarlos solo. Lo que no puede pasar es que el cambio ocurra en silencio.
        """
        esperada = self.comunes["cobertura_mensual"]["esperada_2026_09_23"]
        for producto in self.productos:
            declarada = esperada.get(producto)
            real = self.cobertura[producto] or "completa"
            if declarada is not None and declarada != real:
                print("[site] AVISO la cobertura mensual de %r cambio: el spec esperaba %r y "
                      "el mart trae %r. Actualizar _comunes-dtv-hortalizas.cobertura_mensual."
                      % (producto, declarada, real))

    # -- textos ---------------------------------------------------------
    def pie(self, spec):
        esperado = (spec.get("fuente") or {}).get("organismo_esperado")
        reales = sorted(self.hechos.fuentes)
        if esperado and reales != [esperado]:
            raise pr.ErrorDeProtocolo(
                "%s espera fuente %r y el mart trae %r" % (spec["slug_vista"], esperado, reales))
        return pr.pie_de_fuente(self.protocolo, reales,
                                (spec.get("fuente") or {}).get("publicacion"))

    def subtitulo_unidad(self, unidad):
        return pr.subtitulo_por_unidad(self.protocolo, unidad)

    def titulo(self, spec, valores, anios=None, tipo=None, grafico=None):
        return self.titulador.componer(
            spec, valores, self.hechos.nombre, campanias_efectivas=anios,
            ventanas={"ventana_anios": self.anios}, tipo=tipo, grafico=grafico)

    def notas_de(self, spec, extra=()):
        ids = list(spec.get("notas_metodologicas") or []) + list(extra)
        vistas, salida = set(), []
        for nota_id in ids:
            if nota_id in vistas or nota_id not in self.notas:
                continue
            vistas.add(nota_id)
            nota = self.notas[nota_id]
            salida.append({"titulo": nota["titulo"], "texto": limpiar(nota["texto"])})
        return salida

    def periodo_de(self, producto, anio):
        """"Año 2025" o "Año 2025 · septiembre a diciembre".

        Regla dura de la familia: ningun rotulo de papa puede sugerir un año completo.
        """
        texto = "Año %d" % anio
        rotulo = self.cobertura.get(producto)
        return "%s · %s" % (texto, rotulo) if rotulo else texto

    # -- numeros ---------------------------------------------------------
    def texto(self, valor, medida="peso_tn"):
        """Toneladas y DTV son medidas de la propia declaracion, no estimaciones: se muestran
        completas. La superficie estimada va sin decimales: el kilo de precision no lo tiene."""
        if valor is None:
            return "S/D"
        return pr.fmt_numero(valor, 0)

    def con_unidad(self, valor, medida):
        if valor is None:
            return "S/D"
        return "%s %s" % (self.texto(valor, medida), DTV_SUFIJO[medida])

    def eje(self, valores, unidad):
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje(min(limpios + [0.0]), max(limpios + [0.0]))
        etiquetas = {clave_js(m): pr.fmt_numero(m, 0) for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": veg.NOMBRE_EJE[unidad]}

    def eje_secundario(self, valores, unidad, intervalos):
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje_secundario(min(limpios + [0.0]), max(limpios + [0.0]), intervalos)
        etiquetas = {clave_js(m): pr.fmt_numero(m, 0) for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": veg.NOMBRE_EJE[unidad]}


def rotulo_de_cobertura(meses):
    """"septiembre a diciembre" cuando el producto no tiene los doce meses; None si los tiene.

    Sale del MART, no de un texto escrito a mano: el dia que la fuente mande los meses que
    faltan, el rotulo desaparece solo y ningun cartel queda mintiendo.
    """
    if not meses or len(meses) >= 12:
        return None
    nombres = [veg.MESES[m - 1] for m in meses]
    if meses == list(range(meses[0], meses[-1] + 1)):
        return "%s a %s" % (nombres[0], nombres[-1])
    return pr.unir_lista(nombres, {"separador_lista": ", ", "ultimo_de_lista": " y "})


# --------------------------------------------------------------------------
# Valores: la unica puerta a los numeros de la familia
# --------------------------------------------------------------------------
def dtv_valor(ctx, producto, anio, medida, geo=None, mes=None):
    """Un numero de la familia, con el ambito y el grano que se le pidan.

    `geo=None` es el total provincial, que se calcula SUMANDO departamentos de origen (el mart
    no trae fila provincial). `superficie_estimada_ha` no es una medida del mart: es la formula
    de JC (kilos de las DTV sobre el rendimiento promedio del cultivo), y los rendimientos son
    parametros de negocio que viven en _comunes-dtv-hortalizas, nunca en el codigo.
    """
    if medida == SUPERFICIE_ESTIMADA:
        toneladas = dtv_valor(ctx, producto, anio, "peso_tn", geo, mes)
        if toneladas is None:
            return None
        return toneladas * 1000.0 / ctx.rendimientos[producto]
    hechos = ctx.hechos
    if mes is not None:
        if geo is not None:
            return hechos.total_depto_mes(producto, anio, geo, mes, medida)
        return hechos.total_mes(producto, anio, mes, medida)
    if geo is not None:
        return hechos.total_depto(producto, anio, geo, medida)
    return hechos.total_anual(producto, anio, medida)


# --------------------------------------------------------------------------
# Filtros de la familia
# --------------------------------------------------------------------------
def dtv_filtro_anio(ctx):
    """El año es el periodo y va en la barra de la cabecera, en chips cortos."""
    return {"id": "anio", "etiqueta": "Año", "zona": "periodo",
            "opciones": [{"v": str(a), "t": str(a), "corto": str(a)[2:]} for a in ctx.anios],
            "defecto": str(ctx.anio_defecto)}


def dtv_filtro_producto(ctx, zona):
    """El selector de producto, con icono, en la zona que le declare el spec.

    Sin opcion "Todos" (_comunes-dtv-hortalizas.parametros.incluye_todos): la hoja Modelo
    analisis de JC pide visualizacion POR PRODUCTO, y un agregado de cebolla + batata + papa
    mezclaria tres cadenas comerciales y tres rendimientos distintos.
    """
    lista = con_iconos_de_cultivo(
        ctx, opciones(ctx.productos, ctx.etiqueta_producto))
    return {"id": "producto", "etiqueta": "Producto", "zona": zona,
            "opciones": lista, "defecto": ctx.producto_defecto}


def dtv_filtro_producto_en_paneles(ctx, declarado):
    """El MISMO filtro de producto, dibujado dentro de dos paneles con rotulos distintos.

    Es lo que dibuja JC en la maqueta "Agri 2" y lo que pidio Francisco el 23-sep-2026: el
    cuadro de DTV tiene su fila de chips ("DTV Cebolla", "DTV Batata", "DTV Papa") y el de
    estimaciones la suya ("Cebolla", "Batata", "Papa"). No hay selector global arriba.

    UN solo filtro, dos dibujos: la clave de la combinacion se arma con `producto` una sola
    vez y comun.js mantiene en sincronia todos los controles que declaran el mismo
    `data-filtro`. Dos filtros separados se podrian desincronizar; uno dibujado dos veces, no.

    El rotulo de cada fila sale del spec (`selectores.producto.paneles[].rotulo`), con
    `{producto}` como unico slot: la palabra "DTV" no se escribe en el codigo.
    """
    base = dtv_filtro_producto(ctx, "panel")
    copias = []
    for destino in declarado["paneles"]:
        plantilla = destino["rotulo"]
        copias.append({
            "panel": destino["panel"],
            "opciones": [dict(opcion, t=titulo_literal(plantilla, producto=opcion["t"]))
                         for opcion in base["opciones"]],
        })
    base["paneles"] = copias
    return base


def dtv_filtro_departamento(ctx):
    """Ambito: el total provincial y los 27 departamentos.

    Van los 27 y no solo los que tienen DTV: asi el clic sobre un departamento del mapa sin
    movimiento llega a una pagina que DICE que no hay declaraciones, en vez de quedarse mudo
    en el ambito anterior. La cobertura baja es el dato, no un faltante.
    """
    valores = ["provincia"] + list(ctx.hechos.deptos)
    etiquetas = {"provincia": "Total provincia"}
    for geo in ctx.hechos.deptos:
        etiquetas[geo] = ctx.hechos.nombre[geo]
    return {"id": "departamento", "etiqueta": "Ámbito",
            "opciones": opciones(valores, etiquetas), "defecto": "provincia"}


# --------------------------------------------------------------------------
# Paneles del tablero (la grilla 2x2 de la hoja "Agri 2" de JC)
# --------------------------------------------------------------------------
# Cuatro paneles y ni uno mas, los que JC dibujo en su maqueta:
#
#   combo             barras de bultos + linea de toneladas, por año, dos ejes  (chart9)
#   apiladas          toneladas por departamento de origen, apiladas por año    (chart10)
#   precios-mcba      declarado y NO dibujado: la base 8 no tiene mart          (chart8)
#   tabla-superficie  estimaciones de superficies cosechadas, por departamento  (sin grafico)
#
# El panel `precios-mcba` no se construye aca: no tiene datos, es estatico y lo dibuja
# Tablero.tsx desde el JSON de la pagina.


def composicion_de_bultos(ctx, producto):
    """(rotulo del eje, nota de composicion) para los bultos declarados de un producto.

    Los dos salen del MART, nunca de un texto fijo. Es la condicion con la que Francisco
    habilito sumar `cantidad` el 23-sep-2026: el eje solo puede decir "bolsas" si la fuente lo
    sostiene, y la nota al pie tiene que mostrar de que esta hecha la mezcla. La regla y el
    umbral viven en _comunes-dtv-hortalizas.rotulo_de_bultos; aca solo se aplican.

    Si manda SENASA un año con otra mezcla, el rotulo cambia solo en la proxima publicacion.
    """
    regla = ctx.rotulo_bultos
    partes = ctx.hechos.composicion_acondicionamiento(producto, ctx.anios)
    if not partes:
        return None, None
    total = sum(valor for _, valor in partes)
    principal, mayor = partes[0]
    if mayor / total >= regla["umbral_bolsas"] and principal in regla["nombre_corto"]:
        rotulo = regla["nombre_corto"][principal]
    else:
        rotulo = regla["generico"]
    # Los tres formatos mas pesados con su participacion, y el resto agrupado. Se escriben con
    # el nombre TAL COMO lo declara la fuente ("Bolsas/Bolsitas", "Big-bags"): renombrarlos
    # seria interpretar.
    detalle = ["%s %s" % (nombre, pr.fmt_pct(valor / total * 100, 1))
               for nombre, valor in partes[:3]]
    resto = sum(valor for _, valor in partes[3:])
    if resto:
        detalle.append("otros formatos %s" % pr.fmt_pct(resto / total * 100, 1))
    nota = "Composición de los bultos declarados: %s." % pr.unir_lista(
        detalle, {"separador_lista": ", ", "ultimo_de_lista": " y "})
    if rotulo == regla["generico"]:
        nota += (" El eje dice «%s» y no «bolsas» porque ningún formato llega al %s del total."
                 % (regla["generico"], pr.fmt_pct(regla["umbral_bolsas"] * 100, 0)))
    return rotulo, nota


def producto_con_recorte(ctx, producto):
    """"Cebolla" o "Papa (septiembre a diciembre)".

    Al salir la tarjeta de contexto (la maqueta no la tiene), el parentesis de cobertura es lo
    que hace que ningun numero de papa se pueda leer como un año completo. Va en el titulo de
    los TRES cuadros con datos, no en uno solo.
    """
    etiqueta = ctx.etiqueta_producto[producto]
    recorte = ctx.recortes.get(producto)
    return "%s %s" % (etiqueta, recorte) if recorte else etiqueta


def nota_de_cobertura_mensual(ctx, producto):
    """La frase de la papa, o "" si el producto trae los doce meses.

    Corta a proposito: va al pie de paneles que ya tienen otra nota obligatoria y el pie se
    recorta a tres lineas. El recorte de cobertura ya viaja ademas en el titulo del cuadro
    ("Papa (septiembre a diciembre)"), asi que aca alcanza con decir lo que el titulo no puede:
    que los meses que faltan no son meses en cero.
    """
    if not ctx.cobertura[producto]:
        return ""
    return ("La fuente entrega %s solo de %s: los meses que faltan no son ceros."
            % (pr.minuscula_inicial(ctx.etiqueta_producto[producto]), ctx.cobertura[producto]))


def tabla_bajo_el_grafico(ctx, declarado, anio, filas):
    """La tabla de datos que va DEBAJO de un grafico por año (maqueta "Agri 2", tercera vuelta).

    Las columnas son las MISMAS categorias del grafico (los años de la ventana) y cada fila
    trae su rotulo mas un valor ya formateado por columna. La columna del año elegido en la
    tira de periodo va marcada (`destacada`), que es el unico efecto que el selector tiene
    sobre un cuadro cuyo sujeto es la serie completa.

    `filas` es [(rotulo, [textos por año], es_total)]. Los numeros llegan formateados: este
    archivo no decide precision, la decide `ctx.texto` con la regla del spec de comunes.
    """
    columnas = [{"etiqueta": declarado["encabezado_primera_columna"], "num": False}]
    for a in ctx.anios:
        columnas.append({"etiqueta": str(a), "num": True,
                         "destacada": a == anio})
    return {
        "columnas": columnas,
        "filas": [{"celdas": [rotulo] + textos, "actual": total} for rotulo, textos, total in filas],
    }


def panel_combo_intensivos(ctx, spec, producto, anio, pie):
    """Barras de bultos declarados + linea de toneladas, por año, con dos ejes.

    Es el primer grafico de la maqueta "Agri 2" (chart9, ancla G9:AD23), titulo literal
    "Cebolla - Sgo del Estero - DTV Envios - Cant bolsas y tn por año": barras `clustered` de
    la serie "Bolsas" y linea de la serie "Tn", cinco categorias = los cinco años.

    La palabra "bolsas" NO es constante: la resuelve `composicion_de_bultos` contra el mart
    producto por producto. En cebolla da "bolsas" (99,6% Bolsas/Bolsitas); en batata (95,7%) y
    en papa (97,1%) da "bultos", y la nota al pie muestra la mezcla en los tres casos.
    """
    declarado = spec["paneles"]["combo"]
    rotulo, nota = composicion_de_bultos(ctx, producto)
    titulo = titulo_literal(declarado["titulo_protocolo"],
                            Producto=producto_con_recorte(ctx, producto),
                            bultos=rotulo or "bultos")
    bultos = [ctx.hechos.total_bultos(producto, a) for a in ctx.anios]
    toneladas = [dtv_valor(ctx, producto, a, "peso_tn") for a in ctx.anios]
    if not [v for v in bultos if v] or not [v for v in toneladas if v]:
        return panel_vacio(titulo, "No hay declaraciones de este producto en la ventana de años.")
    eje_izq = ctx.eje(bultos, "bultos")
    eje_izq["nombre"] = pr.mayuscula_inicial(rotulo)
    eje_der = ctx.eje_secundario(toneladas, "tn", len(eje_izq["etiquetas"]) - 1)
    cobertura = nota_de_cobertura_mensual(ctx, producto)
    return {
        "titulo": titulo,
        "subtitulo": "",
        "pie": pie,
        "x": [str(a) for a in ctx.anios],
        "etiquetas": ["Año %d" % a for a in ctx.anios],
        # El año de la tira de periodo se DESTACA en el eje: los cinco años se dibujan siempre
        # (el sujeto del cuadro es la comparacion entre años) y sin esta marca el selector
        # quedaria mudo sobre este panel.
        "destacado": ctx.anios.index(anio) if anio in ctx.anios else None,
        "barras": {
            # El nombre de la serie sale del spec, con su concordancia ya resuelta
            # (rotulo_de_bultos.nombre_de_la_serie): nada de gramatica en el codigo.
            "nombre": ctx.rotulo_bultos["nombre_de_la_serie"][rotulo],
            "color": ctx.colores.solido("cantidad"),
            # Colores para cuando el zoom dibuja otro producto encima: el mismo tipo de
            # variable, otro paso de su rampa (`Colores.comparacion`).
            "color_comp": ctx.colores.comparacion("cantidad"),
            "puntos": bultos,
            "textos": ["%s %s" % (ctx.texto(v), rotulo) if v is not None else "S/D"
                       for v in bultos],
        },
        "linea": {
            "nombre": DTV_ETIQUETA["peso_tn"],
            "color": ctx.colores.solido("peso_tn"),
            "color_comp": ctx.colores.comparacion("peso_tn"),
            "puntos": toneladas,
            "textos": [ctx.con_unidad(v, "peso_tn") for v in toneladas],
        },
        "eje": eje_izq,
        "eje2": eje_der,
        # La tabla de datos bajo el grafico (Imagen 109 de la hoja): dos filas, los bultos y
        # las toneladas, con los mismos cinco años como columnas. El rotulo de la primera fila
        # lo decide la composicion, igual que el eje: "Bolsas" en cebolla, "Bultos" en el resto.
        "tabla": tabla_bajo_el_grafico(ctx, declarado["tabla"], anio, filas_tabla_combo(
            ctx, declarado, rotulo, bultos, toneladas, "")),
        # La MISMA tabla con cada fila rotulada con su producto ("Cebolla · Bolsas"). Es la que
        # se dibuja cuando el zoom compara dos productos: dos bloques con los mismos rotulos no
        # se podrian distinguir. Se compone aca, como todo texto del sitio.
        "tabla_comp": tabla_bajo_el_grafico(ctx, declarado["tabla"], anio, filas_tabla_combo(
            ctx, declarado, rotulo, bultos, toneladas, ctx.etiqueta_producto[producto])),
        "nota": (nota + " " + cobertura).strip(),
    }


def filas_tabla_combo(ctx, declarado, rotulo, bultos, toneladas, sujeto):
    """Las dos filas de la tabla del cuadro combinado: los bultos y las toneladas.

    Con `sujeto` los rotulos quedan rotulados con el producto, que es lo que hace falta cuando
    hay dos tablas una debajo de la otra (comparacion del zoom). La plantilla del prefijo sale
    del spec (`tabla.rotulo_comparado`), como todo texto.
    """
    def rotular(texto_fila):
        if not sujeto:
            return texto_fila
        return titulo_literal(declarado["tabla"]["rotulo_comparado"],
                              Producto=sujeto, Fila=texto_fila)
    return [
        (rotular(titulo_literal(declarado["tabla"]["filas"][0]["rotulo"],
                                Bultos=pr.mayuscula_inicial(rotulo))),
         [ctx.texto(v) if v is not None else "S/D" for v in bultos], False),
        (rotular(declarado["tabla"]["filas"][1]["rotulo"]),
         [ctx.texto(v, "peso_tn") if v is not None else "S/D" for v in toneladas], False),
    ]


def panel_apiladas_intensivos(ctx, spec, producto, anio, pie):
    """Toneladas por departamento de ORIGEN, apiladas, un bloque por año.

    Segundo grafico de la maqueta (chart10, ancla G27:AD42): barras `stacked`, siete series
    para la cebolla (una por departamento) y las mismas cinco categorias de años.

    Entran TODOS los departamentos con movimiento, sin "Resto": son pocos por definicion
    (7 / 6 / 4 de 27) y el grafico de JC tampoco agrupa ninguno. El alto de cada pila es el
    total provincial de ese año, que es lo que el mapa mostraba antes.
    """
    declarado = spec["paneles"]["apiladas"]
    titulo = titulo_literal(declarado["titulo_protocolo"],
                            Producto=producto_con_recorte(ctx, producto))
    totales = []
    for geo in ctx.hechos.deptos:
        puntos = [dtv_valor(ctx, producto, a, declarado["medida"], geo) for a in ctx.anios]
        suma = sum(v for v in puntos if v is not None)
        if suma:
            totales.append((suma, geo, puntos))
    if not totales:
        return panel_vacio(titulo, "No hay movimientos de este producto en la ventana de años.")
    # De mayor a menor: el departamento que mas pesa queda en la BASE de la pila y las lonjas
    # finas arriba, que es donde se las ve. El desempate por nombre deja el orden deterministico.
    totales.sort(key=lambda t: (-t[0], pr.clave_alfabetica(ctx.hechos.nombre[t[1]])))
    series = []
    for _, geo, puntos in totales:
        nombre = ctx.hechos.nombre[geo]
        series.append({
            "nombre": nombre,
            # El color lo fija el NOMBRE del departamento y se asigna una sola vez para toda la
            # familia (ctx.color_depto): asi ROBLES es del mismo color en cebolla, batata y
            # papa, aunque cambie de puesto en la pila.
            "color": ctx.color_depto[nombre],
            "puntos": [v if v is not None else 0.0 for v in puntos],
            "textos": [ctx.con_unidad(v, declarado["medida"]) for v in puntos],
        })
    alturas = [sum(s["puntos"][i] for s in series) for i in range(len(ctx.anios))]
    con_dato = ctx.hechos.deptos_con_movimiento(producto)
    nota = ("%d de los %d departamentos de la provincia %s DTV de %s en estos años. Los que no "
            "aparecen no son ceros: no tienen ninguna declaración de tránsito de este producto."
            % (len(con_dato), len(ctx.hechos.deptos),
               "tiene" if len(con_dato) == 1 else "tienen",
               pr.minuscula_inicial(ctx.etiqueta_producto[producto])))
    cobertura = nota_de_cobertura_mensual(ctx, producto)
    return {
        "titulo": titulo,
        "subtitulo": ctx.subtitulo_unidad(DTV_UNIDAD[declarado["medida"]]),
        "pie": pie,
        "x": [str(a) for a in ctx.anios],
        "etiquetas": ["Año %d" % a for a in ctx.anios],
        "destacado": ctx.anios.index(anio) if anio in ctx.anios else None,
        "series": series,
        "totales": [ctx.con_unidad(v, declarado["medida"]) for v in alturas],
        "eje": ctx.eje(alturas, DTV_UNIDAD[declarado["medida"]]),
        # La tabla de datos bajo el grafico (Imagen 111 de la hoja): una fila por departamento
        # de origen y una columna por año, en toneladas. ALFABETICA, que es como la dibuja JC
        # y como se busca una fila en una tabla; el grafico de arriba apila de mayor a menor
        # porque ahi el orden tiene un motivo visual (la base de la pila es el que mas pesa).
        # El total provincial va PRIMERO y marcado (protocolo, tablas.estructura).
        "tabla": tabla_bajo_el_grafico(ctx, declarado["tabla"], anio, (
            [("Total provincia",
              [ctx.texto(v, declarado["medida"]) for v in alturas], True)]
            + [(ctx.hechos.nombre[geo],
                [ctx.texto(v if v is not None else 0.0, declarado["medida"]) for v in puntos],
                False)
               for _, geo, puntos in sorted(
                   totales, key=lambda t: pr.clave_alfabetica(ctx.hechos.nombre[t[1]]))]
        )),
        "nota": (nota + " " + cobertura).strip(),
    }


def panel_tabla_superficie(ctx, spec, producto, anio, pie):
    """"Estimaciones de superficies cosechadas (*)": el cuarto panel de la maqueta.

    No tiene grafico (celda AM35 de la hoja, con las dos notas de JC en AF36 y AF37): es la
    tabla que JC dibujo en la Imagen 122 (ancla AG40:BE52), DEPARTAMENTOS POR AÑO en
    hectareas, con fila TOTAL. Va por departamento porque es lo que la propia maqueta aclara
    al lado del calculo ("Para provincia y departamentos", celda AO65) y porque ese es el
    lugar donde JC quiere su mapa de calor cuando entre (celda F72): el dia que llegue,
    reemplaza a estas filas sin mover nada mas.

    Las toneladas ya no van al lado: la tabla del cuadro de apiladas muestra exactamente esas
    toneladas por departamento y por año, que son el numerador de esta cuenta. El calculo
    sigue a la vista y auditable, una sola vez y en el cuadro que le corresponde.
    """
    declarado = spec["paneles"]["tabla-superficie"]
    titulo = titulo_literal(declarado["titulo_protocolo"],
                            Producto=producto_con_recorte(ctx, producto),
                            desde=str(ctx.anios[0]), hasta=str(ctx.anios[-1]))
    medida = SUPERFICIE_ESTIMADA
    # Una fila por departamento con DTV en ALGUN año de la ventana; dentro de la fila, el año
    # sin declaraciones va en CERO, como en la maqueta. La regla "un departamento sin DTV no
    # se dibuja como cero" es sobre la FILA, no sobre la celda.
    filas = []
    for geo in ctx.hechos.deptos:
        puntos = [dtv_valor(ctx, producto, a, medida, geo) for a in ctx.anios]
        if not [v for v in puntos if v]:
            continue
        filas.append((ctx.hechos.nombre[geo], puntos))
    if not filas:
        return panel_vacio(titulo, "No hay DTV de este producto en la ventana de años.")
    filas.sort(key=lambda f: pr.clave_alfabetica(f[0]))
    totales = [dtv_valor(ctx, producto, a, medida) for a in ctx.anios]
    # El total provincial va PRIMERO y marcado, como manda el protocolo
    # (_protocolo-presentacion.tablas.estructura.total_arriba). El rotulo es el de la maqueta.
    cuerpo = [(declarado["rotulo_del_total"],
               [ctx.texto(v if v is not None else 0.0, medida) for v in totales], True)]
    for nombre, puntos in filas:
        cuerpo.append((nombre,
                       [ctx.texto(v if v is not None else 0.0, medida) for v in puntos],
                       False))
    nota = ctx.aclaracion_superficie
    cobertura = nota_de_cobertura_mensual(ctx, producto)
    if cobertura:
        nota = cobertura + " " + nota
    return {
        "titulo": titulo,
        "subtitulo": ctx.subtitulo_unidad(DTV_UNIDAD[medida]),
        "pie": pie,
        "tabla": tabla_bajo_el_grafico(ctx, declarado, anio, cuerpo),
        "nota": nota,
    }


# --------------------------------------------------------------------------
# precios-mcba: el cuarto grafico de la maqueta "Agri 2" (chart8), base 8
# --------------------------------------------------------------------------
# Es el unico panel del sitio que NO viaja en las combinaciones del tablero. Motivo: sus
# filtros son SUYOS -grupo, especie, cuatro dimensiones de producto, modo y rango- y no tienen
# nada que ver con el producto y el año que gobiernan los otros tres cuadros. Meterlos en la
# clave de la combinacion multiplicaria las 15 combinaciones del tablero por varios cientos y
# el navegador bajaria todo eso para dibujar una sola linea.
#
# COMO SE ACOTA EL PAYLOAD (el riesgo real: seis dimensiones por 101 meses)
# Cuatro decisiones, en orden de cuanto ahorran:
#
#   1. No se genera el producto cartesiano. Las combinaciones que EXISTEN en el mart son 67
#      (contra varios miles posibles). El reticulado de selecciones -cada dimension en "Todas"
#      o en uno de sus valores- da 650 selecciones sobre esas 67 combinaciones.
#   2. Las 650 selecciones caen sobre 159 series distintas: cuando una dimension tiene un solo
#      valor, elegirlo o dejar "Todas" seleccionan lo mismo. Se guarda la serie una vez y un
#      mapa `claves` de seleccion a serie.
#   3. El JSON se parte POR ESPECIE y POR MODO (el mismo patron con que el mapa de cultivos
#      parte sus 600 combinaciones). La pagina baja un archivo: el de la especie que se esta
#      mirando, en el modo que se esta mirando. La serie diaria pesa quince veces mas que la
#      mensual y el modo por defecto es el mensual, asi que casi nunca se baja.
#   4. Todo lo que se repite entre series del mismo archivo sale a una tabla del archivo: las
#      escalas del eje vertical y los rotulos de mes. Una escala se usa en decenas de series.
TODAS = "*"          # el valor del desplegable "Todas". No colisiona con `Precios.SIN_DATO`
                     # (""), que es la opcion "Sin dato": son dos cosas distintas y el JSON
                     # tiene que poder distinguirlas.
MODOS = ("mensual", "diario")


def capitalizar_valor(valor):
    """"CHANTENAY" -> "Chantenay", "ANC.COKENA" -> "Anc.cokena", "008/012" -> "008/012".

    Inicial mayuscula por palabra y el resto en minuscula. Es como escribe JC los valores de
    estos cuatro desplegables en su maqueta ("Chantennay", "Bolsa", "Primera", "Todas") y es
    mecanico: no hay tabla de nombres porque ponerle nombre propio a decenas de abreviaturas
    de la fuente seria interpretarla (la misma regla con la que los departamentos se muestran
    tal como los manda dim_geo).
    """
    return " ".join(p[:1].upper() + p[1:].lower() for p in str(valor).split(" "))


def etiqueta_de_dimension(etiquetas, valor):
    """El texto de una opcion de los cuatro desplegables, incluidos los dos casos especiales.

    `TODAS` y el valor vacio (la dimension que la fuente NO declara) son opciones de verdad y
    llevan el rotulo que declara el spec. Sin la segunda, las cinco especies sin variedad
    -REMOLACHA, PEREJIL, SANDIA, ACELGA y TUNA- desaparecerian al primer filtro.
    """
    if valor == TODAS:
        return etiquetas["rotulo_todas"]
    if valor == pc.Precios.SIN_DATO:
        return etiquetas["rotulo_sin_dato"]
    return capitalizar_valor(valor)


def precio_texto(valor):
    """"415,08 $/kg". Dos decimales siempre: los precios van de 3,79 a 4.500 y el centavo es
    informacion en la punta baja de la serie."""
    return "%s $/kg" % pr.fmt_numero(valor, 2)


class TablaDeEscalas:
    """Las escalas del eje vertical de un archivo, sin repetir ninguna.

    El eje arranca en CERO, como en el resto del sitio, asi que su unica variable es el maximo
    del tramo VISIBLE. Se guarda una escala por cada tope posible y cada serie se queda con los
    indices de las suyas; el navegador elige despues la primera que cubre lo que se ve, sin
    componer un solo numero (los rotulos de cada marca vienen resueltos de aca).

    Es lo que hace que al achicar el rango la escala se ajuste y se vean las variaciones
    (_protocolo-presentacion.formato_v1.cuarta_tanda.escala_legible): con una escala fija de 0
    a 4.500, los primeros años de cualquier serie quedarian pegados al piso.
    """

    def __init__(self):
        self.escalas = []
        self._indice = {}

    def indices_para(self, valores):
        """Los indices de las escalas que esta serie puede llegar a necesitar, de menor a mayor
        tope. Una por cada valor de la serie, deduplicadas: cualquier tramo tiene como maximo
        uno de esos valores."""
        firmas = []
        for tope in sorted(set(valores)):
            marcas = pr.marcas_eje(0.0, tope)
            firma = (marcas["min"], marcas["max"], marcas["paso"])
            if firma in firmas:
                continue
            firmas.append(firma)
            if firma not in self._indice:
                enteras = all(float(m).is_integer() for m in marcas["marcas"])
                self._indice[firma] = len(self.escalas)
                self.escalas.append({
                    "min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                    "etiquetas": {clave_js(m): pr.fmt_numero(m, 0 if enteras else 2)
                                  for m in marcas["marcas"]},
                })
        firmas.sort(key=lambda f: f[1])
        return [self._indice[f] for f in firmas]


def marcas_del_eje_horizontal(periodos):
    """Meses agrupados por año, como el eje del grafico de JC.

    Devuelve (marcas, cortes):
      marcas  [[indice, "Jul", "2017"], ...] una por MES -no una por punto-, con el año
              siempre escrito. En la serie mensual hay una marca por punto; en la diaria, una
              por mes (un punto por dia daria miles de marcas).
      cortes  los indices de marca donde empieza un año nuevo. Es la guia vertical que separa
              los grupos, y ademas le dice al navegador en que marcas escribir el año: en esas
              y en la primera que se vea.

    Cuales de esas marcas entran finalmente en el eje lo decide el navegador segun el ancho,
    pero los TEXTOS salen todos de aca.
    """
    marcas, cortes = [], []
    ultimo = None
    for i, periodo in enumerate(periodos):
        clave = periodo[:7]
        if clave == ultimo:
            continue
        if ultimo is None or clave[:4] != ultimo[:4]:
            cortes.append(len(marcas))
        marcas.append([i, veg.MESES_CORTOS[int(clave[5:7]) - 1], clave[:4]])
        ultimo = clave
    return marcas, cortes


def frase_de_cobertura(periodos):
    """"Cotiza 44 meses, entre julio de 2017 y diciembre de 2025."

    Sale del mart y no de un texto fijo: es la prueba de la regla 3 de JC ("rangos solo donde
    aparece la especie"), o sea que la serie no tiene huecos porque los meses sin dato no se
    dibujan ni se ofrecen en el rango. Sin esta frase, un lector podria leer 44 puntos
    seguidos como 44 meses consecutivos.
    """
    def largo(periodo):
        return "%s de %s" % (veg.MESES[int(periodo[5:7]) - 1], periodo[:4])
    frase = "Esta selección cotiza %s %s" % (pr.fmt_numero(len(periodos), 0),
                                             "mes" if len(periodos) == 1 else "meses")
    if len(periodos) > 1:
        frase += ", entre %s y %s" % (largo(periodos[0]), largo(periodos[-1]))
    return frase + "."


def puntos_mensuales(precios, especie, combos):
    """[(periodo, valor, texto)] con un punto por mes con dato, y solo esos (regla 3 de JC).

    Cada punto es el PROMEDIO SIMPLE de los promedios diarios del mes: es lo unico que el mart
    habilita (`agregable: false`, `agregacion: promedio`, `ponderacion: sin ponderar`). El
    tooltip dice sobre cuantos dias se promedio, que es la parte que no se puede esconder.
    """
    salida = []
    for periodo, precio, cotizaciones, dias in precios.serie_mensual(especie, combos):
        detalle = "%s %s con cotización" % (pr.fmt_numero(dias, 0),
                                            "día" if dias == 1 else "días")
        if cotizaciones != dias:
            detalle += " (%s cotizaciones)" % pr.fmt_numero(cotizaciones, 0)
        texto = "%s de %s · %s · promedio de %s" % (
            veg.MESES[int(periodo[5:7]) - 1].capitalize(), periodo[:4],
            precio_texto(precio), detalle)
        salida.append((periodo, precio, texto))
    return salida


def puntos_diarios(precios, especie, combos):
    """[(fecha, valor, texto)] con un punto por dia con cotizacion.

    El rango se sigue eligiendo POR MES ("Mes" y "Año", como lo dibuja JC), asi que el id de
    cada punto es su fecha y el recorte se hace contra el mes que la fecha contiene.
    """
    salida = []
    for fecha, precio, cotizaciones in precios.serie_diaria(especie, combos):
        texto = "%s/%s/%s · %s" % (fecha[8:], fecha[5:7], fecha[:4], precio_texto(precio))
        if cotizaciones > 1:
            texto += " · promedio de %s cotizaciones del día" % pr.fmt_numero(cotizaciones, 0)
        salida.append((fecha, precio, texto))
    return salida


def serie_de_precios(declarado, puntos, modo, escalas, titulo):
    """Un bloque de serie listo para dibujar: valores, textos, marcas del eje y su nota al pie.

    `meses` e `inicios` son el mecanismo del rango: `meses` son los unicos meses elegibles -los
    que tienen dato, que es la regla 3 de JC- e `inicios[k]` es el indice del primer punto del
    mes k. Recortar de "Jul 2017" a "Oct 2018" es quedarse con los puntos entre `inicios` de
    uno y el final del otro; no hace falta mirar ninguna fecha.
    """
    if not puntos:
        return None
    ids = [p[0] for p in puntos]
    valores = [p[1] for p in puntos]
    marcas, cortes = marcas_del_eje_horizontal(ids)
    meses, inicios = [], []
    for i, identificador in enumerate(ids):
        if not meses or meses[-1] != identificador[:7]:
            meses.append(identificador[:7])
            inicios.append(i)
    notas = [limpiar(declarado["notas_al_pie"][modo]),
             limpiar(declarado["notas_al_pie"]["corrientes"]),
             frase_de_cobertura(meses)]
    return {
        "titulo": titulo,
        "valores": valores,
        "textos": [p[2] for p in puntos],
        "marcas": marcas,
        "cortes": cortes,
        "meses": meses,
        "inicios": inicios,
        "escalas": escalas.indices_para(valores),
        "nota": " ".join(notas),
    }


def titulo_de_precios(declarado, especie, combos):
    """"Zanahoria Chantenay - Precio promedio en MCBA, origen Sgo del Estero - $/kg (corrientes)".

    El slot {Producto} es la especie mas la variedad, y la variedad sale del DATO: JC escribe
    "Chantennay" con dos enes y el mart dice "CHANTENAY". Un titulo no puede nombrar algo
    distinto de lo que el grafico muestra.

    La variedad entra SOLO si la seleccion deja una sola variedad no vacia. Con "Todas" sobre
    dos variedades el titulo seria mentira, y en las especies donde la fuente no declara
    variedad (la sandia) no hay nada que agregar.
    """
    variedades = {combo[0] for combo in combos}
    etiqueta = declarado["etiquetas"]["especies"][especie]
    if len(variedades) == 1:
        unica = next(iter(variedades))
        if unica != pc.Precios.SIN_DATO:
            etiqueta = "%s %s" % (etiqueta, capitalizar_valor(unica))
    return titulo_literal(declarado["grafico"]["titulo_protocolo"], Producto=etiqueta)


def seleccion_por_defecto(declarado, opciones, claves):
    """Con que valores arranca cada desplegable en esta especie.

    Los de la maqueta de JC si la especie los tiene, "Todas" si no. Si aun asi la combinacion
    no existe, se afloja de derecha a izquierda hasta que exista: ninguna seleccion por defecto
    puede dejar el cuadro vacio.
    """
    defecto = []
    for selector in declarado["selectores_propios"]:
        pedido = selector["defecto"]
        defecto.append(pedido if pedido in opciones[selector["id"]] else TODAS)
    for i in range(len(defecto), -1, -1):
        clave = "|".join(defecto[:i] + [TODAS] * (len(defecto) - i))
        if clave in claves:
            return clave.split("|")
    raise pr.ErrorDeProtocolo(
        "El panel de precios no encuentra ninguna seleccion con datos (%s)" % defecto)


def archivos_de_especie(declarado, precios, especie):
    """Los dos JSON de una especie: {"mensual": ..., "diario": ...}.

    `claves` mapea cada seleccion posible ("CHANTENAY|BOLSA|Primera|*") a la serie que le
    corresponde. Dos selecciones comparten serie cuando seleccionan las mismas combinaciones,
    que es lo que pasa siempre que una dimension tiene un solo valor.

    `combos` viaja tal cual para que el navegador pueda ENCADENAR los desplegables sin
    recalcular nada: las opciones validas de una dimension son los valores que aparecen en las
    combinaciones que cumplen lo ya elegido. Es lo que evita las pantallas vacias.
    """
    combos = precios.combos[especie]
    opciones = precios.opciones[especie]
    for dim, valores in opciones.items():
        for valor in valores:
            if "|" in valor:
                raise pr.ErrorDeProtocolo(
                    "El mart de precios trae el valor %r en la dimension %s y la clave de "
                    "seleccion usa '|' como separador" % (valor, dim))

    puntos_de = {"mensual": puntos_mensuales, "diario": puntos_diarios}
    escalas = {modo: TablaDeEscalas() for modo in MODOS}
    series = {modo: {} for modo in MODOS}
    claves, por_firma = {}, {}
    for seleccion in itertools.product(*[[None] + opciones[d] for d in pc.DIMENSIONES]):
        elegidos = precios.combos_que_cumplen(especie, seleccion)
        if not elegidos:
            continue
        firma = tuple(elegidos)
        if firma not in por_firma:
            por_firma[firma] = "s%d" % len(por_firma)
            titulo = titulo_de_precios(declarado, especie, elegidos)
            for modo in MODOS:
                series[modo][por_firma[firma]] = serie_de_precios(
                    declarado, puntos_de[modo](precios, especie, elegidos), modo,
                    escalas[modo], titulo)
        claves["|".join(TODAS if v is None else v for v in seleccion)] = por_firma[firma]

    defecto = seleccion_por_defecto(declarado, opciones, claves)
    # Rotulos de mes del archivo: los comparten todas sus series y son los que se leen en los
    # dos desplegables del rango.
    meses = sorted({mes for modo in MODOS for serie in series[modo].values()
                    if serie for mes in serie["meses"]})
    rotulos = {mes: "%s %s" % (veg.MESES_CORTOS[int(mes[5:7]) - 1], mes[:4]) for mes in meses}

    comun = {
        "especie": especie,
        "etiqueta": declarado["etiquetas"]["especies"][especie],
        "dimensiones": {
            d: [{"v": TODAS, "t": etiqueta_de_dimension(declarado["etiquetas"], TODAS)}]
               + [{"v": v, "t": etiqueta_de_dimension(declarado["etiquetas"], v)}
                  for v in opciones[d]]
            for d in pc.DIMENSIONES
        },
        "combos": [list(c) for c in combos],
        "defecto": defecto,
        "claves": claves,
        "rotulos_mes": rotulos,
    }
    return {modo: dict(comun, modo=modo, escalas=escalas[modo].escalas,
                       series=series[modo])
            for modo in MODOS}


def construir_precios_mcba(ctx, spec):
    """El panel de precios del MCBA: lo que va en el JSON de la pagina y sus archivos de datos.

    Devuelve {"pagina": ..., "archivos": [...]}. Los archivos se escriben en `escribir_sitio`,
    que es quien tiene el escritor, y ahi cada chip recibe las rutas de los suyos.
    """
    declarado = spec["paneles"]["precios-mcba"]
    precios = ctx.precios

    reales = sorted(precios.fuentes)
    esperado = declarado["organismo_esperado"]
    if reales != [esperado]:
        raise pr.ErrorDeProtocolo(
            "El panel de precios espera fuente %r y el mart trae %r" % (esperado, reales))

    # Los grupos son los del spec (las dos sub-pestañas que dibuja JC) y tienen que ser los del
    # mart: si la fuente manda un grupo nuevo, el build corta con su nombre en vez de
    # esconderlo detras de una pestaña que no existe.
    declarados = [p["id"] for p in declarado["sub_pestanias"]]
    sobran = [g for g in precios.grupos if g not in declarados]
    if sobran:
        raise pr.ErrorDeProtocolo(
            "El mart de precios trae los grupos %s y el spec solo declara sub-pestañas para %s"
            % (", ".join(sobran), ", ".join(declarados)))

    chips, archivos, pestanias = [], [], []
    for pestania in declarado["sub_pestanias"]:
        especies = precios.especies(pestania["id"])
        if not especies:
            raise pr.ErrorDeProtocolo(
                "La sub-pestaña %s del panel de precios no tiene ninguna especie con "
                "cotizacion en el mart" % pestania["id"])
        for especie in especies:
            if especie not in declarado["etiquetas"]["especies"]:
                raise pr.ErrorDeProtocolo(
                    "El mart de precios trae la especie %r y el spec no le declara etiqueta "
                    "(paneles.precios-mcba.etiquetas.especies)" % especie)
            chips.append({"v": especie, "t": declarado["etiquetas"]["especies"][especie],
                          "grupo": pestania["id"], "i": len(archivos)})
            archivos.append(archivos_de_especie(declarado, precios, especie))
        # El chip que arranca elegido en cada pestaña: el de JC (la zanahoria) en la que el la
        # dibujo, y en la otra -la de frutas, que JC no dibujo- la especie con MAS
        # cotizaciones. El criterio alfabetico abria en LIMON, que tiene una sola cotizacion
        # en todo el periodo: el cuadro arrancaba con un grafico de un punto.
        defecto = declarado["chips_cultivo"]["defecto"]
        pestanias.append({
            "id": pestania["id"], "etiqueta": pestania["etiqueta"],
            "actual": bool(pestania.get("defecto")),
            "especie": (defecto if defecto in especies
                        else max(especies, key=lambda e: (precios.cotizaciones(e),
                                                          pr.clave_alfabetica(e)))),
        })

    # Los nueve chips que JC dibujo tienen que seguir existiendo en el dato. Es una AUDITORIA,
    # no un universo: el universo sale del mart (chips_cultivo.por_que_salen_del_mart).
    faltan = sorted(set(declarado["chips_cultivo"]["dibujados_por_jc"])
                    - {chip["t"] for chip in chips})
    if faltan:
        raise pr.ErrorDeProtocolo(
            "El panel de precios: JC dibujo chips para %s y el mart no trae esas especies"
            % ", ".join(faltan))

    pagina = {
        "familia": declarado["rotulo_de_familia"],
        "pestanias": pestanias,
        "chips": chips,
        "dimensiones": [{"id": s["id"], "rotulo": s["rotulo"]}
                        for s in declarado["selectores_propios"]],
        "modo": {
            "rotulo": declarado["modo"]["rotulo"],
            "opciones": [{"v": o["id"], "t": o["etiqueta"]}
                         for o in declarado["modo"]["opciones"]],
            "defecto": next(o["id"] for o in declarado["modo"]["opciones"]
                            if o.get("defecto")),
        },
        "rango": {"inicio": declarado["rango"]["inicio"]["rotulo"],
                  "fin": declarado["rango"]["fin"]["rotulo"]},
        # El subtitulo lleva la unidad (obligatoria, protocolo) y el tramo que se esta viendo
        # (formato_v1.parametros_explicitos). Los dos slots que quedan son rotulos de mes que
        # el propio build compuso (`rotulos_mes`): el navegador los sustituye, no los arma.
        "subtitulo": declarado["grafico"]["subtitulo_protocolo"].replace(
            "{unidad_larga}", pr.unidad_larga(ctx.protocolo, declarado["grafico"]["unidad"])),
        "color": ctx.colores.solido(declarado["grafico"]["medida"]),
        # La cita de fuente NO es la del tablero (SENASA): este cuadro tiene la suya, que es la
        # que JC escribe en la celda AE31 con el organismo desplegado (backlog 14). El
        # organismo del mart ya se verifico mas arriba contra `organismo_esperado`.
        "pie": declarado["fuente_al_pie"],
    }
    return {"pagina": pagina, "archivos": archivos}


def construir_tablero_intensivos(ctx, spec):
    """El tablero de Agricultura > Cultivos intensivos: la grilla 2x2 de la hoja "Agri 2".

    Cuatro paneles con datos. Tres viajan en las combinaciones del tablero (combo, apiladas y
    tabla de superficies, que dependen del producto y del año); el de precios del MCBA tiene
    sus propios filtros y su propio JSON partido por especie, asi que no lleva combinacion.

    SIN indicadores y SIN tarjeta de contexto: la maqueta va de los selectores directo a los
    paneles (spec, `indicadores.estado: fuera-de-esta-pagina`).
    """
    tablero = tablero_base(ctx, spec, [
        # UN filtro de producto, dibujado como fila de chips dentro de los dos paneles que
        # JC le dibuja chips (el de DTV y el de estimaciones). No hay selector global arriba.
        dtv_filtro_producto_en_paneles(ctx, spec["selectores"]["producto"]),
        dtv_filtro_anio(ctx),
    ])
    tablero["particion"] = "producto"
    # El panel de precios NO entra en las combinaciones: tiene sus propios filtros y su propio
    # JSON, partido por especie (ver `construir_precios_mcba`). Se cuelga del tablero y lo
    # escribe `escribir_sitio`, que es quien tiene el escritor.
    tablero["precios"] = construir_precios_mcba(ctx, spec)
    pie = ctx.pie(spec)
    for producto in ctx.productos:
        for anio in ctx.anios:
            tablero["combos"]["|".join([producto, str(anio)])] = {
                "paneles": {
                    "combo": panel_combo_intensivos(ctx, spec, producto, anio, pie),
                    "apiladas": panel_apiladas_intensivos(ctx, spec, producto, anio, pie),
                    "tabla-superficie": panel_tabla_superficie(ctx, spec, producto, anio, pie),
                },
            }
    return tablero

# --------------------------------------------------------------------------
# dtv-departamento-movimientos (la unica vista de detalle de la seccion)
# --------------------------------------------------------------------------
def construir_dtv_departamento(ctx, spec):
    """Las dos salidas que pide la hoja Modelo analisis de JC, en una sola pagina: "ver todos
    los años" (ambito = Total provincia, que es como abre) y "al hacer clic en un departamento
    que se abra su informacion" (el clic del mapa llega con ?departamento=<geo_id>, el mismo
    patron que 09-departamento-datos en cultivos extensivos).

    Dos cuadros, cada uno con su titulo de protocolo: el grafico de evolucion anual y la tabla
    por año. El grafico lleva arriba los numeros del ultimo año de la ventana.
    """
    vista = vista_base(ctx, spec, "serie.html", [
        dtv_filtro_departamento(ctx),
        dtv_filtro_producto(ctx, "barra"),
    ])
    vista["particion"] = "departamento"
    vista["sin_combinacion"] = (
        "No hay DTV de este producto en este ámbito. Solo hay declaraciones de tránsito donde "
        "hubo movimiento registrado: no informar no es lo mismo que mover cero.")
    pie = ctx.pie(spec)
    ultimo = ctx.anios[-1]
    declarado_tabla = spec["tabla_por_anio"]
    spec_tabla = dict(spec, titulo_componentes=declarado_tabla["titulo_componentes"])
    columnas = [{"etiqueta": c["etiqueta"], "num": c["campo"] != "anio"}
                for c in declarado_tabla["columnas"]]
    medidas_tabla = [c["campo"] for c in declarado_tabla["columnas"] if c["campo"] != "anio"]

    for geo in ["provincia"] + list(ctx.hechos.deptos):
        ambito = None if geo == "provincia" else geo
        for producto in ctx.productos:
            toneladas = [dtv_valor(ctx, producto, a, "peso_tn", ambito) for a in ctx.anios]
            documentos = [dtv_valor(ctx, producto, a, "movimientos", ambito) for a in ctx.anios]
            if all(v is None for v in toneladas):
                continue
            valores_filtro = {"departamento": geo, "producto": producto}
            resumen = []
            for medida in spec["indicadores"]["medidas"]:
                valor = dtv_valor(ctx, producto, ultimo, medida, ambito)
                resumen.append({
                    "etiqueta": "%s · %s" % (DTV_ETIQUETA[medida],
                                             ctx.periodo_de(producto, ultimo)),
                    "valor": ctx.con_unidad(valor, medida)})
            eje_izq = ctx.eje(toneladas, "tn")
            eje_der = ctx.eje_secundario(documentos, "dtv", len(eje_izq["etiquetas"]) - 1)
            nota = ctx.aclaracion_superficie
            if ctx.cobertura[producto]:
                nota = ("La fuente entrega %s solo de %s: ningún año de este cuadro es un año "
                        "completo. " % (pr.minuscula_inicial(ctx.etiqueta_producto[producto]),
                                        ctx.cobertura[producto])) + nota
            elemento_grafico = {
                "clase": "grafico",
                "titulo": ctx.titulo(spec, valores_filtro, ctx.anios),
                "subtitulo": "En toneladas y en declaraciones de tránsito (DTV) emitidas",
                "unidad": ["tn", "dtv"],
                "pie": pie,
                "grafico": spec["grafico"],
                "x": [str(a) for a in ctx.anios],
                "series": [
                    {"nombre": DTV_ETIQUETA["peso_tn"], "tipo": "line", "eje": 0,
                     "apilado": False, "color": ctx.colores.solido("peso_tn"),
                     "v": toneladas,
                     "t": [ctx.con_unidad(v, "peso_tn") for v in toneladas],
                     "extra": [""] * len(toneladas)},
                    {"nombre": DTV_ETIQUETA["movimientos"], "tipo": "line", "eje": 1,
                     "apilado": False, "color": ctx.colores.solido("movimientos"),
                     "v": documentos,
                     "t": [ctx.con_unidad(v, "movimientos") for v in documentos],
                     "extra": [""] * len(documentos)},
                ],
                "eje": eje_izq,
                "eje2": eje_der,
                "resumen": resumen,
                "nota": nota,
            }
            filas = []
            for a in ctx.anios:
                celdas = [str(a)]
                for medida in medidas_tabla:
                    celdas.append(ctx.texto(dtv_valor(ctx, producto, a, medida, ambito), medida))
                filas.append({"celdas": celdas})
            elemento_tabla = {
                "clase": "tabla",
                "titulo": ctx.titulo(spec_tabla, valores_filtro, ctx.anios, tipo="lista"),
                "subtitulo": limpiar(spec["subtitulo"]),
                "pie": pie,
                "columnas": columnas,
                "filas": filas,
                "nota": nota,
            }
            vista["combos"]["|".join([geo, producto])] = {
                "elementos": [elemento_grafico, elemento_tabla]}
    return vista


CONSTRUCTORES = {
    "09-cultivo-mapa-sup-sembrada": construir_mapa,
    "09-cultivo-evolucion-sup-sembrada": construir_evolucion_simple,
    "09-cultivo-evolucion-prod-rendimiento": construir_evolucion_doble,
    "09-cultivo-evolucion-cosecha-produccion": construir_evolucion_cosecha_produccion,
    "09-cartera-participacion-produccion": construir_cartera_participacion,
    "09-ranking-cultivo-sup-sembrada": construir_ranking_cultivo,
    "09-cultivo-detalle-componentes": construir_detalle_componentes,
    "09-cartera-evolucion-absoluta": lambda ctx, spec: construir_cartera(ctx, spec, False),
    "09-cartera-evolucion-porcentual": lambda ctx, spec: construir_cartera(ctx, spec, True),
    "09-departamento-datos": construir_datos_departamento,
    "09-departamento-ficha-cultivos": construir_ficha_departamento,
    "09-departamento-cartera": construir_cartera_departamento,
    "09-departamento-evolucion-rendimientos": construir_rendimientos_departamento,
    "09-departamento-posicion-ranking": construir_posicion_ranking,
    "09-ranking-cultivo-produccion": construir_ranking_cultivo,
    "09-ranking-cultivo-rendimiento": construir_ranking_cultivo,
    "09-ranking-total-producido": construir_ranking_total,
    "09-ranking-rendimiento-promedio-3": construir_ranking_promedio3,
    "09-noa-participacion-provincia": construir_torta_noa,
    "09-pais-participacion-sde": construir_participacion_pais,

    "85-evolucion-movimientos": construir_hacienda_evolucion,
    "85-evolucion-internos": construir_hacienda_evolucion,
    "85-evolucion-extraccion": construir_hacienda_evolucion,
    "85-evolucion-introduccion": construir_hacienda_evolucion,
    "85-participacion-categorias": construir_hacienda_participacion,
    "85-ranking-departamento-origen": construir_hacienda_ranking_depto,
    "85-mapa-movimientos-departamento": construir_hacienda_mapa,
    "85-departamento-evolucion": construir_hacienda_departamento,
    "85-estacionalidad-mensual": construir_hacienda_estacionalidad,
    "85-movimientos-por-motivo": construir_hacienda_motivo,
    "85-extraccion-por-provincia-destino": construir_hacienda_contraparte,
    "85-introduccion-por-provincia-origen": construir_hacienda_contraparte,
    "85-balance-introduccion-extraccion": construir_hacienda_balance,
    "85-matriz-od-interna": construir_hacienda_matriz,
    "85-tambos-engorde-corral": construir_hacienda_tambos,

    "dtv-departamento-movimientos": construir_dtv_departamento,
}


# ===========================================================================
# TABLEROS  (rediseño del 2026-08-03)
# ===========================================================================
# JC rechazo el sitio anterior en la reunion del 3-ago: "parecia un informe, no un tablero".
# El tablero es la respuesta. Una pantalla por base: cuatro indicadores de cabecera y cuatro
# paneles compactos, con las vistas de detalle a un click. Layout, paleta y jerarquia salen del
# mockup aprobado por Francisco, archivado en specs/fuentes/.
#
# Un tablero NO reusa el JSON de las vistas de detalle: recalcula lo suyo, mas chico. Es a
# proposito. Cada vista de detalle esta filtrada por lo suyo (el ranking por estacion, el mapa
# por cultivo, el anillo del NOA por campaña) y hacer que un filtro global calzara en todas
# hubiera pedido una capa de traduccion en JavaScript que despues nadie puede leer. Se paga con
# algo de calculo repetido aca y se cobra en que el tablero es un constructor mas, igual a los
# otros veinte de este archivo.

TODOS = "todos"    # valor del filtro `cultivo` que suma todos los cultivos de la campaña


def indicador(etiqueta, valor, unidad, medida, previo, etiqueta_previo, formato=None):
    """Una tarjeta de indicador: numero grande, unidad chica y variacion contra el periodo previo.

    `valor` y `previo` son numeros crudos. La variacion se calcula SIEMPRE sobre el crudo, nunca
    sobre el redondeado de pantalla (misma regla que Precision).
    """
    if valor is None:
        return {"etiqueta": etiqueta, "valor": "S/D", "unidad": unidad, "var": None}
    texto, prefijo = (formato or pr.fmt_compacto)(valor)
    variacion = None
    if previo:
        cambio = valor / previo - 1
        variacion = {
            "texto": texto_variacion(cambio),
            "contra": "vs %s" % etiqueta_previo,
            "clase": "var-pos" if cambio > 0 else ("var-neg" if cambio < 0 else "var-cero"),
        }
    return {"etiqueta": etiqueta, "valor": texto,
            "unidad": (prefijo + " " + unidad).strip(), "var": variacion}


def panel_vacio(titulo, motivo):
    """Un panel sin datos dice POR QUE no los tiene. Nunca se dibuja un panel en blanco."""
    return {"titulo": titulo, "vacio": motivo}


# --------------------------------------------------------------------------
# Tablero de la base 9 (cultivos extensivos)
# --------------------------------------------------------------------------
def cultivos_del_filtro(ctx, cultivo):
    # "Todos" es un AGREGADO: suma todos los cultivos de la fuente, tambien los que no tienen
    # chip (universo_visible: visible no es lo mismo que incluido en agregados). Los numeros
    # que valido JC (produccion fina y gruesa 6.016.454 tn) salen de esta lista completa.
    return cultivos_con_datos(ctx) if cultivo == TODOS else [cultivo]


def total_provincia_cultivos(ctx, campania, cultivos, medida):
    """Suma departamental de una medida. Devuelve None si ningun departamento informo.

    Se suma por departamento y no se lee la fila provincial de la fuente por el mismo motivo que
    el ranking total: cuando el filtro es un subconjunto de cultivos, la fila provincial no
    existe y las dos formas de contar tienen que dar lo mismo en todo el sitio.
    """
    hechos = ctx.hechos
    suma, hubo = 0.0, False
    for geo in hechos.deptos:
        for cultivo in cultivos:
            valor, _ = valor_util(hechos.medidas(geo, campania, cultivo), medida)
            if valor is not None:
                suma += valor
                hubo = True
    return suma if hubo else None


def medida_provincial(ctx, campania, cultivos, medida):
    """El rendimiento no se suma ni se promedia: se recalcula produccion/superficie cosechada."""
    if medida != "rendimiento_kg_ha":
        return total_provincia_cultivos(ctx, campania, cultivos, medida)
    produccion = total_provincia_cultivos(ctx, campania, cultivos, "produccion_tn")
    cosechada = total_provincia_cultivos(ctx, campania, cultivos, "sup_cosechada_ha")
    if not produccion or not cosechada:
        return None
    return produccion * 1000.0 / cosechada


def campania_previa(ctx, campania):
    orden = ctx.hechos.orden_campania
    anteriores = [c for c in ctx.ventana if orden.get(c, 0) < orden.get(campania, 0)]
    return max(anteriores, key=lambda c: orden[c]) if anteriores else None


# Por que estos tres numeros NO se muestran con el filtro en "Todos": reglas de agregacion de
# JC (_protocolo-presentacion.formato_v1.agregacion). El texto va en pantalla, no en un log.
MOTIVO_TODOS_SUPERFICIE = (
    "Con «Todos» la superficie no se muestra: los cultivos de invierno y de verano comparten "
    "lote, y sumarlos contaría las mismas hectáreas dos veces. Elegí un cultivo.")
MOTIVO_TODOS_RENDIMIENTO = (
    "El rendimiento es una variable única de cada cultivo: no existe un rendimiento de todos "
    "los cultivos mezclados. Elegí un cultivo.")
MOTIVO_TODOS = {"sup_sembrada_ha": MOTIVO_TODOS_SUPERFICIE,
                "sup_cosechada_ha": MOTIVO_TODOS_SUPERFICIE,
                "rendimiento_kg_ha": MOTIVO_TODOS_RENDIMIENTO}


def indicadores_cultivos(ctx, spec, campania, cultivos, todos=False):
    """La secuencia FIJA de JC: sembrada, cosechada, produccion, rendimiento (formato_v1).

    SIN variacion contra la campaña anterior: solo el valor con su unidad, como el mockup
    (JC, tercera tanda del 10-ago: "NO había que poner la diferencia con la campaña anterior";
    regla formato_v1.tercera_tanda.kpis_sin_variacion y spec `indicadores.sin_variacion`).

    Con el filtro en "Todos" quedan solo los indicadores legales: la produccion (las toneladas
    se suman entre estaciones), rotulada "(fina y gruesa)" como la rotula JC. Los otros tres no
    se muestran (spec, `con_cultivo_todos`; backlog pregunta 29).
    """
    salida = []
    for declarado in spec["indicadores"]["items"]:
        medida = declarado["medida"]
        if todos and medida != "produccion_tn":
            continue
        etiqueta = declarado["etiqueta"] + (" (fina y gruesa)" if todos else "")
        # Numero COMPLETO y no compacto ("1.415.045 ha", no "1,42 M ha*"): es como los
        # escribe JC en sus recuadros y como se ve en la captura del 10-ago (tema_visual).
        # Al no abreviar, la nota de asteriscos queda vacia y no ocupa renglon.
        completo = (lambda m: lambda v: (ctx.precision.texto(v, m, "provincia"), ""))(medida)
        salida.append(indicador(
            etiqueta,
            medida_provincial(ctx, campania, cultivos, medida),
            declarado["unidad"], medida,
            None,        # sin campaña previa: la variacion esta PROHIBIDA en estos KPIs
            None, formato=completo))
    return salida


def titulo_literal(plantilla, **valores):
    """Titulos del tablero de cultivos: plantilla LITERAL del mockup de JC, con los unicos
    slots dinamicos que admite la regla (formato_v1.tercera_tanda.titulos_del_tablero_literales:
    {Cultivo}, {campania}, {desde}, {hasta}). Sustitucion de strings y nada mas."""
    for clave, valor in valores.items():
        plantilla = plantilla.replace("{%s}" % clave, valor)
    return plantilla


def panel_anillo_participacion(ctx, spec, campania, pie):
    """El anillo del mockup de JC: participacion de cada cultivo en la produccion provincial
    de la campaña, top 5 + Resto, "(fina y gruesa)". NO sigue el selector de cultivo: muestra
    todos por diseño, y la nota lo dice (formato_v1.parametros_explicitos)."""
    declarado = spec["paneles"]["anillo"]
    hechos = ctx.hechos
    # Suma departamental y no fila provincial: la fila 'Total provincia' de Poroto total no
    # existe en la fuente y el poroto quedaria fuera del anillo. Es la misma regla de conteo
    # del resto del tablero (`total_provincia_cultivos`) y reproduce el 48,1% de soja del
    # mockup de JC (hoja Data, 2024/25).
    # cultivos_con_datos y NO cultivos_visibles a proposito: el anillo es un AGREGADO y se
    # calcula sobre todos los cultivos de la fuente; los que no tienen chip caen en "Resto"
    # (universo_visible: visible no es incluido en agregados). Total validado: 6.016.454 tn.
    partes = []
    for cultivo in cultivos_con_datos(ctx):
        valor = total_provincia_cultivos(ctx, campania, [cultivo], declarado["medida"])
        if valor:
            partes.append((cultivo, valor))
    titulo = titulo_literal(declarado["titulo_protocolo"], campania=campania)
    if not partes:
        return panel_vacio(titulo, "Sin producción informada en la campaña elegida.")
    partes.sort(key=lambda t: (-t[1], pr.clave_alfabetica(t[0])))
    total = sum(v for _, v in partes)
    principales = partes[:declarado["top_n"]]
    resto = partes[declarado["top_n"]:]
    porciones = [
        {"n": hechos.cultivo_para_titulo(cultivo), "v": valor,
         "t": ctx.precision.texto(valor, "produccion_tn", "provincia") + " tn",
         "pct": pr.fmt_pct(valor / total * 100, 1),
         "color": ctx.color_cultivo[cultivo]}
        for cultivo, valor in principales]
    if resto:
        suma_resto = sum(v for _, v in resto)
        porciones.append({
            "n": declarado["resto"], "v": suma_resto,
            "t": ctx.precision.texto(suma_resto, "produccion_tn", "provincia") + " tn",
            "pct": pr.fmt_pct(suma_resto / total * 100, 1),
            # El Resto no es un cultivo: no le toca color de la paleta categorica. Gris de
            # apoyo del theme, que no compite con ningun cultivo real.
            "color": ctx.theme["colores"]["texto_apoyo"]})
    nota = "Muestra todos los cultivos de la campaña: no sigue el selector de cultivo."
    if resto:
        nota += " «%s» agrupa los %d cultivos restantes." % (declarado["resto"], len(resto))
    return {
        # Titulo LITERAL del mockup, con la campaña como unico slot (tercera tanda).
        "titulo": titulo,
        "subtitulo": "",
        "pie": pie,
        # SIN cifra central (cuarta tanda, anillo_sin_cifra_central: "queda muy chico por el
        # numero en el medio; prefiero sacarlo y que quede bien"): el donut usa el espacio del
        # panel y el total, que no se publica sin universo, va como linea al pie del cuadro,
        # rotulado "(fina y gruesa)" como lo rotula JC. Los tableros de ganaderia conservan su
        # total al centro: el JSON manda (tablero.js dibuja el centro solo si viene `centro`).
        "total_linea": "Total: %s tn (fina y gruesa)"
                       % ctx.precision.texto(total, "produccion_tn", "provincia"),
        "porciones": porciones,
        "nota": nota,
    }


def panel_mapa_cultivos(ctx, spec, campania, cultivos, variable, pie, todos=False):
    # El panel del mapa NO lleva titulo propio: en el mockup arriba va solo el rotulo
    # "Seleccione departamento" (spec, paneles.mapa.rotulo_accion; tercera_tanda.mapa_grande).
    if todos and variable != "produccion_tn":
        return panel_vacio("", MOTIVO_TODOS[variable])
    hechos = ctx.hechos
    nombres_mapa = dict(hechos.nombre)
    for geo_id, nombre in nombres_extra_geojson().items():
        nombres_mapa.setdefault(geo_id, nombre)
    deptos, con_dato = [], []
    for geo in sorted(nombres_mapa_solo_deptos(nombres_mapa)):
        if variable == "rendimiento_kg_ha":
            produccion = suma_depto(ctx, geo, campania, cultivos, "produccion_tn")
            cosechada = suma_depto(ctx, geo, campania, cultivos, "sup_cosechada_ha")
            valor = (produccion * 1000.0 / cosechada) if produccion and cosechada else None
        else:
            valor = suma_depto(ctx, geo, campania, cultivos, variable)
        # `filas`: el mouseover muestra el NOMBRE y los datos de la seleccion vigente, nunca
        # el geo_id (cuarta tanda, tooltips_con_nombre_y_datos). La lectura rapida es por
        # hover; el click al dato departamental se mantiene.
        deptos.append({"id": geo, "nombre": nombres_mapa[geo], "v": valor,
                       "filas": tooltip_depto_cultivos(ctx, geo, campania, cultivos, todos)})
        if valor is not None:
            con_dato.append(valor)
    if not con_dato:
        return panel_vacio("",
                           "Ningún departamento informó esta variable en la campaña elegida.")
    escala = pr.quintiles(con_dato)
    rampa = ctx.colores.rampa(variable)
    for fila in deptos:
        if fila["v"] is None:
            fila["color"] = ctx.colores.sin_dato
        else:
            fila["color"] = rampa[min(pr.clase_de(fila["v"], escala["cortes"]), len(rampa)) - 1]
        fila["t"] = ctx.precision.texto(fila["v"], variable, "departamento")
    total = medida_provincial(ctx, campania, cultivos, variable)
    subtitulo = ctx.subtitulo_unidad(UNIDAD[variable])
    if todos:
        subtitulo += " · todos los cultivos (fina y gruesa)"
    return {
        "titulo": "",
        "subtitulo": subtitulo,
        "pie": pie,
        "geojson": GEOJSON,
        # El rotulo de accion del mockup y el clic que lo cumple: el clic en un departamento
        # es la UNICA navegacion de contenido permitida (tercera_tanda.solo_tableros) y lleva
        # al dato departamental, conservando la seleccion vigente (persistencia_de_filtros).
        "accion": spec["paneles"]["mapa"].get("rotulo_accion"),
        "ficha": url_de_vista(ctx, spec["paneles"]["mapa"]["click_departamento"],
                              "?departamento="),
        # Proporcion geografica correcta (tercera_tanda.mapa_grande): la caja se adapta al
        # mapa, nunca al reves. Lo aplica tablero.js como aspectScale.
        "aspecto": aspecto_mapa(), "relacion": relacion_mapa(),
        "deptos": deptos,
        "unidad": UNIDAD[variable],
        "escala": {"min": "0",
                   "max": ctx.precision.texto(max(con_dato), variable, "departamento"),
                   "rampa": rampa},
        "total": ("Total provincial: %s %s"
                  % (ctx.precision.texto(total, variable, "provincia"), UNIDAD[variable]))
                 if total is not None else "Total provincial: sin dato",
    }


def suma_depto(ctx, geo, campania, cultivos, medida):
    suma, hubo = 0.0, False
    for cultivo in cultivos:
        valor, _ = valor_util(ctx.hechos.medidas(geo, campania, cultivo), medida)
        if valor is not None:
            suma += valor
            hubo = True
    return suma if hubo else None


def tooltip_depto_cultivos(ctx, geo, campania, cultivos, todos):
    """Las filas del mouseover del mapa del tablero (cuarta tanda,
    tooltips_con_nombre_y_datos): los datos del departamento para el cultivo y la campaña
    activos, en la secuencia FIJA de JC. Con "Todos" queda solo la produccion, rotulada
    "(fina y gruesa)": superficie y rendimiento no se agregan entre cultivos
    (formato_v1.agregacion)."""
    medidas = ["produccion_tn"] if todos else list(MEDIDAS)
    filas = []
    for medida in medidas:
        if medida == "rendimiento_kg_ha":
            produccion = suma_depto(ctx, geo, campania, cultivos, "produccion_tn")
            cosechada = suma_depto(ctx, geo, campania, cultivos, "sup_cosechada_ha")
            valor = (produccion * 1000.0 / cosechada) if produccion and cosechada else None
        else:
            valor = suma_depto(ctx, geo, campania, cultivos, medida)
        etiqueta = ETIQUETA_VARIABLE[medida] + (" (fina y gruesa)" if todos else "")
        filas.append([etiqueta,
                      (ctx.precision.texto(valor, medida, "departamento")
                       + " " + UNIDAD[medida]) if valor is not None else "S/D"])
    return filas


def titulo_tendencia_cultivos(ctx, declarado, cultivo_titulo, todos):
    """El titulo LITERAL del grafico de lineas del mockup (tercera tanda, backlog 31):
    "{Cultivo} - Sgo del Estero - Total - Evolución de la superficie cosechada y producción -
    Campañas {desde} a {hasta}". Slots dinamicos: cultivo y periodo, nada mas. El periodo se
    resuelve con las campañas realmente graficadas (la ventana), no con el "2013/14" del
    dibujo (backlog 32: el titulo nunca promete campañas que el grafico no muestra).

    Con el filtro en "Todos" el grafico queda en produccion sola (la superficie no se suma
    entre estaciones): la frase de la variable se ajusta a lo que de verdad se grafica,
    rotulada "(fina y gruesa)" como la rotula JC. Es la unica desviacion de la plantilla y
    existe para que el titulo no diga algo falso.
    """
    plantilla = declarado["titulo_protocolo"]
    if todos:
        plantilla = plantilla.replace(
            "Evolución de la superficie cosechada y producción",
            "Evolución de la producción (fina y gruesa)")
    return titulo_literal(plantilla, Cultivo=cultivo_titulo,
                          desde=ctx.ventana[0], hasta=ctx.ventana[-1])


def panel_tendencia_cosecha_produccion(ctx, spec, campania, cultivos, todos, pie,
                                       cultivo_titulo):
    """El grafico de lineas del mockup: superficie cosechada + produccion sobre UN SOLO eje
    en "Millones", visible y con su escala, como lo dibuja JC (tercera tanda,
    formato_v1.tercera_tanda.eje_vertical_visible; deroga el eje secundario que hubo antes).
    Las marcas las sigue decidiendo `marcas_eje` (minimo 5). Con el filtro en "Todos" queda
    solo la produccion: la superficie no se suma entre estaciones (formato_v1.agregacion).
    """
    declarado = spec["paneles"]["tendencia"]
    medidas = [m for m in declarado["medidas"] if not (todos and m != "produccion_tn")]
    series, crudas = [], []
    for medida in medidas:
        puntos = [medida_provincial(ctx, c, cultivos, medida) for c in ctx.ventana]
        crudas.append(puntos)
        series.append({
            "nombre": ETIQUETA_VARIABLE[medida] + (" (fina y gruesa)" if todos else ""),
            "color": ctx.colores.solido(medida),
            # Color de la MISMA rampa para cuando el zoom dibuja otro cultivo encima
            # (`bloque_comparacion`): el color lo sigue mandando el tipo de variable.
            "color_comp": ctx.colores.comparacion(medida),
            "eje": 0,     # un solo eje para las dos series, como el mockup (sin secundario)
            "puntos": [ctx.precision.valor(p, medida, "provincia") if p is not None else None
                       for p in puntos],
            "textos": [ctx.precision.texto(p, medida, "provincia") + " " + UNIDAD[medida]
                       if p is not None else "S/D" for p in puntos],
        })
    titulo = titulo_tendencia_cultivos(ctx, declarado, cultivo_titulo, todos)
    if not any(p is not None for puntos in crudas for p in puntos):
        return panel_vacio(titulo,
                           "No hay serie para este cultivo en la ventana de campañas.")
    # Eje unico "Millones": las marcas se calculan sobre TODOS los valores de las dos series
    # juntas (comparten eje) y se rotulan divididas por millon, como lo escribe JC en su
    # grafico (0,00 a 4,00 de a 0,50).
    juntos = [p for puntos in crudas for p in puntos if p is not None]
    eje = eje_millones(juntos)
    # La unidad va ABREVIADA en el eje ("Millones"): asterisco y aclaracion al pie, como
    # exige formato_v1.unidades_abreviadas y el spec (eje_vertical.aclaracion_unidades).
    nota = ("* Eje en millones: superficie cosechada en hectáreas y producción en toneladas."
            if len(medidas) > 1 else "* Eje en millones de toneladas.")
    return {
        "titulo": titulo,
        "subtitulo": "",
        "pie": pie,
        "x": [c[2:4] + "/" + c[5:7] for c in ctx.ventana],
        "etiquetas": list(ctx.ventana),
        "actual": ctx.ventana.index(campania) if campania in ctx.ventana else None,
        "series": series,
        "eje": eje,
        "eje2": None,
        "eje_visible": True,
        "medidas_extra": medidas_extra_cultivos(ctx, declarado, cultivos, todos, juntos, eje),
        "nota": nota,
    }


def medidas_extra_cultivos(ctx, declarado, cultivos, todos, juntos, eje):
    """Las segundas medidas que este cuadro ofrece en el zoom (spec, `comparacion.medidas`).

    Son las variables de la base que el grafico de JC no dibuja: la superficie SEMBRADA, que
    comparte la escala en millones con lo que ya esta dibujado, y el RENDIMIENTO, que es un
    cociente en kg/ha y necesita su propio eje a la derecha (regla 3 de JC: nunca dos escalas
    sobre el mismo eje). El rendimiento nunca se promedia: lo recalcula `medida_provincial`
    como produccion sobre superficie cosechada.

    Con el filtro en "Todos" no se ofrece ninguna: la superficie no se suma entre estaciones
    (formato_v1.agregacion) y el rendimiento sale de ella. El cuadro queda como esta y el
    desplegable no dibuja esa linea.
    """
    comparacion = declarado.get("comparacion") or {}
    pedidas = (comparacion.get("medidas") or {}).get("opciones") or []
    if todos or not pedidas:
        return []
    salida = []
    for opcion in pedidas:
        medida = opcion["v"]
        puntos = [medida_provincial(ctx, c, cultivos, medida) for c in ctx.ventana]
        if not [p for p in puntos if p is not None]:
            continue
        valores = [ctx.precision.valor(p, medida, "provincia") if p is not None else None
                   for p in puntos]
        textos = [ctx.precision.texto(p, medida, "provincia") + " " + UNIDAD[medida]
                  if p is not None else "S/D" for p in puntos]
        if UNIDAD[medida] in ("ha", "tn"):
            # Misma escala en millones que el cuadro: se recalcula sobre las tres series
            # juntas para que la nueva entre entera.
            limpios = [v for v in puntos if v is not None]
            salida.append(medida_extra(ctx, medida, ETIQUETA_VARIABLE[medida], valores, textos,
                                       eje=eje_millones(juntos + limpios)))
        else:
            # Otra unidad: eje propio a la derecha, con la misma cantidad de intervalos que el
            # izquierdo para que las marcas caigan sobre las mismas lineas de grilla.
            salida.append(medida_extra(
                ctx, medida, ETIQUETA_VARIABLE[medida], valores, textos,
                eje2=ctx.eje_secundario([p for p in puntos if p is not None],
                                        UNIDAD[medida], len(eje["etiquetas"]) - 1)))
    return salida


def eje_millones(valores):
    """El eje unico "Millones" del grafico de lineas del tablero (mockup literal), con la
    escala LEGIBLE de la cuarta tanda (formato_v1.cuarta_tanda.escala_legible, Facu: "esta
    mal la escala, no se distinguen las variaciones").

    `marcas_eje` del protocolo salta de paso 500.000 a 1.000.000 (entre las mantisas 5 y 10
    no hay ninguna), asi que con maximos de entre 3,5 y 5 millones deja 4 o 5 intervalos de
    1,00 y las curvas se leen planas: es el caso que marco Facu. JC dibujo paso 0,50. Regla
    mecanica: si el eje del protocolo queda con 5 intervalos o menos, el paso se parte al
    medio y los limites quedan (ya son multiplos del paso nuevo). El minimo de 5 marcas de la
    seccion 7 se sigue cumpliendo de sobra. Para Soja reproduce exactamente el eje del dibujo
    de JC: 0,00 a 4,00 de a 0,50.

    Las etiquetas van divididas por millon con los decimales JUSTOS para que el paso no se
    redondee a cero: dos, como los escribe JC, mientras el paso lo permita; mas decimales
    solo cuando un cultivo chico deja pasos finos sobre el mismo eje en millones (un eje
    donde dos marcas consecutivas dicen lo mismo miente).
    """
    marcas = pr.marcas_eje(min(valores + [0.0]), max(valores + [0.0]))
    intervalos = int(round((marcas["max"] - marcas["min"]) / marcas["paso"]))
    if intervalos <= 5:
        paso = marcas["paso"] / 2.0
        cantidad = int(round((marcas["max"] - marcas["min"]) / paso)) + 1
        marcas = {"min": marcas["min"], "max": marcas["max"], "paso": paso,
                  "marcas": [marcas["min"] + i * paso for i in range(cantidad)]}
    decimales = 2
    while decimales < 6 and round(marcas["paso"] / 1e6, decimales) != marcas["paso"] / 1e6:
        decimales += 1
    return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
            "etiquetas": {clave_js(m): pr.fmt_numero(m / 1e6, decimales)
                          for m in marcas["marcas"]},
            "nombre": "Millones"}


def panel_tabla_datos_cultivos(ctx, spec, campania, cultivos, todos, pie):
    """Forma `tabla-datos`: los numeros crudos bajo el grafico de evolucion, LITERAL al
    mockup Modelo 2 (tercera tanda del 10-ago): DOS bloques de campañas lado a lado, con las
    columnas que dibuja JC ("Campaña", "Superficie Cos. (Ha)", "Producción (Tn)",
    "Rendimiento Kg/ha") y SIN titulo de panel. Deroga la "una sola serie" de la segunda
    tanda (backlog 38). Con la ventana de 10 campañas los bloques cierran 5 y 5.

    La campaña elegida queda marcada. El rendimiento es de la fuente para un cultivo y no
    existe para "Todos" (ahi la tabla queda en produccion sola).
    """
    declarado = spec["paneles"]["tabla-datos"]
    medidas = [m for m in declarado["medidas"] if not (todos and m != "produccion_tn")]
    # Columnas literales del mockup (spec, columnas_por_bloque), recortadas a las medidas
    # legales del filtro: la etiqueta se toma del spec por posicion de la medida.
    etiqueta_col = dict(zip(declarado["medidas"], declarado["columnas_por_bloque"][1:]))
    columnas = ([{"etiqueta": declarado["columnas_por_bloque"][0], "num": False}]
                + [{"etiqueta": etiqueta_col[m], "num": True} for m in medidas])
    filas, hubo = [], False
    for c in ctx.ventana:
        celdas = []
        for medida in medidas:
            valor = medida_provincial(ctx, c, cultivos, medida)
            celdas.append(ctx.precision.texto(valor, medida, "provincia"))
            if valor is not None:
                hubo = True
        filas.append({"campania": c, "celdas": celdas, "actual": c == campania})
    if not hubo:
        return panel_vacio("", "No hay datos de este cultivo en la ventana de campañas.")
    mitad = (len(filas) + 1) // 2
    bloques = [{"columnas": columnas, "filas": parte}
               for parte in (filas[:mitad], filas[mitad:]) if parte]
    return {
        "titulo": "",              # el mockup no le dibuja titulo (spec, sin_titulo)
        "subtitulo": "",
        "pie": pie,
        "bloques": bloques,
    }


def panel_top_sembrada(ctx, spec, campania, cultivos, todos, pie):
    """La tabla de ranking del mockup, LITERAL (tercera tanda): titulo y columnas calcados
    ("Ranking de sup. Sembrada sobre el total provincial"; Puesto, Departamento, Superficie
    Semb. (ha), % sobre Total prov.). Es una TABLA, no una lista de barras: el mockup la
    dibuja asi y tablero.js la dibuja como tabla cuando el panel trae `columnas`."""
    declarado = spec["paneles"]["top"]
    titulo = declarado["titulo_protocolo"]
    medida = declarado["medida"]
    if todos and medida in MOTIVO_TODOS:
        return panel_vacio(titulo, MOTIVO_TODOS[medida])
    filas = []
    for geo in ctx.hechos.deptos:
        valor = suma_depto(ctx, geo, campania, cultivos, medida)
        if valor is not None:
            filas.append((geo, ctx.hechos.nombre[geo], valor))
    if not filas:
        return panel_vacio(titulo,
                           "Ningún departamento informó esta variable en la campaña elegida.")
    ordenados = ordenar_desc(filas)
    puesto_de = puestos([(g, v) for g, _, v in ordenados])
    recorte = ordenados[:declarado["cuantos"]]
    total = total_provincia_cultivos(ctx, campania, cultivos, medida)
    etiquetas = declarado["columnas"]
    return {
        "titulo": titulo,
        "subtitulo": "",
        "pie": pie,
        "columnas": [{"etiqueta": etiquetas[0], "num": False},
                     {"etiqueta": etiquetas[1], "num": False},
                     {"etiqueta": etiquetas[2], "num": True},
                     {"etiqueta": etiquetas[3], "num": True}],
        "filas": [{"celdas": ["%d°" % puesto_de[geo],
                              nombre,
                              ctx.precision.texto(valor, medida, "departamento"),
                              participacion_texto(valor, total)]}
                  for geo, nombre, valor in recorte],
    }


def construir_tablero_cultivos(ctx, spec):
    """El tablero del mockup Modelo 2 de JC, LITERAL (tercera tanda del 10-ago-2026,
    reconstruido de cero tras el rechazo del commit 41df326): tarjeta de contexto, KPIs sin
    variacion, mapa grande sin titulo propio, evolucion con eje "Millones" visible, anillo
    de participacion, tabla de datos en dos bloques y ranking de sup. sembrada en tabla.
    Titulos calcados del mockup (titulos_del_tablero_literales)."""
    hechos = ctx.hechos
    cultivos = cultivos_visibles(ctx)
    variables = spec["paneles"]["mapa"]["variables"]
    # Chips con el nombre que usa JC en el mockup ("Soja", no "Soja total") y "Todos" al FINAL
    # (formato_v1.selectores.cultivo). Universo visible = catalogo de JC ∩ con datos en la
    # ventana (cultivos_visibles): Lenteja y Alpiste tienen datos pero no chip. Sus datos
    # siguen adentro de los agregados ("Todos", anillo), que salen de cultivos_con_datos.
    etiquetas = {c: hechos.cultivo_para_titulo(c) for c in cultivos}
    etiquetas[TODOS] = "Todos"
    # El selector de cultivo del tablero es la grilla de cajitas de la captura del 10-ago
    # (zona `selector`, la declara el spec): icono B&W + nombre, color en el elegido, "Todos"
    # en caja grande. La asignacion de iconos vive en site/iconos-cultivo.yaml.
    opciones_cultivo = con_iconos_de_cultivo(ctx, opciones(cultivos + [TODOS], etiquetas))
    opciones_cultivo[-1]["grande"] = True   # "Todos" va en la caja grande a la derecha
    tablero = tablero_base(ctx, spec, [
        {"id": "cultivo", "etiqueta": "Cultivo",
         "zona": spec["selectores"]["cultivo"].get("zona", "barra"),
         "opciones": opciones_cultivo,
         "defecto": spec["selectores"]["cultivo"]["default"]},
        filtro_campania(ctx),
        # El toggle vive DENTRO del panel del mapa y compite por lugar con el titulo: va con
        # rotulos cortos ("Prod." y no "Producción"), como en el mockup.
        {"id": "variable", "etiqueta": "Variable", "zona": "panel", "panel": "mapa",
         "opciones": [{"v": v, "t": ETIQUETA_VARIABLE[v], "corto": ETIQUETA_CORTA[v]}
                      for v in variables],
         "defecto": variables[0]},
    ])
    tablero["particion"] = "cultivo"
    pie = ctx.pie(spec)
    # El anillo no depende del cultivo elegido: se calcula una vez por campaña.
    anillos = {c: panel_anillo_participacion(ctx, spec, c, pie) for c in ctx.ventana}
    for cultivo in cultivos + [TODOS]:
        todos = cultivo == TODOS
        lista = cultivos_del_filtro(ctx, cultivo)
        nombre_contexto = "Todos los cultivos" if todos else etiquetas[cultivo]
        for campania in ctx.ventana:
            tendencia = panel_tendencia_cosecha_produccion(ctx, spec, campania, lista, todos,
                                                           pie, nombre_contexto)
            tabla = panel_tabla_datos_cultivos(ctx, spec, campania, lista, todos, pie)
            top = panel_top_sembrada(ctx, spec, campania, lista, todos, pie)
            kpis = indicadores_cultivos(ctx, spec, campania, lista, todos)
            # La tarjeta de contexto del mockup: QUE se esta viendo, escrito y no tacito
            # (formato_v1.parametros_explicitos). Con el icono del cultivo en COLOR, como en
            # la captura del 10-ago; "Todos" no tiene icono y la tarjeta lo esconde.
            icono_contexto = None if todos else iconos_de_cultivo(ctx, cultivo)[1]
            contexto = {"nombre": nombre_contexto, "detalle": "Campaña " + campania,
                        "icono": icono_contexto}
            for variable in variables:
                tablero["combos"]["|".join([cultivo, campania, variable])] = {
                    "contexto": contexto,
                    "kpis": kpis,
                    "paneles": {
                        "mapa": panel_mapa_cultivos(ctx, spec, campania, lista, variable,
                                                    pie, todos),
                        "tendencia": tendencia,
                        "anillo": anillos[campania],
                        "tabla-datos": tabla,
                        "top": top,
                    },
                }
    return tablero


# --------------------------------------------------------------------------
# Tablero de la base 85 (movimientos de hacienda)
# --------------------------------------------------------------------------
def indicadores_hacienda(ctx, spec, recorte, anio):
    hechos = ctx.hechos
    previo = anio - 1 if (anio - 1) in ctx.anios_cerrados else None

    def anual(medida, cual, cuando):
        return hechos.total_anual(cual, cuando, "Total", medida) if cuando else None

    def carga(cual, cuando):
        cabezas = anual("cabezas", cual, cuando)
        documentos = anual("documentos", cual, cuando)
        if not cabezas or not documentos:
            return None
        return cabezas / documentos

    entero = lambda v: (pr.fmt_numero(v, 0), "")
    salida = [
        indicador("Cabezas movidas", anual("cabezas", recorte, anio), "cabezas", "cabezas",
                  anual("cabezas", recorte, previo), previo),
        indicador("Documentos (DTE)", anual("documentos", recorte, anio), "dte", "documentos",
                  anual("documentos", recorte, previo), previo, formato=entero),
        indicador("Cabezas por documento", carga(recorte, anio), "cabezas", "cabezas",
                  carga(recorte, previo), previo,
                  formato=lambda v: (pr.fmt_numero(v, 1), "")),
    ]
    # El cuarto indicador es siempre el contrapunto del recorte elegido: si se esta mirando lo
    # que sale, interesa cuanto entra. JC separa los dos universos y nunca los suma.
    contra = spec["indicadores"]["contrapunto"][recorte]
    salida.append(indicador(contra["etiqueta"], anual("cabezas", contra["recorte"], anio),
                            "cabezas", "cabezas",
                            anual("cabezas", contra["recorte"], previo), previo))
    return salida


def panel_anillo_hacienda(ctx, spec, recorte, anio, pie):
    hechos = ctx.hechos
    partes = []
    for categoria in ctx.categorias:
        valor = hechos.total_anual(recorte, anio, categoria, "cabezas")
        if valor:
            partes.append((categoria, valor))
    if not partes:
        return panel_vacio(spec["paneles"]["anillo"]["titulo"],
                           "La fuente no abre este universo por categoría en el año elegido.")
    total = sum(v for _, v in partes)
    partes.sort(key=lambda t: (-t[1], pr.clave_alfabetica(t[0])))
    centro, prefijo = pr.fmt_compacto(total)
    return {
        "titulo": spec["paneles"]["anillo"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad("cabezas"),
        "pie": pie,
        "centro": centro,
        "centro_unidad": (prefijo + " cabezas").strip(),
        "centro_nota": "suma de las categorías",
        "porciones": [{"n": categoria, "v": valor,
                       "t": ctx.texto(valor) + " cabezas",
                       "pct": pr.fmt_pct(valor / total * 100, 1),
                       "color": ctx.color_categoria[categoria]}
                      for categoria, valor in partes],
        "nota": nota_total_vs_categorias(ctx, "categoria"),
    }


def panel_mapa_hacienda(ctx, spec, recorte, anio, medida, pie):
    hechos = ctx.hechos
    nombres_mapa = dict(hechos.nombre)
    deptos, con_dato = [], []
    for geo in hechos.deptos:
        valor = hechos.total_depto(recorte, anio, geo, "Total", medida)
        deptos.append({"id": geo, "nombre": nombres_mapa[geo], "v": valor})
        if valor is not None:
            con_dato.append(valor)
    if not con_dato:
        return panel_vacio(spec["paneles"]["mapa"]["titulo"],
                           "Este universo no se abre por departamento de origen.")
    escala = pr.quintiles(con_dato)
    rampa = ctx.colores.rampa(medida)
    for fila in deptos:
        if fila["v"] is None:
            fila["color"] = ctx.colores.sin_dato
        else:
            fila["color"] = rampa[min(pr.clase_de(fila["v"], escala["cortes"]), len(rampa)) - 1]
        fila["t"] = ctx.texto(fila["v"]) if fila["v"] is not None else "S/D"
    total = hechos.total_anual(recorte, anio, "Total", medida)
    return {
        "titulo": spec["paneles"]["mapa"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad(hac.UNIDAD[medida]),
        "pie": pie,
        "geojson": GEOJSON,
        "aspecto": aspecto_mapa(), "relacion": relacion_mapa(),
        "deptos": deptos,
        "unidad": hac.UNIDAD[medida],
        "escala": {"min": "0", "max": ctx.texto(max(con_dato)), "rampa": rampa},
        "total": ("Total provincial: %s %s" % (ctx.texto(total), hac.UNIDAD[medida]))
                 if total is not None else "Total provincial: sin dato",
    }


def panel_tendencia_hacienda(ctx, spec, recorte, anio, pie):
    """Los 12 meses del año elegido, con el año anterior de fondo para comparar.

    Antes eran los totales anuales: la base 85 tiene cuatro años cerrados, la linea salia con
    cuatro puntos y practicamente plana, y el panel no contaba nada. Mes a mes si se ve algo que
    el negocio conoce y busca: la hacienda se mueve por temporada. Es ademas lo que pide JC en su
    hoja Modelo Analisis (f45, "MENSUALIZAR LOS MISMOS CUADROS PARA ESTABLECER ESTACIONALIDAD"),
    y por eso el enlace de este panel va a la vista de estacionalidad y no a la de evolucion.

    Los 53 meses NO se apilan en una sola linea corrida: asi el patron estacional se pierde
    adentro de la tendencia (mismo criterio que 85-estacionalidad-mensual).
    """
    hechos = ctx.hechos
    meses = range(1, 13)
    puntos = [hechos.total_mes(recorte, anio, m, "Total", "cabezas") for m in meses]
    if not [p for p in puntos if p is not None]:
        return panel_vacio(spec["paneles"]["tendencia"]["titulo"],
                           "No hay serie mensual para este universo.")

    previo = anio - 1
    referencia = None
    if previo in ctx.anios:
        valores = [hechos.total_mes(recorte, previo, m, "Total", "cabezas") for m in meses]
        if [v for v in valores if v is not None]:
            referencia = {"nombre": str(previo), "puntos": valores,
                          "textos": [ctx.texto(v) + " cabezas" if v is not None else "S/D"
                                     for v in valores]}

    todos = [p for p in puntos if p is not None]
    base = ctx.subtitulo_unidad("cabezas")
    subtitulo = base
    if referencia:
        todos = todos + [v for v in referencia["puntos"] if v is not None]
        # La linea gris punteada se explica aca y no en una leyenda: el panel es chico y el
        # subtitulo ya ocupa su renglon. Sigue nombrando la unidad, que es lo que exige el
        # protocolo.
        subtitulo = subtitulo + " · punteado: " + referencia["nombre"]
    eje = ctx.eje(todos, "cabezas")
    return {
        "titulo": spec["paneles"]["tendencia"]["titulo"],
        "subtitulo": subtitulo,
        # Con una comparacion explicita encima, la linea de referencia se apaga (dos punteados
        # no se distinguen) y el subtitulo no puede seguir nombrandola. Este es el mismo
        # subtitulo sin esa frase; lo elige el navegador, no lo escribe.
        "subtitulo_comparado": base,
        "pie": pie,
        "x": list(MESES_CORTOS),
        "puntos": puntos,
        "textos": [ctx.texto(p) + " cabezas" if p is not None else "S/D" for p in puntos],
        "etiquetas": [m + " " + str(anio) for m in MESES_CORTOS],
        # El selector de la barra verde elige el AÑO, y el panel entero ya es ese año: no hay un
        # punto que marcar sobre la serie como pasaba con la serie anual.
        "actual": None,
        "nombre": str(anio),
        # Como se llama esta linea en la leyenda cuando el zoom le pone otra al lado. Sin
        # comparacion el cuadro tiene una sola serie y no dibuja leyenda.
        "medida_nombre": hac.ETIQUETA_MEDIDA["cabezas"],
        "referencia": referencia,
        "color": ctx.theme["colores"]["primario_medio"],
        # Segundo verde del theme para la serie comparada: este cuadro no pinta por rampa de
        # variable (su linea es cromo del tema), asi que su comparacion tampoco.
        "color_comp": ctx.theme["colores"]["primario"],
        "eje": eje,
        "medidas_extra": medidas_extra_hacienda(ctx, spec, recorte, anio, meses, eje),
    }


def medidas_extra_hacienda(ctx, spec, recorte, anio, meses, eje):
    """La segunda medida que este cuadro ofrece en el zoom: los DTE emitidos mes a mes.

    Un documento no es una cabeza -son dos tipos de variable distintos, con rampa propia cada
    uno en el protocolo- asi que van con dos ejes y cada uno con su unidad rotulada (regla 3
    de JC). Nunca se suman ni se combinan en un numero: son dos lineas, y punto.

    Es lo unico que hay que agregar al payload para el cruce de medidas de esta base: el otro
    cruce, el de dos anios, ya viaja en las combinaciones.
    """
    comparacion = (spec["paneles"]["tendencia"].get("comparacion") or {})
    pedidas = (comparacion.get("medidas") or {}).get("opciones") or []
    salida = []
    for opcion in pedidas:
        medida = opcion["v"]
        puntos = [ctx.hechos.total_mes(recorte, anio, m, "Total", medida) for m in meses]
        limpios = [p for p in puntos if p is not None]
        if not limpios:
            continue
        unidad = h_unidad_texto(medida)
        salida.append(medida_extra(
            ctx, medida, hac.ETIQUETA_MEDIDA[medida], puntos,
            [ctx.texto(p) + " " + unidad if p is not None else "S/D" for p in puntos],
            eje2=ctx.eje_secundario(limpios, hac.UNIDAD[medida],
                                    len(eje["etiquetas"]) - 1)))
    return salida


def panel_top_hacienda(ctx, spec, recorte, anio, pie):
    hechos = ctx.hechos
    cuantos = spec["paneles"]["top"]["cuantos"]
    filas = []
    for geo in hechos.deptos_con_movimiento(recorte):
        valor = hechos.total_depto(recorte, anio, geo, "Total", "cabezas")
        if valor:
            filas.append((geo, hechos.nombre[geo], valor))
    if not filas:
        return panel_vacio(spec["paneles"]["top"]["titulo"],
                           "Este universo no se abre por departamento de origen.")
    ordenados = ordenar_desc(filas)[:cuantos]
    tope = ordenados[0][2]
    total = hechos.total_anual(recorte, anio, "Total", "cabezas")
    return {
        "titulo": spec["paneles"]["top"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad("cabezas"),
        "pie": pie,
        "barras": [{"n": nombre, "t": ctx.texto(valor),
                    "pct": (valor / tope * 100.0) if tope else 0.0,
                    "participacion": participacion_texto(valor, total)}
                   for _, nombre, valor in ordenados],
    }


def construir_tablero_hacienda(ctx, spec):
    recortes = spec["recortes"]
    medidas = spec["paneles"]["mapa"]["medidas"]
    tablero = tablero_base(ctx, spec, [
        {"id": "recorte", "etiqueta": "Universo", "zona": "barra",
         "opciones": opciones(recortes, ctx.etiqueta_universo), "defecto": recortes[0]},
        h_filtro_anio(ctx),
        {"id": "medida", "etiqueta": "Medida", "zona": "panel", "panel": "mapa",
         "opciones": opciones(medidas, {"cabezas": "Cabezas", "documentos": "Documentos"}),
         "defecto": medidas[0]},
    ])
    pie = ctx.pie(spec)
    for recorte in recortes:
        for anio in ctx.anios_cerrados:
            anillo = panel_anillo_hacienda(ctx, spec, recorte, anio, pie)
            tendencia = panel_tendencia_hacienda(ctx, spec, recorte, anio, pie)
            top = panel_top_hacienda(ctx, spec, recorte, anio, pie)
            kpis = indicadores_hacienda(ctx, spec, recorte, anio)
            for medida in medidas:
                tablero["combos"]["|".join([recorte, str(anio), medida])] = {
                    "kpis": kpis,
                    "paneles": {
                        "anillo": anillo,
                        "mapa": panel_mapa_hacienda(ctx, spec, recorte, anio, medida, pie),
                        "tendencia": tendencia,
                        "top": top,
                    },
                }
    return tablero


def tablero_base(ctx, spec, filtros):
    return {
        "slug": spec["slug_vista"],
        "tipo": "tablero",
        "template": "tablero.html",
        "titulo": spec["titulo"],
        "subtitulo_pagina": limpiar(spec["subtitulo"]),
        "filtros": filtros,
        "combos": {},
        "seccion": spec["seccion"],
        "paneles": spec["paneles"],
        "publicable": True,
        "reservada": False,
        "spec": spec,
    }


# ==========================================================================
# Base 48 · stock bovino
# ==========================================================================
class ContextoStock:
    """El mismo papel que `Contexto`, para la base 48. Misma interfaz publica."""

    def __init__(self, hechos):
        self.protocolo = pr.cargar_protocolo()
        self.comunes = pr.cargar_comunes(48)
        self.theme = pr.cargar_theme()
        self.navegacion = pr.cargar_yaml(os.path.join(DIR_SITE, "navegacion.yaml"))
        self.hechos = hechos
        self.colores = pr.Colores(self.protocolo, self.comunes, self.theme)

        ventana = self.comunes["tiempo"]["ventana_anios"]
        self.anios = [a for a in hechos.anios
                      if ventana["desde"] <= a <= ventana["hasta"]]
        # El stock es una foto al cierre del anio: no hay anio en curso que recortar, asi que
        # todos los anios son comparables entre si (a diferencia de la base 85).
        self.anio_defecto = self.anios[-1] if self.anios else None

        cat = self.comunes["categorias"]
        self.categorias = [c for c in cat["orden"] if c in hechos.categorias]
        self.agregado = cat["agregado"]
        self.color_categoria = self.colores.por_categoria(self.categorias)

        self.zonas = self.comunes["zonas"]["orden"]
        self.zona_de = {}
        for zona, deptos in self.comunes["zonas"]["departamentos"].items():
            for nombre in deptos:
                self.zona_de[nombre] = zona
        self.color_zona = self.colores.por_categoria(self.zonas)
        self._verificar_zonas()

        self.relaciones = self.comunes["relaciones"]

    def _verificar_zonas(self):
        """Las seis zonas de JC tienen que cubrir los 27 departamentos, sin sobras.

        Lo pide el propio spec (`zonas.verificacion`): si faltara uno, el anillo de
        participacion no cerraria en 100% y no habria forma de darse cuenta mirandolo.
        """
        nombres = {self.hechos.nombre[g] for g in self.hechos.deptos}
        declarados = set(self.zona_de)
        faltan, sobran = sorted(nombres - declarados), sorted(declarados - nombres)
        if faltan or sobran:
            raise pr.ErrorDeProtocolo(
                "La zonificacion de _comunes-base-48 no cierra contra dim_geo. "
                "Sin zona: %s. Declarados que no existen: %s" % (faltan, sobran))

    # -- textos ---------------------------------------------------------
    def pie(self, spec):
        esperado = ((spec.get("fuente") or self.comunes.get("fuente") or {})
                    .get("organismo_esperado"))
        reales = sorted(self.hechos.fuentes)
        if esperado and reales != [esperado]:
            raise pr.ErrorDeProtocolo(
                "%s espera fuente %r y el mart trae %r" % (spec["slug_vista"], esperado, reales))
        return pr.pie_de_fuente(self.protocolo, reales, None)

    def subtitulo_unidad(self, unidad, categoria=None):
        texto = pr.subtitulo_por_unidad(self.protocolo, unidad)
        if categoria and categoria != self.agregado:
            return "%s - categoría: %s" % (texto, pr.minuscula_inicial(categoria))
        return texto

    # -- numeros ---------------------------------------------------------
    def texto(self, valor):
        """Cabezas: conteo exacto, sin redondear. Igual criterio que la base 85."""
        return pr.fmt_numero(valor, 0)

    def eje(self, valores, unidad):
        limpios = [v for v in valores if v is not None]
        marcas = pr.marcas_eje(min(limpios + [0.0]), max(limpios + [0.0]))
        etiquetas = {clave_js(m): pr.fmt_numero(m, 0) for m in marcas["marcas"]}
        return {"min": marcas["min"], "max": marcas["max"], "paso": marcas["paso"],
                "etiquetas": etiquetas, "nombre": stk.NOMBRE_EJE[unidad]}


def s_filtro_anio(ctx):
    return {"id": "anio", "etiqueta": "Año", "zona": "periodo",
            "opciones": [{"v": str(a), "t": str(a), "corto": str(a)[2:]} for a in ctx.anios],
            "defecto": str(ctx.anio_defecto)}


def s_filtro_categoria(ctx, spec):
    """Total primero y despues las categorias en el orden del ciclo productivo, no alfabetico."""
    valores = [ctx.agregado] + ctx.categorias
    return {"id": "categoria", "etiqueta": "Categoría", "zona": "barra",
            "opciones": [{"v": c, "t": c} for c in valores],
            "defecto": ctx.agregado}


def indicadores_stock(ctx, spec, anio, categoria):
    hechos = ctx.hechos
    previo = anio - 1 if (anio - 1) in ctx.anios else None
    dos_dec = lambda v: (pr.fmt_numero(v, 2), "")
    pct = lambda v: (pr.fmt_numero(v * 100, 1), "%")

    salida = []
    for decl in spec["indicadores"]:
        etiqueta = decl["etiqueta"]
        if "relacion" in decl:
            nombre = decl["relacion"]
            formato = pct if nombre == "participacion_vientres" else dos_dec
            unidad = "" if nombre == "participacion_vientres" else "por vaca"
            salida.append(indicador(
                etiqueta, hechos.relacion(anio, nombre), unidad, nombre,
                hechos.relacion(previo, nombre) if previo else None, previo, formato=formato))
            continue
        # Los dos indicadores de volumen siguen la categoria elegida en la barra de chips
        # cuando el spec pide el agregado; los que declaran una categoria fija no se mueven.
        cual = decl["categoria"]
        if cual == ctx.agregado and categoria != ctx.agregado:
            cual = categoria
            etiqueta = categoria
        salida.append(indicador(
            etiqueta, hechos.total_anual(anio, cual), "cabezas", "cabezas",
            hechos.total_anual(previo, cual) if previo else None, previo))
    return salida


def panel_anillo_stock(ctx, spec, anio, categoria, pie):
    """Participacion por ZONA productiva: las seis que definio JC en su hoja Modelo An 01."""
    hechos = ctx.hechos
    por_zona = {}
    for geo in hechos.deptos:
        valor = hechos.total_depto(anio, geo, categoria)
        if not valor:
            continue
        zona = ctx.zona_de[hechos.nombre[geo]]
        por_zona[zona] = por_zona.get(zona, 0.0) + valor
    if not por_zona:
        return panel_vacio(spec["paneles"]["anillo"]["titulo"],
                           "No hay stock de esta categoría en el año elegido.")
    total = sum(por_zona.values())
    partes = sorted(por_zona.items(), key=lambda t: (-t[1], pr.clave_alfabetica(t[0])))
    centro, prefijo = pr.fmt_compacto(total)
    return {
        "titulo": spec["paneles"]["anillo"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad("cabezas", categoria),
        "pie": pie,
        "centro": centro,
        "centro_unidad": (prefijo + " cabezas").strip(),
        "centro_nota": "suma de las zonas",
        "porciones": [{"n": zona, "v": valor,
                       "t": ctx.texto(valor) + " cabezas",
                       "pct": pr.fmt_pct(valor / total * 100, 1),
                       "color": ctx.color_zona[zona]}
                      for zona, valor in partes],
        "nota": "Zonas productivas definidas por Juan Carlos Antuña.",
    }


def panel_mapa_stock(ctx, spec, anio, categoria, pie):
    hechos = ctx.hechos
    deptos, con_dato = [], []
    for geo in hechos.deptos:
        valor = hechos.total_depto(anio, geo, categoria)
        deptos.append({"id": geo, "nombre": hechos.nombre[geo], "v": valor})
        if valor is not None:
            con_dato.append(valor)
    if not con_dato:
        return panel_vacio(spec["paneles"]["mapa"]["titulo"],
                           "No hay stock de esta categoría en el año elegido.")
    escala = pr.quintiles(con_dato)
    rampa = ctx.colores.rampa("cabezas")
    for fila in deptos:
        if fila["v"] is None:
            fila["color"] = ctx.colores.sin_dato
        else:
            fila["color"] = rampa[min(pr.clase_de(fila["v"], escala["cortes"]), len(rampa)) - 1]
        fila["t"] = ctx.texto(fila["v"]) if fila["v"] is not None else "S/D"
    total = hechos.total_anual(anio, categoria)
    return {
        "titulo": spec["paneles"]["mapa"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad("cabezas", categoria),
        "pie": pie,
        "geojson": GEOJSON,
        "aspecto": aspecto_mapa(), "relacion": relacion_mapa(),
        "deptos": deptos,
        "unidad": "cabezas",
        "escala": {"min": "0", "max": ctx.texto(max(con_dato)), "rampa": rampa},
        "total": "Total provincial: %s cabezas" % ctx.texto(total),
    }


def panel_tendencia_stock(ctx, spec, anio, categoria, pie):
    """Los 14 anios de la serie. El anio elegido queda marcado sobre la linea."""
    hechos = ctx.hechos
    puntos = [hechos.total_anual(a, categoria) for a in ctx.anios]
    if not [p for p in puntos if p is not None]:
        return panel_vacio(spec["paneles"]["tendencia"]["titulo"],
                           "No hay serie para esta categoría.")
    return {
        "titulo": spec["paneles"]["tendencia"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad("cabezas", categoria),
        "pie": pie,
        "x": [str(a)[2:] for a in ctx.anios],
        "puntos": puntos,
        "textos": [ctx.texto(p) + " cabezas" if p is not None else "S/D" for p in puntos],
        "etiquetas": [str(a) for a in ctx.anios],
        "actual": ctx.anios.index(anio) if anio in ctx.anios else None,
        # Como se llama esta linea en la leyenda cuando el zoom pone otra categoria al lado.
        # Sin comparacion el cuadro tiene una sola serie y no dibuja leyenda.
        "medida_nombre": spec["paneles"]["tendencia"]["medida_nombre"],
        "color": ctx.theme["colores"]["primario_medio"],
        # Segundo verde del theme para la serie comparada: este cuadro no pinta por rampa de
        # variable (su linea es cromo del tema), asi que su comparacion tampoco.
        "color_comp": ctx.theme["colores"]["primario"],
        "eje": ctx.eje([p for p in puntos if p is not None], "cabezas"),
    }


def panel_top_stock(ctx, spec, anio, categoria, pie):
    hechos = ctx.hechos
    cuantos = spec["paneles"]["top"]["cuantos"]
    filas = []
    for geo in hechos.deptos:
        valor = hechos.total_depto(anio, geo, categoria)
        if valor:
            filas.append((geo, hechos.nombre[geo], valor))
    if not filas:
        return panel_vacio(spec["paneles"]["top"]["titulo"],
                           "No hay stock de esta categoría en el año elegido.")
    ordenados = ordenar_desc(filas)[:cuantos]
    tope = ordenados[0][2]
    total = hechos.total_anual(anio, categoria)
    return {
        "titulo": spec["paneles"]["top"]["titulo"],
        "subtitulo": ctx.subtitulo_unidad("cabezas", categoria),
        "pie": pie,
        "barras": [{"n": nombre, "t": ctx.texto(valor),
                    "pct": (valor / tope * 100.0) if tope else 0.0,
                    "participacion": participacion_texto(valor, total)}
                   for _, nombre, valor in ordenados],
    }


def construir_tablero_stock(ctx, spec):
    tablero = tablero_base(ctx, spec, [s_filtro_anio(ctx), s_filtro_categoria(ctx, spec)])
    pie = ctx.pie(spec)
    categorias = [ctx.agregado] + ctx.categorias
    for anio in ctx.anios:
        for categoria in categorias:
            tablero["combos"]["|".join([str(anio), categoria])] = {
                "kpis": indicadores_stock(ctx, spec, anio, categoria),
                "paneles": {
                    "anillo": panel_anillo_stock(ctx, spec, anio, categoria, pie),
                    "mapa": panel_mapa_stock(ctx, spec, anio, categoria, pie),
                    "tendencia": panel_tendencia_stock(ctx, spec, anio, categoria, pie),
                    "top": panel_top_stock(ctx, spec, anio, categoria, pie),
                },
            }
    return tablero


TABLEROS = {
    "tablero-cultivos-extensivos": construir_tablero_cultivos,
    "tablero-cultivos-intensivos": construir_tablero_intensivos,
    "tablero-movimientos-hacienda": construir_tablero_hacienda,
    "tablero-stock-bovino": construir_tablero_stock,
}


def anotar_abreviaturas(tablero):
    """Unidades abreviadas con asterisco y aclaracion al pie (formato_v1.unidades_abreviadas).

    Los indicadores compactan a partir del millon ("3,04 M ha"). JC pide que toda unidad
    abreviada lleve asterisco y su aclaracion en la misma pantalla; la nota se arma solo con
    las abreviaturas que ese combo realmente usa.
    """
    larga = {"ha": "hectáreas", "tn": "toneladas", "kg/ha": "kilos por hectárea",
             "cabezas": "cabezas", "dte": "documentos"}
    for combo in tablero["combos"].values():
        # Un tablero puede no tener indicadores: la maqueta "Agri 2" de JC va de los selectores
        # directo a los paneles (tablero-cultivos-intensivos.indicadores.estado). Sin tarjetas
        # no hay unidad que abreviar y no hay nota que escribir.
        if "kpis" not in combo:
            continue
        usadas = []
        for kpi in combo["kpis"]:
            unidad = kpi.get("unidad") or ""
            if not unidad.startswith("M "):
                continue
            # Los kpis se COMPARTEN entre combos (se calculan una vez por periodo y se reusan
            # con cada variable del mapa): la anotacion tiene que ser idempotente.
            if not unidad.endswith("*"):
                kpi["unidad"] = unidad + "*"
            base = unidad[2:].rstrip("*")
            if base not in usadas:
                usadas.append(base)
        # La nota puede venir escrita por el constructor del tablero (en cultivos intensivos
        # trae la aclaracion de JC sobre la superficie estimada): se le SUMA la de las
        # abreviaturas, no se la pisa.
        propia = combo.get("kpis_nota") or ""
        asterisco = ("* " + " · ".join(
            "M %s: millones de %s" % (u, larga.get(u, u)) for u in usadas)) if usadas else ""
        combo["kpis_nota"] = " ".join(t for t in (propia, asterisco) if t)


def verificar_tablero(tablero):
    """Un panel sin pie de fuente no sale. La cita al pie es obligatoria y la pidio JC."""
    for clave, combo in tablero["combos"].items():
        # El layout dibuja 4 tarjetas; un combo puede llenar menos cuando la agregacion no es
        # legal (cultivo "Todos": queda solo la produccion, formato_v1.agregacion). Cero
        # indicadores es un error, SALVO en un tablero que declara no tenerlos: la maqueta
        # "Agri 2" de JC no dibuja tarjetas y va de los selectores directo a los paneles
        # (tablero-cultivos-intensivos.indicadores.estado). "Sin tarjetas" y "la tarjeta salio
        # vacia" tienen que poder distinguirse: por eso la ausencia de la clave, y no una
        # lista vacia.
        if "kpis" in combo and not 1 <= len(combo["kpis"]) <= 4:
            raise pr.ErrorDeProtocolo(
                "El tablero %s tiene %d indicadores en %s y el layout admite de 1 a 4"
                % (tablero["slug"], len(combo["kpis"]), clave))
        for nombre, panel in combo["paneles"].items():
            if not panel.get("vacio") and not panel.get("pie"):
                raise pr.ErrorDeProtocolo(
                    "El panel %s del tablero %s no tiene pie de fuente (%s)"
                    % (nombre, tablero["slug"], clave))
    verificar_comparaciones(tablero)


def verificar_comparaciones(tablero):
    """Un cuadro que ofrece cruzar datos tiene que poder hacerlo.

    Misma regla que con los botones: no se dibuja un control que no hace nada. Se verifica que
    cada segunda medida declarada en el spec aparezca en el payload de alguna combinacion
    (`medidas_extra`); si ninguna la trae, el desplegable seria un adorno. "Alguna" y no
    "todas" a proposito: hay combinaciones donde la medida no es legal y ahi no se ofrece (el
    cultivo "Todos", donde la superficie no se suma entre estaciones).
    """
    for nombre, definicion in tablero["paneles"].items():
        if not isinstance(definicion, dict):
            continue
        pedidas = ((definicion.get("comparacion") or {}).get("medidas") or {}).get("opciones")
        if not pedidas:
            continue
        ofrecidas = set()
        for combo in tablero["combos"].values():
            panel = combo["paneles"].get(nombre) or {}
            for extra in panel.get("medidas_extra") or []:
                ofrecidas.add(extra["id"])
        faltan = [o["v"] for o in pedidas if o["v"] not in ofrecidas]
        if faltan:
            raise pr.ErrorDeProtocolo(
                "El panel %s del tablero %s ofrece comparar con %s y ninguna combinacion trae "
                "esa serie en `medidas_extra`" % (nombre, tablero["slug"], ", ".join(faltan)))


def verificar_subtitulos(ctx, vista):
    """Protocolo: "todo subtitulo nombra la unidad".

    Los cuadros de una sola unidad la declaran en `unidad` y se verifica contra el subtitulo.
    Dos casos no entran en esa regla y se resuelven distinto, no se saltean:
      - la ficha del departamento mezcla ha, tn, kg/ha y %: la unidad va en cada encabezado de
        columna, y eso es lo que se verifica.
      - la tabla de posiciones no tiene unidad (las celdas son puestos): queda anotada.
    """
    sin_unidad = []
    for combo in vista["combos"].values():
        for elemento in combo["elementos"]:
            unidad = elemento.get("unidad")
            if unidad:
                pr.verificar_subtitulo(ctx.protocolo, elemento["subtitulo"], unidad,
                                       "%s (%s)" % (vista["slug"], elemento["titulo"]))
            elif elemento.get("columnas"):
                numericas = [c for c in elemento["columnas"] if c["num"]]
                sin_marca = [c["etiqueta"] for c in numericas
                             if "(" not in c["etiqueta"] and "%" not in c["etiqueta"]]
                if sin_marca:
                    sin_unidad.append((vista["slug"], sin_marca))
            else:
                sin_unidad.append((vista["slug"], []))
    return sin_unidad


# ===========================================================================
# Verificaciones sobre la vista terminada
# ===========================================================================
def verificar_vista(ctx, vista):
    spec = vista["spec"]
    if not vista["combos"]:
        raise pr.ErrorDeProtocolo("La vista %s quedo sin ninguna combinacion con datos"
                                  % vista["slug"])
    clave = clave_de(vista, defaults_de(vista))
    if clave not in vista["combos"]:
        raise pr.ErrorDeProtocolo("La vista %s no tiene datos para sus propios defaults (%s)"
                                  % (vista["slug"], clave))
    vista["clave_default"] = clave
    vista["elementos_default"] = vista["combos"][clave]["elementos"]

    # El spec declara el titulo que TIENE que salir de sus componentes. Se verifica que el
    # compositor lo produzca exactamente, en alguna de las combinaciones de la vista: los specs
    # de departamento escriben su ejemplo con MORENO, que no es el default de la pagina.
    esperados = spec.get("titulo_protocolo_ejemplo")
    if esperados:
        esperados = esperados if isinstance(esperados, list) else [esperados]
        generados = set()
        for combo in vista["combos"].values():
            for elemento in combo["elementos"]:
                titulo = elemento["titulo"]
                generados.add(titulo)
                generados.add(titulo.split(ctx.protocolo["tipografia"]["separador_titulo"], 1)[-1])
        for esperado in esperados:
            if esperado not in generados:
                raise pr.ErrorDeProtocolo(
                    "%s: el compositor nunca produce el `titulo_protocolo_ejemplo` del spec.\n"
                    "  esperado: %s" % (vista["slug"], esperado))

    for combo in vista["combos"].values():
        for elemento in combo["elementos"]:
            if not elemento.get("titulo"):
                raise pr.ErrorDeProtocolo("%s: hay un cuadro sin titulo" % vista["slug"])
            if not elemento.get("pie"):
                raise pr.ErrorDeProtocolo("%s: hay un cuadro sin pie de fuente" % vista["slug"])
            pr.verificar_guiones(elemento["titulo"])
            for eje in (elemento.get("eje"), elemento.get("eje2")):
                if eje and len(eje["etiquetas"]) < 5:
                    raise pr.ErrorDeProtocolo(
                        "%s: un eje quedo con %d marcas (el protocolo exige 5)"
                        % (vista["slug"], len(eje["etiquetas"])))


def aplicar_gate(vista):
    """sensibilidad: comparativo sin `aprobado_por` -> no se publica, va a _privado/."""
    spec = vista["spec"]
    sensible = spec.get("sensibilidad") == "comparativo" or spec.get("publicable") is False
    aprobado = spec.get("aprobado_por")
    if sensible and not aprobado:
        vista["publicable"] = False
        vista["motivo_reserva"] = (
            "Compara a Santiago del Estero con otras provincias o con el total del país. "
            "CLAUDE.md trata ese material como sensible: no se publica sin decisión escrita de "
            "Francisco registrada en el spec (%s.yaml, campo aprobado_por). Esta página no está "
            "enlazada desde ninguna parte del sitio." % spec["slug_vista"])
    else:
        vista["publicable"] = True
    return vista


# ===========================================================================
# Escritura del sitio
# ===========================================================================
class Escritor:
    def __init__(self, destino):
        self.destino = destino
        self.escritos = []

    def texto(self, ruta_relativa, contenido):
        ruta = os.path.join(self.destino, ruta_relativa)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        datos = contenido.encode("utf-8")
        with open(ruta, "wb") as f:
            f.write(datos)
        self.escritos.append((ruta_relativa, hashlib.sha256(datos).hexdigest()))
        return len(datos)

    def copia(self, origen, ruta_relativa):
        with open(origen, "rb") as f:
            datos = f.read()
        ruta = os.path.join(self.destino, ruta_relativa)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "wb") as f:
            f.write(datos)
        self.escritos.append((ruta_relativa, hashlib.sha256(datos).hexdigest()))
        return len(datos)


def json_determinista(objeto):
    return json.dumps(objeto, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")) + "\n"


def fecha_de_la_entrega():
    """Sale del manifiesto de la entrega, no del reloj (regla del agente)."""
    dir_entregas = os.path.join(DIR_CONFIGS, "entregas")
    fechas = []
    for nombre in sorted(os.listdir(dir_entregas)):
        if not nombre.endswith(".yaml"):
            continue
        manifiesto = pr.cargar_yaml(os.path.join(dir_entregas, nombre))
        for archivo in manifiesto.get("archivos") or []:
            if archivo.get("fecha_archivo"):
                fechas.append(str(archivo["fecha_archivo"]))
    if not fechas:
        raise pr.ErrorDeProtocolo("No hay ninguna fecha de entrega en configs/entregas/")
    return fecha_larga(max(fechas))


MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(iso):
    anio, mes, dia = iso.split("-")
    return "%d de %s de %s" % (int(dia), MESES[int(mes) - 1], anio)


def limpiar_destino():
    """Borra lo que genera este build en el sitio, sin tocar el codigo del sitio."""
    for nombre in GENERADOS_PUBLICOS:
        ruta = os.path.join(DIR_PUBLICO, nombre)
        if os.path.isdir(ruta):
            shutil.rmtree(ruta)
    logo = (pr.cargar_theme().get("logo_provincia") or {}).get("archivo")
    if logo and os.path.exists(os.path.join(DIR_PUBLICO, logo.lstrip("/"))):
        os.remove(os.path.join(DIR_PUBLICO, logo.lstrip("/")))
    for ruta in (DIR_CONTENIDO, DIR_ESTILOS):
        if os.path.isdir(ruta):
            shutil.rmtree(ruta)


def entorno_jinja():
    """Jinja queda solo para el CSS (site/templates/pivotal.css.j2): el HTML lo dibuja web/.

    Sin autoescape: es CSS, no HTML. Con autoescape las comillas de las familias tipograficas
    salian como &#39; y el navegador descartaba en silencio la pila de `--rotulos`.
    """
    entorno = Environment(
        loader=FileSystemLoader(DIR_TEMPLATES),
        autoescape=False,
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )
    return entorno


# ---------------------------------------------------------------------------
# Reparto de filtros entre las dos barras (rediseño 2026-08-03)
# ---------------------------------------------------------------------------
# Los badges que rotulaban la FORMA del cuadro ("Anillo", "Mapa", "Barras") se sacaron el
# 10-ago-2026 por regla de JC (_protocolo-presentacion.formato_v1.sin_leyendas_de_tipo_de_grafico:
# "Por favor sacarle las leyendas del tipo de gráfico"). Al usuario no le importa el tipo;
# le importa el dato.

# Cuantas opciones aguanta una fila de chips antes de que convenga un desplegable. Arriba de
# esto (los 27 departamentos, por ejemplo) los chips ocupan media pantalla y dejan de ayudar.
MAXIMO_CHIPS = 18


def repartir_filtros(filtros):
    """Reparte los filtros entre la banda verde (periodo), la barra de chips, el selector
    grande y los paneles.

    La `zona` la declara el filtro; el que no la declara va a la barra de chips, que es el
    default seguro. `selector` es la grilla de cajitas con icono del tema del 10-ago
    (tema_visual.chips_cultivo): se dibuja DENTRO de la grilla del tablero, no en una barra.
    El `control` (chips o desplegable) se decide por cantidad de opciones.
    Devuelve (periodo, barra, selector) y deja anotado el resto para el panel que corresponda.
    """
    periodo, barra, selector = [], [], []
    for filtro in filtros:
        filtro.setdefault("zona", "barra")
        filtro["control"] = ("chips" if len(filtro["opciones"]) <= MAXIMO_CHIPS else "select")
        if filtro["zona"] == "periodo":
            filtro["control"] = "chips"
            periodo.append(filtro)
        elif filtro["zona"] == "barra":
            barra.append(filtro)
        elif filtro["zona"] == "selector":
            filtro["control"] = "chips"
            selector.append(filtro)
    return periodo, barra, selector


def payload_json(vista):
    return {
        "slug": vista["slug"],
        "tipo": vista["tipo"],
        "filtros": [f["id"] for f in vista["filtros"]],
        "combos": vista["combos"],
        # El texto del combo vacio lo puede afinar la vista. No todas las combinaciones que
        # faltan faltan por lo mismo: en la base 85, cruzar "documentos" con una categoria no
        # es una laguna del dato, es que la fuente no abre los documentos por categoria, y el
        # mensaje generico lo haria pasar por un agujero.
        "sin_combinacion": vista.get("sin_combinacion")
                           or "No hay datos para esta combinación de filtros.",
    }


def escribir_datos(escritor, vista, carpeta_datos, ruta_publica):
    """Escribe el JSON de la vista. Si la vista declara `particion`, lo parte en un archivo
    por valor de ese filtro: el mapa tiene 600 combinaciones y no tiene sentido que el
    navegador baje las 600 para mostrar una. La pagina baja el indice y una particion.
    """
    payload = payload_json(vista)
    particion = vista.get("particion")
    if not particion:
        escritor.texto("%s/%s.json" % (carpeta_datos, vista["slug"]),
                       json_determinista(payload))
        return "%s/%s.json" % (ruta_publica, vista["slug"])

    indice = [f["id"] for f in vista["filtros"]].index(particion)
    partes = {}
    for clave, combo in vista["combos"].items():
        partes.setdefault(clave.split("|")[indice], {})[clave] = combo
    archivos = {}
    for i, valor in enumerate(sorted(partes, key=pr.clave_alfabetica)):
        nombre = "%s/%s/p%02d.json" % (carpeta_datos, vista["slug"], i)
        escritor.texto(nombre, json_determinista({"combos": partes[valor]}))
        archivos[valor] = "%s/%s/p%02d.json" % (ruta_publica, vista["slug"], i)
    payload["combos"] = {}
    payload["particion"] = particion
    payload["archivos"] = archivos
    escritor.texto("%s/%s.json" % (carpeta_datos, vista["slug"]), json_determinista(payload))
    return "%s/%s.json" % (ruta_publica, vista["slug"])


def escribir_datos_precios(escritor, tablero, carpeta_datos, ruta_publica):
    """Los archivos del panel de precios: uno por especie y modo, con su ruta en cada chip.

    Mismo criterio que la particion de `escribir_datos`: el navegador baja el archivo de la
    especie que esta mirando, en el modo que esta mirando, y ninguno mas. Sin partir, el panel
    bajaria las 159 series de las 16 especies -en los dos modos- para dibujar una sola linea.
    """
    bloque = tablero["precios"]
    rutas = [{} for _ in bloque["archivos"]]
    for i, por_modo in enumerate(bloque["archivos"]):
        for modo in sorted(por_modo):
            nombre = "%s/%s-precios/p%02d-%s.json" % (carpeta_datos, tablero["slug"], i, modo)
            escritor.texto(nombre, json_determinista(por_modo[modo]))
            rutas[i][modo] = "%s/%s-precios/p%02d-%s.json" % (
                ruta_publica, tablero["slug"], i, modo)
    for chip in bloque["pagina"]["chips"]:
        chip["archivos"] = rutas[chip.pop("i")]
    return bloque["pagina"]


def construir_home(ctx, vistas_por_slug):
    """La home sale del arbol tematico del indice de JC. Las ramas sin datos se muestran igual."""
    manifiesto = pr.cargar_yaml(os.path.join(DIR_CONFIGS, "manifiesto-indice.yaml"))
    secciones = ctx.navegacion["secciones"]
    ramas = []
    for declaracion in ctx.navegacion["ramas"]:
        pendientes, publicadas = [], []
        for base in manifiesto["bases"]:
            tema = base.get("tema")
            if not tema or tema.get("bloque") != declaracion["bloque"]:
                continue
            ruta = tema.get("ruta") or []
            if not ruta or ruta[0] != declaracion["rama"]:
                continue
            pendientes.append("%s · %s" % (base["descripcion"], base["fuente"] or "sin fuente"))
        for seccion in secciones:
            if seccion["rama"] != declaracion["id"]:
                continue
            cantidad = sum(1 for grupo in seccion["grupos"] for slug in grupo["vistas"]
                           if slug in vistas_por_slug)
            publicadas.append({"url": seccion["url"], "titulo": seccion["titulo"],
                               "cantidad": cantidad})
        listado = []
        if not publicadas:
            listado = sorted(pendientes)[:5]
            if len(pendientes) > len(listado):
                listado.append("y %d bases más declaradas en el índice"
                               % (len(pendientes) - len(listado)))
        # El `id` ancla la rama en la home (`#rama-agricultura`): es el nivel intermedio del
        # breadcrumb, que tiene que linkear a SU nivel y no a la home a secas
        # (formato_v1.navegacion.breadcrumb, bug que encontro JC).
        ramas.append({"id": declaracion["id"], "titulo": declaracion["titulo"],
                      "bajada": limpiar(declaracion["bajada"]),
                      "secciones": publicadas, "pendientes": listado})
    return ramas


def miga_de_tablero(seccion, spec):
    """El breadcrumb del tablero. Si el spec declara uno (el del mockup de JC), se sigue tramo
    por tramo: cada nivel linkea a SU nivel y los tramos entre llaves ("{cultivo}") quedan
    dinamicos, atados al selector de la pagina (los actualiza comun.js)."""
    rama_href = "%s#rama-%s" % (INICIO, seccion["rama"])
    declarado = spec.get("breadcrumb")
    if not declarado:
        return [{"texto": "Inicio", "href": INICIO},
                {"texto": seccion["ruta"][0], "href": rama_href},
                {"texto": seccion["titulo"], "href": None}]
    pasos = []
    for tramo in [t.strip() for t in declarado.split(" - ")]:
        if tramo == "Inicio":
            pasos.append({"texto": "Inicio", "href": INICIO})
        elif tramo.lower() == seccion["ruta"][0].lower():
            pasos.append({"texto": seccion["ruta"][0], "href": rama_href})
        elif tramo.lower() == seccion["titulo"].lower():
            # Su nivel es esta misma pagina en su estado por defecto. El TEXTO es el que
            # declara el spec ("Cultivos Extensivos", con las mayusculas del mockup): el
            # breadcrumb del tablero es literal (tercera tanda).
            pasos.append({"texto": tramo, "href": "%s/%s" % (PREFIJO, seccion["url"])})
        elif tramo.startswith("{") and tramo.endswith("}"):
            pasos.append({"texto": "", "dinamico": tramo[1:-1]})
        else:
            pasos.append({"texto": tramo, "href": None})
    return pasos


def menu_del_sitio(ctx, seccion_actual=None):
    """El menu lateral verde del Modelo 2 (site/navegacion.yaml, `menu_lateral`).

    Cada sector despliega sus secciones publicadas; un sector sin secciones se dibuja igual
    (el mockup de JC los lista todos) pero el template le pone "Proximamente" adentro, sin
    ningun link muerto. El sector de la pagina actual arranca desplegado.
    """
    ramas_declaradas = {r["id"] for r in ctx.navegacion["ramas"]}
    salida = []
    for entrada in ctx.navegacion["menu_lateral"]:
        if entrada["rama"] not in ramas_declaradas:
            raise pr.ErrorDeProtocolo(
                "menu_lateral nombra la rama %r, que no existe en site/navegacion.yaml"
                % entrada["rama"])
        secciones, actual = [], False
        for seccion in ctx.navegacion["secciones"]:
            if seccion["rama"] != entrada["rama"]:
                continue
            es_actual = seccion_actual is not None and seccion["id"] == seccion_actual
            actual = actual or es_actual
            secciones.append({"titulo": seccion["titulo"], "url": seccion["url"],
                              "actual": es_actual})
        salida.append({"id": entrada["rama"], "titulo": entrada["titulo"],
                       "actual": actual, "secciones": secciones})
    return salida


def tiene_analisis(seccion):
    """Una seccion puede tener tablero y todavia no tener vistas de detalle.

    Es el caso de stock bovino: Francisco pidio el 5-ago-2026 construir solo el tablero. Sin
    vistas no se escribe `analisis.html` ni se dibuja su pestaña, porque una pestaña que abre
    una pagina vacia se lee como que algo se rompio.
    """
    return bool(seccion.get("grupos"))


def pestanias_de(seccion, actual):
    """Las dos entradas de una base: el tablero (portada) y la lista completa de vistas.

    Es la forma que toma la decision del 3-ago: el tablero pasa a ser lo primero que se ve y
    las vistas de detalle, que es lo que ya estaba construido, quedan un click mas abajo.
    Una seccion sin vistas de detalle muestra una sola pestaña.

    En cultivos el esquema tablero+analisis NO EXISTE MAS (tercera tanda del 10-ago:
    "OLVIDATE DEL ANÁLISIS COMPLETO... TE QUEDES CON LOS TABLEROS"): la seccion lo declara
    con `sin_pestanias` en site/navegacion.yaml y no se dibuja ninguna pestaña. Las otras
    secciones no cambian.
    """
    if seccion.get("sin_pestanias"):
        return []
    pestanias = [
        {"texto": "Tablero", "href": "%s/%s" % (PREFIJO, seccion["url"]),
         "actual": actual == "tablero"},
    ]
    if tiene_analisis(seccion):
        pestanias.append({"texto": "Análisis completo",
                          "href": "%s/%s/analisis" % (PREFIJO, seccion["url"]),
                          "actual": actual == "analisis"})
    return pestanias


# Lo que cada componente de src/tableros/paginas/ lee de una vista o de un tablero. El resto
# del diccionario (spec, combos...) es del build y no viaja a la pagina: los combos van aparte,
# en public/plataforma/data, y la pagina los baja en el navegador.
CAMPOS_VISTA = ("slug", "tipo", "titulo", "reservada", "motivo_reserva", "advertencias",
                "ruta_datos", "notas", "enlaces")
CAMPOS_ELEMENTO = ("titulo", "subtitulo", "pie", "nota", "clase", "advertencia")


def vista_para_pagina(vista):
    datos = {campo: vista.get(campo) for campo in CAMPOS_VISTA}
    datos["elementos_default"] = [
        {campo: el.get(campo) for campo in CAMPOS_ELEMENTO if campo in el}
        for el in vista["elementos_default"]]
    return datos


# Disposiciones que sabe dibujar src/tableros/paginas/Tablero.tsx. El spec elige una en
# `paneles.disposicion`; sin declaracion queda la de siempre. Un valor que el componente no
# sepa dibujar es un error de protocolo: el build no publica una pagina que el sitio no puede
# armar.
DISPOSICIONES = ("mockup", "grilla-2x2")


def disposicion_de(tablero):
    declarada = tablero["paneles"].get("disposicion") or "mockup"
    if declarada not in DISPOSICIONES:
        raise pr.ErrorDeProtocolo(
            "El tablero %s pide la disposicion %r, que el sitio no sabe dibujar. "
            "Disponibles: %s" % (tablero["slug"], declarada, ", ".join(DISPOSICIONES)))
    return declarada


def tablero_para_pagina(tablero):
    return {"slug": tablero["slug"], "titulo": tablero["titulo"],
            "ruta_datos": tablero["ruta_datos"],
            "disposicion": disposicion_de(tablero),
            "tarjeta_contexto": bool(tablero["spec"].get("tarjeta_contexto"))}


def escribir_sitio(ctx, vistas, tableros):
    entorno = entorno_jinja()
    escritor = Escritor(DIR_SITIO_WEB)
    fecha = fecha_de_la_entrega()
    theme = ctx.theme
    # StrictUndefined: la cascara (base.html) pide estas variables en TODAS las paginas. Se
    # declaran una sola vez aca en su version vacia; cada pagina pisa lo que necesita con
    # `pagina(...)`. Sin esto, agregar un `{% if %}` en la cascara rompe cuatro renders.
    comun = {"theme": theme, "fecha_datos": fecha, "filtros_periodo": [], "filtros_barra": [],
             "pestanias": [], "subtitulo_cabecera": None, "miga": None,
             "titulo_cabecera": theme["titulo_sitio"],
             "menu": menu_del_sitio(ctx), "con_menu": True,
             "clase_cuerpo": "", "botones_cabecera": [], "banderas_idioma": [],
             "base": PREFIJO, "inicio": INICIO}

    logo_pagina = dict(theme.get("logo_provincia") or {})
    if logo_pagina.get("archivo"):
        logo_pagina["archivo"] = PREFIJO + logo_pagina["archivo"]
    theme_pagina = {"titulo_sitio": theme["titulo_sitio"], "pie": theme["pie"],
                    "pie_tecnologia": theme["pie_tecnologia"], "logo_provincia": logo_pagina}

    def pagina(plantilla, **extra):
        datos = dict(comun)
        datos.update(extra)
        datos["plantilla"] = plantilla
        datos["theme"] = theme_pagina
        return datos

    def escribir_pagina(ruta, datos):
        """Una pagina = un JSON en src/tableros/contenido/paginas/. La ruta es la URL sin el
        prefijo; las portadas de seccion son <seccion>/index."""
        escritor.texto("src/tableros/contenido/paginas/%s.json" % ruta, json_determinista(datos))

    # CSS generado desde el theme
    css = entorno.get_template("pivotal.css.j2").render(
        theme=theme, c=theme["colores"],
        variacion=ctx.protocolo["tablas"]["colores_de_variacion"],
        sin_dato=ctx.colores.sin_dato)
    escritor.texto("src/tableros/estilos/pivotal.css", css)

    # Geometria (el JS de las paginas vive en src/tableros/cliente/, es codigo del sitio)
    escritor.copia(os.path.join(DIR_CONFIGS, "dims", "sde-departamentos.geojson"),
                   "public/plataforma/geo/sde-departamentos.geojson")

    # Logo provincial: si el theme referencia un asset (site/theme.yaml, logo_provincia.archivo,
    # ruta publica), se copia de site/assets/ al artefacto. Sin asset se dibuja el wordmark.
    archivo_logo = (theme.get("logo_provincia") or {}).get("archivo")
    if archivo_logo:
        relativa = archivo_logo.lstrip("/")
        origen_logo = os.path.join(DIR_ASSETS, relativa)
        if not os.path.exists(origen_logo):
            raise pr.ErrorDeProtocolo(
                "El theme referencia el logo %r pero no existe site/assets/%s."
                % (archivo_logo, relativa))
        escritor.copia(origen_logo, "public/plataforma/" + relativa)

    vistas_por_slug = {v["slug"]: v for v in vistas}
    secciones = ctx.navegacion["secciones"]
    url_de = {}
    for seccion in secciones:
        for grupo in seccion["grupos"]:
            for slug in grupo["vistas"]:
                url_de[slug] = "%s/%s/%s" % (PREFIJO, seccion["url"], slug)
        # `vistas_sueltas`: paginas publicadas en la seccion SIN listado de analisis (cultivos
        # desde la tercera tanda: 09-departamento-datos y la comparacion NOA, alcanzables solo
        # por los botones de cabecera y el click del mapa).
        for slug in seccion.get("vistas_sueltas") or []:
            url_de[slug] = "%s/%s/%s" % (PREFIJO, seccion["url"], slug)
    for slug in ctx.navegacion["privadas"]["vistas"]:
        url_de[slug] = "%s/_privado/%s" % (PREFIJO, slug)

    def extras_de_seccion(seccion):
        """Tema de cuerpo y botones de cabecera que declara la seccion (site/navegacion.yaml).

        Hoy solo cultivos los trae (segunda tanda del 10-ago: tema moderno + botones "Datos
        por Departamento" y "Santiago en el NOA" habilitados); el resto de las paginas sale
        con los defaults de `comun` y queda byte a byte como estaba (alcance solo-cultivos).
        Un boton cuya vista destino no esta publicada NO se dibuja: es la vuelta atras
        prevista si Francisco baja la comparacion NOA (backlog 11).
        """
        if not seccion:
            return {}
        extras = {}
        if seccion.get("tema_cuerpo"):
            extras["clase_cuerpo"] = seccion["tema_cuerpo"]
        # Banderas de idioma es/en/pt arriba a la derecha, donde estaba el titulo duplicado
        # (tercera tanda: "ahí iban las banderas de idiomas"; backlog 33, RESUELTA). Español
        # activa; ingles y portugues deshabilitadas con "Próximamente" (excepcion acotada a
        # la regla de botones muertos). Solo en las secciones que lo declaran (hoy cultivos).
        if seccion.get("cabecera_banderas"):
            # Desde el 22-sep-2026 van como SIGLA en monoespaciada (ES / EN / PT) y no como
            # banderita: a este tamaño las tres banderas no se distinguen, y la sigla es la
            # forma en que el sitio institucional escribe los rotulos chicos.
            extras["banderas_idioma"] = [
                {"codigo": "es", "nombre": "Español", "activa": True},
                {"codigo": "en", "nombre": "Inglés", "activa": False},
                {"codigo": "pt", "nombre": "Português", "activa": False},
            ]
        botones = []
        for boton in seccion.get("botones_cabecera") or []:
            destino = boton["vista"]
            if destino not in url_de:
                raise pr.ErrorDeProtocolo(
                    "El boton de cabecera %r de la seccion %s apunta a %s, que no esta en "
                    "ninguna seccion de site/navegacion.yaml"
                    % (boton["texto"], seccion["id"], destino))
            vista_destino = vistas_por_slug.get(destino)
            if vista_destino is not None and not vista_destino["publicable"]:
                continue
            botones.append({"texto": boton["texto"], "href": url_de[destino]})
        if botones:
            extras["botones_cabecera"] = botones
        return extras

    # Paginas de vista
    for vista in vistas:
        publicable = vista["publicable"]
        carpeta = None
        for seccion in secciones:
            for grupo in seccion["grupos"]:
                if vista["slug"] in grupo["vistas"]:
                    carpeta = seccion
            if vista["slug"] in (seccion.get("vistas_sueltas") or []):
                carpeta = seccion
        if not publicable:
            base_url = "_privado"
            miga = [{"texto": "Inicio", "href": INICIO},
                    {"texto": "Material reservado", "href": PREFIJO + "/_privado"},
                    {"texto": vista["titulo"], "href": None}]
            carpeta_datos = "public/plataforma/_privado/data"
            ruta_publica = PREFIJO + "/_privado/data"
        else:
            if carpeta is None:
                raise pr.ErrorDeProtocolo(
                    "La vista %s no esta ubicada en ninguna seccion de site/navegacion.yaml"
                    % vista["slug"])
            base_url = carpeta["url"]
            miga = [{"texto": "Inicio", "href": INICIO},
                    {"texto": carpeta["ruta"][0], "href": "%s#rama-%s" % (INICIO, carpeta["rama"])},
                    {"texto": carpeta["titulo"], "href": "%s/%s" % (PREFIJO, carpeta["url"])},
                    {"texto": vista["titulo"], "href": None}]
            carpeta_datos, ruta_publica = "public/plataforma/data", PREFIJO + "/data"

        vista["reservada"] = not publicable
        # Los enlaces entre vistas solo se dibujan si el destino esta PUBLICADO: una vista
        # despublicada (estado no-publicada, tercera tanda) no genera pagina y linkearla
        # seria un link muerto. Se dropea el enlace, no se rompe la pagina.
        vista["enlaces"] = [{"texto": e["texto"],
                             "href": url_de[e["href"].replace(".html", "")]}
                            for e in vista["enlaces"]
                            if e["href"].replace(".html", "") in url_de]
        vista["ruta_datos"] = escribir_datos(escritor, vista, carpeta_datos, ruta_publica)
        periodo, barra, _ = repartir_filtros(vista["filtros"])
        extras = extras_de_seccion(carpeta if publicable else None)
        # Cuarta tanda (boton_volver_provincia, declarado en el bloque `cabecera` del spec
        # de la vista): el boton de cabecera que NOMBRA la pagina actual pasa a decir
        # "Provincia" y VUELVE al tablero ("un boton que nombra la pagina en la que ya estas
        # no navega a ningun lado"). La regla es general: la declaran 09-departamento-datos
        # (boton_datos_por_departamento, el caso que marco Facu) y
        # 09-noa-participacion-provincia (boton_santiago_en_el_noa, mismo defecto). Conserva
        # cultivo y campaña: el link lleva data-conserva y comun.js arrastra la seleccion
        # vigente, incluidos los parametros que esta pagina no usa.
        if vista["spec"].get("cabecera"):
            extras["botones_cabecera"] = [
                dict(boton, texto="Provincia", href="%s/%s" % (PREFIJO, carpeta["url"]))
                if boton["href"] == url_de[vista["slug"]] else boton
                for boton in extras.get("botones_cabecera", [])]
        escribir_pagina("%s/%s" % (base_url, vista["slug"]), pagina(
            vista["template"].replace(".html", ""),
            vista=vista_para_pagina(vista), miga=miga,
            titulo_cabecera=vista["titulo"], subtitulo_cabecera=vista["subtitulo_pagina"],
            filtros_periodo=periodo, filtros_barra=barra,
            menu=menu_del_sitio(ctx, carpeta["id"] if carpeta else None),
            pestanias=pestanias_de(carpeta, "analisis") if carpeta else [],
            titulo_pestania="%s · %s" % (vista["titulo"], theme["titulo_sitio"]),
            **extras))

    # Tableros: son la PORTADA de cada seccion (index.html), no una pagina mas.
    tablero_de_seccion = {t["seccion"]: t for t in tableros}
    for tablero in tableros:
        seccion = next(s for s in secciones if s["id"] == tablero["seccion"])
        tablero["ruta_datos"] = escribir_datos(escritor, tablero, "public/plataforma/data",
                                               PREFIJO + "/data")
        # El panel de precios del MCBA tiene su propio JSON, partido por especie: no viaja en
        # las combinaciones del tablero porque sus filtros son otros (ver
        # `construir_precios_mcba`).
        precios = (escribir_datos_precios(escritor, tablero, "public/plataforma/data",
                                          PREFIJO + "/data")
                   if tablero.get("precios") else None)
        periodo, barra, selector = repartir_filtros(tablero["filtros"])
        paneles = []
        for declarado in tablero["paneles"]["orden"]:
            # `detalle` es opcional: una seccion puede tener tablero y todavia no tener sus
            # vistas de detalle construidas (es el caso de stock bovino, que Francisco pidio
            # dejar en stand by el 5-ago-2026). Sin vista adonde ir, el panel no dibuja el
            # enlace; un "ver detalle" que no lleva a ningun lado es peor que no tenerlo.
            destino = declarado.get("detalle")
            if destino is not None and destino not in url_de:
                raise pr.ErrorDeProtocolo(
                    "El panel %s del tablero %s enlaza a la vista %s, que no esta en ninguna "
                    "seccion de site/navegacion.yaml"
                    % (declarado["id"], tablero["slug"], destino))
            definicion = tablero["paneles"][declarado["id"]]
            # `titulo` puede faltar: en el tablero de cultivos (mockup literal) el mapa y la
            # tabla de datos no llevan titulo de panel, y los titulos de los graficos son por
            # combinacion (los pinta tablero.js desde el JSON).
            panel = dict(declarado, titulo=definicion.get("titulo", ""),
                         detalle=url_de[destino] if destino else None)
            if declarado["id"] == "utilidades":
                # Panel del Modelo 2 (backlog 33): iconos en variante color. El item que
                # declara `accion` es un boton de verdad (hoy "Exportar como PDF"); el que no
                # la declara sigue deshabilitado con "Proximamente" (Asistente IA).
                panel["items"] = [item_utilidad(item) for item in definicion["items"]]
            if definicion.get("forma") == "precios":
                # Panel con filtros PROPIOS y datos propios (precios del MCBA, base 8). Se
                # dibuja como cualquier otro panel del tablero, pero su cascara y sus controles
                # salen de aca y el dibujo lo hace `pintarPrecios` en tablero.js. Su cita de
                # fuente no es la del tablero: es la suya (MAGyP y no SENASA).
                panel["precios"] = precios
                panel["pie"] = precios["pie"]
                panel["subtitulo"] = definicion.get("subtitulo", "")
            if declarado["id"] == "informacion-relacionada":
                # Panel estatico del mockup, DIBUJADO con sus links deshabilitados y
                # "Proximamente" (cuarta tanda, informacion_relacionada_se_dibuja: "tiene que
                # estar aunque no lleve a ningun lado"). Misma excepcion acotada a la regla
                # de botones muertos que utilidades y banderas; cada link se activa cuando
                # entre su base (backlog 8).
                panel["items"] = list(definicion["items"])
            # Pie de cuadro (maqueta "Agri 2", tercera vuelta): "Más información →" y
            # "Generar PDF" al pie de CADA panel, no en una tira de utilidades al final. Se
            # declara una sola vez en el spec y se le pega a todos los paneles de la grilla.
            #
            # Dos lugares para declararlas, y no es lo mismo:
            #   `paneles.acciones_de_cuadro`  las que llevan TODOS los cuadros de ese tablero
            #                                 ("Más información" y "Generar PDF" de la maqueta)
            #   `paneles.<id>.acciones`       las de ESE cuadro y nada mas. Es por donde entra
            #                                 el "Zoom" (Francisco, 24-sep-2026): un cuadro sin
            #                                 grafico -la tabla de superficies, la lista de
            #                                 informacion relacionada- no tiene nada que
            #                                 ampliar y no lo declara. No se prende solo.
            # Las propias van DESPUES de las comunes: el "Zoom" queda al lado del "Generar PDF",
            # como en la maqueta de pasturas y forrajes de JC.
            # Cruzar datos: los dos controles que el zoom le pone a este cuadro, si su spec
            # se los habilita (ver `bloque_comparacion`). Van en el JSON de la PAGINA -no en
            # el de los datos- porque son cascara: las opciones son las del filtro y las
            # combinaciones ya estan en el payload de datos.
            panel["comparacion"] = bloque_comparacion(
                definicion, tablero["filtros"], declarado["id"], tablero["slug"])
            comunes = tablero["paneles"].get("acciones_de_cuadro") or []
            propias = definicion.get("acciones") or []
            if (comunes or propias) and declarado["id"] not in PANELES_SIN_PIE_DE_ACCIONES:
                destinos = tablero["paneles"].get("destinos_de_mas_informacion") or {}
                panel["acciones"] = [
                    accion_de_cuadro(item, destinos.get(declarado["id"], {}).get(item["id"]),
                                     url_de, tablero["slug"], declarado["id"])
                    for item in list(comunes) + list(propias)]
            paneles.append(panel)
        escribir_pagina("%s/index" % seccion["url"], pagina(
            "tablero",
            tablero=tablero_para_pagina(tablero), paneles=paneles,
            miga=miga_de_tablero(seccion, tablero["spec"]),
            filtros_panel=filtros_por_panel(tablero["filtros"]),
            titulo_cabecera=tablero["titulo"],
            subtitulo_cabecera=tablero["subtitulo_pagina"],
            filtros_periodo=periodo, filtros_barra=barra,
            filtro_selector=selector[0] if selector else None,
            menu=menu_del_sitio(ctx, seccion["id"]),
            pestanias=pestanias_de(seccion, "tablero"),
            titulo_pestania="%s · %s" % (tablero["titulo"], theme["titulo_sitio"]),
            **extras_de_seccion(seccion)))

    # Lista completa de vistas de la seccion: lo que antes era la portada, ahora el "extra".
    for seccion in secciones:
        if seccion["id"] not in tablero_de_seccion:
            raise pr.ErrorDeProtocolo(
                "La seccion %s no tiene tablero. Desde el rediseño del 3-ago la portada de "
                "cada base es su tablero: falta el spec tablero-%s.yaml"
                % (seccion["id"], seccion["id"]))
        if not tiene_analisis(seccion):
            continue
        grupos = []
        for grupo in seccion["grupos"]:
            fichas = []
            for slug in grupo["vistas"]:
                vista = vistas_por_slug.get(slug)
                if not vista or not vista["publicable"]:
                    continue
                fichas.append({"archivo": slug, "titulo": vista["titulo"],
                               "subtitulo_pagina": vista["subtitulo_pagina"],
                               "tipo": vista["tipo"]})
            if fichas:
                grupos.append({"titulo": grupo["titulo"], "vistas": fichas})
        datos_seccion = {"titulo": seccion["titulo"], "bajada": limpiar(seccion["bajada"]),
                         "url": seccion["url"], "grupos": grupos}
        miga = [{"texto": "Inicio", "href": INICIO},
                {"texto": seccion["ruta"][0], "href": INICIO},
                {"texto": seccion["titulo"], "href": "%s/%s" % (PREFIJO, seccion["url"])},
                {"texto": "Análisis completo", "href": None}]
        escribir_pagina("%s/analisis" % seccion["url"], pagina(
            "seccion",
            seccion=datos_seccion, miga=miga,
            titulo_cabecera=seccion["titulo"], subtitulo_cabecera="Todas las vistas de la base",
            menu=menu_del_sitio(ctx, seccion["id"]),
            pestanias=pestanias_de(seccion, "analisis"),
            titulo_pestania="%s · %s" % (seccion["titulo"], theme["titulo_sitio"]),
            **extras_de_seccion(seccion)))

    # Indice del material reservado (no se enlaza desde ningun lado)
    privadas = ctx.navegacion["privadas"]
    fichas = []
    for slug in privadas["vistas"]:
        vista = vistas_por_slug.get(slug)
        if not vista:
            continue
        fichas.append({"archivo": slug, "titulo": vista["titulo"],
                       "subtitulo_pagina": vista["subtitulo_pagina"],
                       "tipo": vista["tipo"], "slug": slug})
    escribir_pagina("_privado/index", pagina(
        "privado",
        privadas={"titulo": privadas["titulo"], "bajada": limpiar(privadas["bajada"]),
                  "vistas": fichas},
        miga=[{"texto": "Inicio", "href": INICIO},
              {"texto": "Material reservado", "href": None}],
        titulo_cabecera="Material reservado",
        subtitulo_cabecera="No se enlaza desde ninguna parte del sitio",
        titulo_pestania="Material reservado · %s" % theme["titulo_sitio"]))

    # Home. SIN menu lateral (cuarta tanda, home_sin_menu_lateral: "el sidebar en la pagina
    # principal no tiene que estar; tiene que aparecer recien cuando se entra a un dashboard"):
    # el menu tematico se dibuja recien dentro de las secciones.
    escribir_pagina("tableros", pagina(
        "home",
        ramas=construir_home(ctx, vistas_por_slug),
        con_menu=False,
        subtitulo_cabecera=theme["bajada_sitio"],
        titulo_pestania=theme["titulo_sitio"]))

    # Iconos: al deploy van SOLO los que el sitio usa (los referencio algun filtro, la tarjeta
    # de contexto o el panel de utilidades). El catalogo completo queda en site/assets/iconos/.
    for variante, nombre in sorted(_ICONOS_USADOS):
        with open(os.path.join(DIR_ASSETS, "iconos", "trazo", nombre + ".svg"),
                  encoding="utf-8") as f:
            dibujo = f.read()
        # El dibujo viene con `currentColor`: aca se fija el color de la variante, asi el SVG
        # se puede usar como <img> (que no hereda el color del texto).
        escritor.texto("public/plataforma/iconos/%s/%s.svg" % (variante, nombre),
                       dibujo.replace("currentColor", theme["colores"][COLOR_ICONO[variante]]))

    return escritor


def escribir_asignacion_colores(ctx):
    """Deja escrita la asignacion de color por cultivo, para que sea auditable y estable."""
    lineas = [
        "# Color fijo por cultivo. GENERADO por pipeline/site_build.py, no editar a mano.",
        "#",
        "# El protocolo pide que, cuando el color distingue CATEGORIAS y no magnitudes, cada",
        "# cultivo tenga un color fijo asignado una sola vez y respetado en todas las vistas",
        "# (_comunes-base-9.uniformidad.regla_color_cultivo). La asignacion se hace en orden",
        "# alfabetico contra site/theme.yaml -> paleta_categorica, asi es la misma en cada build.",
        "#",
        "# Las escalas de INTENSIDAD de los mapas no salen de aca: las define el protocolo por",
        "# tipo de variable (superficie verde, produccion ocre, rendimiento azul).",
        "colores:",
    ]
    for cultivo in sorted(ctx.color_cultivo, key=pr.clave_alfabetica):
        lineas.append('  "%s": "%s"' % (cultivo, ctx.color_cultivo[cultivo]))
    return "\n".join(lineas) + "\n"


def escribir_colores_hacienda(ctx):
    """Lo mismo que colores-cultivo.yaml, para las categorias de hacienda.

    _comunes-base-85.uniformidad.regla_color_categoria: cada categoria (terneros, vacas,
    novillos...) tiene un color fijo asignado una sola vez y respetado en todas las vistas.
    """
    lineas = [
        "# Color fijo por categoria de hacienda. GENERADO por pipeline/site_build.py, no editar.",
        "#",
        "# Se asigna en orden alfabetico contra site/theme.yaml -> paleta_categorica, asi es la",
        "# misma en cada build. Las escalas de INTENSIDAD (mapa, matriz OD) no salen de aca: esas",
        "# las define el protocolo por tipo de variable (cabezas marron, documentos gris azulado).",
        "colores:",
    ]
    for categoria in sorted(ctx.color_categoria, key=pr.clave_alfabetica):
        lineas.append('  "%s": "%s"' % (categoria, ctx.color_categoria[categoria]))
    return "\n".join(lineas) + "\n"


# ===========================================================================
# main
# ===========================================================================
def main(args=None):
    parser = argparse.ArgumentParser(prog="pipeline.site")
    parser.add_argument("--hashes", action="store_true",
                        help="imprimir el sha256 de cada archivo generado")
    ns = parser.parse_args(args)

    con = duckdb.connect()
    hechos = Hechos(con)
    hacienda = hac.Hacienda(con)
    stock = stk.Stock(con)
    # Las DTV de hortalizas son TRES bases (56 batata, 57 cebolla, 75 papa) sobre un solo mart:
    # se leen juntas y los productos que entran los declara el spec de comunes de la familia
    # (el algodon vive en el mismo mart y NO entra: es cultivo extensivo).
    comunes_dtv = pr.cargar_comunes(ContextoVegetales.familia)
    vegetales = veg.Vegetales(
        con, [p["valor"] for p in comunes_dtv["parametros"]["productos"]])
    # Base 8: los precios mayoristas del MCBA, que alimentan UN panel del tablero de cultivos
    # intensivos (el cuarto grafico de la maqueta "Agri 2").
    precios_mcba = pc.Precios(con)
    con.close()
    ctx = Contexto(hechos)
    # Un contexto por base (o por FAMILIA de bases): no comparten hecho, ni grano temporal, ni
    # medidas, ni redondeo. La vista se construye con el contexto que dice su spec en `familia`
    # o, si no la declara, en `base`.
    contextos = {9: ctx, 85: ContextoHacienda(hacienda), 48: ContextoStock(stock),
                 ContextoVegetales.familia: ContextoVegetales(vegetales, precios_mcba)}

    with open(os.path.join(DIR_SITE, "colores-cultivo.yaml"), "w", encoding="utf-8") as f:
        f.write(escribir_asignacion_colores(ctx))
    with open(os.path.join(DIR_SITE, "colores-categoria-hacienda.yaml"), "w",
              encoding="utf-8") as f:
        f.write(escribir_colores_hacienda(contextos[85]))

    specs = cargar_specs()
    vistas, tableros, omitidas, sin_unidad_en_subtitulo = [], [], [], {}
    for slug in sorted(specs):
        spec = specs[slug]
        # Tercera tanda del 10-ago-2026 (solo_tableros): las vistas despublicadas quedan como
        # REGISTRO de sus reglas y no generan pagina ni JSON. En cultivos las unicas paginas
        # son el tablero, 09-departamento-datos y 09-noa-participacion-provincia.
        if spec.get("estado") == "no-publicada":
            omitidas.append((slug, "spec en estado no-publicada (tercera tanda 10-ago: "
                                   "queda como registro, sin pagina propia)"))
            continue
        constructor = CONSTRUCTORES.get(slug) or TABLEROS.get(slug)
        if constructor is None:
            omitidas.append((slug, "no hay constructor para este spec"))
            continue
        clave_contexto = spec.get("familia") or spec.get("base")
        if clave_contexto not in contextos:
            raise pr.ErrorDeProtocolo(
                "El spec %s declara base/familia %r y no hay contexto para eso"
                % (slug, clave_contexto))
        ctx_vista = contextos[clave_contexto]
        if slug in TABLEROS:
            tablero = constructor(ctx_vista, spec)
            anotar_abreviaturas(tablero)
            verificar_tablero(tablero)
            tableros.append(tablero)
            continue
        vista = constructor(ctx_vista, spec)
        aplicar_gate(vista)
        verificar_vista(ctx_vista, vista)
        for slug_vista, columnas in verificar_subtitulos(ctx_vista, vista):
            sin_unidad_en_subtitulo.setdefault(slug_vista, set()).update(columnas or ["(el cuadro no tiene unidad: son puestos)"])
        vistas.append(vista)

    limpiar_destino()
    escritor = escribir_sitio(ctx, vistas, tableros)

    publicadas = [v for v in vistas if v["publicable"]]
    reservadas = [v for v in vistas if not v["publicable"]]
    print("[site] %d tableros, %d vistas publicadas, %d reservadas en _privado/, %d omitidas"
          % (len(tableros), len(publicadas), len(reservadas), len(omitidas)))
    for tablero in tableros:
        print("[site]   TABLERO %-40s %4d combinaciones"
              % (tablero["slug"], len(tablero["combos"])))
    for vista in vistas:
        marca = "PRIVADA" if not vista["publicable"] else "       "
        print("[site]   %s %-40s %-18s %4d combinaciones"
              % (marca, vista["slug"], vista["tipo"], len(vista["combos"])))
    for slug, motivo in omitidas:
        print("[site]   OMITIDA %-40s %s" % (slug, motivo))
    for slug in sorted(sin_unidad_en_subtitulo):
        print("[site]   AVISO   %-40s cuadro sin unidad unica en el subtitulo: %s"
              % (slug, ", ".join(sorted(sin_unidad_en_subtitulo[slug]))))
    total = sum(1 for _ in escritor.escritos)
    print("[site] %d archivos escritos en el sitio (src/tableros y public/plataforma)" % total)
    if ns.hashes:
        for ruta, digest in escritor.escritos:
            print("[hash] %s  %s" % (digest, ruta))


if __name__ == "__main__":
    main(sys.argv[1:])
