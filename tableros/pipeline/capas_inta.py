"""Arma configs/dims/capas-inta/ desde las descargas crudas de los geoservicios del INTA.

Son los mapas del INTA que pidio JC el 15-nov-2026 y que el 18-nov-2026 pidio traer ADENTRO
del sitio, textual: "JAMAS DIJE QUE PONGAMOS LINKS EXTERNOS AL RESTO DE LOS MAPAS... la idea
es QUE ESTEN DENTRO DE AGRIFOOD!!!! Nunca pusimos links externos a nada, por ende, no se
porque se hizo en este caso. La idea era BAJAR LAS CAPAS Y PONER NUESTRO PROPIO VISOR, SI NO
SE PUEDE, ELIMINAMOS TODO. PARA QUE QUEDE DENTRO DE NUESTRA WEB." Y sobre por que se podia:
"TODOS TIENEN la opcion DESCARGAR, por ende podemos ponerlo en nuestro propio visor."
Tenia razon: se bajan por WFS. Procedencia, comandos y huellas en configs/dims/capas-inta.yaml.

Mismo criterio que pipeline/capas_ign.py y pipeline/capas_energia.py:
  - Determinista: mismas descargas -> mismos archivos byte a byte.
  - Sin dependencias: solo la stdlib.
  - Coordenadas a 5 decimales (~1 metro) y sin puntos consecutivos repetidos.

Tres diferencias con las capas del IGN y del tendido, las tres por como viene el dato:

  1. **Son POLIGONOS, no lineas ni puntos.** Es la primera geometria de area del sitio. Lo que
     dice cada mapa es el RELLENO -de que clase de suelo, de que aptitud, de que zona es cada
     poligono-, asi que dibujar solo el contorno seria perder el mapa entero.

  2. **La leyenda es del INTA, no nuestra.** Cada capa viene con su SLD (el estilo que el
     GeoServer del INTA publica por `GetStyles`), que trae una regla por clase con el nombre y
     el color oficial. De ahi salen las clases y sus colores, igual que las 18 clases del Mapa
     Nacional de Cultivos salieron del `.qml` del INTA. Este modulo las LEE y las imprime en el
     formato de `_protocolo-presentacion.colores.capas_de_contexto`, que es donde viven los
     colores de dato; no las inventa y no las escribe el sitio.

  3. **No se recortan contra la provincia.** Las tres capas del nodo02 ya son de Santiago del
     Estero y nada mas (se verifica la caja al correr: si alguna se sale de la caja provincial
     declarada, corta). Recortar un poligono contra otro poligono es otra operacion que la de
     recortar una linea -hay que reconstruir el anillo por el borde- y no hace falta para
     estas. Una capa de alcance nacional tendra que resolverlo antes de entrar.

Uso:
  python -m pipeline.capas_inta <carpeta de descargas> configs/dims/capas-inta       configs/dims/sde-departamentos.geojson
"""

import json
import os
import sys
import xml.etree.ElementTree as ET

from pipeline.capas_ign import DECIMALES, Limite, escribir, recortar_linea
from pipeline.capas_energia import anillos_del_contorno

# La caja de la provincia, un poco holgada: la misma con la que se bajaron las capas del IGN.
CAJA_PROVINCIA = (-65.3, -30.6, -61.5, -25.5)

# Tolerancia de simplificacion en grados (~55 m a esta latitud). El dato del INTA viene de
# shapefiles digitalizados a escala 1:250.000 o menor: un vertice cada 55 m es mas detalle del
# que la fuente sostiene. No se toca sin medir cuanto cambia el dibujo.
TOLERANCIA = 0.0005

# Cada capa: el archivo crudo, el campo que la clasifica, el archivo publicado, su geometria
# y si hay que recortarla contra el limite de la provincia.
#
# `recorte` NO es una comodidad: las tres capas del nodo02 ya son de Santiago del Estero y
# nada mas (se verifica la caja al correr), y las de geo-backend son de TODO el noroeste, asi
# que sin recorte se dibujarian desbordando la silueta de la provincia.
CAPAS = (
    {"id": "inta-aptitud-tierras", "crudo": "usoaptitshp.json", "campo": "apt_desc",
     "salida": "aptitud-de-tierras.geojson", "geometria": "poligonos", "recorte": False},
    {"id": "inta-zonificacion-uso-suelo", "crudo": "zonificacion_usosuelo.json",
     "campo": "denominaci", "salida": "zonificacion-del-uso-del-suelo.geojson",
     "geometria": "poligonos", "recorte": False},
    # Cursos de agua del NOA: lineas. Se recorta con la MISMA rutina que las capas del IGN y
    # el tendido electrico (`recortar_linea` contra el contorno disuelto de los departamentos),
    # asi que ningun tramo queda colgando afuera del mapa.
    {"id": "inta-cursos-de-agua", "crudo": "cursosdeagua.json", "campo": "TIPO",
     "salida": "cursos-de-agua.geojson", "geometria": "lineas", "recorte": True},
    # Cuencas hidricas del NOA: areas, y mas grandes que la provincia (hay cuencas que la
    # contienen entera). Se recortan cerrando cada pedazo por el contorno provincial.
    {"id": "inta-cuencas", "crudo": "cuencas_noa_ll.json", "campo": "Nom_Macro_",
     "salida": "cuencas-hidricas.geojson", "geometria": "poligonos", "recorte": True},
    # Cobertura del suelo 2006-2007 (LCCS-FAO): es NACIONAL y son 4,36 millones de vertices.
    # Lleva su propia tolerancia, mas gruesa que la de las demas, y esa decision esta medida:
    # recortada a la provincia quedan 1.331 poligonos, y el archivo pesa 3,51 MB con 56 m de
    # tolerancia, 2,49 MB con 111 m, 1,61 MB con 222 m y 1,04 MB con 444 m. A 222 m el error
    # es MENOR QUE UN PIXEL hasta el zoom maximo (la provincia entra en 1.052 px, o sea unos
    # 400 m por pixel, y el zoom llega a 8x), asi que es detalle que no se ve y pesa un tercio
    # mas. El archivo se baja recien cuando alguien prende la capa.
    {"id": "inta-cobertura-suelo", "crudo": "lccs_n3_2007.json", "campo": "NIVEL3",
     "salida": "cobertura-del-suelo-2006-2007.geojson", "geometria": "poligonos",
     "recorte": True, "tolerancia": 0.002, "clase_por_nombre": True},
    # Areas ganaderas deforestadas 2008-2017: UNA sola clase (el SLD del INTA tiene una regla
    # sin filtro) y 49.467 parches. Se descartan los de menos de 1 ha -el 63% de los parches y
    # el 0,99% de la superficie, medido- y el resto se publica como UN rasgo.
    {"id": "inta-areas-deforestadas", "crudo": "tb_layers_ganaderas_transii.json", "campo": None,
     "salida": "areas-deforestadas-2008-2017.geojson", "geometria": "poligonos",
     "recorte": True, "minimo_ha": 1, "un_solo_rasgo": True},
)

# "Suelo Santiago del Estero" (geonode:suel_sgo) se baja y se transforma bien -302 poligonos,
# 955 KB- pero NO se publica todavia, y es una pregunta para JC (backlog 129), no una
# limitacion tecnica. Su SLD clasifica por `simbolo`, la unidad cartografica de suelos
# ("MKtc", "AEtc"), y son 81 clases: eso no es una leyenda, es una tabla, y al costado del
# mapa ocuparia mas que el mapa. La capa trae ademas drenaje, textura superficial, salinidad,
# sodicidad y capacidad de uso, cualquiera de los cuales da una leyenda de 8 a 13 renglones
# que se lee -pero clasificar por ahi seria inventarle una leyenda nuestra a un mapa del INTA,
# que es justo lo que no hacemos. Decide JC: las 81 unidades como las publica el INTA, o
# agrupada por una de esas variables.
CAPAS_PENDIENTES = (
    {"id": "inta-suelo-sde", "crudo": "suel_sgo.json", "campo": "simbolo",
     "salida": "suelo-santiago-del-estero.geojson"},
)

SLD = "{http://www.opengis.net/sld}"
OGC = "{http://www.opengis.net/ogc}"

# Valores que el dato trae y el SLD del INTA NO declara, con su cuenta verificada contra el
# archivo. Es el mismo mecanismo que `DECLARADAS_EN_EL_INFORME` del Mapa Nacional de Cultivos:
# un valor sin leyenda corta la corrida, y la unica forma de publicarlo es declararlo aca con
# su motivo. Si el INTA reexporta la capa y la cuenta cambia, vuelve a cortar.
DECLARADAS_FUERA_DEL_SLD = {
    ("inta-cursos-de-agua", "CAÑADA"): {
        # En MAYUSCULA como las otras tres de esta capa ("RIO", "ARROYO", "QUEBRADA"): el
        # rotulo de una clase del INTA se escribe como lo escribe el INTA, y una leyenda con
        # tres renglones en mayuscula y uno en minuscula se lee como un error.
        "etiqueta": "CAÑADA",
        # Un tono mas claro de la misma familia azul de los otros tres tipos (rio #1f579b,
        # arroyo #5396cf, quebrada #73b3d8). El SLD del INTA no le da ninguno: su propio mapa
        # NO dibuja este rasgo. Se publica nombrado en la leyenda, que es mejor que perderlo
        # en silencio, y queda avisado en advertencias_para_jc de capas-inta.yaml.
        "color": "#9fcbe6",
        "cuantos": 1,
    },
}


# ---------------------------------------------------------------- el estilo del INTA

def _color_de_la_regla(regla, geometria):
    """El color de una regla del SLD: el RELLENO de un area, el TRAZO de una linea.

    Son dos simbolizadores distintos y lo que dice el mapa es distinto en cada uno: el area se
    lee por su relleno y la linea por su trazo. Un SLD de lineas no trae `fill` y uno de areas
    trae ademas un `stroke` que es el contorno, no la clase.
    """
    if geometria == "lineas":
        camino, cual = "%sLineSymbolizer/%sStroke/%sCssParameter" % (SLD, SLD, SLD), "stroke"
    else:
        camino, cual = "%sPolygonSymbolizer/%sFill/%sCssParameter" % (SLD, SLD, SLD), "fill"
    for parametro in regla.findall("./" + camino):
        if parametro.get("name") == cual and (parametro.text or "").strip():
            return parametro.text.strip().lower()
    return None


def clases_del_sld(ruta, geometria):
    """Las reglas del SLD del INTA, en su orden, que es el orden de su leyenda.

    Devuelve una lista de {campo, valor, etiqueta, color}. Una regla del SLD es: el nombre de
    la clase, un filtro `PropertyIsEqualTo` sobre un campo, y el color. Una regla sin filtro
    (el "else" del SLD, o una regla que solo rotula) o sin color no es una clase de la leyenda
    y se saltea.

    El CAMPO sale regla por regla y no una vez por capa porque un SLD del INTA puede filtrar
    por mas de uno: el de cuencas trae 14 reglas por `Nom_Macro_` y 2 por `Cod_Macro_`.
    """
    raiz = ET.parse(ruta).getroot()
    clases = []
    for regla in raiz.iter(SLD + "Rule"):
        igual = regla.find("./%sFilter/%sPropertyIsEqualTo" % (OGC, OGC))
        if igual is None:
            continue
        campo = igual.find(OGC + "PropertyName")
        literal = igual.find(OGC + "Literal")
        color = _color_de_la_regla(regla, geometria)
        if campo is None or literal is None or color is None:
            continue
        nombre = regla.find(SLD + "Name")
        texto = nombre.text if nombre is not None else literal.text
        clases.append({"campo": (campo.text or "").strip(),
                       "valor": (literal.text or "").strip(),
                       "etiqueta": (texto or "").strip(),
                       "color": color})
    if not clases:
        # Un SLD SIN FILTROS no esta roto: es una capa de una sola clase, que se pinta toda
        # igual. Es el caso de las areas deforestadas, que son un unico fenomeno. Se devuelve
        # su color y nada mas; el rotulo lo pone la etiqueta de la capa, no una leyenda de un
        # renglon que repetiria el nombre.
        for regla in raiz.iter(SLD + "Rule"):
            color = _color_de_la_regla(regla, geometria)
            if color:
                return [{"campo": None, "valor": None, "etiqueta": "", "color": color}]
        raise SystemExit("[capas-inta] %s no declara ninguna clase con filtro y color"
                         % os.path.basename(ruta))
    return clases


def leyenda_de_la_capa(capa, sld):
    """Las clases del SLD traducidas al campo que clasifica la capa: [(valor, etiqueta, color)].

    Una regla que filtra por OTRO campo se traduce por su NOMBRE, que en los SLD del INTA es
    el nombre de la clase tal como va en la leyenda. Es el caso de las dos clases "Sin Aporte
    Significativo" de cuencas, que el INTA filtra por codigo (9 y 14) y nombra por extenso. No
    se adivina nada: si el nombre de la regla no coincide con un valor real del campo que
    clasifica, los rasgos de esa clase quedan sin leyenda y la corrida se corta mas abajo.
    """
    crudas = clases_del_sld(sld, capa["geometria"])
    if capa["campo"] is None:
        if len(crudas) != 1 or crudas[0]["campo"] is not None:
            raise SystemExit("[capas-inta] %s se declaro de una sola clase y su SLD clasifica "
                             "por %r." % (capa["id"], crudas[0]["campo"]))
        return [("", "", crudas[0]["color"])]
    salida, ajenas = [], []
    for regla in crudas:
        if regla["campo"] == capa["campo"]:
            salida.append((regla["valor"], regla["etiqueta"], regla["color"]))
        else:
            ajenas.append((regla["campo"], regla["valor"], regla["etiqueta"]))
            salida.append((regla["etiqueta"], regla["etiqueta"], regla["color"]))
    if not any(r[0] for r in salida):
        raise SystemExit("[capas-inta] %s: el SLD no clasifica por %r ni por su nombre."
                         % (capa["id"], capa["campo"]))
    for campo, valor, etiqueta in ajenas:
        print("[capas-inta] %s: el SLD filtra %r por %s=%r y no por %s; se toma el nombre de "
              "la regla." % (capa["id"], etiqueta, campo, valor, capa["campo"]))
    return salida


# ---------------------------------------------------------------- geometria

def simplificar(puntos, tolerancia):
    """Douglas-Peucker sobre una cadena abierta de puntos.

    Iterativo y no recursivo: un anillo de la capa de suelos tiene miles de vertices y la
    version recursiva se lleva puesta la pila en el peor caso.
    """
    if len(puntos) <= 3:
        return puntos
    quedan = [False] * len(puntos)
    quedan[0] = quedan[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        desde, hasta = pila.pop()
        if hasta <= desde + 1:
            continue
        ax, ay = puntos[desde]
        bx, by = puntos[hasta]
        dx, dy = bx - ax, by - ay
        largo2 = dx * dx + dy * dy
        peor, cual = -1.0, -1
        for i in range(desde + 1, hasta):
            px, py = puntos[i]
            if largo2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / largo2
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > peor:
                peor, cual = d2, i
        if peor > tolerancia * tolerancia:
            quedan[cual] = True
            pila.append((desde, cual))
            pila.append((cual, hasta))
    return [puntos[i] for i in range(len(puntos)) if quedan[i]]


def anillo_limpio(anillo, tolerancia=None):
    """Un anillo del GeoJSON -> anillo cerrado, simplificado, redondeado y sin repetidos.

    Devuelve None si despues de simplificar no queda un anillo (menos de tres vertices
    distintos): un poligono mas chico que la tolerancia no se dibuja.
    """
    puntos = [(p[0], p[1]) for p in anillo]
    if len(puntos) > 1 and puntos[0] == puntos[-1]:
        puntos.pop()
    if len(puntos) < 3:
        return None
    # Se simplifica la cadena abierta y despues se cierra, asi el cierre nunca se pierde.
    puntos = simplificar(puntos, TOLERANCIA if tolerancia is None else tolerancia)
    salida = []
    for x, y in puntos:
        p = (round(x, DECIMALES), round(y, DECIMALES))
        if not salida or salida[-1] != p:
            salida.append(p)
    if len(salida) > 1 and salida[0] == salida[-1]:
        salida.pop()
    if len(salida) < 3:
        return None
    return [[p[0], p[1]] for p in salida] + [[salida[0][0], salida[0][1]]]


def partes_del_rasgo(geometria, tolerancia=None):
    """Las partes de un Polygon o MultiPolygon: [[anillo exterior, hueco...], ...].

    **La estructura se conserva, no se aplana.** El primer anillo de cada parte es el exterior
    y los siguientes son HUECOS, y en estas capas los huecos existen de verdad: un poligono de
    Aptitud de Tierras tiene 13 y uno de la Zonificacion tiene 6 (son unidades que rodean a
    otra). Aplanarlos en una sola lista de anillos hace que el hueco se pinte lleno y tape
    justo al poligono que va adentro.

    Si el anillo exterior de una parte no sobrevive a la simplificacion, la parte entera se
    descarta: un hueco sin su exterior no es nada.
    """
    tipo = geometria.get("type")
    if tipo == "Polygon":
        poligonos = [geometria["coordinates"]]
    elif tipo == "MultiPolygon":
        poligonos = list(geometria["coordinates"])
    else:
        raise SystemExit("[capas-inta] geometria %r: este modulo publica poligonos." % tipo)
    partes, antes, despues = [], 0, 0
    for poligono in poligonos:
        anillos = []
        for i, anillo in enumerate(poligono):
            antes += len(anillo)
            limpio = anillo_limpio(anillo, tolerancia)
            if limpio is None:
                if i == 0:
                    anillos = []
                    break
                continue
            despues += len(limpio)
            anillos.append(limpio)
        if anillos:
            partes.append(anillos)
    return partes, antes, despues


# ---------------------------------------------------------------- recorte de poligonos

# Franjas de latitud para indexar las aristas del contorno provincial. Sin indice, cruzar un
# anillo de 3.300 vertices contra los 2.281 del contorno son 7,5 millones de pruebas por
# anillo. Es el mismo truco que usa `capas_ign.Limite`.
FRANJAS = 64


class Contorno:
    """El contorno de la provincia como ANILLO, con sus aristas indexadas por latitud.

    `capas_ign.Limite` alcanza para preguntar si un punto esta adentro y por donde cruza un
    segmento, pero para recortar un POLIGONO hace falta algo mas: saber en QUE arista del
    contorno cae cada cruce y en que orden, porque el pedazo recortado se cierra caminando por
    el borde de la provincia desde donde sale hasta donde vuelve a entrar.
    """

    def __init__(self, anillo):
        self.anillo = ccw(abierto(anillo))
        ys = [p[1] for p in self.anillo]
        self.ymin, self.ymax = min(ys), max(ys)
        self.alto = (self.ymax - self.ymin) / FRANJAS or 1.0
        self.franjas = [[] for _ in range(FRANJAS)]
        n = len(self.anillo)
        for i in range(n):
            a, b = self.anillo[i], self.anillo[(i + 1) % n]
            for k in range(self.franja(min(a[1], b[1])), self.franja(max(a[1], b[1])) + 1):
                self.franjas[k].append(i)

    def franja(self, y):
        return max(0, min(FRANJAS - 1, int((y - self.ymin) / self.alto)))

    def candidatas(self, a, b):
        vistas = set()
        for k in range(self.franja(min(a[1], b[1])), self.franja(max(a[1], b[1])) + 1):
            vistas.update(self.franjas[k])
        return vistas


def abierto(anillo):
    """El anillo sin repetir el primer punto al final."""
    puntos = [(p[0], p[1]) for p in anillo]
    while len(puntos) > 1 and puntos[0] == puntos[-1]:
        puntos.pop()
    return puntos


def area_con_signo(anillo):
    s = 0.0
    n = len(anillo)
    for i in range(n):
        x1, y1 = anillo[i]
        x2, y2 = anillo[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def ccw(anillo):
    return anillo if area_con_signo(anillo) >= 0 else anillo[::-1]


def adentro_de(anillo, punto):
    x, y = punto
    dentro = False
    n = len(anillo)
    for i in range(n):
        x1, y1 = anillo[i]
        x2, y2 = anillo[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xc = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xc > x:
                dentro = not dentro
    return dentro


def _cruce(a, b, c, d):
    """(t sobre a-b, u sobre c-d) si los segmentos se cruzan; None si no."""
    ax, ay = a
    bx, by = b
    cx, cy = c
    dx_, dy_ = d
    rx, ry = bx - ax, by - ay
    sx, sy = dx_ - cx, dy_ - cy
    den = rx * sy - ry * sx
    if den == 0:
        return None
    t = ((cx - ax) * sy - (cy - ay) * sx) / den
    u = ((cx - ax) * ry - (cy - ay) * rx) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return t, u
    return None


def recortar_anillo(contorno, anillo):
    """La INTERSECCION de un anillo simple con el contorno de la provincia.

    Devuelve una lista de anillos cerrados (un anillo que entra y sale varias veces se parte
    en varios pedazos). Es Weiler-Atherton sobre dos anillos simples, que es lo que hace falta
    y nada mas: las capas que se recortan acá no traen huecos (verificado en la de cuencas:
    39 partes, 0 huecos), así que no hay que decidir a qué pedazo le toca cada hueco.

    El caminar por el borde es lo que lo distingue de recortar una línea: una línea cortada
    queda abierta y se publica así, pero un polígono cortado tiene que CERRARSE por el borde
    de la provincia, o no es un polígono.
    """
    sujeto = ccw(abierto(anillo))
    if len(sujeto) < 3:
        return []
    borde = contorno.anillo
    ns, nb = len(sujeto), len(borde)

    # Cruces: por arista del sujeto y por arista del borde, con su parametro.
    por_sujeto = [[] for _ in range(ns)]
    por_borde = [[] for _ in range(nb)]
    for i in range(ns):
        a, b = sujeto[i], sujeto[(i + 1) % ns]
        for j in contorno.candidatas(a, b):
            cruce = _cruce(a, b, borde[j], borde[(j + 1) % nb])
            if cruce is None:
                continue
            t, u = cruce
            punto = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
            nodo = {"punto": punto, "t": t, "u": u, "i": i, "j": j}
            por_sujeto[i].append(nodo)
            por_borde[j].append(nodo)

    hay = any(por_sujeto)
    if not hay:
        # Sin cruces: o el anillo esta entero adentro, o el contorno entero adentro de el, o
        # no se tocan. Las tres son casos reales con las cuencas, que son mas grandes que la
        # provincia.
        if adentro_de(borde, sujeto[0]):
            return [sujeto]
        if adentro_de(sujeto, borde[0]):
            return [list(borde)]
        return []

    # Las dos listas aumentadas, con los cruces intercalados en su lugar.
    def aumentar(puntos, cruces, clave):
        lista = []
        for i, p in enumerate(puntos):
            lista.append({"punto": p, "cruce": None})
            for nodo in sorted(cruces[i], key=lambda n: n[clave]):
                lista.append({"punto": nodo["punto"], "cruce": nodo})
        return lista

    lista_s = aumentar(sujeto, por_sujeto, "t")
    lista_b = aumentar(borde, por_borde, "u")
    pos_s = dict((id(n["cruce"]), k) for k, n in enumerate(lista_s) if n["cruce"])
    pos_b = dict((id(n["cruce"]), k) for k, n in enumerate(lista_b) if n["cruce"])

    # Entra o sale: se mira el PUNTO MEDIO hasta el nodo siguiente del sujeto. Mirar el
    # vertice siguiente no sirve cuando hay dos cruces seguidos en la misma arista.
    def medio(lista, k):
        a = lista[k]["punto"]
        b = lista[(k + 1) % len(lista)]["punto"]
        return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)

    entradas = []
    for k, n in enumerate(lista_s):
        if not n["cruce"]:
            continue
        n["entra"] = adentro_de(borde, medio(lista_s, k))
        if n["entra"]:
            entradas.append(k)
    if not entradas:
        # Solo toques tangenciales: se resuelve como si no hubiera cruces.
        return [sujeto] if adentro_de(borde, sujeto[0]) else []

    # El recorrido: por el sujeto mientras va adentro, y por el BORDE de la provincia desde que
    # sale hasta que vuelve a entrar. Cada salto cae en el nodo gemelo de la otra lista -es el
    # mismo punto, con el mismo par de coordenadas- y se sigue desde el SIGUIENTE, para no
    # escribir dos veces el punto del cruce.
    guardia = 2 * (len(lista_s) + len(lista_b)) + 8
    salida, usados = [], set()
    for arranque in entradas:
        if arranque in usados:
            continue
        usados.add(arranque)
        pedazo, k, en_sujeto, cerro = [], arranque, True, False
        for paso in range(guardia):
            if paso and en_sujeto and k == arranque:
                cerro = True
                break
            lista = lista_s if en_sujeto else lista_b
            nodo = lista[k]
            pedazo.append(nodo["punto"])
            cruce = nodo["cruce"]
            if cruce is not None and paso:
                if en_sujeto and not nodo.get("entra"):
                    k, en_sujeto = (pos_b[id(cruce)] + 1) % len(lista_b), False
                    continue
                if not en_sujeto and lista_s[pos_s[id(cruce)]].get("entra"):
                    destino = pos_s[id(cruce)]
                    usados.add(destino)
                    if destino == arranque:
                        cerro = True
                        break
                    k, en_sujeto = (destino + 1) % len(lista_s), True
                    continue
            if en_sujeto and cruce is not None and nodo.get("entra"):
                usados.add(k)
            k = (k + 1) % len(lista)
        if not cerro:
            raise SystemExit(
                "[capas-inta] el recorte de un poligono no cerro: el camino dio mas vueltas "
                "que vertices tienen los dos anillos juntos (%d cruces, %d entradas)."
                % (sum(len(c) for c in por_sujeto), len(entradas)))
        limpio = []
        for p in pedazo:
            if not limpio or limpio[-1] != p:
                limpio.append(p)
        if len(limpio) > 2 and limpio[0] == limpio[-1]:
            limpio.pop()
        if len(limpio) >= 3:
            salida.append(limpio)
    return salida


def tramos_del_rasgo(geometria):
    """Las polilineas de un LineString o MultiLineString."""
    tipo = geometria.get("type")
    if tipo == "LineString":
        return [geometria["coordinates"]]
    if tipo == "MultiLineString":
        return list(geometria["coordinates"])
    raise SystemExit("[capas-inta] geometria %r: esta capa se declaro de lineas." % tipo)


# ---------------------------------------------------------------- las dos geometrias

def rasgos_de_area(capa, geo, borde, renombre=None):
    """Un rasgo por poligono, con su clase. Devuelve (rasgos, vertices antes, despues)."""
    oeste, sur, este, norte = CAJA_PROVINCIA
    rasgos, antes, despues, chicos = [], 0, 0, [0]
    for rasgo in geo.get("features") or []:
        geometria = rasgo.get("geometry") or {}
        if not geometria.get("coordinates"):
            continue
        # Parches por debajo del minimo: se cuentan y se descartan. El motivo y la cuenta estan
        # medidos en configs/dims/capas-inta.yaml, no se descarta nada a ojo.
        if capa.get("minimo_ha"):
            if ((rasgo.get("properties") or {}).get("sup_ha") or 0) < capa["minimo_ha"]:
                chicos[0] += 1
                continue
        valor = clase_del_rasgo(capa, rasgo, renombre)
        partes, a, d = partes_del_rasgo(geometria, capa.get("tolerancia"))
        antes += a
        if capa["recorte"]:
            # Se simplifica ANTES de recortar, a proposito: los vertices que agrega el recorte
            # son los del contorno de la provincia y no se tocan, asi que el borde de la capa
            # calca la silueta en vez de quedar un diente adentro o afuera.
            recortadas, d = [], 0
            for anillos in partes:
                for pedazo in recortar_anillo(borde["contorno"], anillos[0]):
                    recortadas.append([[list(p) for p in pedazo] + [list(pedazo[0])]])
                    d += len(pedazo) + 1
            partes = recortadas
        despues += d
        if not partes:
            continue
        for anillos in partes:
            for anillo in anillos:
                for x, y in anillo:
                    if not (oeste <= x <= este and sur <= y <= norte):
                        raise SystemExit(
                            "[capas-inta] %s: el vertice (%s, %s) cae fuera de la caja de la "
                            "provincia. Esta capa no es solo de Santiago del Estero y necesita "
                            "recorte antes de publicarse." % (capa["id"], x, y))
        rasgos.append({"type": "Feature",
                       "properties": {"clase": valor},
                       "geometry": {"type": "MultiPolygon", "coordinates": partes}})
    rasgos.sort(key=lambda r: (r["properties"]["clase"],
                               r["geometry"]["coordinates"][0][0][0]))
    if chicos[0]:
        print("[capas-inta] %s: %d parches de menos de %s ha descartados."
              % (capa["id"], chicos[0], capa["minimo_ha"]))
    if capa.get("un_solo_rasgo"):
        # Una capa de UNA clase se publica como UN rasgo con todas sus partes. No es un ahorro
        # de bytes nada mas (aunque son 1,4 MB menos de repetir la envoltura de cada rasgo):
        # el cliente dibuja un rasgo en UN trazo, asi que 18.085 parches pasan de 18.085
        # llamadas de dibujo a una sola.
        partes = [p for r in rasgos for p in r["geometry"]["coordinates"]]
        partes.sort(key=lambda p: p[0][0])
        rasgos = [{"type": "Feature", "properties": {"clase": ""},
                   "geometry": {"type": "MultiPolygon", "coordinates": partes}}] if partes else []
    return rasgos, antes, despues


def rasgos_de_linea(capa, geo, borde, renombre=None):
    """UN rasgo por clase, con todos sus tramos recortados a la provincia.

    Un rasgo por tramo serian miles de copias de la misma propiedad: es el mismo criterio con
    el que el tendido electrico publica un rasgo por nivel de tension. Los tramos se recortan
    con `recortar_linea`, la misma rutina del IGN y del tendido, asi que ninguno queda colgando
    afuera del mapa.
    """
    if not capa["recorte"]:
        raise SystemExit("[capas-inta] %s es de lineas y no declara recorte." % capa["id"])
    por_clase, antes, despues = {}, 0, 0
    for rasgo in geo.get("features") or []:
        geometria = rasgo.get("geometry") or {}
        if not geometria.get("coordinates"):
            continue
        valor = clase_del_rasgo(capa, rasgo, renombre)
        for tramo in tramos_del_rasgo(geometria):
            antes += len(tramo)
            for pedazo in recortar_linea(borde["limite"], [(p[0], p[1]) for p in tramo]):
                simple = simplificar(pedazo, capa.get("tolerancia") or TOLERANCIA)
                if len(simple) < 2:
                    continue
                despues += len(simple)
                por_clase.setdefault(valor, []).append([[p[0], p[1]] for p in simple])
    rasgos = []
    for valor in sorted(por_clase):
        tramos = sorted(por_clase[valor])
        rasgos.append({"type": "Feature",
                       "properties": {"clase": valor},
                       "geometry": {"type": "MultiLineString", "coordinates": tramos}})
    return rasgos, antes, despues


def clase_del_rasgo(capa, rasgo, renombre=None):
    """La clase de un rasgo: el valor del campo que clasifica, o su NOMBRE si la capa lo pide.

    `clase_por_nombre` existe por la cobertura del suelo: ahi el campo que clasifica es
    `NIVEL3`, que trae codigos ("22200"), y el nombre de la clase ("Arbustal abierto") esta en
    el SLD. Un tooltip que dijera "22200" no le sirve a nadie, asi que la clase que se publica
    es el nombre y el codigo se traduce aca. La traduccion sale del SLD del INTA, no de una
    tabla nuestra.
    """
    valor = (rasgo.get("properties") or {}).get(capa["campo"])
    valor = "" if valor is None else str(valor).strip()
    return renombre.get(valor, valor) if renombre else valor


# ---------------------------------------------------------------- main

def una_capa(entrada, salida, capa, borde):
    crudo = os.path.join(entrada, capa["crudo"])
    sld = os.path.join(entrada, capa["crudo"].rsplit(".", 1)[0] + ".sld")
    for ruta in (crudo, sld):
        if not os.path.exists(ruta):
            raise SystemExit("[capas-inta] falta %s" % ruta)

    clases = leyenda_de_la_capa(capa, sld)
    renombre = None
    if capa.get("clase_por_nombre"):
        renombre = dict((valor, etiqueta) for valor, etiqueta, _ in clases)
        clases = [(etiqueta, etiqueta, color) for _, etiqueta, color in clases]
    etiqueta_de = dict((valor, etiqueta) for valor, etiqueta, _ in clases)

    with open(crudo, encoding="utf-8") as f:
        geo = json.load(f)

    sin_clase = {}
    for rasgo in geo.get("features") or []:
        valor = clase_del_rasgo(capa, rasgo, renombre)
        if valor not in etiqueta_de:
            sin_clase[valor] = sin_clase.get(valor, 0) + 1
    for valor, cuantos in sorted(sin_clase.items()):
        declarada = DECLARADAS_FUERA_DEL_SLD.get((capa["id"], valor))
        if declarada is None:
            raise SystemExit(
                "[capas-inta] %s: %d rasgos traen en %s el valor %r, que el SLD del INTA no "
                "declara. Una clase sin leyenda no se publica: hay que declararla en "
                "DECLARADAS_FUERA_DEL_SLD con su motivo y su cuenta, como las clases del Mapa "
                "Nacional de Cultivos." % (capa["id"], cuantos, capa["campo"], valor))
        if declarada["cuantos"] != cuantos:
            raise SystemExit(
                "[capas-inta] %s: %r esta declarada con %d rasgos y el archivo trae %d. La "
                "capa cambio: hay que volver a mirarla antes de publicarla."
                % (capa["id"], valor, declarada["cuantos"], cuantos))
        clases.append((valor, declarada["etiqueta"], declarada["color"]))
        etiqueta_de[valor] = declarada["etiqueta"]

    if capa["geometria"] == "lineas":
        rasgos, antes, despues = rasgos_de_linea(capa, geo, borde, renombre)
        detalle = "%d tramos" % sum(len(r["geometry"]["coordinates"]) for r in rasgos)
    else:
        rasgos, antes, despues = rasgos_de_area(capa, geo, borde, renombre)
        detalle = "%d huecos" % sum(len(anillos) - 1 for r in rasgos
                                    for anillos in r["geometry"]["coordinates"])

    bytes_escritos = escribir(salida, capa["salida"],
                              {"type": "FeatureCollection", "features": rasgos})
    usadas = set(r["properties"]["clase"] for r in rasgos)
    print("[capas-inta] %-38s %5d rasgos (%s), %6d de %7d vertices (%2.0f%% menos), "
          "%2d de %2d clases del SLD, %8d bytes"
          % (capa["salida"], len(rasgos), detalle, despues, antes,
             100.0 * (1 - despues / float(antes or 1)), len(usadas), len(clases),
             bytes_escritos))
    return clases, usadas


def el_borde(ruta_departamentos):
    """El borde de la provincia en las dos formas que hacen falta para recortar.

    `limite` es el de `capas_ign`, que responde si un punto esta adentro: alcanza para cortar
    una linea. `contorno` es el ANILLO indexado, que hace falta para cerrar un poligono
    caminando por el borde. Los dos salen del MISMO contorno disuelto de los departamentos, asi
    que una capa de area y una de linea se recortan contra exactamente la misma silueta.
    """
    anillos = anillos_del_contorno(ruta_departamentos)
    if len(anillos) != 1:
        raise SystemExit("[capas-inta] el contorno de la provincia dio %d anillos y el recorte "
                         "de poligonos camina por UNO. Hay que mirar los departamentos."
                         % len(anillos))
    print("[capas-inta] contorno provincial: 1 anillo, %d puntos" % (len(anillos[0]) - 1))
    return {"limite": Limite({"type": "MultiPolygon", "coordinates": [[anillos[0]]]}),
            "contorno": Contorno(anillos[0])}


def main(entrada, salida, ruta_departamentos):
    os.makedirs(salida, exist_ok=True)
    borde = el_borde(ruta_departamentos)
    bloques = []
    for capa in CAPAS:
        clases, usadas = una_capa(entrada, salida, capa, borde)
        linea = capa["geometria"] == "lineas"
        if capa["campo"] is None:
            # Una sola clase: UN estilo general y nada mas. Una leyenda de un renglon repetiria
            # el nombre de la capa, que ya esta en su casilla del control, con su color al lado.
            bloques.append('  %s:\n    estilos:\n'
                           '      - {cuando: {}, rotulo: "", color: "%s"}'
                           % (capa["id"], clases[0][2]))
            continue
        renglones = ["  %s:" % capa["id"]]
        if linea:
            renglones.append("    halo: 0.8")
        renglones.append("    estilos:")
        for valor, etiqueta, color in clases:
            if valor not in usadas:
                continue
            renglones.append("      - cuando: {clase: [%s]}"
                             % json.dumps(valor, ensure_ascii=False))
            # El rotulo va con los espacios colapsados: en el SLD del INTA hay clases con dos
            # espacios seguidos, que es un tipeo suyo y en la leyenda se ve como un hueco. El
            # VALOR no se toca, que es el que tiene que coincidir con el dato.
            renglones.append("        rotulo: %s"
                             % json.dumps(" ".join(etiqueta.split()), ensure_ascii=False))
            renglones.append('        color: "%s"' % color)
            if linea:
                renglones.append("        ancho: 1.0")
                renglones.append("        trazo: lleno")
        # El ultimo estilo es siempre el general: lo exige el build (un rasgo que no coincida
        # con ninguna regla quedaria sin dibujar). Va SIN ROTULO a proposito: en estas capas no
        # puede haber un rasgo sin clase -el script corta si el dato trae un valor que la
        # leyenda del INTA no declara- asi que un renglon "Sin clasificar" seria una clase
        # imposible ocupando lugar en la leyenda. El estilo queda igual, por si acaso.
        renglones.append('      - {cuando: {}, rotulo: "", color: "#b9a79c"%s}'
                         % (", ancho: 0.8, trazo: punteado" if linea else ""))
        bloques.append("\n".join(renglones))
    print("\n[capas-inta] Para _protocolo-presentacion.yaml, "
          "colores.capas_de_contexto (colores del SLD del INTA):\n")
    print("\n".join(bloques))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("\n".join(__doc__.strip().splitlines()[-2:]))
    main(sys.argv[1], sys.argv[2], sys.argv[3])
