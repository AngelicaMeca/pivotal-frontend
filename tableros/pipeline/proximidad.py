# -*- coding: utf-8 -*-
"""Indicadores derivados del cruce de capas geoespaciales (ERS de Mapas, RF18).

Hoy hay uno: cuantos parajes de cada departamento estan a menos de 5, 10, 20 y 40 km de la
red vial PAVIMENTADA (RF18.1). Todo lo que decide el resultado -que capas, que calzada cuenta,
que radios y con que metodo se mide- se declara en `configs/dims/indicadores-geo.yaml` y aca
no hay ni una constante de negocio (RF18.2).

No corre en la publicacion horaria: las capas no cambian de una hora a la otra y el calculo
son 11 millones de distancias. Se corre a mano y el resultado se commitea, igual que las
propias capas del IGN:

    python -m pipeline.proximidad

Escribe `configs/dims/indicadores-geo/proximidad-parajes.csv` (una fila por paraje, con su
distancia y su radio) y `.../proximidad-parajes-resumen.yaml` (el conteo por departamento mas
el metodo y las capas de las que salio, que es lo que RF18.2 pide que quede registrado).
"""

import io
import json
import math
import os
import sys

import yaml

RADIO_TIERRA = 6371008.8
CONFIG = os.path.join("configs", "dims", "indicadores-geo.yaml")
DIMS = os.path.join("configs", "dims")
DEPARTAMENTOS = "sde-departamentos.geojson"
INDICADOR = "proximidad-parajes-red-pavimentada"


class ErrorDeIndicador(Exception):
    pass


def cargar_config(raiz="."):
    ruta = os.path.join(raiz, CONFIG)
    if not os.path.exists(ruta):
        raise ErrorDeIndicador("No esta %s." % CONFIG)
    with io.open(ruta, encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    if INDICADOR not in (doc.get("indicadores") or {}):
        raise ErrorDeIndicador("%s no declara el indicador %r." % (CONFIG, INDICADOR))
    return doc


def _geojson(raiz, relativo):
    ruta = os.path.join(raiz, DIMS, *relativo.split("/"))
    if not os.path.exists(ruta):
        raise ErrorDeIndicador("Falta la capa declarada %r (%s)." % (relativo, ruta))
    with io.open(ruta, encoding="utf-8") as f:
        return json.load(f)


def _lineas(geometria):
    """Las lineas de un LineString o MultiLineString, como lista de listas de puntos."""
    tipo = geometria["type"]
    if tipo == "LineString":
        return [geometria["coordinates"]]
    if tipo == "MultiLineString":
        return geometria["coordinates"]
    raise ErrorDeIndicador("Geometria de linea no soportada: %s" % tipo)


def segmentos_de_la_red(raiz, red):
    """Los segmentos de la red, ya proyectados al plano local, y su latitud de referencia.

    Devuelve (segmentos, lat0, cuantos_por_capa). Cada segmento es
    (lon1, lat1, lon2, lat2, minlon, maxlon, minlat, maxlat), en GRADOS. Una capa que no traiga
    el atributo de calzada CORTA: filtrar por un campo que no existe dejaria pasar toda la red,
    tierra incluida, y el indicador diria otra cosa.
    """
    atributo = red["atributo_calzada"]
    incluidas = set(red["calzada_incluida"])
    crudas, lats = [], []
    por_capa = {}
    for relativo in red["capas"]:
        doc = _geojson(raiz, relativo)
        vistos = set()
        tramos = []
        for f in doc["features"]:
            props = f.get("properties") or {}
            if atributo not in props:
                raise ErrorDeIndicador(
                    "La capa %r no trae el atributo %r por el que se la filtra; sus campos son"
                    " %s." % (relativo, atributo, sorted(props)))
            vistos.add(props[atributo])
            if props[atributo] not in incluidas:
                continue
            for linea in _lineas(f["geometry"]):
                for i in range(len(linea) - 1):
                    tramos.append((linea[i], linea[i + 1]))
        if not vistos & incluidas:
            raise ErrorDeIndicador(
                "La capa %r no tiene ni un rasgo con calzada en %s; trae %s."
                % (relativo, sorted(incluidas), sorted(str(v) for v in vistos)))
        por_capa[relativo] = len(tramos)
        crudas.extend(tramos)
        for a, b in tramos:
            lats.append(a[1])
            lats.append(b[1])
    if not crudas:
        raise ErrorDeIndicador("La red quedo vacia: ninguna capa aporto tramos.")

    lat0 = sum(lats) / len(lats)
    # Los segmentos se guardan en GRADOS con su caja ya calculada: la proyeccion a metros se
    # hace alrededor de CADA paraje (ver distancia_a_la_red), no una vez para toda la
    # provincia, y la caja sirve para descartar en grados sin multiplicar nada.
    segmentos = []
    for a, b in crudas:
        segmentos.append((a[0], a[1], b[0], b[1],
                          a[0] if a[0] < b[0] else b[0], a[0] if a[0] > b[0] else b[0],
                          a[1] if a[1] < b[1] else b[1], a[1] if a[1] > b[1] else b[1]))
    return segmentos, lat0, por_capa


def distancia_a_la_red(lonp, latp, segmentos):
    """La distancia en metros al tramo pavimentado mas cercano.

    El plano se centra en EL PARAJE: x = R*cos(lat_paraje)*(lon - lon_paraje) e
    y = R*(lat - lat_paraje). Importa que la latitud de referencia sea la del paraje y no una
    sola para toda la provincia: entre -25,6 y -30,5 el cos cambia un 2%, y con una referencia
    unica una distancia de 9,7 km salia 80 m mas larga que la distancia al vertice mas cercano
    medida con haversine, que es geometricamente imposible. Con el plano por paraje el error
    contra la esfera queda en el cuarto decimal del kilometro.

    El recorrido es fuerza bruta -10.821 segmentos por paraje- con un descarte EN GRADOS antes
    de multiplicar nada: si la caja del segmento ya esta mas lejos que el mejor hasta ahora, no
    hay nada que calcular. Sin eso son 11 millones de raices cuadradas.
    """
    kp = RADIO_TIERRA * math.cos(math.radians(latp)) * math.pi / 180.0
    m = RADIO_TIERRA * math.pi / 180.0
    mejor = float("inf")
    tol_lon = tol_lat = float("inf")
    for lon1, lat1, lon2, lat2, minlon, maxlon, minlat, maxlat in segmentos:
        if minlon - lonp > tol_lon or lonp - maxlon > tol_lon:
            continue
        if minlat - latp > tol_lat or latp - maxlat > tol_lat:
            continue
        x1 = (lon1 - lonp) * kp
        y1 = (lat1 - latp) * m
        x2 = (lon2 - lonp) * kp
        y2 = (lat2 - latp) * m
        dx, dy = x2 - x1, y2 - y1
        largo2 = dx * dx + dy * dy
        if largo2 == 0.0:
            d = math.hypot(x1, y1)
        else:
            t = -(x1 * dx + y1 * dy) / largo2
            if t < 0.0:
                t = 0.0
            elif t > 1.0:
                t = 1.0
            d = math.hypot(x1 + t * dx, y1 + t * dy)
        if d < mejor:
            mejor = d
            tol_lon = mejor / kp
            tol_lat = mejor / m
    return mejor


def radio_de(distancia_km, radios_km):
    """El primer radio que contiene a esa distancia, o None si esta mas lejos que todos."""
    for r in radios_km:
        if distancia_km <= r:
            return r
    return None


def calcular(raiz=".", avisar=None):
    doc = cargar_config(raiz)
    ind = doc["indicadores"][INDICADOR]
    radios = list(ind["radios_km"])
    if radios != sorted(set(radios)) or any(r <= 0 for r in radios):
        raise ErrorDeIndicador(
            "`radios_km` tiene que venir ordenado, sin repetidos y positivo; vino %s." % radios)

    segmentos, lat0, por_capa = segmentos_de_la_red(raiz, ind["red"])
    if avisar:
        avisar("red pavimentada: %d segmentos (%s), latitud media %.4f"
               % (len(segmentos),
                  ", ".join("%s: %d" % (os.path.basename(c), n) for c, n in por_capa.items()),
                  lat0))

    sujeto = ind["sujeto"]
    parajes = _geojson(raiz, sujeto["capa"])["features"]
    campo_geo = sujeto["geo_id_en"]
    campo_nombre = sujeto["nombre_en"]

    # Los departamentos de la provincia, para controlar lo que trae la fuente. BAHRA tiene
    # parajes con `cod_pcia` 86 y un `cod_depto` de la provincia VECINA (cuatro, todos sobre
    # el limite). No se les puede asignar un departamento de Santiago sin inventarlo, asi que
    # quedan marcados y fuera de los conteos: si entraran al total provincial, la provincia
    # dejaria de ser la suma de sus departamentos.
    propios = {x["properties"]["geo_id"]
               for x in _geojson(raiz, DEPARTAMENTOS)["features"]}

    filas, ajenos = [], []
    for f in parajes:
        props = f["properties"]
        if campo_geo not in props or not props[campo_geo]:
            raise ErrorDeIndicador(
                "El paraje %r no trae %r: sin departamento no se puede agrupar."
                % (props.get(campo_nombre), campo_geo))
        lon, lat = f["geometry"]["coordinates"][:2]
        d = distancia_a_la_red(lon, lat, segmentos)
        fila = {
            "geo_id": str(props[campo_geo]),
            "paraje": props[campo_nombre],
            "lon": lon,
            "lat": lat,
            "distancia_km": round(d / 1000.0, 3),
            "radio_km": radio_de(d / 1000.0, radios),
        }
        (filas if fila["geo_id"] in propios else ajenos).append(fila)
    filas.sort(key=lambda x: (x["geo_id"], x["paraje"] or "", x["lon"]))
    ajenos.sort(key=lambda x: (x["geo_id"], x["paraje"] or "", x["lon"]))
    if avisar:
        avisar("%d parajes medidos" % len(filas))
        if ajenos:
            avisar("%d parajes quedaron afuera: la fuente les pone un departamento de otra "
                   "provincia (%s)"
                   % (len(ajenos), ", ".join("%s -> %s" % (x["paraje"], x["geo_id"])
                                             for x in ajenos)))
    return ind, radios, filas, por_capa, lat0, ajenos


def resumir(filas, radios):
    """Conteo acumulado por departamento y para la provincia.

    Es ACUMULADO a proposito: "a menos de 10 km" incluye a los que estan a menos de 5. Es como
    se lee un radio, y evita que alguien sume las bandas y le de otro total.
    """
    def vacio():
        return {"parajes": 0, "hasta": {r: 0 for r in radios}, "mas_lejos": 0,
                "suma_km": 0.0, "max_km": 0.0}

    por_depto, provincia = {}, vacio()
    for f in filas:
        for destino in (por_depto.setdefault(f["geo_id"], vacio()), provincia):
            destino["parajes"] += 1
            destino["suma_km"] += f["distancia_km"]
            destino["max_km"] = max(destino["max_km"], f["distancia_km"])
            if f["radio_km"] is None:
                destino["mas_lejos"] += 1
            for r in radios:
                if f["distancia_km"] <= r:
                    destino["hasta"][r] += 1
    for destino in list(por_depto.values()) + [provincia]:
        destino["promedio_km"] = round(destino["suma_km"] / destino["parajes"], 2)
        destino["max_km"] = round(destino["max_km"], 2)
        del destino["suma_km"]
    return por_depto, provincia


def escribir(raiz, ind, radios, filas, por_capa, lat0, ajenos=(), avisar=None):
    import datetime

    carpeta = os.path.join(raiz, DIMS, "indicadores-geo")
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta)

    ruta_csv = os.path.join(carpeta, "proximidad-parajes.csv")
    with io.open(ruta_csv, "w", encoding="utf-8", newline="") as f:
        f.write(u"geo_id,paraje,lon,lat,distancia_km,radio_km\n")
        for x in filas:
            f.write(u'%s,"%s",%s,%s,%s,%s\n'
                    % (x["geo_id"], (x["paraje"] or "").replace('"', '""'),
                       x["lon"], x["lat"], x["distancia_km"],
                       "" if x["radio_km"] is None else x["radio_km"]))

    por_depto, provincia = resumir(filas, radios)
    resumen = {
        "generado_por": "python -m pipeline.proximidad",
        "fecha": datetime.date.today().isoformat(),
        "indicador": INDICADOR,
        "requisito": ind.get("requisito"),
        "radios_km": radios,
        # RF18.2: de que capas sale y con que metodo, pegado al resultado y no solo al config.
        "capas_de_origen": {
            "sujeto": ind["sujeto"]["capa"],
            "red": {os.path.basename(c): {"segmentos": n} for c, n in por_capa.items()},
            "calzada_incluida": ind["red"]["calzada_incluida"],
        },
        "metodo": dict(ind["metodo"], latitud_media_de_la_red=round(lat0, 6)),
        "provincia": provincia,
        "departamentos": por_depto,
        # Lo que la fuente trae mal y no se arregla en silencio.
        "fuera_del_conteo": {
            "motivo": "la fuente (BAHRA) les pone cod_pcia 86 y un cod_depto de otra "
                      "provincia; son parajes del limite y no se les inventa departamento",
            "parajes": [{"paraje": x["paraje"], "cod_depto_de_la_fuente": x["geo_id"],
                         "distancia_km": x["distancia_km"]} for x in ajenos],
        },
    }
    ruta_yaml = os.path.join(carpeta, "proximidad-parajes-resumen.yaml")
    with io.open(ruta_yaml, "w", encoding="utf-8", newline="") as f:
        f.write(u"# Generado por `python -m pipeline.proximidad`. No editar a mano.\n")
        f.write(u"# RF18.1 (los radios) y RF18.2 (de que capas sale y con que metodo).\n")
        f.write(yaml.safe_dump(resumen, allow_unicode=True, sort_keys=False,
                               default_flow_style=False))
    if avisar:
        avisar("escrito %s (%d filas)" % (ruta_csv, len(filas)))
        avisar("escrito %s" % ruta_yaml)
    return por_depto, provincia


def leer_resumen(raiz="."):
    """El resultado ya calculado. Es lo que lee el build; si no esta, devuelve vacio."""
    ruta = os.path.join(raiz, DIMS, "indicadores-geo", "proximidad-parajes-resumen.yaml")
    if not os.path.exists(ruta):
        return {}
    with io.open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def leer_parajes(raiz="."):
    """Una fila por paraje con su distancia. Lista de dicts."""
    import csv
    ruta = os.path.join(raiz, DIMS, "indicadores-geo", "proximidad-parajes.csv")
    if not os.path.exists(ruta):
        return []
    with io.open(ruta, encoding="utf-8", newline="") as f:
        return [dict(r, lon=float(r["lon"]), lat=float(r["lat"]),
                     distancia_km=float(r["distancia_km"]),
                     radio_km=int(r["radio_km"]) if r["radio_km"] else None,
                     en_la_provincia=r.get("en_la_provincia", "si") == "si")
                for r in csv.DictReader(f)]


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Indicadores derivados de capas (RF18).")
    ap.add_argument("--raiz", default=".")
    args = ap.parse_args(argv)

    def avisar(t):
        print("[proximidad] %s" % t)

    try:
        ind, radios, filas, por_capa, lat0, ajenos = calcular(args.raiz, avisar)
        por_depto, provincia = escribir(args.raiz, ind, radios, filas, por_capa, lat0,
                                        ajenos, avisar)
    except ErrorDeIndicador as e:
        sys.exit("[proximidad] %s" % e)

    cabeza = " ".join("%8s" % ("<=%dkm" % r) for r in radios)
    print("")
    print("PARAJES POR DISTANCIA A LA RED PAVIMENTADA  (conteo acumulado)")
    print("  %-10s %7s %s %7s %8s %8s"
          % ("", "parajes", cabeza, "+lejos", "prom km", "max km"))
    print("  %-10s %7d %s %7d %8.1f %8.1f"
          % ("PROVINCIA", provincia["parajes"],
             " ".join("%8d" % provincia["hasta"][r] for r in radios),
             provincia["mas_lejos"], provincia["promedio_km"], provincia["max_km"]))
    for geo_id in sorted(por_depto):
        d = por_depto[geo_id]
        print("  %-10s %7d %s %7d %8.1f %8.1f"
              % (geo_id, d["parajes"], " ".join("%8d" % d["hasta"][r] for r in radios),
                 d["mas_lejos"], d["promedio_km"], d["max_km"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
