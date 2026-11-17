# -*- coding: utf-8 -*-
"""La SERIE del Mapa Nacional de Cultivos del INTA, campania por campania.

Esto NO es el mapa que se dibuja -ese lo arma `pipeline/mapa_cultivos.py`, que recorta un
raster a un PNG-. Aca se cruza la cartografia de CADA campania con los limites departamentales
para sacar la superficie por cultivo y por departamento, que es el insumo del analisis de
evolucion interanual.

Requisitos que implementa (ERS de Mapas, "Modulo de Mapas y Base de Informes de Contexto"):
  RF19    la serie administrada por campania, con su DOI, su URL y su estado de ingesta;
          el registro es `configs/series-mapas-cultivos.yaml`.
  RF19.1  dar de alta una campania posterior es agregar una entrada en ese YAML.
  RF19.2  por campania se registran la cartografia Y el informe que la acompania.
  RF20    se ingesta la serie ENTERA, no solo la ultima: el objeto es la evolucion.
  RF20.1  inventario de que se bajo, cuando y si el md5 de Zenodo cerro.
  RF20.2  aviso cuando hay campanias registradas sin ingestar, diciendo cuales.
  RF20.3  el cruzamiento departamental de cada campania (lo de este modulo).
  RF21    el analisis de evolucion se arma sobre lo ingerido y verificado.
  RF21.2  los huecos de la serie viajan escritos en la salida.

COMO SE CRUZA, Y POR QUE ASI. El raster es nacional (hasta 44.000 x 71.000 pixeles de 30 m) y
en Python puro no se puede mirar pixel por pixel: serian cientos de millones de vueltas. El
truco es no recorrer pixeles sino TRAMOS. Los departamentos se rasterizan a la grilla exacta
del raster con un barrido por filas (`tramos_por_fila`), que para cada fila devuelve unos pocos
intervalos [x0, x1) con el departamento al que pertenecen -una fila cruza 2 a 6 departamentos,
no 14.000 pixeles sueltos-. Despues, por cada fila, se desempaca el renglon del raster UNA vez
y se cuenta cada valor adentro de cada tramo con `bytes.count`, que corre en C. Son unos pocos
millones de llamadas en C en vez de cientos de millones de vueltas en Python.

LA SUPERFICIE DE UN PIXEL NO ES CONSTANTE. El raster esta en grados, no en metros: un pixel de
0,00027 grados mide menos de este a oeste cerca del polo que cerca del ecuador. Entre el norte
y el sur de Santiago la diferencia llega al 5%, que sobre un departamento son miles de
hectareas. Asi que el area se calcula POR FILA con la formula esferica exacta
(`area_de_fila`), nunca con un numero fijo de hectareas por pixel.
"""
from __future__ import annotations

import io
import math
import os
import struct

try:
    import yaml
except ImportError:  # pragma: no cover - el pipeline siempre lo tiene
    yaml = None

from pipeline import mapa_cultivos as mc

# Radio medio de la Tierra (IUGG), en metros. Es el que usa la formula de area de abajo.
RADIO_TIERRA = 6371008.8

# Donde viven el registro de la serie y los limites departamentales, relativo a la raiz del
# pipeline (la carpeta `tableros/`).
REGISTRO = os.path.join("configs", "series-mapas-cultivos.yaml")
DEPARTAMENTOS = os.path.join("configs", "dims", "sde-departamentos.geojson")


class ErrorDeSerie(Exception):
    """Algo de la serie no cierra y la corrida tiene que parar."""


# --------------------------------------------------------------------------- area

def area_de_fila(lat_norte, lat_sur, paso_lon):
    """Hectareas de UN pixel de una fila cuyo borde superior e inferior son esas latitudes.

    Area exacta de una celda lat/lon sobre la esfera:  R^2 * dlon * (sin(N) - sin(S)).
    Se devuelve en hectareas (1 ha = 10.000 m2).
    """
    dlon = math.radians(paso_lon)
    m2 = (RADIO_TIERRA ** 2) * dlon * (math.sin(math.radians(lat_norte))
                                       - math.sin(math.radians(lat_sur)))
    return m2 / 10000.0


# ------------------------------------------------------------------ departamentos

def _anillos(geometria):
    """Todos los anillos de un Polygon o MultiPolygon, como listas de (lon, lat)."""
    tipo = geometria["type"]
    if tipo == "Polygon":
        poligonos = [geometria["coordinates"]]
    elif tipo == "MultiPolygon":
        poligonos = geometria["coordinates"]
    else:
        raise ErrorDeSerie("Geometria %r no esperada en los limites departamentales." % tipo)
    for poligono in poligonos:
        for anillo in poligono:
            yield anillo


def tramos_por_fila(departamentos, lon0, lat0, px, py, col_ini, col_fin, fila_ini, fila_fin):
    """Rasteriza los departamentos a la grilla del raster, por BARRIDO DE FILAS.

    Devuelve {fila: [(x0, x1, geo_id), ...]} con las columnas en coordenadas del raster y el
    intervalo abierto a la derecha. Se usa la regla PAR-IMPAR sobre todos los anillos del
    departamento, que es la que resuelve bien los agujeros sin tener que saber cual anillo es
    exterior y cual es hueco.

    No se recorre fila por fila contra TODOS los lados: cada lado se mete en el balde de la
    primera fila que toca y sale cuando se pasa de su ultima fila (la tabla de lados activos de
    siempre). Asi el trabajo es proporcional al alto de los lados y no a filas x lados.
    """
    tramos = {}
    for depto in departamentos:
        geo_id = depto["properties"]["geo_id"]
        # Lados no horizontales, con su rango de filas. La fila f se muestrea en su CENTRO.
        lados = []
        for anillo in _anillos(depto["geometry"]):
            for (lon_a, lat_a), (lon_b, lat_b) in zip(anillo, anillo[1:]):
                if lat_a == lat_b:
                    continue                     # un lado horizontal no corta ninguna fila
                arriba, abajo = max(lat_a, lat_b), min(lat_a, lat_b)
                # fila cuyo centro cae dentro de [abajo, arriba)
                f_desde = int(math.ceil((lat0 - arriba) / py - 0.5))
                f_hasta = int(math.floor((lat0 - abajo) / py - 0.5))
                f_desde = max(f_desde, fila_ini)
                f_hasta = min(f_hasta, fila_fin - 1)
                if f_hasta < f_desde:
                    continue
                lados.append((f_desde, f_hasta, lon_a, lat_a, lon_b, lat_b))
        if not lados:
            continue
        empiezan = {}
        for lado in lados:
            empiezan.setdefault(lado[0], []).append(lado)
        activos = []
        for fila in range(min(empiezan), fila_fin):
            activos.extend(empiezan.pop(fila, ()))
            if not activos:
                if not empiezan:
                    break
                continue
            activos = [l for l in activos if l[1] >= fila]
            if not activos:
                continue
            lat = lat0 - (fila + 0.5) * py
            cortes = []
            for _, _, lon_a, lat_a, lon_b, lat_b in activos:
                if (lat_a > lat) == (lat_b > lat):
                    continue                     # la fila no pasa entre las dos puntas
                t = (lat - lat_a) / (lat_b - lat_a)
                cortes.append(lon_a + t * (lon_b - lon_a))
            if len(cortes) < 2:
                continue
            cortes.sort()
            for i in range(0, len(cortes) - 1, 2):
                # Centro del pixel otra vez: se pinta el pixel cuyo centro cae adentro.
                x0 = int(math.ceil((cortes[i] - lon0) / px - 0.5))
                x1 = int(math.floor((cortes[i + 1] - lon0) / px - 0.5)) + 1
                x0 = max(x0, col_ini)
                x1 = min(x1, col_fin)
                if x1 > x0:
                    tramos.setdefault(fila, []).append((x0, x1, geo_id))
    return tramos


# ------------------------------------------------------------------- cruzamiento

def superficie_por_departamento(ruta_tif, valores, departamentos, caja=mc.CAJA, avisar=None):
    """RF20.3: hectareas por departamento y por valor de clase para UN raster.

    `valores` es el conjunto de valores que la campania declara (del .qml o del informe). Un
    valor del raster que no este ahi CORTA: un cultivo sin nombre no se publica ni se cuenta.

    Devuelve (superficies, pixeles, geometria) donde `superficies` es
    {geo_id: {valor: hectareas}}, `pixeles` es {geo_id: {valor: cuantos}} y `geometria` describe
    la grilla usada, para poder auditar el resultado.
    """
    with open(ruta_tif, "rb") as f:
        campos = mc.leer_ifd(f)
        ancho_tif = campos[256][1][0]
        alto_tif = campos[257][1][0]
        if campos[258][1][0] != 8 or campos[277][1][0] != 1:
            raise ErrorDeSerie("%s: se esperaba una sola banda de 8 bits."
                               % os.path.basename(ruta_tif))
        if campos[259][1][0] != 32773:
            raise ErrorDeSerie("%s: se esperaba PackBits (32773), vino %d."
                               % (os.path.basename(ruta_tif), campos[259][1][0]))
        if campos[278][1][0] != 1:
            raise ErrorDeSerie("%s: se esperaba una fila por tira (RowsPerStrip = 1)."
                               % os.path.basename(ruta_tif))
        offsets = campos[273][1]
        largos = campos[279][1]
        escala = campos[33550][1]
        anclaje = campos[33922][1]
        px, py = escala[0], escala[1]
        lon0, lat0 = anclaje[3], anclaje[4]

        col_ini = max(0, int((caja[0] - lon0) / px))
        col_fin = min(ancho_tif, int((caja[2] - lon0) / px) + 1)
        fila_ini = max(0, int((lat0 - caja[3]) / py))
        fila_fin = min(alto_tif, int((lat0 - caja[1]) / py) + 1)
        if col_fin <= col_ini or fila_fin <= fila_ini:
            raise ErrorDeSerie("%s: la caja de la provincia no toca el raster."
                               % os.path.basename(ruta_tif))

        tramos = tramos_por_fila(departamentos, lon0, lat0, px, py,
                                 col_ini, col_fin, fila_ini, fila_fin)
        if not tramos:
            raise ErrorDeSerie("%s: los limites departamentales no cayeron sobre el raster."
                               % os.path.basename(ruta_tif))

        lista = sorted(valores)
        pixeles = {}
        superficies = {}
        for fila in sorted(tramos):
            f.seek(offsets[fila])
            cruda = bytes(mc.desempacar(f.read(largos[fila]), ancho_tif))
            ha = area_de_fila(lat0 - fila * py, lat0 - (fila + 1) * py, px)
            for x0, x1, geo_id in tramos[fila]:
                pedazo = cruda[x0:x1]
                vistos = 0
                porDepto = pixeles.setdefault(geo_id, {})
                superficie = superficies.setdefault(geo_id, {})
                for valor in lista:
                    cuantos = pedazo.count(valor)
                    if not cuantos:
                        continue
                    porDepto[valor] = porDepto.get(valor, 0) + cuantos
                    superficie[valor] = superficie.get(valor, 0.0) + cuantos * ha
                    vistos += cuantos
                if vistos != len(pedazo) and len(pedazo):
                    # Hay pixeles con un valor que la campania no declara. Se busca cual para
                    # poder nombrarlo en el error: un cultivo sin nombre no se cuenta.
                    sobrantes = sorted({b for b in pedazo if b not in valores})
                    if sobrantes:
                        raise ErrorDeSerie(
                            "%s: el raster trae el valor %s en el departamento %s, que la "
                            "campania no declara. Hay que mirar la tabla de clases de esa "
                            "campania antes de publicar su superficie."
                            % (os.path.basename(ruta_tif), sobrantes[0], geo_id))

    geometria = {"ancho_raster": ancho_tif, "alto_raster": alto_tif,
                 "paso_lon": px, "paso_lat": py,
                 "ventana": {"col_ini": col_ini, "col_fin": col_fin,
                             "fila_ini": fila_ini, "fila_fin": fila_fin},
                 "filas_leidas": len(tramos)}
    if avisar:
        avisar("%s: %d filas, %d departamentos con dato"
               % (os.path.basename(ruta_tif), len(tramos), len(pixeles)))
    return superficies, pixeles, geometria


# ----------------------------------------------------------------------- registro

def cargar_registro(raiz=".", ruta=REGISTRO):
    if yaml is None:
        raise ErrorDeSerie("Hace falta PyYAML para leer el registro de la serie.")
    completa = os.path.join(raiz, ruta)
    if not os.path.exists(completa):
        raise ErrorDeSerie("No esta el registro de la serie (%s)." % ruta)
    with io.open(completa, encoding="utf-8") as f:
        return yaml.safe_load(f)


def cargar_departamentos(raiz=".", ruta=DEPARTAMENTOS):
    import json
    with io.open(os.path.join(raiz, ruta), encoding="utf-8") as f:
        return json.load(f)["features"]


def inventario(registro):
    """RF20.1 y RF20.2: que campanias estan ingeridas y cuales faltan."""
    ingeridas, faltan = [], []
    for c in registro["campanias"]:
        (ingeridas if c.get("estado_ingesta") == "ingerida" else faltan).append(c["id"])
    return ingeridas, faltan


# ------------------------------------------------------------------- la ingesta

SALIDA = os.path.join("configs", "dims", "mapas-cultivos")
SUPERFICIES = "superficies.csv"
INVENTARIO = "inventario.yaml"


def md5_de(ruta):
    import hashlib
    h = hashlib.md5()
    with open(ruta, "rb") as f:
        for tramo in iter(lambda: f.read(1024 * 1024), b""):
            h.update(tramo)
    return h.hexdigest()


def clases_de_la_mitad(registro, campania, mitad, carpeta_campania):
    """{valor: etiqueta} de una mitad de campania, del .qml del INTA o del informe.

    `clases_de: estilo` lee el .qml que publica el INTA al lado del raster. `clases_de:
    informe` usa la tabla transcripta en el registro, porque esa campania no publico .qml: se
    verifico que, en las campanias que traen las dos cosas, la tabla del informe y el .qml
    dicen exactamente lo mismo.
    """
    declaradas = dict(mitad.get("clases") or {})
    if mitad.get("clases_de") == "estilo":
        if not mitad.get("estilo"):
            raise ErrorDeSerie("%s/%s dice `clases_de: estilo` y no declara el archivo."
                               % (campania["id"], mitad["mitad"]))
        ruta = os.path.join(carpeta_campania, mitad["estilo"])
        if not os.path.exists(ruta):
            raise ErrorDeSerie("Falta el estilo %s de %s/%s."
                               % (mitad["estilo"], campania["id"], mitad["mitad"]))
        del_qml = {v: e for v, _rgb, e in mc.clases_del_qml(ruta)}
        # Lo escrito en el registro manda sobre el .qml solo para AGREGAR lo que el .qml no
        # trae; si los dos declaran el mismo valor con otro nombre, corta.
        for valor, etiqueta in declaradas.items():
            if valor in del_qml and del_qml[valor] != etiqueta:
                raise ErrorDeSerie(
                    "%s/%s: el valor %d se llama %r en el .qml y %r en el registro. Hay que "
                    "mirar cual es el bueno antes de contar superficie."
                    % (campania["id"], mitad["mitad"], valor, del_qml[valor], etiqueta))
        del_qml.update(declaradas)
        return del_qml
    if not declaradas:
        raise ErrorDeSerie("%s/%s dice `clases_de: informe` y no trae la tabla `clases`."
                           % (campania["id"], mitad["mitad"]))
    return declaradas


def canonico(registro, etiqueta):
    """El nombre con el que ese cultivo se llama en TODA la serie.

    El INTA no escribe siempre igual: "No Agricola" en la tabla de invierno y "No agricola" en
    la de verano, "Sorgo" y "Sorgo GR", "Ca\u00f1a de Az\u00facar" y "ca\u00f1a de az\u00facar". Sin unificarlo, el
    analisis de evolucion mostraria dos series para el mismo cultivo. El diccionario es
    declarativo (`cultivos_canonicos` del registro) y una etiqueta que no este ahi CORTA: un
    cultivo nuevo tiene que entrar por decision, no por sorpresa.
    """
    tabla = registro.get("cultivos_canonicos") or {}
    if etiqueta not in tabla:
        raise ErrorDeSerie(
            "La clase %r no esta en `cultivos_canonicos` del registro de la serie. Si es un "
            "cultivo nuevo del INTA, hay que agregarlo ahi con el nombre con el que se publica."
            % etiqueta)
    return tabla[etiqueta]


def ingerir(raiz=".", carpeta_rasters=None, avisar=None):
    """RF20: cruza TODAS las campanias que esten bajadas y escribe el resultado.

    Escribe dos archivos, los dos se commitean (como las capas del IGN): `superficies.csv` con
    el cruce por campania, mitad, departamento y clase, e `inventario.yaml` con que campania se
    pudo ingerir, cuando y si el md5 de Zenodo cerro (RF20.1).

    No corre en la publicacion horaria: necesita 1,7 GB de raster que no estan en el repo. Se
    corre a mano cuando entra una campania nueva.
    """
    import datetime

    registro = cargar_registro(raiz)
    departamentos = cargar_departamentos(raiz)
    carpeta_rasters = carpeta_rasters or os.path.join(raiz, "raw", "mnc")
    salida = os.path.join(raiz, SALIDA)
    if not os.path.isdir(salida):
        os.makedirs(salida)

    filas = []
    inventario_campanias = []
    for campania in registro["campanias"]:
        cid = campania["id"]
        carpeta = os.path.join(carpeta_rasters, str(campania["zenodo"]))
        estado = {"campania": cid, "doi": campania["doi"], "mitades": []}
        completa = True
        for mitad in campania["mitades"]:
            ruta = os.path.join(carpeta, mitad["raster"])
            detalle = {"mitad": mitad["mitad"], "raster": mitad["raster"]}
            if not os.path.exists(ruta):
                detalle["estado"] = "no-bajado"
                estado["mitades"].append(detalle)
                completa = False
                continue
            bytes_reales = os.path.getsize(ruta)
            md5_real = md5_de(ruta)
            detalle["bytes"] = bytes_reales
            detalle["md5_verificado"] = (md5_real == mitad["md5"]
                                         and bytes_reales == mitad["bytes"])
            if not detalle["md5_verificado"]:
                # RF20.1: una campania que no verifica NO entra al analisis (RF21.1).
                detalle["estado"] = "integridad-no-verificada"
                estado["mitades"].append(detalle)
                completa = False
                if avisar:
                    avisar("%s/%s: el md5 no cierra con el que publica Zenodo; se saltea."
                           % (cid, mitad["mitad"]))
                continue
            clases = clases_de_la_mitad(registro, campania, mitad, carpeta)
            valores = set(clases)
            sup, px, geo = superficie_por_departamento(ruta, valores, departamentos,
                                                       avisar=avisar)
            for geo_id in sorted(sup):
                for valor in sorted(sup[geo_id]):
                    etiqueta = clases[valor]
                    filas.append((cid, mitad["mitad"], geo_id, valor, etiqueta,
                                  canonico(registro, etiqueta),
                                  px[geo_id][valor], round(sup[geo_id][valor], 2)))
            detalle["estado"] = "ingerida"
            detalle["pixeles_raster"] = "%dx%d" % (geo["ancho_raster"], geo["alto_raster"])
            detalle["filas_leidas"] = geo["filas_leidas"]
            estado["mitades"].append(detalle)
        estado["estado"] = "ingerida" if completa else "incompleta"
        inventario_campanias.append(estado)

    cabecera = ("campania", "mitad", "geo_id", "valor", "clase_inta", "cultivo",
                "pixeles", "hectareas")
    with io.open(os.path.join(salida, SUPERFICIES), "w", encoding="utf-8", newline="") as f:
        f.write(u",".join(cabecera) + u"\n")
        for fila in sorted(filas):
            f.write(u",".join(
                (u'"%s"' % str(x).replace('"', '""')) if isinstance(x, str) else str(x)
                for x in fila) + u"\n")

    faltan = [c["campania"] for c in inventario_campanias if c["estado"] != "ingerida"]
    doc = {
        "generado_por": "python -m pipeline.cultivos_serie ingerir",
        "fecha": datetime.date.today().isoformat(),
        "campanias": inventario_campanias,
        # RF20.2: el aviso de serie incompleta viaja ESCRITO, no solo por consola, porque es lo
        # que despues tiene que explicitar la pagina (RF21.2).
        "campanias_sin_ingerir": faltan,
        "filas_superficies": len(filas),
    }
    with io.open(os.path.join(salida, INVENTARIO), "w", encoding="utf-8", newline="") as f:
        f.write(u"# Generado por `python -m pipeline.cultivos_serie ingerir`. No editar a mano.\n")
        f.write(u"# RF20.1 (que se bajo y si verifico) y RF20.2 (que campanias faltan).\n")
        f.write(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False, default_flow_style=False))
    if avisar:
        avisar("escritas %d filas en %s" % (len(filas), os.path.join(SALIDA, SUPERFICIES)))
        if faltan:
            avisar("RF20.2 - campanias registradas SIN ingerir: %s" % ", ".join(faltan))
    return filas, doc


def leer_superficies(raiz="."):
    """El cruce ya calculado, como lista de dicts. Es lo que lee el build."""
    import csv
    ruta = os.path.join(raiz, SALIDA, SUPERFICIES)
    if not os.path.exists(ruta):
        return []
    with io.open(ruta, encoding="utf-8", newline="") as f:
        return [dict(r, valor=int(r["valor"]), pixeles=int(r["pixeles"]),
                     hectareas=float(r["hectareas"]))
                for r in csv.DictReader(f)]


def leer_inventario(raiz="."):
    ruta = os.path.join(raiz, SALIDA, INVENTARIO)
    if not os.path.exists(ruta):
        return {"campanias": [], "campanias_sin_ingerir": []}
    with io.open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def evolucion(raiz=".", geo_id=None, mitad=None):
    """RF21: superficie por cultivo y campania, para la provincia o un departamento.

    Devuelve (campanias, series, huecos): `campanias` son las ingeridas en orden; `series` es
    {cultivo: [ha por campania]} con None donde esa campania no esta; `huecos` son las
    campanias registradas que NO entraron (RF21.2), para que la pagina pueda decirlo.
    """
    registro = cargar_registro(raiz)
    inv = leer_inventario(raiz)
    ingeridas = [c["campania"] for c in (inv.get("campanias") or [])
                 if c.get("estado") == "ingerida"]
    orden = [c["id"] for c in registro["campanias"] if c["id"] in ingeridas]
    huecos = [c["id"] for c in registro["campanias"] if c["id"] not in ingeridas]

    acumulado = {}
    for fila in leer_superficies(raiz):
        if geo_id and fila["geo_id"] != geo_id:
            continue
        if mitad and fila["mitad"] != mitad:
            continue
        if fila["campania"] not in orden:
            continue
        clave = fila["cultivo"]
        acumulado.setdefault(clave, {}).setdefault(fila["campania"], 0.0)
        acumulado[clave][fila["campania"]] += fila["hectareas"]
    series = {}
    for cultivo, porCampania in acumulado.items():
        series[cultivo] = [round(porCampania[c], 2) if c in porCampania else None
                           for c in orden]
    return orden, series, huecos


# ------------------------------------------------------------------------- CLI

def main(argv=None):
    import argparse

    ap = argparse.ArgumentParser(
        description="La serie del Mapa Nacional de Cultivos del INTA (RF19 a RF21).")
    ap.add_argument("accion", choices=("ingerir", "estado", "evolucion"))
    ap.add_argument("--raiz", default=".")
    ap.add_argument("--rasters", default=None,
                    help="carpeta con una subcarpeta por registro de Zenodo")
    ap.add_argument("--departamento", default=None)
    args = ap.parse_args(argv)

    def avisar(t):
        print("[mnc] %s" % t)

    if args.accion == "ingerir":
        ingerir(args.raiz, args.rasters, avisar)
        return 0

    registro = cargar_registro(args.raiz)
    inv = leer_inventario(args.raiz)
    if args.accion == "estado":
        print("SERIE DEL MAPA NACIONAL DE CULTIVOS  (%d campanias registradas)"
              % len(registro["campanias"]))
        estado_de = {c["campania"]: c for c in (inv.get("campanias") or [])}
        for c in registro["campanias"]:
            e = estado_de.get(c["id"]) or {}
            mitades = ", ".join("%s:%s" % (m["mitad"], m.get("estado", "?"))
                                for m in (e.get("mitades") or []))
            print("  %-10s %-12s %s" % (c["id"], e.get("estado", "sin-ingerir"), mitades))
        faltan = inv.get("campanias_sin_ingerir") or [c["id"] for c in registro["campanias"]]
        if faltan:
            print("\nRF20.2 - sin ingerir: %s" % ", ".join(faltan))
        return 0

    orden, series, huecos = evolucion(args.raiz, args.departamento)
    print("campanias: %s" % ", ".join(orden))
    if huecos:
        print("huecos de la serie (RF21.2): %s" % ", ".join(huecos))
    for cultivo in sorted(series, key=lambda c: -sum(v or 0 for v in series[c])):
        print("  %-38s %s" % (cultivo, " ".join(
            ("%10.0f" % v) if v is not None else "         -" for v in series[cultivo])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
