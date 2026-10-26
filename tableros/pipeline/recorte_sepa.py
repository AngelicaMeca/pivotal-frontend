"""Los RECORTES de la provincia de las galerias del SEPA.

    python -m pipeline.recorte_sepa            muestra que haria
    python -m pipeline.recorte_sepa --escribir escribe los archivos

Cada imagen del SEPA es el pais entero: 1.818 x 2.237 px y entre 0,6 y 1,6 MB. El visor la
dibuja RECORTADA A LA PROVINCIA, asi que de todo ese peso usa el 6%. Bajar el pais entero para
mirar Santiago del Estero era lo que hacia que "los mapas demoran mucho en cargar" (la usuaria,
27-oct-2026): con una conexion normal, ocho segundos con el lienzo en blanco.

Esta herramienta deja, al lado de cada original, un `<nombre>-sde.<ext>` con la caja de la
provincia y nada mas. Pesa entre 5 y 11 veces menos y es lo que baja el visor; el original
sigue ahi y se baja solo cuando hace falta de verdad: "Imagen original" y "Mostrar todo el
pais".

QUE NO HACE, a proposito:
  - No reescala ni reproyecta. El recorte es un rectangulo de pixeles enteros de la imagen
    original, asi que la caja en grados sale exacta de una regla de tres y la puntería del
    visor (que se ajusto hasta 0,56 px contra los limites que trae dibujada la imagen) no se
    toca.
  - No cambia el formato con perdida. El GIF ya es de paleta: sale PNG, sin perder un pixel.
    El JPEG sale JPEG de calidad 92 y SIN submuestreo de color, que es lo que conserva el
    grano con el que fue medido todo lo demas (los bordes que les saca `sinLineas`).

SE CORRE A MANO, como pipeline/sepa_kml.py, y necesita Pillow, que NO es dependencia del
pipeline: el build no abre una imagen nunca, solo lee cabeceras (site_build._dimensiones_imagen)
y copia archivos. Es el mismo criterio con el que se hicieron las miniaturas, que se generaron
una vez y se commitean (configs/dims/mapas-clima.yaml).

Cuando llega un mapa nuevo: copiar el original y su miniatura, correr esto, y commitear los
tres archivos. El build CORTA si a un mapa le falta su recorte, igual que si le falta la
miniatura: un mapa no se publica a medias.
"""
import os
import re
import sys

from pipeline import site_build as sb
from pipeline import sepa_kml

# Grados de mas alrededor de la provincia. El visor recorta el dibujo a la silueta de la
# provincia (`g.clip(provincia)`), asi que afuera no se ve nada: este margen es nada mas que
# aire para el redondeo y para los 8 px que agrandar() se toma de mas.
MARGEN = 0.25


def caja_del_spec(spec):
    """La misma caja que arma el build: la del KML, pisada por `caja_ajustada` si el spec la
    trae. Si no coinciden, el recorte quedaria corrido."""
    georef = spec["georreferencia"]
    caja = sepa_kml.caja(os.path.join(sb.RAIZ, "configs", "dims", "sepa-kml",
                                      georef["kml"] + ".kml"))
    if georef.get("rotacion") == "ignorar":
        caja["rotacion"] = 0.0
    ajustada = georef.get("caja_ajustada")
    if ajustada:
        caja.update({k: float(v) for k, v in ajustada.items()})
    return caja


def rectangulo(caja, ancho, alto):
    """(x0, y0, x1, y1) en pixeles enteros de la caja de la provincia dentro de la imagen."""
    (lon0, lon1), (lat0, lat1) = sb._extremos_geojson()

    def columna(lon):
        return (lon - caja["oeste"]) / (caja["este"] - caja["oeste"]) * ancho

    def fila(lat):
        return (lat - caja["norte"]) / (caja["sur"] - caja["norte"]) * alto

    x0 = max(0, int(columna(lon0 - MARGEN)))
    x1 = min(ancho, int(columna(lon1 + MARGEN)) + 1)
    y0 = max(0, int(fila(lat1 + MARGEN)))
    y1 = min(alto, int(fila(lat0 - MARGEN)) + 1)
    return x0, y0, x1, y1


def originales(spec):
    """Los archivos ORIGINALES de la galeria (ni miniaturas ni recortes), en orden."""
    carpeta = os.path.join(sb.RAIZ, spec["assets"]["carpeta"])
    patron = re.compile(spec["assets"]["patron"])
    nombres = []
    for nombre in sorted(os.listdir(carpeta)):
        m = patron.match(nombre)
        if m and not m.groupdict().get("mini") and not m.groupdict().get("sde"):
            nombres.append(nombre)
    return carpeta, nombres


def recortar(spec, escribir):
    from PIL import Image

    carpeta, nombres = originales(spec)
    if not nombres:
        print("  %s: no hay originales" % spec["slug_vista"])
        return
    caja = caja_del_spec(spec)
    if caja["rotacion"]:
        raise SystemExit("%s: el KML viene rotado %g grados. El recorte es un rectangulo de la "
                         "imagen, asi que solo vale con la rotacion ignorada."
                         % (spec["slug_vista"], caja["rotacion"]))
    medidas = {sb._dimensiones_imagen(os.path.join(carpeta, n)) for n in nombres}
    if len(medidas) != 1:
        raise SystemExit("%s: las imagenes de la galeria no miden todas lo mismo (%s). Una sola "
                         "caja no puede ubicarlas a todas." % (spec["slug_vista"], sorted(medidas)))
    ancho, alto = medidas.pop()
    x0, y0, x1, y1 = rectangulo(caja, ancho, alto)
    pesaban = recortados = 0
    for nombre in nombres:
        base, ext = nombre.rsplit(".", 1)
        salida = base + "-sde." + ("png" if ext.lower() == "gif" else "jpg")
        origen = os.path.join(carpeta, nombre)
        destino = os.path.join(carpeta, salida)
        pesaban += os.path.getsize(origen)
        if escribir:
            im = Image.open(origen)
            rec = im.crop((x0, y0, x1, y1))
            if ext.lower() == "gif":
                # Ya es de paleta: PNG se la lleva tal cual, sin perder un pixel.
                rec.save(destino, format="PNG", optimize=True)
            else:
                rec.convert("RGB").save(destino, format="JPEG", quality=92, subsampling=0)
        if os.path.exists(destino):
            recortados += os.path.getsize(destino)
    print("  %-34s %2d mapas de %dx%d -> recorte %dx%d en (%d, %d)"
          % (spec["slug_vista"], len(nombres), ancho, alto, x1 - x0, y1 - y0, x0, y0))
    if recortados:
        print("      %6.1f MB  ->  %5.1f MB   (%.1f veces menos)"
              % (pesaban / 1e6, recortados / 1e6, float(pesaban) / recortados))
    print("      en el spec:  recorte: {x: %d, y: %d}" % (x0, y0))


def main():
    escribir = "--escribir" in sys.argv
    specs = sb.cargar_specs()
    hay = [s for s in specs.values()
           if isinstance(s, dict) and (s.get("georreferencia") or {}).get("kml")]
    if not hay:
        raise SystemExit("Ningun spec declara `georreferencia`.")
    print("Recortes de la provincia%s:" % ("" if escribir else " (ensayo, nada se escribe)"))
    for spec in sorted(hay, key=lambda s: s["slug_vista"]):
        recortar(spec, escribir)
    if not escribir:
        print("\nCorrelo con --escribir para generarlos.")


if __name__ == "__main__":
    main()
