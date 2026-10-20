"""Los KML del SEPA que ubican en el mapa las imagenes de las galerias de AgroClima.

    python -m pipeline.sepa_kml

Baja los archivos que declara configs/dims/sepa-kml.yaml a configs/dims/sepa-kml/ y muestra la
caja de cada uno. Se corre a mano cuando el SEPA cambia algo (como pipeline/capas_ign.py): el
build lee los archivos commiteados y nunca le pide nada al SEPA. Sin dependencias nuevas.

`caja(archivo)` es lo que usa el build: norte, sur, este, oeste y rotacion del GroundOverlay.
"""
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET

import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(RAIZ, "configs", "dims", "sepa-kml.yaml")
CARPETA = os.path.join(RAIZ, "configs", "dims", "sepa-kml")
KML = "{http://www.opengis.net/kml/2.2}"


def caja(ruta):
    """{norte, sur, este, oeste, rotacion} del GroundOverlay del KML. Corta si no tiene uno."""
    raiz = ET.parse(ruta).getroot()
    caja_kml = raiz.find(".//%sGroundOverlay/%sLatLonBox" % (KML, KML))
    if caja_kml is None:
        raise ValueError("%s no tiene un GroundOverlay con LatLonBox" % ruta)

    def valor(nombre, defecto=None):
        nodo = caja_kml.find(KML + nombre)
        if nodo is None:
            if defecto is None:
                raise ValueError("%s: al LatLonBox le falta <%s>" % (ruta, nombre))
            return defecto
        return float(nodo.text)

    return {"norte": valor("north"), "sur": valor("south"), "este": valor("east"),
            "oeste": valor("west"), "rotacion": valor("rotation", 0.0)}


def main():
    with open(CONFIG, encoding="utf-8") as f:
        config = yaml.safe_load(f)
    os.makedirs(CARPETA, exist_ok=True)
    for nombre, decl in sorted(config["kml"].items()):
        pedido = urllib.request.Request(decl["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(pedido, timeout=60) as respuesta:
            datos = respuesta.read()
        destino = os.path.join(CARPETA, nombre + ".kml")
        with open(destino, "wb") as f:
            f.write(datos)
        print("[sepa_kml] %s %d bytes %s" % (nombre, len(datos), caja(destino)))


if __name__ == "__main__":
    sys.exit(main())
