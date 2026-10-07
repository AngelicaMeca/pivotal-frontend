"""PNG de 8 bits RGBA: leer, quitarle el fondo plano y volver a escribir. Solo biblioteca estandar.

POR QUE EXISTE
Los iconos de producto son los PNG que armo JC (`site/assets/iconos/bn/` y `color/`, los
Anexos I y II de su "Protocolo de formato - Version 1"). Los 202 archivos vienen con un FONDO
PLANO #f7f7f7 OPACO que ocupa todo el lienzo. Sobre la crema del sitio ese fondo se ve como
una estampilla pegada, y sobre un chip elegido -que tiene color- se ve directamente roto. Es
el mismo problema que ya habia tenido el logo de la provincia (site/theme.yaml, logo_provincia).

La solucion NO es editar los archivos de JC: `site/assets/iconos/` se trata como `raw/`, no se
toca. El fondo se saca al COPIARLOS al sitio, que es lo que hace este modulo.

POR QUE NO UNA LIBRERIA
Pillow resolveria esto en cuatro lineas, pero seria una dependencia nueva del pipeline para un
recorte de fondo. CLAUDE.md pide justificar toda dependencia nueva y el codigo simple y
aburrido: un PNG RGBA sin entrelazado se lee y se escribe con `zlib` y `struct`, que ya vienen
con Python. Lo que sigue es exactamente eso y nada mas.

DETERMINISMO
Mismo PNG de entrada -> mismos bytes de salida. Se escribe siempre con filtro 0 (None) en
todas las lineas y `zlib.compress(..., 9)`, sin metadata, sin fecha y sin azar.

QUE NO SOPORTA (y corta el build si aparece)
- profundidad distinta de 8 bits o tipo de color distinto de 6 (RGBA)
- entrelazado Adam7 (hay UNO en el catalogo de JC, `bn/camelidos.png`, que el sitio no usa)
"""
import struct
import zlib


class ErrorDePNG(Exception):
    """El PNG no es de la forma que este modulo sabe manejar. Corta el build."""


FIRMA = b"\x89PNG\r\n\x1a\n"


def _chunks(datos):
    if datos[:8] != FIRMA:
        raise ErrorDePNG("no empieza con la firma PNG")
    i = 8
    while i < len(datos):
        largo = struct.unpack(">I", datos[i:i + 4])[0]
        tipo = datos[i + 4:i + 8]
        yield tipo, datos[i + 8:i + 8 + largo]
        i += 12 + largo


def _chunk(tipo, cuerpo):
    return (struct.pack(">I", len(cuerpo)) + tipo + cuerpo
            + struct.pack(">I", zlib.crc32(tipo + cuerpo) & 0xFFFFFFFF))


def leer_rgba(datos, nombre=""):
    """Devuelve (ancho, alto, bytearray de ancho*alto*4). Aplica el desfiltrado del PNG."""
    ancho = alto = None
    comprimido = b""
    for tipo, cuerpo in _chunks(datos):
        if tipo == b"IHDR":
            ancho, alto, prof, color, comp, filtro, entrelazado = struct.unpack(
                ">IIBBBBB", cuerpo[:13])
            # Tipo 6 = RGBA y tipo 2 = RGB. El RGB entro con los mapas del Observatorio
            # Forrajero, que vienen sin canal alfa: se leen igual y se les pone el alfa en
            # opaco. Lo que sale de esta funcion es SIEMPRE RGBA, que es lo que esperan
            # `sin_fondo` y `escribir_rgba`.
            if prof != 8 or color not in (2, 6):
                raise ErrorDePNG(
                    "%s: solo se soportan PNG de 8 bits RGB o RGBA (este es profundidad %d, "
                    "tipo %d)" % (nombre, prof, color))
            canales = 4 if color == 6 else 3
            if comp != 0 or filtro != 0:
                raise ErrorDePNG("%s: compresion o filtrado no estandar" % nombre)
            if entrelazado:
                raise ErrorDePNG(
                    "%s: el PNG esta entrelazado (Adam7) y este modulo no lo desentrelaza. "
                    "Guardarlo sin entrelazado." % nombre)
        elif tipo == b"IDAT":
            comprimido += cuerpo
    if ancho is None:
        raise ErrorDePNG("%s: sin IHDR" % nombre)

    crudo = zlib.decompress(comprimido)
    # `paso` es el largo de la linea TAL COMO VIENE (3 o 4 bytes por pixel) y `canales` el
    # salto del filtro, que mira al pixel de la izquierda: con RGB son 3 bytes, no 4. Confundir
    # los dos da una imagen con bandas diagonales, que es el sintoma clasico.
    paso = ancho * canales                # bytes por linea, sin el byte de filtro
    pixeles = bytearray(ancho * alto * 4)
    previa = bytearray(paso)
    pos = 0
    for y in range(alto):
        filtro = crudo[pos]
        linea = bytearray(crudo[pos + 1:pos + 1 + paso])
        pos += 1 + paso
        if filtro == 1:                   # Sub
            for i in range(canales, paso):
                linea[i] = (linea[i] + linea[i - canales]) & 0xFF
        elif filtro == 2:                 # Up
            for i in range(paso):
                linea[i] = (linea[i] + previa[i]) & 0xFF
        elif filtro == 3:                 # Average
            for i in range(paso):
                izq = linea[i - canales] if i >= canales else 0
                linea[i] = (linea[i] + ((izq + previa[i]) >> 1)) & 0xFF
        elif filtro == 4:                 # Paeth
            for i in range(paso):
                izq = linea[i - canales] if i >= canales else 0
                arriba = previa[i]
                diag = previa[i - canales] if i >= canales else 0
                p = izq + arriba - diag
                pa, pb, pc = abs(p - izq), abs(p - arriba), abs(p - diag)
                if pa <= pb and pa <= pc:
                    pred = izq
                elif pb <= pc:
                    pred = arriba
                else:
                    pred = diag
                linea[i] = (linea[i] + pred) & 0xFF
        elif filtro != 0:
            raise ErrorDePNG("%s: filtro de linea desconocido (%d)" % (nombre, filtro))
        if canales == 4:
            pixeles[y * paso:(y + 1) * paso] = linea
        else:
            # RGB -> RGBA, con el alfa en opaco.
            destino = y * ancho * 4
            for x in range(ancho):
                o, p = destino + x * 4, x * 3
                pixeles[o] = linea[p]
                pixeles[o + 1] = linea[p + 1]
                pixeles[o + 2] = linea[p + 2]
                pixeles[o + 3] = 255
        previa = linea
    return ancho, alto, pixeles


def escribir_rgba(ancho, alto, pixeles):
    """Serializa a PNG. Filtro 0 en todas las lineas: simple, y el resultado no depende de nada."""
    paso = ancho * 4
    crudo = bytearray()
    for y in range(alto):
        crudo.append(0)
        crudo += pixeles[y * paso:(y + 1) * paso]
    ihdr = struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0)
    return (FIRMA + _chunk(b"IHDR", ihdr)
            + _chunk(b"IDAT", zlib.compress(bytes(crudo), 9))
            + _chunk(b"IEND", b""))


# El fondo de los iconos de JC. No se adivina: es el mismo #f7f7f7 en los 202 archivos.
FONDO = (247, 247, 247)
# Cuanto se puede alejar un pixel del fondo y seguir contando como fondo. 12 alcanza para el
# ruido del PNG y se queda MUY lejos de la tinta (el negro del trazo esta a 247).
TOLERANCIA = 12


def sin_fondo(datos, nombre="", fondo=FONDO, tolerancia=TOLERANCIA):
    """El mismo dibujo con el fondo plano en transparente. Devuelve los bytes del PNG nuevo.

    Se borra SOLO el fondo que se toca desde el borde del lienzo, no todo pixel del color del
    fondo: los dibujos B&W de JC estan rellenos con ese mismo #f7f7f7 por dentro (la panza de
    la vaina de soja, el algodon), y un reemplazo por color dejaria el dibujo agujereado. Se
    verifico: en `bn/soja.png` hay 23.710 pixeles del color del fondo que son relleno interno.

    El anillo de antialias que queda entre el dibujo y el fondo se destiñe: a cada pixel de ese
    borde se le calcula cuanto se aleja del fondo y ese numero pasa a ser su opacidad, y el
    color se "des-mezcla" con el fondo. Sin esto queda un halo claro de un pixel, que sobre el
    cocoa del chip elegido se ve como un contorno sucio.
    """
    ancho, alto, px = leer_rgba(datos, nombre)
    total = ancho * alto

    def es_fondo(i):
        j = i * 4
        return (px[j + 3] == 255
                and abs(px[j] - fondo[0]) <= tolerancia
                and abs(px[j + 1] - fondo[1]) <= tolerancia
                and abs(px[j + 2] - fondo[2]) <= tolerancia)

    # 1) que pixeles son fondo: los del color del fondo conectados con el borde del lienzo
    es_borde = bytearray(total)
    pila = []
    for x in range(ancho):
        pila.append(x)
        pila.append((alto - 1) * ancho + x)
    for y in range(alto):
        pila.append(y * ancho)
        pila.append(y * ancho + ancho - 1)
    while pila:
        i = pila.pop()
        if es_borde[i] or not es_fondo(i):
            continue
        es_borde[i] = 1
        x, y = i % ancho, i // ancho
        if x > 0:
            pila.append(i - 1)
        if x < ancho - 1:
            pila.append(i + 1)
        if y > 0:
            pila.append(i - ancho)
        if y < alto - 1:
            pila.append(i + ancho)

    # 2) el anillo de antialias: un pixel que NO es fondo pero toca fondo
    # Cuanto puede alejarse del fondo cada canal, en cada direccion. Con fondo claro, alejarse
    # hacia el negro da mucho recorrido y hacia el blanco muy poco: por eso son dos divisores.
    abajo = [max(1, c) for c in fondo]
    arriba = [max(1, 255 - c) for c in fondo]
    for i in range(total):
        if es_borde[i]:
            j = i * 4
            px[j] = px[j + 1] = px[j + 2] = px[j + 3] = 0
            continue
        x, y = i % ancho, i // ancho
        toca = ((x > 0 and es_borde[i - 1]) or (x < ancho - 1 and es_borde[i + 1])
                or (y > 0 and es_borde[i - ancho]) or (y < alto - 1 and es_borde[i + ancho]))
        if not toca:
            continue
        j = i * 4
        if px[j + 3] != 255:
            continue
        alfa = 0.0
        for k in range(3):
            c = px[j + k]
            d = (fondo[k] - c) / abajo[k] if c <= fondo[k] else (c - fondo[k]) / arriba[k]
            alfa = max(alfa, d)
        if alfa >= 1.0:
            continue
        if alfa <= 0.0:
            px[j] = px[j + 1] = px[j + 2] = px[j + 3] = 0
            continue
        for k in range(3):
            puro = fondo[k] + (px[j + k] - fondo[k]) / alfa
            px[j + k] = max(0, min(255, int(round(puro))))
        px[j + 3] = max(0, min(255, int(round(alfa * 255))))

    return escribir_rgba(ancho, alto, px)
