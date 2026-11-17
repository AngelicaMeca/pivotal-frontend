# -*- coding: utf-8 -*-
"""Los valores de cada capa publicada POR DEPARTAMENTO (ERS de Mapas, RF25).

RF25 pide que el visitante pueda elegir un departamento y consultar los valores de las capas
activas para ese departamento. Los km que ya publicaba el sitio son PROVINCIALES (la tabla de
la red vial suma toda la provincia), asi que para contestar esa pregunta hay que repartir cada
capa entre los 27 departamentos. Eso es lo que hace este modulo.

Se corre UNA vez y el resultado se commitea (`configs/dims/capas-por-departamento.csv`), igual
que las capas del IGN y el indicador de proximidad: es derivado de archivos que ya estan
versionados, es deterministico y es chico. La publicacion horaria no lo recalcula.

---------------------------------------------------------------------------------------------
EL METODO, Y LO QUE TIENE DE APROXIMADO
---------------------------------------------------------------------------------------------
- **Puntos** (localidades, parajes, estaciones de ferrocarril): punto en poligono. Exacto.
- **Lineas** (rutas, caminos, vias, tendido electrico): cada segmento se PARTE donde cruza un
  limite departamental y cada pedazo se suma en el departamento que le toca. El largo es
  haversine, el mismo de la tabla provincial.

El metodo conserva el total por construccion -cada pedazo se cuenta una vez y en un solo
lado- asi que la suma de los departamentos da el total provincial sin trucos.

**El corte en el limite no es un lujo, y la primera version no lo hacia.** Asignarle el
segmento entero al departamento de su punto medio es mucho mas simple, pero medido sobre estas
capas daba una cota de error de **6,56% en el ferrocarril**, 4,58% en las rutas nacionales y
3,44% en las provinciales: el IGN guarda las vias y las rutas como segmentos LARGOS, y uno que
cruza un limite se lleva muchos kilometros al lado equivocado. (En los caminos rurales, que son
segmentos cortos, era 1,91%, y en el tendido electrico 0,23%.) Con el corte la cota baja a lo
que mide el pedazo mas chico que se deja sin partir.

El corte es por bisecciones: si las dos puntas de un pedazo caen en departamentos distintos se
lo parte al medio y se sigue, hasta que coincidan o hasta que el pedazo baje de
`CORTE_MINIMO_M`. Solo se refinan los pedazos que cruzan un limite, asi que cuesta poco.
"""

import io
import json
import math
import os
import sys

import yaml

from pipeline import capas_ign as ign


class ErrorDeCapas(Exception):
    """Las capas o los limites no estan donde se los declara."""


RADIO_TIERRA_KM = 6371.0088
DIMS = os.path.join("configs", "dims")
DEPARTAMENTOS = "sde-departamentos.geojson"
SALIDA = "capas-por-departamento.csv"
RESUMEN = "capas-por-departamento-resumen.yaml"
# La propiedad que abre cada capa de lineas. Es el MISMO corte que usa la tabla provincial
# (`site_build.ContextoCapasIgn.APERTURA` la toma de aca), para que los km por departamento y
# los km de la provincia se puedan comparar columna por columna.
APERTURA = {"rutas-nacionales": "calzada", "rutas-provinciales": "calzada",
            "caminos-terciarios": "calzada", "ferrocarril": "estado",
            "tendido-media-tension": "tension"}
CATALOGOS = (
    (os.path.join(DIMS, "capas-ign.yaml"), os.path.join(DIMS, "capas-ign")),
    (os.path.join(DIMS, "capas-energia.yaml"), os.path.join(DIMS, "capas-energia")),
)


def km_entre(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_KM * math.asin(math.sqrt(h))


def cargar_departamentos(raiz="."):
    """[(geo_id, nombre, Limite)] en el orden del archivo, que es lo que lo hace determinista."""
    ruta = os.path.join(raiz, DIMS, DEPARTAMENTOS)
    if not os.path.exists(ruta):
        raise ErrorDeCapas("Falta %s." % ruta)
    with io.open(ruta, encoding="utf-8") as f:
        geo = json.load(f)
    deptos = []
    for rasgo in geo["features"]:
        props = rasgo.get("properties") or {}
        geo_id = str(props.get("geo_id") or props.get("in1") or props.get("id") or "")
        if not geo_id:
            raise ErrorDeCapas("Un departamento de %s no trae `geo_id`." % DEPARTAMENTOS)
        deptos.append((geo_id, props.get("nombre") or props.get("fna") or "",
                       ign.Limite(rasgo["geometry"])))
    if not deptos:
        raise ErrorDeCapas("%s no trae departamentos." % DEPARTAMENTOS)
    return deptos


def cual(deptos, punto):
    """El geo_id del departamento que contiene el punto, o None si cae afuera de la provincia."""
    for geo_id, _nombre, limite in deptos:
        if limite.adentro(punto):
            return geo_id
    return None


def capas_declaradas(raiz="."):
    """[(id, dicho, ruta)] de las capas publicadas, de los dos catalogos."""
    capas = []
    for catalogo, carpeta in CATALOGOS:
        ruta_cat = os.path.join(raiz, catalogo)
        if not os.path.exists(ruta_cat):
            continue
        with io.open(ruta_cat, encoding="utf-8") as f:
            cat = yaml.safe_load(f) or {}
        for cid, dicho in sorted(((cat.get("publicacion") or {}).get("capas") or {}).items()):
            ruta = os.path.join(raiz, carpeta, dicho["archivo"])
            if not os.path.exists(ruta):
                raise ErrorDeCapas(
                    "La capa %s dice estar en %s y el archivo no esta. Hay que bajarla antes "
                    "de repartirla por departamento." % (cid, ruta))
            capas.append((cid, dicho, ruta))
    return capas


def partes_de(geometria):
    """Las tiras de puntos de una LineString o MultiLineString."""
    if geometria["type"] == "MultiLineString":
        return geometria["coordinates"]
    if geometria["type"] == "LineString":
        return [geometria["coordinates"]]
    return []


# Hasta donde se parte un pedazo que cruza un limite. 25 metros sobre tramos de decenas de
# kilometros: lo que queda sin resolver es despreciable y cuesta un punado de bisecciones por
# cruce (log2(50 km / 25 m) = 11).
CORTE_MINIMO_M = 25.0


def _repartir(deptos, a, b, km, clave, pendientes):
    """Suma el largo de a-b en el departamento que le toca, partiendolo si cruza un limite.

    `pendientes["dudoso"]` acumula el largo que se dejo sin resolver porque el pedazo ya era
    mas corto que `CORTE_MINIMO_M`: es la cota del error que se publica.
    """
    largo = km_entre(a[0], a[1], b[0], b[1])
    if largo <= 0:
        return
    da, db = cual(deptos, a), cual(deptos, b)
    if da == db:
        if da is None:
            pendientes["fuera"] += largo
        else:
            km[(da, clave)] = km.get((da, clave), 0.0) + largo
        return
    if largo * 1000.0 <= CORTE_MINIMO_M:
        # Ya no vale la pena seguir partiendo: se lo da al departamento del punto medio y lo
        # que pudo quedar del lado equivocado se cuenta en la cota.
        medio = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        geo_id = cual(deptos, medio) or da or db
        if geo_id is None:
            pendientes["fuera"] += largo
        else:
            km[(geo_id, clave)] = km.get((geo_id, clave), 0.0) + largo
            pendientes["dudoso"] += largo
        return
    medio = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    _repartir(deptos, a, medio, km, clave, pendientes)
    _repartir(deptos, medio, b, km, clave, pendientes)


def largo_por_departamento(deptos, rasgos, apertura=None):
    """{(geo_id, valor): km} partiendo cada segmento donde cruza un limite departamental.

    `apertura` es la propiedad que abre la capa (la calzada de una ruta, el estado de una via,
    el nivel de tension): el mismo corte que usa la tabla provincial, para que los dos numeros
    se puedan comparar.

    Devuelve tambien (km_fuera, km_dudoso): lo que cae afuera de la provincia y la cota del
    error, que con el corte es el largo de los pedazos que quedaron abajo del minimo.
    """
    km = {}
    pendientes = {"fuera": 0.0, "dudoso": 0.0}
    for rasgo in rasgos:
        props = rasgo.get("properties") or {}
        valor = str(props.get(apertura, "")) if apertura else ""
        for parte in partes_de(rasgo.get("geometry") or {}):
            for a, b in zip(parte, parte[1:]):
                _repartir(deptos, (a[0], a[1]), (b[0], b[1]), km, valor, pendientes)
    return km, pendientes["fuera"], pendientes["dudoso"]


def puntos_por_departamento(deptos, rasgos, apertura=None):
    """{(geo_id, valor): cuantos} por punto en poligono. Exacto."""
    cuenta = {}
    fuera = 0
    for rasgo in rasgos:
        geometria = rasgo.get("geometry") or {}
        if geometria.get("type") != "Point":
            continue
        props = rasgo.get("properties") or {}
        valor = str(props.get(apertura, "")) if apertura else ""
        lon, lat = geometria["coordinates"][0], geometria["coordinates"][1]
        geo_id = cual(deptos, (lon, lat))
        if geo_id is None:
            fuera += 1
            continue
        cuenta[(geo_id, valor)] = cuenta.get((geo_id, valor), 0) + 1
    return cuenta, fuera


def calcular(raiz=".", avisar=None):
    deptos = cargar_departamentos(raiz)
    filas = []
    resumen_capas = []
    for cid, dicho, ruta in capas_declaradas(raiz):
        with io.open(ruta, encoding="utf-8") as f:
            geo = json.load(f)
        rasgos = geo.get("features") or []
        apertura = APERTURA.get(cid)
        geometria = dicho.get("geometria")
        if geometria == "lineas":
            valores, fuera, dudoso = largo_por_departamento(deptos, rasgos, apertura)
            total = sum(valores.values())
            for (geo_id, valor), km in sorted(valores.items()):
                filas.append((cid, "km", geo_id, valor, round(km, 3)))
            resumen_capas.append({
                "capa": cid, "etiqueta": dicho.get("etiqueta"), "medida": "km",
                "rasgos": len(rasgos), "total_provincial": round(total, 3),
                "fuera_de_la_provincia_km": round(fuera, 3),
                "cota_error_km": round(dudoso, 3),
                "cota_error_pct": round(100.0 * dudoso / total, 3) if total else 0.0})
            if avisar:
                avisar("%-26s %10.1f km en %d departamentos (cota de error %.2f%%)"
                       % (cid, total, len({g for g, _v in valores}),
                          100.0 * dudoso / total if total else 0.0))
        elif geometria == "puntos":
            valores, fuera = puntos_por_departamento(deptos, rasgos, apertura)
            total = sum(valores.values())
            for (geo_id, valor), cuantos in sorted(valores.items()):
                filas.append((cid, "cuantos", geo_id, valor, cuantos))
            resumen_capas.append({
                "capa": cid, "etiqueta": dicho.get("etiqueta"), "medida": "cuantos",
                "rasgos": len(rasgos), "total_provincial": total,
                "fuera_de_la_provincia": fuera})
            if avisar:
                avisar("%-26s %10d puntos en %d departamentos%s"
                       % (cid, total, len({g for g, _v in valores}),
                          (", %d afuera" % fuera) if fuera else ""))
        else:
            # Una capa de poligonos (las amenazas del IGN) no se reparte asi: su dato ya viene
            # por departamento o es un poligono propio. No se adivina.
            if avisar:
                avisar("%-26s geometria %r: no se reparte (no es linea ni punto)"
                       % (cid, geometria))
    return deptos, filas, resumen_capas


def escribir(raiz, deptos, filas, resumen_capas):
    carpeta = os.path.join(raiz, DIMS)
    ruta = os.path.join(carpeta, SALIDA)
    with io.open(ruta, "w", encoding="utf-8", newline="") as f:
        f.write(u"capa,medida,geo_id,apertura,valor\n")
        for capa, medida, geo_id, valor, cuanto in sorted(filas):
            f.write(u"%s,%s,%s,%s,%s\n" % (capa, medida, geo_id, valor, cuanto))

    ruta_resumen = os.path.join(carpeta, RESUMEN)
    cuerpo = {
        "generado_por": "python -m pipeline.capas_departamento",
        "para": "RF25 del ERS de Mapas: los valores de las capas activas por departamento.",
        "metodo": {
            "puntos": "Punto en poligono. Exacto.",
            "lineas": ("Cada segmento se le asigna al departamento que contiene su PUNTO "
                       "MEDIO y se suma su largo (haversine) ahi. No se corta el segmento en "
                       "el limite, asi que el total provincial se conserva exacto y lo que "
                       "puede estar mal atribuido es el pedazo que cruza un limite."),
            "corte_en_el_limite": ("Un pedazo cuyas dos puntas caen en departamentos "
                                   "distintos se parte al medio y se sigue, hasta que "
                                   "coincidan o hasta que baje de 25 metros."),
            "cota_de_error": ("`cota_error_km` es el largo de los pedazos que quedaron "
                              "abajo de los 25 metros sin resolverse: es el maximo que "
                              "podria estar del lado equivocado, no el error real. Sin el "
                              "corte en el limite esa cota llegaba al 6,56% en el "
                              "ferrocarril."),
            "no_es": ("No es distancia por camino ni accesibilidad: son kilometros de traza "
                      "y cantidades de puntos adentro de cada departamento."),
        },
        "departamentos": len(deptos),
        "capas": resumen_capas,
    }
    with io.open(ruta_resumen, "w", encoding="utf-8", newline="") as f:
        f.write(yaml.safe_dump(cuerpo, allow_unicode=True, sort_keys=False,
                               default_flow_style=False))
    return ruta, ruta_resumen


def leer(raiz="."):
    """{capa: {geo_id: {apertura: valor}}} de lo ya calculado, o {} si todavia no se calculo."""
    ruta = os.path.join(raiz, DIMS, SALIDA)
    if not os.path.exists(ruta):
        return {}
    porCapa = {}
    with io.open(ruta, encoding="utf-8") as f:
        next(f, None)
        for linea in f:
            partes = linea.rstrip("\n").split(",")
            if len(partes) != 5:
                continue
            capa, medida, geo_id, apertura, valor = partes
            cuanto = float(valor) if medida == "km" else int(valor)
            porCapa.setdefault(capa, {"medida": medida, "por_departamento": {}})
            porCapa[capa]["por_departamento"].setdefault(geo_id, {})[apertura] = cuanto
    return porCapa


def leer_resumen(raiz="."):
    ruta = os.path.join(raiz, DIMS, RESUMEN)
    if not os.path.exists(ruta):
        return {}
    with io.open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def main(argv=None):
    import argparse
    p = argparse.ArgumentParser(
        description="Reparte las capas publicadas entre los departamentos (RF25).")
    p.add_argument("accion", nargs="?", default="calcular",
                   choices=("calcular", "estado", "departamento"))
    p.add_argument("--raiz", default=".")
    p.add_argument("--geo-id")
    args = p.parse_args(argv)

    def decir(t):
        print("[capas-depto] %s" % t)

    if args.accion == "calcular":
        deptos, filas, resumen = calcular(args.raiz, avisar=decir)
        ruta, ruta_resumen = escribir(args.raiz, deptos, filas, resumen)
        print("%d filas en %s" % (len(filas), ruta))
        print("resumen en %s" % ruta_resumen)
        return 0

    if args.accion == "estado":
        resumen = leer_resumen(args.raiz)
        if not resumen:
            print("todavia no se calculo")
            return 0
        print("%d departamentos, %d capas" % (resumen["departamentos"],
                                              len(resumen["capas"])))
        for capa in resumen["capas"]:
            if capa["medida"] == "km":
                print("  %-26s %10.1f km   cota de error %.2f%%"
                      % (capa["capa"], capa["total_provincial"], capa["cota_error_pct"]))
            else:
                print("  %-26s %10d puntos" % (capa["capa"], capa["total_provincial"]))
        return 0

    if args.accion == "departamento":
        if not args.geo_id:
            p.error("departamento necesita --geo-id")
        datos = leer(args.raiz)
        for capa in sorted(datos):
            porDepto = datos[capa]["por_departamento"].get(args.geo_id)
            if not porDepto:
                continue
            total = sum(porDepto.values())
            unidad = "km" if datos[capa]["medida"] == "km" else ""
            print("  %-26s %10.1f %s   %s" % (
                capa, total, unidad,
                ", ".join("%s=%s" % (k or "(sin abrir)", v)
                          for k, v in sorted(porDepto.items()))))
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
