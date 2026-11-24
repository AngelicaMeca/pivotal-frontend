"""Las capas del INTA SIN RECORTAR, para el boton "Mostrar todo el país".

Pedido de la usuaria del 25-nov-2026: un botoncito que diga "mostrar todo el pais", como el de
los mapas de AgroClima. Alla ese boton es gratis: la imagen del SEPA YA es nacional y el visor
simplemente deja de recortarla. Aca cada capa es un vector que el pipeline recorta contra el
contorno de la provincia (`capas_inta.py`), asi que fuera del limite no hay nada dibujado. Este
modulo publica la OTRA version de cada capa: la que el INTA sirve entera.

Hasta donde llega cada una, que no es una decision nuestra sino de la fuente:
  - Aptitud de tierras y Zonificacion del uso del suelo NO estan aca: el INTA las publica solo
    para Santiago del Estero (lo verifica `capas_inta.py` contra la caja provincial). Con el
    boton prendido se siguen viendo tal cual, dibujadas sobre la provincia y nada alrededor,
    que es lo que hay.
  - Cuencas hidricas y Cursos de agua son del NOROESTE.
  - Cobertura del suelo y Areas ganaderas deforestadas son NACIONALES.

POR QUE ES UN MODULO APARTE y no una opcion de `capas_inta.py`: volver a correr aquel
regeneraria tambien las capas recortadas que ya estan publicadas, y la descarga de hoy no es
byte a byte la del 18-nov-2026 (el GeoServer del INTA sirve ahora mas vertices por capa: 8,6 MB
de cuencas contra 3,6). Lo que JC ya vio no se toca de rebote: este script solo escribe
archivos nuevos.

LAS TOLERANCIAS son decisiones medidas, no un numero a ojo. El encuadre del boton es el pais
entero en una caja de 640 px de alto: unos 5,8 km por pixel, y el zoom llega a 40x, o sea 145 m
por pixel en el maximo. Lo medido, capa por capa, esta en la declaracion de cada una y en
configs/dims/capas-inta.yaml.

Uso:
  .venv/Scripts/python -m pipeline.capas_pais <carpeta de descargas> configs/dims/capas-inta
"""
import json
import os
import sys

from pipeline.capas_ign import DECIMALES, escribir
from pipeline.capas_inta import (clase_del_rasgo, leyenda_de_la_capa, partes_del_rasgo,
                                 simplificar, tramos_del_rasgo)

# Cada capa, con la MISMA declaracion que en `capas_inta.CAPAS` salvo el recorte (no hay) y la
# tolerancia (mas gruesa: esto se mira a escala de pais).
CAPAS = (
    {"id": "inta-cuencas", "crudo": "cuencas_noa_ll.json", "campo": "Nom_Macro_",
     "salida": "cuencas-hidricas-pais.geojson", "geometria": "poligonos",
     # 0,68 MB con 222 m, lo mismo que pesa la version recortada de la provincia, que lleva
     # 55 m: a aquella el recorte le saca casi todo lo que aca saca la tolerancia. A 55 m este
     # archivo serian 3,66 MB.
     "tolerancia": 0.002},
    {"id": "inta-cursos-de-agua", "crudo": "cursosdeagua.json", "campo": "TIPO",
     "salida": "cursos-de-agua-pais.geojson", "geometria": "lineas",
     "tolerancia": 0.002},
    {"id": "inta-cobertura-suelo", "crudo": "lccs_n3_2007.json", "campo": "NIVEL3",
     "salida": "cobertura-del-suelo-2006-2007-pais.geojson", "geometria": "poligonos",
     # 2,2 km, y es lo que el peso permite: esta capa es un tapiz que cubre el pais entero con
     # 14,1 millones de vertices. Medido el 25-nov-2026, un rasgo por clase: 13,09 MB a 555 m,
     # 7,94 MB a 1,1 km y 3,1 MB a 2,2 km. A 2,2 km el error es 0,4 px en el encuadre del boton
     # (el pais en 640 px son 5,8 km por pixel), asi que a simple vista el dibujo es el mismo y
     # pesa cuatro veces menos. Acercando mucho se nota el borde grueso: ahi la version fina es
     # la de la provincia, que vuelve apagando el boton.
     "tolerancia": 0.02, "clase_por_nombre": True, "minimo_px": True, "por_clase": True},
    {"id": "inta-areas-deforestadas", "crudo": "tb_layers_ganaderas_transii.json",
     "campo": None, "salida": "areas-deforestadas-2008-2017-pais.geojson",
     # El MISMO corte que la version de la provincia: un parche de menos de 1 ha no se dibuja.
     # Y es el corte que se puede hacer: a 1 ha quedan 33.222 parches de los 88.651 y el 98,8%
     # de las hectareas desmontadas; a 100 ha quedarian 1.958 parches y el 40% de la
     # superficie, o sea un mapa que dice que se desmonto la mitad de lo que se desmonto.
     # Medido sobre la descarga del 25-nov-2026 (935.564 ha en total).
     "geometria": "poligonos", "tolerancia": 0.005, "minimo_ha": 1, "un_solo_rasgo": True},
)

# Una parte mas chica que esto NO SE PUBLICA en la version nacional. Es la caja del anillo
# exterior en grados cuadrados: 0,00005 son unos 0,6 km2. Con el pais en 640 px de alto, un
# parche asi mide medio pixel; lo unico que hace es pesar.
MINIMO_GRADOS2 = 0.00005


# Valores que el dato trae FUERA DE LA PROVINCIA y que el SLD del INTA no declara, con su
# cuenta verificada contra el archivo. Es la misma tabla, con el mismo criterio, que
# `capas_inta.DECLARADAS_FUERA_DEL_SLD`: un valor sin leyenda corta la corrida y la unica forma
# de publicarlo es declararlo aca con su motivo y su cuenta. Si el INTA reexporta la capa y la
# cuenta cambia, vuelve a cortar.
#
# Las tres son de Cursos de agua y son 18 tramos sobre 40.000. Se publican NOMBRADAS en la
# leyenda, que es la decision que ya se tomo con "CAÑADA" dentro de la provincia: perder un
# rasgo en silencio es peor que mostrarlo con su nombre. Los rotulos van como los escribe el
# INTA, en mayuscula y sin acento donde el no lo pone: el rotulo de una clase suya no se
# corrige. Los colores son de la misma familia azul del SLD (rio #1f579b, arroyo #5396cf,
# quebrada #73b3d8) y no salen de ningun dato: el SLD del INTA no les da ninguno porque su
# propio mapa no las dibuja. Queda avisado en advertencias_para_jc de capas-inta.yaml.
DECLARADAS_FUERA_DEL_SLD = {
    ("inta-cursos-de-agua", "CAÑADA"): {
        # El MISMO tono que lleva dentro de la provincia: una clase no cambia de color porque
        # se la mire con el pais a la vista.
        "etiqueta": "CAÑADA", "color": "#9fcbe6", "cuantos": 16,
    },
    ("inta-cursos-de-agua", "AGUADA"): {
        # Un azul mas gris: una aguada no es un curso que corre, y el tono lo dice sin que haya
        # que explicarlo.
        "etiqueta": "AGUADA", "color": "#a9c0d1", "cuantos": 1,
    },
    ("inta-cursos-de-agua", "ZANJON"): {
        "etiqueta": "ZANJON", "color": "#8aa9c2", "cuantos": 1,
    },
}


def rasgos_del_archivo(ruta):
    """Los rasgos de un FeatureCollection, UNO POR UNO, sin cargar el archivo entero.

    `json.load` no sirve para estas capas: la cobertura del suelo que sirve hoy el INTA son
    395 MB de GeoJSON (eran 122 MB en noviembre: el GeoServer empezo a servir las coordenadas
    con todos sus decimales), y el arbol de objetos de Python que sale de ahi pide varios
    gigabytes. Leyendo rasgo por rasgo la memoria se queda en lo que mida el rasgo mas grande.

    El recorrido no interpreta JSON: cuenta llaves. Lo unico delicado es no contar las que
    estan DENTRO de un texto (los nombres de clase del INTA no traen llaves, pero una clase
    nueva podria), asi que el barrido conoce las comillas y la barra invertida.
    """
    with open(ruta, encoding="utf-8") as f:
        buffer = ""
        while '"features"' not in buffer:
            trozo = f.read(1 << 20)
            if not trozo:
                raise SystemExit("[capas-pais] %s no es un FeatureCollection" % ruta)
            buffer += trozo
        buffer = buffer[buffer.index('"features"'):]
        buffer = buffer[buffer.index("[") + 1:]
        # El barrido NO puede empezar de cero cada vez que se lee un trozo nuevo: `en_texto` y
        # `escapado` son estado, y volver a pasar por un texto ya leido los deja al reves. Por
        # eso el cursor `i` vive afuera del bucle y solo vuelve a cero cuando el buffer se
        # recorta (al terminar un rasgo o cuando no hay ninguno a medias).
        i, profundidad, inicio, en_texto, escapado = 0, 0, None, False, False
        while True:
            while i < len(buffer):
                c = buffer[i]
                if en_texto:
                    if escapado:
                        escapado = False
                    elif c == "\\":
                        escapado = True
                    elif c == '"':
                        en_texto = False
                elif c == '"':
                    en_texto = True
                elif c == "{":
                    if profundidad == 0:
                        inicio = i
                    profundidad += 1
                elif c == "}":
                    profundidad -= 1
                    if profundidad == 0:
                        yield json.loads(buffer[inicio:i + 1])
                        buffer = buffer[i + 1:]
                        i, inicio = -1, None
                elif c == "]" and profundidad == 0:
                    return
                i += 1
            if inicio is None:
                buffer, i = "", 0
            trozo = f.read(1 << 20)
            if not trozo:
                return
            buffer += trozo


def caja_de_la_parte(parte):
    xs = [p[0] for p in parte[0]]
    ys = [p[1] for p in parte[0]]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def rasgos_de_area(capa, crudos, renombre, etiqueta_de, sin_clase, cuenta):
    """Un rasgo por poligono, con su clase, sin recortar nada."""
    rasgos, antes, despues, chicos, minusculas = [], 0, 0, 0, 0
    for rasgo in crudos:
        geometria = rasgo.get("geometry") or {}
        if not geometria.get("coordinates"):
            continue
        valor = clase_del_rasgo(capa, rasgo, renombre)
        if valor not in etiqueta_de:
            # Sin leyenda no se dibuja, y la corrida se corta mas abajo con la cuenta en la
            # mano: asi el aviso dice cuantos rasgos son y no solo que existe el valor.
            sin_clase[valor] = sin_clase.get(valor, 0) + 1
            continue
        cuenta[valor] = cuenta.get(valor, 0) + 1
        if capa.get("minimo_ha"):
            if ((rasgo.get("properties") or {}).get("sup_ha") or 0) < capa["minimo_ha"]:
                chicos += 1
                continue
        partes, a, _d = partes_del_rasgo(geometria, capa.get("tolerancia"))
        antes += a
        if capa.get("minimo_px"):
            quedan = [p for p in partes if caja_de_la_parte(p) >= MINIMO_GRADOS2]
            minusculas += len(partes) - len(quedan)
            partes = quedan
        if not partes:
            continue
        despues += sum(len(anillo) for p in partes for anillo in p)
        rasgos.append({"type": "Feature",
                       "properties": {"clase": valor},
                       "geometry": {"type": "MultiPolygon",
                                    "coordinates": [[[[round(x, DECIMALES), round(y, DECIMALES)]
                                                      for x, y in anillo] for anillo in p]
                                                    for p in partes]}})
    rasgos.sort(key=lambda r: (r["properties"]["clase"],
                               r["geometry"]["coordinates"][0][0][0]))
    if chicos:
        print("[capas-pais] %s: %d parches de menos de %s ha descartados."
              % (capa["id"], chicos, capa["minimo_ha"]))
    if minusculas:
        print("[capas-pais] %s: %d partes de menos de medio pixel descartadas."
              % (capa["id"], minusculas))
    if capa.get("un_solo_rasgo") or capa.get("por_clase"):
        # UN RASGO POR CLASE, con todas sus partes. En la version recortada esto se hacia solo
        # con las capas de una clase (`un_solo_rasgo`); en la nacional se hace tambien con la
        # cobertura del suelo, y ahi son 12.765 envoltorios de rasgo que se ahorran: casi 2 MB
        # de llaves y comillas repetidas, y 12.765 llamadas de dibujo que pasan a ser 42. El
        # cartel no pierde nada: dice la CLASE, que es la misma para todas las partes de un
        # rasgo, y el cliente ya parte cada rasgo de area en una pieza por parte.
        por_clase = {}
        for r in rasgos:
            por_clase.setdefault(r["properties"]["clase"], []).extend(
                r["geometry"]["coordinates"])
        rasgos = []
        for clase in sorted(por_clase):
            partes = sorted(por_clase[clase], key=lambda p: p[0][0])
            rasgos.append({"type": "Feature", "properties": {"clase": clase},
                           "geometry": {"type": "MultiPolygon", "coordinates": partes}})
    return rasgos, antes, despues


def rasgos_de_linea(capa, crudos, renombre, etiqueta_de, sin_clase, cuenta):
    """Un rasgo por clase, con todos sus tramos, sin recortar nada."""
    por_clase, antes, despues = {}, 0, 0
    for rasgo in crudos:
        geometria = rasgo.get("geometry") or {}
        if not geometria.get("coordinates"):
            continue
        valor = clase_del_rasgo(capa, rasgo, renombre)
        if valor not in etiqueta_de:
            sin_clase[valor] = sin_clase.get(valor, 0) + 1
            continue
        cuenta[valor] = cuenta.get(valor, 0) + 1
        for tramo in tramos_del_rasgo(geometria):
            antes += len(tramo)
            simple = simplificar([(p[0], p[1]) for p in tramo], capa["tolerancia"])
            if len(simple) < 2:
                continue
            despues += len(simple)
            por_clase.setdefault(valor, []).append(
                [[round(p[0], DECIMALES), round(p[1], DECIMALES)] for p in simple])
    rasgos = []
    for valor in sorted(por_clase):
        rasgos.append({"type": "Feature", "properties": {"clase": valor},
                       "geometry": {"type": "MultiLineString",
                                    "coordinates": sorted(por_clase[valor])}})
    return rasgos, antes, despues


def una_capa(entrada, salida, capa):
    crudo = os.path.join(entrada, capa["crudo"])
    sld = os.path.join(entrada, capa["crudo"].rsplit(".", 1)[0] + ".sld")
    for ruta in (crudo, sld):
        if not os.path.exists(ruta):
            raise SystemExit("[capas-pais] falta %s" % ruta)

    clases = leyenda_de_la_capa(capa, sld)
    renombre = None
    if capa.get("clase_por_nombre"):
        renombre = dict((valor, etiqueta) for valor, etiqueta, _ in clases)
        clases = [(etiqueta, etiqueta, color) for _, etiqueta, color in clases]
    etiqueta_de = dict((valor, etiqueta) for valor, etiqueta, _ in clases)

    # Las clases que el SLD no declara y que ya se miraron una por una: se agregan ANTES de
    # recorrer el archivo porque el recorrido es uno solo (ver `rasgos_del_archivo`), asi que
    # la leyenda tiene que estar completa de entrada. Lo que llegue y no este en ninguna de las
    # dos listas se cuenta y corta la corrida al final, con su cuenta.
    for (id_capa, valor), declarada in sorted(DECLARADAS_FUERA_DEL_SLD.items()):
        if id_capa == capa["id"]:
            clases.append((valor, declarada["etiqueta"], declarada["color"]))
            etiqueta_de[valor] = declarada["etiqueta"]

    sin_clase, cuenta = {}, {}
    crudos = rasgos_del_archivo(crudo)
    if capa["geometria"] == "lineas":
        rasgos, antes, despues = rasgos_de_linea(capa, crudos, renombre, etiqueta_de,
                                               sin_clase, cuenta)
    else:
        rasgos, antes, despues = rasgos_de_area(capa, crudos, renombre, etiqueta_de,
                                              sin_clase, cuenta)

    for valor, cuantos in sorted(sin_clase.items()):
        raise SystemExit(
            "[capas-pais] %s: %d rasgos traen en %s el valor %r, que el SLD del INTA no "
            "declara. Una clase sin leyenda no se publica: hay que mirarla y declararla en "
            "DECLARADAS_FUERA_DEL_SLD con su motivo y su cuenta."
            % (capa["id"], cuantos, capa["campo"], valor))
    # Y la cuenta de las declaradas tiene que seguir siendo la medida: si el INTA reexporta la
    # capa y aparecen mas, hay que volver a mirarla antes de publicarla.
    for (id_capa, valor), declarada in sorted(DECLARADAS_FUERA_DEL_SLD.items()):
        if id_capa != capa["id"]:
            continue
        cuantos = cuenta.get(valor, 0)
        if cuantos != declarada["cuantos"]:
            raise SystemExit(
                "[capas-pais] %s: %r esta declarada con %d rasgos y el archivo trae %d. La "
                "capa cambio: hay que volver a mirarla antes de publicarla."
                % (capa["id"], valor, declarada["cuantos"], cuantos))

    bytes_escritos = escribir(salida, capa["salida"],
                              {"type": "FeatureCollection", "features": rasgos})
    usadas = set(r["properties"]["clase"] for r in rasgos)
    print("[capas-pais] %-44s %4d rasgos, %7d de %8d vertices (%2.0f%% menos), %2d de %2d "
          "clases, %5.2f MB"
          % (capa["salida"], len(rasgos), despues, antes,
             100.0 * (1 - despues / float(antes or 1)), len(usadas), len(clases),
             bytes_escritos / 1048576.0))
    return clases, usadas


def main(entrada, salida):
    os.makedirs(salida, exist_ok=True)
    bloques = []
    for capa in CAPAS:
        clases, usadas = una_capa(entrada, salida, capa)
        if capa["campo"] is None:
            # Una sola clase: el estilo general de la capa ya lo declara el protocolo y no
            # cambia fuera de la provincia.
            continue
        renglones = ["  %s:" % capa["id"], "    estilos_pais:"]
        linea = capa["geometria"] == "lineas"
        for valor, etiqueta, color in clases:
            if valor not in usadas:
                continue
            renglones.append("      - cuando: {clase: [%s]}"
                             % json.dumps(valor, ensure_ascii=False))
            renglones.append("        rotulo: %s"
                             % json.dumps(" ".join(etiqueta.split()), ensure_ascii=False))
            renglones.append('        color: "%s"' % color)
            if linea:
                renglones.append("        ancho: 1.0")
                renglones.append("        trazo: lleno")
        renglones.append('      - {cuando: {}, rotulo: "", color: "#b9a79c"%s}'
                         % (", ancho: 0.8, trazo: punteado" if linea else ""))
        bloques.append("\n".join(renglones))
    print("\n[capas-pais] Para _protocolo-presentacion.yaml, colores.capas_de_contexto "
          "(la leyenda con el boton prendido):\n")
    print("\n".join(bloques))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("\n".join(__doc__.strip().splitlines()[-2:]))
    main(sys.argv[1], sys.argv[2])
