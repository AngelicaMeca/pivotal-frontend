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
  python -m pipeline.capas_inta <carpeta de descargas> configs/dims/capas-inta
"""

import json
import os
import sys
import xml.etree.ElementTree as ET

from pipeline.capas_ign import DECIMALES, escribir

# La caja de la provincia, un poco holgada: la misma con la que se bajaron las capas del IGN.
CAJA_PROVINCIA = (-65.3, -30.6, -61.5, -25.5)

# Tolerancia de simplificacion en grados (~55 m a esta latitud). El dato del INTA viene de
# shapefiles digitalizados a escala 1:250.000 o menor: un vertice cada 55 m es mas detalle del
# que la fuente sostiene. No se toca sin medir cuanto cambia el dibujo.
TOLERANCIA = 0.0005

# Cada capa: el archivo crudo, el campo que la clasifica y el archivo publicado.
CAPAS = (
    {"id": "inta-aptitud-tierras", "crudo": "usoaptitshp.json", "campo": "apt_desc",
     "salida": "aptitud-de-tierras.geojson"},
    {"id": "inta-zonificacion-uso-suelo", "crudo": "zonificacion_usosuelo.json",
     "campo": "denominaci", "salida": "zonificacion-del-uso-del-suelo.geojson"},
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


# ---------------------------------------------------------------- el estilo del INTA

def clases_del_sld(ruta):
    """(campo, [(valor, etiqueta, color)]) en el orden del SLD del INTA, que es su leyenda.

    Una regla del SLD es: el nombre de la clase, un filtro `PropertyIsEqualTo` sobre el campo
    que clasifica, y el relleno. Una regla sin filtro (el "else" del SLD) o sin relleno no es
    una clase de la leyenda y se saltea.
    """
    raiz = ET.parse(ruta).getroot()
    campos, clases = set(), []
    for regla in raiz.iter(SLD + "Rule"):
        igual = regla.find("./%sFilter/%sPropertyIsEqualTo" % (OGC, OGC))
        if igual is None:
            continue
        campo = igual.find(OGC + "PropertyName")
        literal = igual.find(OGC + "Literal")
        relleno = regla.find("./%sPolygonSymbolizer/%sFill/%sCssParameter" % (SLD, SLD, SLD))
        if campo is None or literal is None or relleno is None:
            continue
        if relleno.get("name") != "fill":
            continue
        nombre = regla.find(SLD + "Name")
        texto = nombre.text if nombre is not None else literal.text
        campos.add((campo.text or "").strip())
        clases.append(((literal.text or "").strip(), (texto or "").strip(),
                       (relleno.text or "").strip().lower()))
    if not clases:
        raise SystemExit("[capas-inta] %s no declara ninguna clase con filtro y relleno"
                         % os.path.basename(ruta))
    if len(campos) != 1:
        raise SystemExit("[capas-inta] %s clasifica por %d campos distintos (%s): este modulo "
                         "publica UNA clase por poligono."
                         % (os.path.basename(ruta), len(campos), ", ".join(sorted(campos))))
    return campos.pop(), clases


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


def anillo_limpio(anillo):
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
    puntos = simplificar(puntos, TOLERANCIA)
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


def partes_del_rasgo(geometria):
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
            limpio = anillo_limpio(anillo)
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


# ---------------------------------------------------------------- main

def una_capa(entrada, salida, capa):
    crudo = os.path.join(entrada, capa["crudo"])
    sld = os.path.join(entrada, capa["crudo"].rsplit(".", 1)[0] + ".sld")
    for ruta in (crudo, sld):
        if not os.path.exists(ruta):
            raise SystemExit("[capas-inta] falta %s" % ruta)

    campo_sld, clases = clases_del_sld(sld)
    if campo_sld != capa["campo"]:
        raise SystemExit("[capas-inta] %s: el SLD clasifica por %r y la capa declara %r."
                         % (capa["id"], campo_sld, capa["campo"]))
    etiqueta_de = dict((valor, etiqueta) for valor, etiqueta, _ in clases)

    with open(crudo, encoding="utf-8") as f:
        geo = json.load(f)

    oeste, sur, este, norte = CAJA_PROVINCIA
    rasgos, antes, despues, sin_clase = [], 0, 0, {}
    for rasgo in geo.get("features") or []:
        geometria = rasgo.get("geometry") or {}
        if not geometria.get("coordinates"):
            continue
        valor = (rasgo.get("properties") or {}).get(capa["campo"])
        valor = "" if valor is None else str(valor).strip()
        if valor not in etiqueta_de:
            sin_clase[valor] = sin_clase.get(valor, 0) + 1
        partes, a, d = partes_del_rasgo(geometria)
        antes += a
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
    if sin_clase:
        raise SystemExit(
            "[capas-inta] %s: %d poligonos traen en %s un valor que el SLD del INTA no "
            "declara (%s). Una clase sin leyenda no se publica: hay que leerla del informe "
            "del INTA y declararla, como las del Mapa Nacional de Cultivos."
            % (capa["id"], sum(sin_clase.values()), capa["campo"],
               ", ".join("%r x%d" % (v, n) for v, n in sorted(sin_clase.items()))))

    # Orden estable: por clase y despues por el primer vertice. Determinismo.
    rasgos.sort(key=lambda r: (r["properties"]["clase"],
                               r["geometry"]["coordinates"][0][0][0]))
    bytes_escritos = escribir(salida, capa["salida"],
                              {"type": "FeatureCollection", "features": rasgos})
    usadas = set(r["properties"]["clase"] for r in rasgos)
    huecos = sum(len(anillos) - 1 for r in rasgos
                 for anillos in r["geometry"]["coordinates"])
    print("[capas-inta] %-38s %4d rasgos (%d huecos), %6d de %7d vertices (%2.0f%% menos), "
          "%2d de %2d clases del SLD, %8d bytes"
          % (capa["salida"], len(rasgos), huecos, despues, antes,
             100.0 * (1 - despues / float(antes or 1)), len(usadas), len(clases),
             bytes_escritos))
    return clases, usadas


def main(entrada, salida):
    os.makedirs(salida, exist_ok=True)
    bloques = []
    for capa in CAPAS:
        clases, usadas = una_capa(entrada, salida, capa)
        renglones = ["  %s:" % capa["id"], "    estilos:"]
        for valor, etiqueta, color in clases:
            if valor not in usadas:
                continue
            renglones.append("      - cuando: {clase: [%s]}"
                             % json.dumps(valor, ensure_ascii=False))
            renglones.append("        rotulo: %s" % json.dumps(etiqueta, ensure_ascii=False))
            renglones.append('        color: "%s"' % color)
        # El ultimo estilo es siempre el general: lo exige el build (un poligono que no
        # coincida con ninguna regla quedaria sin dibujar).
        renglones.append('      - {rotulo: "Sin clasificar", color: "#b9a79c"}')
        bloques.append("\n".join(renglones))
    print("\n[capas-inta] Para _protocolo-presentacion.yaml, "
          "colores.capas_de_contexto (colores del SLD del INTA):\n")
    print("\n".join(bloques))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip().splitlines()[-1])
    main(sys.argv[1], sys.argv[2])
