"""Arma configs/dims/pais-provincias.geojson desde la descarga cruda del IGN.

Es el MAPA BASE de "Mostrar todo el país", el boton que los mapas de Suelos y de Cuencas
copian del visor de AgroClima (pedido de la usuaria del 25-nov-2026: "no hay forma de que haya
un botoncito que diga 'mostrar todo el pais' asi como en los mapas de agroclima?"). Alla el
boton es gratis -la imagen del SEPA ya es nacional y el visor deja de recortarla- y aca hace
falta cartografia que el sitio no tenia: fuera de la provincia no habia nada dibujado.

Determinista: mismo archivo de entrada -> mismo archivo de salida byte a byte. Sin
dependencias nuevas: json de la stdlib y la simplificacion que ya usan las capas.

Que hace:
  - Se queda con la Argentina CONTINENTAL. La capa `ign:provincia` trae Tierra del Fuego con
    el sector antartico y las islas del Atlantico Sur: partes que bajan hasta el polo (lat -90)
    y otras que llegan hasta 36 grados de longitud oeste (Georgias y Sandwich del Sur). Son
    3,27 de los 4,1 millones de vertices del archivo y, sobre todo, estiran la caja del dibujo:
    con ellas adentro el encuadre mide 47 grados de ancho por 68 de alto y el pais entra como
    una franja de 1 px. Se descarta toda PARTE que caiga fuera de CAJA_CONTINENTAL; las 24
    provincias siguen estando, Tierra del Fuego con su isla y las Malvinas.
  - Simplifica con la misma rutina que las capas (Douglas-Peucker). TOLERANCIA es una decision
    medida, ver abajo.
  - Renombra las propiedades del IGN a las nuestras: in1 -> geo_id, nam -> nombre, y no guarda
    nada mas.
  - Redondea a 5 decimales (~1 m) y ordena por geo_id.

Uso:
  .venv/Scripts/python pipeline/geojson_pais.py <provincias-crudo.json> \
      configs/dims/pais-provincias.geojson
"""
import json
import os
import sys

from pipeline.capas_inta import partes_del_rasgo
from pipeline.capas_ign import DECIMALES

# La caja de la Argentina continental (oeste, sur, este, norte). Lo que cae afuera no se
# DIBUJA: el sector antartico y las islas mas alejadas del Atlantico Sur. No es una afirmacion
# sobre nada -el mapa base de un tablero provincial no decide limites- es el encuadre: la caja
# del mapa tiene que mostrar el pais donde estan las provincias, y con el sector antartico
# adentro el dibujo mide 1 px de ancho. La isla de Tierra del Fuego (hasta -55,06) y las
# Malvinas (lon -61,5 a -57,7) entran; las Georgias y las Sandwich del Sur, que estan a 36
# grados oeste, no.
CAJA_CONTINENTAL = (-74.0, -56.0, -53.0, -21.0)

# Grados. 555 m, y esto esta MEDIDO: el pais entra en una caja de 640 px de alto, o sea unos
# 5,8 km por pixel, asi que 555 m es la decima parte de un pixel en el encuadre del boton. El
# archivo pesa 0,74 MB con 222 m, 0,34 con 555 m, 0,18 con 1,1 km y 0,09 con 2,2 km. Se eligio
# 555 m porque es CONTEXTO: la provincia que se esta mirando la dibuja su propio archivo de
# departamentos, con todo el detalle, y encima de este.
TOLERANCIA = 0.005


def main(entrada, salida):
    with open(entrada, encoding="utf-8") as f:
        crudo = json.load(f)

    features, fuera = [], 0
    for rasgo in crudo["features"]:
        geometria = rasgo.get("geometry")
        if not geometria:
            continue
        propiedades = rasgo["properties"]
        partes, _, _ = partes_del_rasgo(geometria, TOLERANCIA)
        oeste, sur, este, norte = CAJA_CONTINENTAL
        quedan = []
        for parte in partes:
            xs = [p[0] for p in parte[0]]
            ys = [p[1] for p in parte[0]]
            if min(xs) < oeste or max(xs) > este or min(ys) < sur or max(ys) > norte:
                fuera += 1
                continue
            quedan.append([[[round(p[0], DECIMALES), round(p[1], DECIMALES)] for p in anillo]
                           for anillo in parte])
        if not quedan:
            sys.exit("[pais] %s quedo sin ninguna parte dentro de %s"
                     % (propiedades.get("nam"), CAJA_CONTINENTAL))
        features.append({
            "type": "Feature",
            "properties": {"geo_id": str(propiedades["in1"]), "nombre": propiedades["nam"]},
            "geometry": {"type": "MultiPolygon", "coordinates": quedan},
        })

    features.sort(key=lambda x: x["properties"]["geo_id"])
    if len(features) != 24:
        sys.exit("[pais] se esperaban 24 provincias y salieron %d" % len(features))

    doc = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    with open(salida, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    puntos = sum(len(a) for x in features
                 for parte in x["geometry"]["coordinates"] for a in parte)
    print("[pais] %d provincias, %d partes (%d descartadas fuera de la caja continental), "
          "%d puntos, %d bytes"
          % (len(features),
             sum(len(x["geometry"]["coordinates"]) for x in features), fuera,
             puntos, os.path.getsize(salida)))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("\n".join(__doc__.strip().splitlines()[-3:]))
    main(sys.argv[1], sys.argv[2])
