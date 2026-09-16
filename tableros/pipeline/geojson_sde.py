"""Arma configs/dims/sde-departamentos.geojson desde la descarga cruda del IGN.

Determinista: mismo archivo de entrada -> mismo archivo de salida byte a byte.
No agrega dependencias: solo json de la stdlib.

Que hace:
  - Se queda con los 27 departamentos de Santiago (in1 empieza con 86).
  - Renombra las propiedades del IGN a las nuestras: in1 -> geo_id, nam -> nombre.
    No guarda nada mas: el resto de los atributos (fna, gna, gid, fdc, sag) no se usan
    y solo agrandan el archivo.
  - Redondea las coordenadas a 5 decimales (~1 metro). Los vertices compartidos entre
    departamentos limitrofes se redondean igual, asi que las fronteras siguen cerrando.
  - Saca puntos consecutivos repetidos que quedan despues de redondear.
  - Ordena los features por geo_id.
"""
import json
import os
import sys

DECIMALES = 5


def limpiar_anillo(anillo):
    salida = []
    for x, y in anillo:
        p = [round(x, DECIMALES), round(y, DECIMALES)]
        if not salida or salida[-1] != p:
            salida.append(p)
    # un anillo tiene que cerrar y tener al menos 4 puntos (3 distintos + el de cierre)
    if len(salida) >= 2 and salida[0] != salida[-1]:
        salida.append(salida[0])
    return salida if len(salida) >= 4 else None


def limpiar_geometria(geom):
    if geom["type"] == "Polygon":
        anillos = [limpiar_anillo(a) for a in geom["coordinates"]]
        anillos = [a for a in anillos if a]
        return {"type": "Polygon", "coordinates": anillos} if anillos else None
    if geom["type"] == "MultiPolygon":
        poligonos = []
        for poly in geom["coordinates"]:
            anillos = [limpiar_anillo(a) for a in poly]
            anillos = [a for a in anillos if a]
            if anillos:
                poligonos.append(anillos)
        return {"type": "MultiPolygon", "coordinates": poligonos} if poligonos else None
    sys.exit("[geojson] geometria inesperada: %s" % geom["type"])


def main(entrada, salida):
    with open(entrada, encoding="utf-8") as f:
        crudo = json.load(f)

    features = []
    for f_ in crudo["features"]:
        p = f_["properties"]
        codigo = str(p["in1"])
        if not codigo.startswith("86"):
            continue
        geom = limpiar_geometria(f_["geometry"])
        if geom is None:
            sys.exit("[geojson] el departamento %s quedo sin geometria al limpiar" % codigo)
        features.append({
            "type": "Feature",
            "properties": {"geo_id": codigo, "nombre": p["nam"]},
            "geometry": geom,
        })

    features.sort(key=lambda x: x["properties"]["geo_id"])
    if len(features) != 27:
        sys.exit("[geojson] se esperaban 27 departamentos y salieron %d" % len(features))

    doc = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    with open(salida, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
        f.write("\n")

    puntos = sum(
        len(a)
        for x in features
        for poly in ([x["geometry"]["coordinates"]] if x["geometry"]["type"] == "Polygon"
                     else x["geometry"]["coordinates"])
        for a in poly
    )
    print("[geojson] %d departamentos, %d puntos, %d bytes"
          % (len(features), puntos, os.path.getsize(salida)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
