"""Arma configs/dims/capas-energia/ desde las descargas crudas de la Secretaria de Energia.

Es el MAPA DE TENDIDO ELECTRICO que pidio JC el 15-nov-2026 (punto 3.a de su comentario: "Van
los mapas de Redes viales (primaria, secundaria y terciaria) y el de tendido electrico... La
fuente es IGN, salvo el de tendido electrico que es Secretaria de Energia"). La fuente que JC
subio en el Excel es el visor https://sig.energia.gob.ar/v/ y la ficha de IDE Energia
cfe43937-4d63-454c-8103-e8b14459786a ("Capa para bajar del tendido"), que para descargar
remite al portal de datos abiertos: ahi esta la capa de lineas, no en el visor.
Procedencia, comandos y huellas en configs/dims/capas-energia.yaml.

Mismo criterio que pipeline/capas_ign.py, del que importa la geometria:
  - Determinista: mismas descargas -> mismos archivos byte a byte.
  - Sin dependencias: solo la stdlib.
  - Coordenadas a 5 decimales (~1 metro) y sin puntos consecutivos repetidos.

Dos diferencias con las capas del IGN, las dos por como viene el dato:

  1. **El limite provincial se DISUELVE de los departamentos** en vez de bajarse del IGN.
     configs/dims/sde-departamentos.geojson es una cobertura topologicamente limpia (cada
     arista interior aparece exactamente dos veces, una por cada departamento que la comparte;
     las del borde, una sola vez), asi que quedandose con las aristas de una sola vez sale el
     contorno de la provincia. Se verifica al correr: todas las aristas tienen que aparecer una
     o dos veces y todo vertice del borde tiene que tener grado par, o sea cerrar en anillos.
     Se hace asi a proposito y no por comodidad: recortar contra el MISMO contorno que dibujan
     los mapas del sitio garantiza que ni un tramo quede colgando afuera del mapa. Con el
     poligono del IGN, que tiene otra generalizacion, los bordes no coinciden.

  2. **Las lineas se agrupan por nivel de tension, como la red terciaria del IGN, y se UNEN en
     polilineas.** El CSV trae 129.163 tramos de DOS puntos cada uno, sin nombre ni
     identificador: un feature por tramo serian megabytes de propiedades repetidas. Sale un
     feature por nivel con un MultiLineString, que es lo que el navegador necesita para
     pintarlos de un color por nivel. Y como los tramos vienen cortados uno a uno pero
     comparten las puntas, se encadenan en polilineas largas: es EXACTAMENTE la misma
     geometria (el mismo conjunto de segmentos, ni uno mas ni uno menos; se verifica al
     correr), con cada punta compartida escrita una vez y no dos. Baja de 5,9 MB a 3,6 MB.

**El numero de tension se publica tal cual y SIN unidad.** Ni el dataset ni su ficha de
metadata dicen en que unidad esta el campo `tension` (ver `advertencias_para_jc` del config).
No se deduce de la magnitud, que es la regla de las unidades del pipeline: va con su nota y
queda preguntado a JC (backlog 115).

Uso:
  python -m pipeline.capas_energia <carpeta con las descargas crudas> \
      configs/dims/capas-energia configs/dims/sde-departamentos.geojson
"""
import collections
import csv
import json
import os
import sys

from pipeline.capas_ign import DECIMALES, Limite, escribir, recortar_linea

# El CSV trae una fila por tramo y la geometria en una celda: hay que levantarle el tope.
csv.field_size_limit(1 << 30)

ARCHIVO_CRUDO = "tendido-media-tension.csv"
ARCHIVO_SALIDA = "tendido-media-tension.geojson"


def anillos_del_contorno(ruta_departamentos):
    """El contorno de la provincia, disuelto de los departamentos (ver el docstring)."""
    with open(ruta_departamentos, encoding="utf-8") as f:
        doc = json.load(f)
    veces = collections.Counter()
    for feature in doc["features"]:
        geometria = feature["geometry"]
        poligonos = ([geometria["coordinates"]] if geometria["type"] == "Polygon"
                     else geometria["coordinates"])
        for poligono in poligonos:
            for anillo in poligono:
                for i in range(len(anillo) - 1):
                    a, b = tuple(anillo[i]), tuple(anillo[i + 1])
                    if a != b:
                        veces[(a, b) if a <= b else (b, a)] += 1

    raras = sorted(c for c in set(veces.values()) if c not in (1, 2))
    if raras:
        sys.exit("[capas-energia] %s no es una cobertura limpia: hay aristas que aparecen %s "
                 "veces (se esperaba 1 en el borde y 2 en los limites interiores)."
                 % (ruta_departamentos, raras))

    bordes = [e for e, c in veces.items() if c == 1]
    vecinos = collections.defaultdict(list)
    for a, b in bordes:
        vecinos[a].append(b)
        vecinos[b].append(a)
    impares = sorted(p for p, vs in vecinos.items() if len(vs) % 2)
    if impares:
        sys.exit("[capas-energia] el contorno no cierra: %d vertices con grado impar (el "
                 "primero, %s). El recorte no seria confiable." % (len(impares), impares[0]))

    # Encadenar las aristas del borde en anillos. Con todos los grados pares cada vertice tiene
    # continuacion hasta volver al punto de partida.
    pendientes = {}
    for a, b in bordes:
        pendientes.setdefault(a, set()).add(b)
        pendientes.setdefault(b, set()).add(a)
    anillos = []
    for arranque in sorted(pendientes):
        while pendientes.get(arranque):
            anillo = [arranque]
            actual = arranque
            while True:
                siguientes = pendientes.get(actual)
                if not siguientes:
                    break
                proximo = sorted(siguientes)[0]
                pendientes[actual].discard(proximo)
                pendientes[proximo].discard(actual)
                if not pendientes[actual]:
                    del pendientes[actual]
                if proximo in pendientes and not pendientes[proximo]:
                    del pendientes[proximo]
                anillo.append(proximo)
                actual = proximo
                if proximo == arranque:
                    break
            if len(anillo) >= 4 and anillo[0] == anillo[-1]:
                anillos.append([list(p) for p in anillo])
            elif len(anillo) > 1:
                sys.exit("[capas-energia] cadena de borde abierta de %d puntos desde %s"
                         % (len(anillo), arranque))
    if not anillos:
        sys.exit("[capas-energia] no salio ningun anillo del contorno provincial")
    return anillos


def limite_provincial(ruta_departamentos):
    anillos = anillos_del_contorno(ruta_departamentos)
    print("[capas-energia] contorno provincial: %d anillo(s), %d puntos"
          % (len(anillos), sum(len(a) for a in anillos)))
    return Limite({"type": "MultiPolygon", "coordinates": [[a] for a in anillos]})


def tramos_por_tension(ruta_csv, limite):
    """{tension: [tramos recortados]} leyendo el CSV de a una fila."""
    por_tension = collections.defaultdict(list)
    leidas = adentro = 0
    with open(ruta_csv, encoding="utf-8-sig", newline="") as f:
        lector = csv.DictReader(f)
        for columna in ("tension", "geojson"):
            if columna not in (lector.fieldnames or []):
                sys.exit("[capas-energia] el CSV no trae la columna %r (trae %s)"
                         % (columna, lector.fieldnames))
        for fila in lector:
            leidas += 1
            geometria = json.loads(fila["geojson"])
            if geometria["type"] == "LineString":
                lineas = [geometria["coordinates"]]
            elif geometria["type"] == "MultiLineString":
                lineas = geometria["coordinates"]
            else:
                sys.exit("[capas-energia] geometria inesperada en la fila %d: %s"
                         % (leidas, geometria["type"]))
            recortados = []
            for linea in lineas:
                recortados.extend(recortar_linea(limite, linea))
            if recortados:
                adentro += 1
                por_tension[fila["tension"].strip()].extend(recortados)
    print("[capas-energia] %s: %d filas leidas, %d con algun tramo en la provincia"
          % (os.path.basename(ruta_csv), leidas, adentro))
    if not por_tension:
        sys.exit("[capas-energia] ningun tramo cayo adentro de la provincia")
    return por_tension


def unir_tramos(tramos):
    """Encadena tramos que comparten punta en polilineas, sin cambiar la geometria.

    Los tramos del CSV son segmentos de dos puntos: el mismo poste aparece como punta de dos
    tramos y se escribe dos veces. Aca se recorren los segmentos como aristas de un grafo y se
    van consumiendo en caminos lo mas largos posible, arrancando por los vertices que NO son de
    paso (grado distinto de dos: puntas y bifurcaciones) para no partir un camino al medio.
    El resultado es el mismo conjunto de segmentos repartido en menos lineas; el llamador lo
    controla comparandolo contra el original.
    """
    aristas = set()
    for tramo in tramos:
        for i in range(len(tramo) - 1):
            a, b = tuple(tramo[i]), tuple(tramo[i + 1])
            if a != b:
                aristas.add((a, b) if a <= b else (b, a))
    vecinos = collections.defaultdict(set)
    for a, b in aristas:
        vecinos[a].add(b)
        vecinos[b].add(a)

    # Primero los vertices que no son de paso (una punta o una bifurcacion); despues el resto,
    # que son los anillos cerrados. Ordenados para que el resultado sea el mismo siempre.
    arranques = ([p for p in sorted(vecinos) if len(vecinos[p]) != 2]
                 + [p for p in sorted(vecinos) if len(vecinos[p]) == 2])
    lineas = []
    for arranque in arranques:
        while vecinos.get(arranque):
            linea = [arranque]
            actual = arranque
            while vecinos.get(actual):
                proximo = min(vecinos[actual])
                vecinos[actual].discard(proximo)
                vecinos[proximo].discard(actual)
                for punto in (actual, proximo):
                    if not vecinos[punto]:
                        del vecinos[punto]
                linea.append(proximo)
                actual = proximo
                # En un vertice de paso se sigue derecho; en una bifurcacion se corta, asi la
                # linea no inventa un giro que el dato no tiene.
                if len(vecinos.get(actual, ())) > 1:
                    break
            lineas.append([list(p) for p in linea])
    sobrantes = sum(len(v) for v in vecinos.values())
    if sobrantes:
        sys.exit("[capas-energia] quedaron %d aristas sin encadenar" % sobrantes)

    # Control: el conjunto de segmentos tiene que ser el mismo que entro.
    salida = set()
    for linea in lineas:
        for i in range(len(linea) - 1):
            a, b = tuple(linea[i]), tuple(linea[i + 1])
            salida.add((a, b) if a <= b else (b, a))
    if salida != aristas:
        sys.exit("[capas-energia] la union cambio la geometria: entraron %d segmentos y "
                 "salieron %d" % (len(aristas), len(salida)))
    return sorted(lineas)


def orden_de_tension(valor):
    """Los niveles se ordenan por su numero; uno que no sea numero va al final, por texto."""
    try:
        return (0, float(valor), "")
    except ValueError:
        return (1, 0.0, valor)


def main(entrada, salida, ruta_departamentos):
    os.makedirs(salida, exist_ok=True)
    limite = limite_provincial(ruta_departamentos)
    por_tension = tramos_por_tension(os.path.join(entrada, ARCHIVO_CRUDO), limite)

    features = []
    for tension in sorted(por_tension, key=orden_de_tension):
        sueltos = por_tension[tension]
        tramos = unir_tramos(sueltos)
        print("[capas-energia]   tension %s: %d tramos sueltos -> %d polilineas"
              % (tension, len(sueltos), len(tramos)))
        features.append({
            "type": "Feature",
            "properties": {"tension": tension},
            "geometry": {"type": "MultiLineString", "coordinates": tramos},
        })
    doc = {"type": "FeatureCollection", "features": features}
    bytes_escritos = escribir(salida, ARCHIVO_SALIDA, doc)
    print("[capas-energia] %s: %s, %d bytes"
          % (ARCHIVO_SALIDA,
             ", ".join("tension %s %d tramos" % (f["properties"]["tension"],
                                                 len(f["geometry"]["coordinates"]))
                       for f in features),
             bytes_escritos))
    print("[capas-energia] coordenadas a %d decimales; la unidad de `tension` NO esta "
          "documentada por la fuente y se publica sin unidad (backlog 115)." % DECIMALES)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__.strip().splitlines()[-1])
    main(sys.argv[1], sys.argv[2], sys.argv[3])
