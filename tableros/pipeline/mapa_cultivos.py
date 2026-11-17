# -*- coding: utf-8 -*-
"""Recorta el Mapa Nacional de Cultivos del INTA a la provincia y lo publica como PNG.

Pedido de JC (comentario del 15-nov-2026, punto 4): "MAPA DE CULTIVOS: Lo agregamos como item
en el desplegable del menu de la izquierda Y QUE SE VEA (incluido el zoom) TAL COMO
ESPECTACULARMENTE BIEN HICISTE CON LOS DE AGROCLIMA. Si no se puede agregar la referencia a
cada cultivo (deberia estar en alguno de los archivos) solo dejemoslo asi. Por ahora solo
pongamos el ultimo, o sea campania 2024/2025".

Lo que hace y por que, en orden:

1. El GeoTIFF del INTA es el pais entero: 43.994 x 70.641 pixeles de ~30 m, 193 MB. El visor
   del sitio dibuja la provincia, o sea el 7% de esos pixeles. Igual que con los mapas del
   SEPA (pipeline/recorte_sepa.py), se recorta y se remuestrea: la salida son ~2.000 px de
   ancho, que es la medida con la que ya trabajan las galerias de AgroClima.

2. El remuestreo es POR VECINO MAS CERCANO, nunca un promedio. Los valores del raster son
   CODIGOS DE CULTIVO (10 es maiz, 11 soja): promediar un maiz con una soja daria un girasol.
   Se toma un pixel cada `paso` y punto.

3. El recorte es un rectangulo de PIXELES ENTEROS y la caja en grados se recalcula de esos
   pixeles, asi que el PNG queda georreferenciado exacto y el visor lo ubica sin ajustes.

4. La leyenda sale del `.qml` que el INTA publica al lado del raster (el estilo de QGIS): ahi
   esta el nombre y el color oficial de cada clase. Es la "referencia a cada cultivo" que JC
   daba por perdida: SI esta en los archivos, y es la que se publica. NO se inventa ningun
   color ni ningun nombre.

5. El PNG se escribe con PALETA (pngs.escribir_paleta): son 17 colores y en RGBA pesaria
   cuatro veces mas. "Mascara" y el relleno 255 (fuera del area procesada) van TRANSPARENTES,
   asi el visor deja ver el mapa de abajo donde la fuente no clasifico.

Determinista: mismo raster y mismo paso -> PNG identico byte a byte.

Uso (el raster NO vive en el repo, se baja de Zenodo; ver configs/dims/mapas-cultivos.yaml):
    python -m pipeline.mapa_cultivos <carpeta con los .tif y .qml> site/assets/mapas/cultivos
"""

import os
import struct
import sys
import xml.etree.ElementTree as ET

from pipeline import pngs

# La caja de la provincia, la misma con la que se bajan las capas del IGN
# (configs/dims/capas-ign.yaml -> fuente.caja), un poco holgada. Es una caja de ENCUADRE, no un
# recorte fino: el visor dibuja encima los limites departamentales.
CAJA = (-65.3, -30.6, -61.5, -25.5)  # lon_min, lat_min, lon_max, lat_max

# Un pixel cada 7: 43.994 px de ~30 m dan ~2.000 px de ancho para la provincia, que es la
# medida de los recortes del SEPA (1818 y 1919 px). A ~210 m por pixel un lote de 100 ha
# sigue midiendo cinco pixeles.
PASO = 7

# Clases que NO se dibujan. No son cultivos: son el afuera.
#   "Mascara" -> lo que el INTA excluye del procesamiento.
#   255       -> el relleno del raster fuera del area clasificada.
# Van transparentes y no a un color de la paleta, para que el visor deje ver el mapa de abajo.
SIN_DATO = ("Mascara", "Máscara")
RELLENO = 255

# CLASES QUE EL RASTER TRAE Y SU PROPIO .qml NO DECLARA, con de donde sale cada una. No se
# adivina ninguna: cada entrada esta escrita en el informe oficial del INTA que acompania al
# raster ("Informe Mapa Nacional de Cultivos campania 2024/2025", noviembre de 2025, Zenodo
# 17652712), y mientras no este ahi el script CORTA la corrida.
#
# Los dos casos de hoy son COSTURAS del postproceso, y los dos salen de las tablas del informe.
# El informe explica el mecanismo: "En postprocesamiento se aplicaron reglas para mantener
# estables las clases agricolas y no agricolas en los mapas de invierno y verano", o sea que un
# codigo de la otra campania puede quedar en un pixel suelto. Medido sobre la caja de la
# provincia al paso de produccion (5.448.560 pixeles cada uno):
#   - VERANO, valor 20: TRES pixeles. Es "No Agricola" en la Tabla 1 (invierno). Se publica con
#     el nombre y el color que el estilo de verano le da a SU "No agricola" (valor 22,
#     #e6f0c2), que es ademas el mismo color con el que el estilo de invierno pinta al 20: los
#     dos estilos del INTA coinciden, asi que no hay nada que elegir.
#   - INVIERNO, valor 10: UN pixel. Es "Maiz" en la Tabla 2 (verano), con el #0042ff de ese
#     estilo. Entra a la leyenda de invierno como una clase mas.
# Mientras un valor no este en estas tablas, el script CORTA la corrida: un cultivo sin nombre
# ni color no se publica.
DECLARADAS_EN_EL_INFORME = {
    "MNC_ver25": {20: ((230, 240, 194), "No agrícola")},
    "MNC_inv24": {10: ((0, 66, 255), "Maíz")},
}


def leer_ifd(f):
    """Los campos del primer IFD de un TIFF chico, como {tag: (tipo, valores)}."""
    cab = f.read(8)
    if cab[:2] != b"II" or struct.unpack("<H", cab[2:4])[0] != 42:
        raise SystemExit("Se esperaba un TIFF clasico little-endian (el del INTA lo es).")
    (inicio,) = struct.unpack("<I", cab[4:8])
    f.seek(inicio)
    (cuantos,) = struct.unpack("<H", f.read(2))
    entradas = f.read(cuantos * 12)
    tamanios = {1: (1, "B"), 3: (2, "H"), 4: (4, "I"), 12: (8, "d")}
    campos = {}
    for i in range(cuantos):
        tag, tipo, cuenta = struct.unpack("<HHI", entradas[i * 12:i * 12 + 8])
        cruda = entradas[i * 12 + 8:i * 12 + 12]
        if tipo not in tamanios:
            continue
        ancho_tipo, fmt = tamanios[tipo]
        total = ancho_tipo * cuenta
        if total <= 4:
            cuerpo = cruda[:total]
        else:
            (pos,) = struct.unpack("<I", cruda)
            aqui = f.tell()
            f.seek(pos)
            cuerpo = f.read(total)
            f.seek(aqui)
        campos[tag] = (tipo, struct.unpack("<" + fmt * cuenta, cuerpo))
    return campos


def desempacar(datos, ancho):
    """PackBits (compresion 32773, la que usa el raster del INTA). Devuelve `ancho` bytes."""
    salida = bytearray()
    i = 0
    n = len(datos)
    while i < n and len(salida) < ancho:
        control = datos[i]
        i += 1
        if control < 128:                      # los proximos control+1 bytes, tal cual
            salida += datos[i:i + control + 1]
            i += control + 1
        elif control > 128:                    # el proximo byte, repetido 257-control veces
            salida += bytes([datos[i]]) * (257 - control)
            i += 1
        # control == 128 es relleno: no dice nada
    if len(salida) < ancho:
        raise SystemExit("Una fila del raster se desempaco corta (%d de %d bytes)."
                         % (len(salida), ancho))
    return salida


def clases_del_qml(ruta):
    """[(valor, (r,g,b), etiqueta)] del estilo de QGIS, en el orden en que lo escribe el INTA."""
    raiz = ET.parse(ruta).getroot()
    rampa = raiz.find(".//colorrampshader")
    if rampa is None:
        raise SystemExit("El .qml %s no trae un colorrampshader con las clases." % ruta)
    salida = []
    for item in rampa.findall("item"):
        color = item.get("color", "")
        if not color.startswith("#") or len(color) != 7:
            raise SystemExit("Color %r no esperado en %s." % (color, ruta))
        rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
        salida.append((int(float(item.get("value"))), rgb, item.get("label", "")))
    return salida


def recortar(ruta_tif, ruta_qml, paso=PASO, caja=CAJA, extra=()):
    """Devuelve (ancho, alto, indices, paleta, transparentes, caja_real, clases, presentes)."""
    with open(ruta_tif, "rb") as f:
        campos = leer_ifd(f)
        ancho_tif = campos[256][1][0]
        alto_tif = campos[257][1][0]
        if campos[258][1][0] != 8 or campos[277][1][0] != 1:
            raise SystemExit("Se esperaba una sola banda de 8 bits.")
        if campos[259][1][0] != 32773:
            raise SystemExit("Se esperaba compresion PackBits (32773), vino %d."
                             % campos[259][1][0])
        if campos[278][1][0] != 1:
            raise SystemExit("Se esperaba una fila por tira (RowsPerStrip = 1).")
        offsets = campos[273][1]
        largos = campos[279][1]
        escala = campos[33550][1]
        anclaje = campos[33922][1]
        px, py = escala[0], escala[1]
        lon0, lat0 = anclaje[3], anclaje[4]

        # La ventana en pixeles ENTEROS, recortada al raster.
        col_ini = max(0, int((caja[0] - lon0) / px))
        col_fin = min(ancho_tif, int((caja[2] - lon0) / px) + 1)
        fila_ini = max(0, int((lat0 - caja[3]) / py))
        fila_fin = min(alto_tif, int((lat0 - caja[1]) / py) + 1)
        if col_fin <= col_ini or fila_fin <= fila_ini:
            raise SystemExit("La caja pedida no toca el raster.")

        columnas = list(range(col_ini, col_fin, paso))
        filas = list(range(fila_ini, fila_fin, paso))
        clases = clases_del_qml(ruta_qml)
        # Las del informe que el .qml no trae se agregan al final de la leyenda, salvo que ya
        # exista una clase con el mismo nombre: ahi comparten entrada y color, que es el caso
        # del "No agricola" de verano.
        por_etiqueta = {e: v for v, _, e in clases}
        for valor, (rgb, etiqueta) in sorted(extra.items() if extra else ()):
            if etiqueta in por_etiqueta:
                continue
            clases.append((valor, rgb, etiqueta))

        # Indice de paleta por valor del raster. La entrada 0 es el transparente.
        paleta = [(255, 255, 255)]
        indice_de = {}
        for valor, rgb, etiqueta in clases:
            if etiqueta in SIN_DATO or valor == RELLENO:
                indice_de[valor] = 0
                continue
            indice_de[valor] = len(paleta)
            paleta.append(rgb)
        indice_de.setdefault(RELLENO, 0)
        # Un valor del informe cuyo nombre ya tiene entrada en la paleta la REUSA: no se dibuja
        # dos veces el mismo "No agricola" con dos colores.
        for valor, (rgb, etiqueta) in sorted(extra.items() if extra else ()):
            if valor in indice_de:
                continue
            gemelo = [v for v, _, e in clases if e == etiqueta and v in indice_de]
            indice_de[valor] = indice_de[gemelo[0]] if gemelo else len(paleta)
            if not gemelo:
                paleta.append(rgb)

        presentes = {}
        imagen = bytearray()
        for fila in filas:
            f.seek(offsets[fila])
            cruda = desempacar(f.read(largos[fila]), ancho_tif)
            renglon = bytearray(len(columnas))
            for k, col in enumerate(columnas):
                valor = cruda[col]
                if valor not in indice_de:
                    raise SystemExit(
                        "El raster trae el valor %d, que el .qml %s no declara. Un cultivo sin "
                        "nombre ni color no se publica: hay que mirar el estilo nuevo."
                        % (valor, os.path.basename(ruta_qml)))
                renglon[k] = indice_de[valor]
                presentes[valor] = presentes.get(valor, 0) + 1
            imagen += renglon

    # La caja REAL del rectangulo escrito: el borde externo del primer y del ultimo pixel
    # tomado. Es lo que el visor necesita para ubicarlo.
    ultima_col = columnas[-1]
    ultima_fila = filas[-1]
    caja_real = (round(lon0 + col_ini * px, 9),
                 round(lat0 - (ultima_fila + 1) * py, 9),
                 round(lon0 + (ultima_col + 1) * px, 9),
                 round(lat0 - fila_ini * py, 9))
    return (len(columnas), len(filas), imagen, paleta, (0,), caja_real, clases, presentes)


# El ancho de la miniatura de la grilla, el mismo de las galerias de AgroClima.
ANCHO_MINIATURA = 400


def miniatura(ancho, alto, indices, ancho_mini=ANCHO_MINIATURA):
    """La misma imagen de paleta a `ancho_mini` px, por vecino mas cercano.

    Vecino mas cercano otra vez por el mismo motivo que el recorte: son CLASES. Un promedio
    inventaria cultivos en los bordes de cada lote, que es justo donde se mira una miniatura.
    """
    paso = ancho / float(ancho_mini)
    alto_mini = max(1, int(round(alto / paso)))
    chico = bytearray(ancho_mini * alto_mini)
    for y in range(alto_mini):
        fila = min(alto - 1, int(y * paso))
        base = fila * ancho
        destino = y * ancho_mini
        for x in range(ancho_mini):
            chico[destino + x] = indices[base + min(ancho - 1, int(x * paso))]
    return ancho_mini, alto_mini, chico


def main(entrada, salida):
    os.makedirs(salida, exist_ok=True)
    for base in ("MNC_ver25", "MNC_inv24"):
        ruta_tif = os.path.join(entrada, base + ".tif")
        ruta_qml = os.path.join(entrada, base + ".qml")
        for r in (ruta_tif, ruta_qml):
            if not os.path.exists(r):
                raise SystemExit("Falta %s." % r)
        ancho, alto, imagen, paleta, transparentes, caja, clases, presentes = recortar(
            ruta_tif, ruta_qml, extra=DECLARADAS_EN_EL_INFORME.get(base, {}))
        bytes_png = pngs.escribir_paleta(ancho, alto, imagen, paleta, transparentes)
        # Sin sufijo: ESTA es la imagen que publica el sitio. Las galerias del SEPA usan
        # `-sde` para distinguir el recorte del original del pais, que ahi tambien se publica;
        # aca el original es un GeoTIFF de 193 MB que no se publica en ninguna forma, asi que la
        # unica imagen grande es esta y no hay de que distinguirla.
        destino = os.path.join(salida, base.lower() + ".png")
        with open(destino, "wb") as f:
            f.write(bytes_png)
        # La miniatura de la grilla, al lado del recorte y con el sufijo que ya usan las
        # galerias de AgroClima.
        ancho_m, alto_m, chica = miniatura(ancho, alto, imagen)
        bytes_mini = pngs.escribir_paleta(ancho_m, alto_m, chica, paleta, transparentes)
        destino_mini = os.path.join(salida, base.lower() + "-mini.png")
        with open(destino_mini, "wb") as f:
            f.write(bytes_mini)
        total = sum(presentes.values())
        print("[cultivos] %s: %dx%d px, %d bytes" % (os.path.basename(destino), ancho, alto,
                                                     len(bytes_png)))
        print("           %s: %dx%d px, %d bytes" % (os.path.basename(destino_mini), ancho_m,
                                                     alto_m, len(bytes_mini)))
        print("           caja: lon %.9f a %.9f, lat %.9f a %.9f"
              % (caja[0], caja[2], caja[1], caja[3]))
        print("           clases con pixeles en la provincia (de %d muestras):" % total)
        for valor, rgb, etiqueta in clases:
            cuantos = presentes.get(valor, 0)
            if not cuantos:
                continue
            print("             %-24s valor %-4d #%02x%02x%02x  %7.3f%%"
                  % (etiqueta, valor, rgb[0], rgb[1], rgb[2], 100.0 * cuantos / total))
        faltan = [e for v, _, e in clases if not presentes.get(v)]
        if faltan:
            print("           sin un solo pixel en la provincia: %s" % ", ".join(faltan))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
