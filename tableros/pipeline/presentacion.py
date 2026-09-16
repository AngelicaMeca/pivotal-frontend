"""Motor de presentacion: el protocolo de JC, traducido a funciones.

Lo consume pipeline/site_build.py. Aca NO hay nada de la base 9 en particular:
son las reglas mecanicas de specs/modelos/_protocolo-presentacion.yaml (titulos,
numeros, escalas de mapa, marcas de eje, colores y pie de fuente).

Regla de oro: ningun string de presentacion se escribe en un template. Todo sale
de este modulo mas los `titulo_componentes` que declara cada spec. Si un titulo no
se puede componer, se levanta ErrorDeProtocolo y el build falla: no se publica un
cuadro con el titulo a medias.

Determinismo: sustitucion de strings, aritmetica con Decimal y redondeo comercial
(half-up). Sin locale, sin heuristicas, sin azar.
"""
import math
import os
import unicodedata
from decimal import Decimal, ROUND_HALF_UP

import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MODELOS = os.path.join(RAIZ, "specs", "modelos")


class ErrorDeProtocolo(Exception):
    """El build no puede componer algo que el protocolo exige. Corta el build."""


# ===========================================================================
# Carga de los YAML de reglas
# ===========================================================================
def cargar_yaml(ruta):
    with open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f)


def cargar_protocolo():
    return cargar_yaml(os.path.join(DIR_MODELOS, "_protocolo-presentacion.yaml"))


def cargar_comunes(base):
    return cargar_yaml(os.path.join(DIR_MODELOS, "_comunes-base-%d.yaml" % base))


def cargar_theme():
    return cargar_yaml(os.path.join(RAIZ, "site", "theme.yaml"))


# ===========================================================================
# NUMEROS (formato es-AR: punto de miles, coma decimal, redondeo comercial)
# ===========================================================================
def _dec(valor):
    return Decimal(str(valor))


def redondear(valor, decimales=0):
    """Redondeo comercial (half-up), no el bancario que trae round()."""
    return _dec(valor).quantize(Decimal(1).scaleb(-decimales), rounding=ROUND_HALF_UP)


def redondear_a_multiplo(valor, multiplo):
    return float(redondear(_dec(valor) / multiplo, 0) * multiplo)


def fmt_numero(valor, decimales=0, signo=False):
    """1234567.89 -> '1.234.567,89'. None -> 'S/D'."""
    if valor is None:
        return "S/D"
    d = redondear(valor, decimales)
    negativo = d < 0
    texto = format(abs(d), "f")
    entero, _, frac = texto.partition(".")
    grupos = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    salida = ".".join(grupos)
    if decimales:
        salida += "," + frac.ljust(decimales, "0")[:decimales]
    if negativo:
        return "-" + salida
    if signo:
        return "+" + salida
    return salida


def fmt_compacto(valor):
    """Numero grande en formato corto para las tarjetas de indicador del tablero.

    Devuelve (texto, prefijo). El prefijo se antepone a la unidad, no al numero: "3,04" + "M Ha",
    como en el mockup. Solo se compacta a partir del millon; abajo de eso el numero entero con
    separador de miles entra igual en la tarjeta y no hay por que hacerle perder precision
    ("2.322 kg/Ha" se lee mejor que "2,3 mil kg/Ha").
    """
    if valor is None:
        return "S/D", ""
    if abs(valor) >= 1_000_000:
        return fmt_numero(valor / 1_000_000.0, 2), "M"
    return fmt_numero(valor, 0), ""


def fmt_pct(valor, decimales=1, signo=False):
    if valor is None:
        return "S/D"
    return fmt_numero(valor, decimales, signo) + "%"


class Precision:
    """precision_display de la base: cuanto redondeo se muestra en pantalla.

    La regla esta escrita en prosa en _comunes-base-N.precision_display y ejecutada aca:
      - departamento: rendimiento a la decena; el resto a la centena si es >= 1.000
      - provincia y pais: entero, sin redondear
    Los CALCULOS (rankings, participaciones, variaciones, promedios) usan SIEMPRE el valor sin
    redondear: esto es solo pantalla. El dato departamental es una estimacion de la fuente y
    mostrarlo al kilo le daria una precision que no tiene.
    """

    def __init__(self, comunes):
        self.declarado = comunes["precision_display"]["nivel_departamento"]

    def valor(self, valor, medida, nivel):
        """nivel: 'departamento' | 'provincia' | 'pais'."""
        if valor is None:
            return None
        if nivel != "departamento":
            return float(redondear(valor, 0))
        if medida == "rendimiento_kg_ha":
            return redondear_a_multiplo(valor, 10)
        if abs(valor) >= 1000:
            return redondear_a_multiplo(valor, 100)
        return float(redondear(valor, 0))

    def texto(self, valor, medida, nivel):
        if valor is None:
            return "S/D"
        return fmt_numero(self.valor(valor, medida, nivel), 0)


# ===========================================================================
# EJE VERTICAL (protocolo, bloque 7): minimo 5 marcas rotuladas
# ===========================================================================
MANTISAS = [1, 2, 2.5, 5, 10]


def marcas_eje(minimo, maximo, objetivo=7):
    """Devuelve {min, max, paso, marcas}. El eje siempre incluye el cero."""
    piso_bruto = min(0.0, float(minimo))
    techo_bruto = max(0.0, float(maximo))
    rango = techo_bruto - piso_bruto
    if rango == 0:
        return {"min": 0.0, "max": 1.0, "paso": 1.0, "marcas": [0.0, 1.0]}
    crudo = rango / objetivo
    exponente = math.floor(math.log10(crudo))
    mantisa = crudo / (10 ** exponente)
    paso = (10 ** exponente) * next(m for m in MANTISAS if m >= mantisa - 1e-12)
    piso = techo = None
    for _ in range(3):
        piso = math.floor(piso_bruto / paso) * paso
        techo = math.ceil(techo_bruto / paso) * paso
        cantidad = int(round((techo - piso) / paso)) + 1
        if cantidad >= 5:
            break
        paso = paso / 2
    cantidad = int(round((techo - piso) / paso)) + 1
    marcas = [float(redondear(piso + i * paso, 6)) for i in range(cantidad)]
    if len(marcas) < 5:
        raise ErrorDeProtocolo(
            "El eje quedo con %d marcas y el protocolo exige 5 o mas (min=%s max=%s)"
            % (len(marcas), minimo, maximo)
        )
    return {"min": marcas[0], "max": marcas[-1], "paso": float(paso), "marcas": marcas}


def marcas_eje_secundario(minimo, maximo, intervalos):
    """Eje derecho de `barras-y-linea`: misma cantidad de intervalos que el izquierdo."""
    piso_bruto = min(0.0, float(minimo))
    techo_bruto = max(0.0, float(maximo))
    rango = techo_bruto - piso_bruto
    if rango == 0:
        return {"min": 0.0, "max": float(intervalos), "paso": 1.0,
                "marcas": [float(i) for i in range(intervalos + 1)]}
    crudo = rango / intervalos
    exponente = math.floor(math.log10(crudo))
    mantisa = crudo / (10 ** exponente)
    paso = (10 ** exponente) * next(m for m in MANTISAS if m >= mantisa - 1e-12)
    piso = math.floor(piso_bruto / paso) * paso
    marcas = [float(redondear(piso + i * paso, 6)) for i in range(intervalos + 1)]
    while marcas[-1] < techo_bruto:
        paso = paso * 2
        piso = math.floor(piso_bruto / paso) * paso
        marcas = [float(redondear(piso + i * paso, 6)) for i in range(intervalos + 1)]
    return {"min": marcas[0], "max": marcas[-1], "paso": float(paso), "marcas": marcas}


# ===========================================================================
# MAPAS: quintiles proporcionales (protocolo, bloque 8)
# ===========================================================================
def quintiles(valores):
    """valores: lista de numeros de los departamentos CON DATO.

    Devuelve {cortes, clase_de_valor(v) -> 1..5, n}. Clasificacion por CANTIDAD
    de departamentos, no por partes iguales del rango.
    """
    ordenados = sorted(valores)
    n = len(ordenados)
    if n == 0:
        return {"cortes": [], "n": 0, "pocos": False}
    if n < 5:
        distintos = sorted(set(ordenados))
        return {"cortes": distintos[:-1], "n": n, "pocos": True}
    cortes = []
    for k in range(1, 5):
        posicion = int(redondear(_dec(n * k) / 5, 0))
        cortes.append(ordenados[posicion - 1])
    return {"cortes": cortes, "n": n, "pocos": False}


def clase_de(valor, cortes):
    """C1 = [min, corte1]; C2 = (corte1, corte2]; ...; C5 = (corte4, max]."""
    for i, corte in enumerate(cortes):
        if valor <= corte:
            return i + 1
    return len(cortes) + 1


# ===========================================================================
# COLORES
# ===========================================================================
class Colores:
    def __init__(self, protocolo, comunes, theme):
        self.rampas = protocolo["colores"]["rampas"]
        self.sin_dato = protocolo["colores"]["sin_dato"]["hex"]
        self.tipos = comunes["presentacion"]["tipos_de_variable"]
        self.theme = theme
        self.categorica = theme["paleta_categorica"]

    def rampa(self, medida):
        tipo = self.tipos.get(medida)
        if tipo is None:
            raise ErrorDeProtocolo("La medida %r no declara tipo de variable en _comunes" % medida)
        return self.rampas[tipo]["hex"]

    def solido(self, medida):
        return self.rampas[self.tipos[medida]]["color_solido"]

    def por_categoria(self, categorias, excluir=()):
        """Un color fijo por categoria, asignado en orden alfabetico. Deterministico.

        `excluir` saca colores de la paleta: en las comparaciones geograficas el primario esta
        reservado para Santiago del Estero y ninguna otra area puede usarlo.
        """
        paleta = [c for c in self.categorica if c not in excluir]
        orden = sorted(categorias, key=clave_alfabetica)
        return {c: paleta[i % len(paleta)] for i, c in enumerate(orden)}


def clave_alfabetica(texto):
    """Orden alfabetico estable, sin depender del locale del sistema."""
    plano = unicodedata.normalize("NFKD", str(texto))
    plano = "".join(c for c in plano if not unicodedata.combining(c))
    return (plano.casefold(), str(texto))


# ===========================================================================
# TITULOS (protocolo, bloque 2)
# ===========================================================================
def minuscula_inicial(texto):
    return texto[:1].lower() + texto[1:] if texto else texto


def mayuscula_inicial(texto):
    return texto[:1].upper() + texto[1:] if texto else texto


class Titulador:
    """Compone el titulo de protocolo por sustitucion de slots. Sin heuristicas."""

    def __init__(self, protocolo, comunes, base, recortes=None):
        self.p = protocolo
        self.comunes = comunes
        self.base = base
        self.tipografia = protocolo["tipografia"]
        self.sujeto_base = protocolo["slots"]["sujeto"]["por_base"][base]
        self.variables = protocolo["slots"]["variable"]
        self.aperturas = protocolo["slots"]["apertura"]["frases"]
        self.periodos = protocolo["periodo"] if "periodo" in protocolo else \
            protocolo["slots"]["periodo"]["plantillas"]
        # Grano temporal de la base: decide si el periodo se dice en campañas o en años. Lo
        # declara el protocolo por base, no cada vista (`slots.periodo.grano_por_base`).
        self.grano = protocolo["slots"]["periodo"]["grano_por_base"][base]
        # id de universo -> "(texto entre parentesis)". Solo lo traen las bases que tienen
        # recortes declarados; la base 9 pasa None y el slot queda siempre sin resolver.
        self.recortes = recortes or {}

    # ---- fragmentos por slot -------------------------------------------
    def frase_variable(self, medida):
        entrada = self.variables["frase_base"].get(medida)
        if entrada is None:
            raise ErrorDeProtocolo("No hay frase para la medida %r" % medida)
        return entrada["frase"], entrada["genero"]

    def fragmento_variable(self, decl, valores, tipo, grafico):
        """Prefijo (por grafico o por tipo) + frase. `override` reemplaza el fragmento."""
        frase, genero = None, "multiple"
        if "multiple" in decl:
            frases = [self.frase_variable(m)[0] for m in decl["multiple"]]
            frase = unir_lista(frases, self.tipografia)
        else:
            medida = decl.get("fijo")
            if "desde_filtro" in decl:
                medida = valores.get(decl["desde_filtro"], medida)
            if medida is not None:
                frase, genero = self.frase_variable(medida)
        articulo = self.variables["articulo"][genero]
        if "override" in decl and decl["override"]:
            if not decl.get("motivo"):
                raise ErrorDeProtocolo("El override de variable exige un `motivo` escrito al lado")
            texto = decl["override"]
            if "{frase}" in texto or "{art}" in texto:
                if frase is None:
                    return None
                texto = texto.replace("{frase}", frase).replace("{art}", articulo)
            return texto
        if frase is None:
            return None
        prefijos = self.variables["prefijo_por_grafico"]
        plantilla = prefijos.get(grafico) or self.variables["prefijo_por_tipo"][tipo]
        return plantilla.replace("{frase}", frase).replace("{art}", articulo)

    def fragmento_area(self, decl, valores, nombres_geo):
        if decl is None:
            return None
        if decl == "provincia":
            return self.p["slots"]["area"]["resolucion"]["provincia"]
        if isinstance(decl, dict) and "fijo" in decl:
            return decl["fijo"]
        if isinstance(decl, dict) and "comparacion" in decl:
            partes = [self.p["slots"]["area"]["resolucion"][a] for a in decl["comparacion"]]
            return self.tipografia["separador_areas"].join(partes)
        if isinstance(decl, dict) and "desde_filtro" in decl:
            valor = valores.get(decl["desde_filtro"])
            if valor is None:
                return None
            if valor == "provincia":
                return self.p["slots"]["area"]["resolucion"]["provincia"]
            nombre = nombres_geo.get(valor, valor)
            return self.p["slots"]["area"]["resolucion"]["departamento"].replace("{nombre}", nombre)
        raise ErrorDeProtocolo("No se como resolver el area %r" % (decl,))

    def fragmento_sujeto(self, decl, valores, con_articulo):
        if decl is None:
            return None
        if isinstance(decl, dict) and "fijo" in decl:
            return decl["fijo"]
        if isinstance(decl, dict) and "desde" in decl:
            destino = decl["desde"]
            if destino in ("subsector", "presentacion.subsector"):
                return self.sujeto_base["frase_en_titulo"] if con_articulo \
                    else self.sujeto_base["subsector"]
            if destino == "presentacion.estacion":
                return self.p["slots"]["sujeto"]["estacion_a_frase"][valores["estacion"]]
            raise ErrorDeProtocolo("No se como resolver el sujeto desde %r" % destino)
        if isinstance(decl, dict) and "desde_filtro" in decl:
            filtro = decl["desde_filtro"]
            valor = valores.get(filtro)
            if valor is None:
                return None
            # Tabla explicita valor-del-filtro -> frase, escrita en el spec. Existe porque el
            # rotulo del selector y la frase del titulo no siempre son el mismo texto: el
            # selector dice "Engorde a corral" y el titulo tiene que decir "los engordes a
            # corral". Sin la tabla habria que deducir plural y articulo, o sea heuristica.
            if "frases" in decl:
                if valor not in decl["frases"]:
                    raise ErrorDeProtocolo(
                        "El sujeto no tiene frase para el valor %r del filtro %r" % (valor, filtro))
                return decl["frases"][valor]
            if valor == "__varios__":
                return self.sujeto_base["frase_en_titulo"] if con_articulo \
                    else self.sujeto_base["subsector"]
            if filtro == "estacion":
                return self.p["slots"]["sujeto"]["estacion_a_frase"][valor]
            if filtro == "cultivo_grupo":
                return minuscula_inicial(valor)
            if filtro == "cultivo":
                return minuscula_inicial(valores.get("cultivo_para_titulo", valor))
            return minuscula_inicial(str(valor))
        raise ErrorDeProtocolo("No se como resolver el sujeto %r" % (decl,))

    def fragmento_apertura(self, decl, valores):
        """Un id de `slots.apertura.frases`, fijo o salido de un selector de la pagina."""
        if not decl:
            return None
        if isinstance(decl, dict):
            if "desde_filtro" not in decl:
                raise ErrorDeProtocolo("No se como resolver la apertura %r" % (decl,))
            decl = valores.get(decl["desde_filtro"])
            if decl is None:
                return None
        if decl in self.p["slots"]["apertura"]["sin_apertura"]["valores"]:
            return None
        if decl not in self.aperturas:
            raise ErrorDeProtocolo("No hay frase de apertura para %r" % (decl,))
        return self.aperturas[decl]

    def fragmento_recorte(self, decl, valores, spec):
        """El parentesis que JC le pone a sus cuadros: '(sin introducción)', '(extracción)'.

        No lo compone nadie: sale tal cual de `_comunes-base-N.universos.<id>.etiqueta_corta`,
        que es donde estan escritos los cuatro universos una sola vez.
        """
        if decl is None:
            return None
        if isinstance(decl, str):
            return decl
        if isinstance(decl, dict) and "fijo" in decl:
            return decl["fijo"]
        if isinstance(decl, dict) and decl.get("desde_universo"):
            universo = (spec.get("universo") or {}).get("recorte")
        elif isinstance(decl, dict) and "desde_filtro" in decl:
            universo = valores.get(decl["desde_filtro"])
        else:
            raise ErrorDeProtocolo("No se como resolver el recorte %r" % (decl,))
        if universo is None:
            return None
        if universo not in self.recortes:
            raise ErrorDeProtocolo(
                "El recorte %r de %s no esta declarado en los universos de la base"
                % (universo, spec.get("slug_vista")))
        return self.recortes[universo]

    def fragmento_periodo(self, decl, valores, campanias_efectivas, ventanas):
        if decl is None:
            return None
        plantillas = self.p["slots"]["periodo"]["plantillas"]
        if isinstance(decl, dict) and "fijo" in decl:
            periodos = [decl["fijo"]]
        elif isinstance(decl, dict) and "ventana" in decl:
            periodos = campanias_efectivas or ventanas[decl["ventana"]]
        elif isinstance(decl, dict) and "desde_filtro" in decl:
            valor = valores.get(decl["desde_filtro"])
            if valor is None:
                return None
            periodos = [valor]
        else:
            raise ErrorDeProtocolo("No se como resolver el periodo %r" % (decl,))
        if not periodos:
            return None
        periodos = [str(p) for p in periodos]
        if len(periodos) == 1:
            return plantillas["%s_simple" % self.grano].replace(
                "{%s}" % self.grano, periodos[0])
        if contiguos(periodos, self.grano):
            return (plantillas["%s_rango" % self.grano]
                    .replace("{desde}", periodos[0]).replace("{hasta}", periodos[-1]))
        if len(periodos) <= 3:
            return plantillas["%s_lista" % self.grano].replace(
                "{lista}", unir_lista(periodos, self.tipografia))
        return (plantillas["%s_muchas" % self.grano]
                .replace("{n}", str(len(periodos))).replace("{hasta}", periodos[-1]))

    # ---- composicion ----------------------------------------------------
    def componer(self, spec, valores, nombres_geo, campanias_efectivas=None,
                 ventanas=None, tipo=None, grafico=None):
        tipo = tipo or spec["tipo"]
        grafico = grafico if grafico is not None else spec.get("grafico")
        componentes = spec["titulo_componentes"]
        plantilla = self.p["titulo"]["plantillas"].get(tipo)
        if plantilla is None:
            raise ErrorDeProtocolo("El protocolo no tiene plantilla de titulo para el tipo %r" % tipo)

        apertura = self.fragmento_apertura(componentes.get("apertura"), valores)
        area = self.fragmento_area(componentes.get("area"), valores, nombres_geo)
        variable = self.fragmento_variable(
            componentes.get("variable") or {}, valores, tipo, grafico)
        recorte = self.fragmento_recorte(componentes.get("recorte"), valores, spec)
        periodo = self.fragmento_periodo(
            componentes.get("periodo"), valores, campanias_efectivas, ventanas or {})

        fragmentos = []
        indice_variable = None
        for grupo in plantilla["grupos"]:
            elegido = None
            for variante in grupo["variantes"]:
                con_articulo = "de {sujeto}" in variante
                sujeto = self.fragmento_sujeto(
                    componentes.get("sujeto"), valores, con_articulo)
                disponibles = {"area": area, "variable": variable, "sujeto": sujeto,
                               "apertura": apertura, "recorte": recorte, "periodo": periodo}
                usados = [s for s in disponibles if "{%s}" % s in variante]
                if all(disponibles[s] for s in usados):
                    texto = variante
                    for slot in usados:
                        texto = texto.replace("{%s}" % slot, disponibles[slot])
                    elegido = texto
                    break
            if elegido is None:
                if grupo.get("opcional"):
                    continue
                raise ErrorDeProtocolo(
                    "No se pudo resolver el grupo %r del titulo de %s (filtros: %r)"
                    % (grupo["grupo"], spec.get("slug"), valores))
            if grupo["grupo"] == "variable":
                indice_variable = len(fragmentos)
            fragmentos.append(elegido)

        if not fragmentos:
            raise ErrorDeProtocolo("Titulo vacio en %s" % spec.get("slug"))
        fragmentos[0] = mayuscula_inicial(fragmentos[0])
        if indice_variable is not None:
            fragmentos[indice_variable] = mayuscula_inicial(fragmentos[indice_variable])
        titulo = self.tipografia["separador_titulo"].join(fragmentos)
        verificar_guiones(titulo)
        return titulo


def verificar_guiones(texto):
    for prohibido in ("–", "—"):
        if prohibido in texto:
            raise ErrorDeProtocolo(
                "El titulo %r usa un guion prohibido por el protocolo (%r)" % (texto, prohibido))


def unir_lista(items, tipografia):
    items = list(items)
    if len(items) == 1:
        return items[0]
    return (tipografia["separador_lista"].join(items[:-1])
            + tipografia["ultimo_de_lista"] + items[-1])


def contiguos(periodos, grano):
    """Contiguidad por el anio: de la campania se toma el de inicio (2015/16 -> 2015)."""
    if grano == "campania":
        anios = [int(str(c).split("/")[0]) for c in periodos]
    else:
        anios = [int(a) for a in periodos]
    return all(b - a == 1 for a, b in zip(anios, anios[1:]))


# ===========================================================================
# SUBTITULO Y PIE DE FUENTE (protocolo, bloques 4 y 5)
# ===========================================================================
def unidad_larga(protocolo, unidad):
    larga = protocolo["subtitulo"]["unidad_larga"].get(unidad)
    if larga is None:
        raise ErrorDeProtocolo("No hay nombre largo para la unidad %r" % unidad)
    return larga


def subtitulo_por_unidad(protocolo, unidad):
    return protocolo["subtitulo"]["plantilla_por_defecto"].replace(
        "{unidad_larga}", unidad_larga(protocolo, unidad))


def verificar_subtitulo(protocolo, subtitulo, unidades, contexto):
    """El subtitulo TIENE que nombrar la unidad (protocolo, bloque 4).

    `unidades` puede ser una sola o varias: un grafico de barras y linea muestra dos y el
    subtitulo tiene que nombrar las dos.
    """
    if isinstance(unidades, str):
        unidades = [unidades]
    for unidad in unidades:
        larga = unidad_larga(protocolo, unidad)
        if larga.lower() not in subtitulo.lower():
            raise ErrorDeProtocolo(
                "El subtitulo de %s no nombra la unidad %r: %r" % (contexto, larga, subtitulo))
    return subtitulo


def pie_de_fuente(protocolo, organismos, publicacion=None):
    """Se arma con el valor de la columna `fuente` de las filas que se muestran."""
    organismos = sorted(set(organismos))
    if not organismos:
        raise ErrorDeProtocolo("Un cuadro sin filas no puede citar fuente")
    texto = unir_lista(organismos, protocolo["tipografia"])
    if publicacion:
        return protocolo["pie_de_fuente"]["plantilla_con_publicacion"] \
            .replace("{organismo}", texto).replace("{publicacion}", publicacion)
    return protocolo["pie_de_fuente"]["plantilla"].replace("{organismo}", texto)


# ===========================================================================
# NUMERACION DENTRO DE UNA PAGINA (protocolo, bloque 6)
# ===========================================================================
def numerar(protocolo, elementos):
    """elementos: lista de dicts con clave `clase` ('mapa'|'grafico'|'tabla').

    Solo se numera si la pagina tiene 2 o mas elementos de la MISMA clase.
    """
    formatos = protocolo["numeracion"]["decision"]["como"]
    plantillas = {"tabla": formatos["formato_tabla"],
                  "grafico": formatos["formato_grafico"],
                  "mapa": formatos["formato_mapa"]}
    conteo = {}
    for elemento in elementos:
        conteo[elemento["clase"]] = conteo.get(elemento["clase"], 0) + 1
    contador = {}
    for elemento in elementos:
        clase = elemento["clase"]
        if conteo[clase] < 2:
            elemento["rotulo"] = None
            continue
        contador[clase] = contador.get(clase, 0) + 1
        elemento["rotulo"] = plantillas[clase].replace("{n}", str(contador[clase]))
    return elementos
