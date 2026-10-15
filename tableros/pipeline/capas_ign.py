"""Arma configs/dims/capas-ign/ desde las descargas crudas del IGN (pedido de JC, 14-oct-2026).

Son las capas que JC pidio del catalogo de Capas SIG del IGN: red vial (nacional, provincial y
terciaria), ferrocarril (tendidos y estaciones) y amenazas hidrometeorologicas (registros
DESINVENTAR por departamento y niveles de exposicion SINAGIR por region). La procedencia, los
comandos de descarga y la huella de cada archivo crudo estan en configs/dims/capas-ign.yaml.

Mismo criterio que pipeline/geojson_sde.py:
  - Determinista: mismas descargas -> mismos archivos byte a byte.
  - Sin dependencias: solo la stdlib. El recorte contra el limite provincial es geometria plana
    escrita aca (punto en poligono por paridad y corte de segmento contra el borde).
  - Coordenadas redondeadas a 5 decimales (~1 metro) y sin puntos consecutivos repetidos.

Que hace con cada capa:
  - Lineas (rutas, caminos, vias): se quedan los TRAMOS adentro de la provincia. Un tramo que
    cruza el limite se corta justo en el borde (el punto de corte se calcula), asi las rutas
    llegan hasta el limite y no se pasan.
  - Puntos (estaciones): se quedan los que caen adentro.
  - La red terciaria se publica COMPLETA (decision de la usuaria, 14-oct-2026), pero agrupada
    en un feature por tipo de calzada: son ~20.000 tramos sin nombre y repetir las propiedades
    en cada uno era la mitad del peso del archivo.
  - Los codigos del IGN se traducen a texto con los dominios de su metadata (RST, FUN, GNA).
  - DESINVENTAR viene por departamento con el codigo INDEC (in1): se escribe como tabla
    (geo_id + registros por tipo de evento), sin geometria, porque el mapa usa los poligonos
    de sde-departamentos.geojson.
  - SINAGIR viene por REGION: se escribe la region que contiene a Santiago del Estero.

Uso:
  python pipeline/capas_ign.py <carpeta con las descargas crudas> configs/dims/capas-ign       86 configs/dims/sde-departamentos.geojson

El 86 es el codigo INDEC de la provincia (provincia es parametro: nada de SDE fijo aca) y el
GeoJSON de departamentos es contra el que se controla que DESINVENTAR traiga a todos.
"""
import json
import os
import sys

DECIMALES = 5
BANDAS = 400  # franjas de latitud para indexar los bordes de la provincia

# Dominios de la metadata del IGN (configs/dims/capas-ign.yaml los cita).
CALZADA_RUTAS = {1: "Pavimentado", 2: "Consolidado", 3: "Tierra"}          # red nacional y provincial
CALZADA_TERCIARIA = {1: "Pavimentado", 19: "Consolidado", 13: "Tierra"}    # red terciaria
ESTADO_FFCC = {2: "Abandonado", 4: "Desmantelado", 6: "Activo", 9: "En construcción"}

EVENTOS_DESINVENTAR = [
    ("des_inun", "Inundaciones"),
    ("des_torm", "Tormentas"),
    ("des_viefue", "Vientos fuertes"),
    ("des_tornad", "Tornados"),
    ("des_graniz", "Granizo"),
    ("des_sequia", "Sequía"),
    ("des_lluvia", "Lluvias"),
    ("des_escarc", "Escarcha"),
    ("des_olasca", "Olas de calor"),
    ("des_niebla", "Niebla"),
    ("des_tormel", "Tormentas eléctricas"),
    ("des_tormni", "Tormentas de nieve"),
]

AMENAZAS_SINAGIR = [
    ("inun_reg", "Inundaciones regionales"),
    ("inun_nuc", "Inundaciones de núcleos urbanos"),
    ("inun_lla", "Inundaciones de llanura"),
    ("torm_sev", "Tormentas severas"),
    ("gran_nev", "Grandes nevadas"),
    ("inci_pres_", "Incidentes con presas (operación)"),
    ("inci_pre_f", "Incidentes con presas (falla)"),
    ("enos_calid", "ENOS fase cálida (El Niño)"),
    ("enos_frios", "ENOS fase fría (La Niña)"),
]


def leer(carpeta, nombre):
    with open(os.path.join(carpeta, nombre), encoding="utf-8") as f:
        return json.load(f)


def escribir(salida, nombre, doc):
    ruta = os.path.join(salida, nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return os.path.getsize(ruta)


def redondear(p):
    return [round(p[0], DECIMALES), round(p[1], DECIMALES)]


# ---------------------------------------------------------------- limite provincial

class Limite:
    """Los bordes del poligono provincial, indexados por franja de latitud."""

    def __init__(self, geometria):
        if geometria["type"] == "Polygon":
            poligonos = [geometria["coordinates"]]
        else:
            poligonos = geometria["coordinates"]
        self.bordes = []
        for poligono in poligonos:
            for anillo in poligono:
                for i in range(len(anillo) - 1):
                    a, b = anillo[i], anillo[i + 1]
                    if a != b:
                        self.bordes.append((a[0], a[1], b[0], b[1]))
        ys = [y for e in self.bordes for y in (e[1], e[3])]
        self.ymin, self.ymax = min(ys), max(ys)
        self.alto = (self.ymax - self.ymin) / BANDAS
        self.franjas = [[] for _ in range(BANDAS)]
        for e in self.bordes:
            for k in range(self.franja(min(e[1], e[3])), self.franja(max(e[1], e[3])) + 1):
                self.franjas[k].append(e)
        xs = [x for e in self.bordes for x in (e[0], e[2])]
        self.caja = (min(xs), self.ymin, max(xs), self.ymax)

    def franja(self, y):
        k = int((y - self.ymin) / self.alto)
        return max(0, min(BANDAS - 1, k))

    def adentro(self, p):
        x, y = p
        if not (self.caja[0] <= x <= self.caja[2] and self.caja[1] <= y <= self.caja[3]):
            return False
        dentro = False
        for x1, y1, x2, y2 in self.franjas[self.franja(y)]:
            if (y1 > y) != (y2 > y):
                xc = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                if xc > x:
                    dentro = not dentro
        return dentro

    def cortes(self, a, b):
        """Parametros t en [0, 1] donde el segmento a-b cruza el borde, ordenados."""
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        ts = set()
        k1, k2 = self.franja(min(ay, by)), self.franja(max(ay, by))
        vistos = set()
        for k in range(k1, k2 + 1):
            for e in self.franjas[k]:
                if e in vistos:
                    continue
                vistos.add(e)
                x1, y1, x2, y2 = e
                ex, ey = x2 - x1, y2 - y1
                den = dx * ey - dy * ex
                if den == 0:
                    continue
                t = ((x1 - ax) * ey - (y1 - ay) * ex) / den
                u = ((x1 - ax) * dy - (y1 - ay) * dx) / den
                if 0 <= t <= 1 and 0 <= u <= 1:
                    ts.add(t)
        return sorted(ts)


def recortar_linea(limite, linea):
    """Los tramos de una polilinea que quedan adentro de la provincia."""
    tramos = []
    actual = []

    def cerrar():
        limpio = []
        for p in actual:
            q = redondear(p)
            if not limpio or limpio[-1] != q:
                limpio.append(q)
        if len(limpio) >= 2:
            tramos.append(limpio)

    dentro_a = limite.adentro(linea[0])
    if dentro_a:
        actual.append(linea[0])
    for i in range(len(linea) - 1):
        a, b = linea[i], linea[i + 1]
        dentro_b = limite.adentro(b)
        ts = limite.cortes(a, b) if (dentro_a != dentro_b or not dentro_a) else []
        # Cada corte alterna adentro/afuera a lo largo del segmento.
        dentro = dentro_a
        for t in ts:
            p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
            if dentro:
                actual.append(p)
                cerrar()
                actual = []
            else:
                actual = [p]
            dentro = not dentro
        if dentro_b:
            actual.append(b)
        dentro_a = dentro_b
    if dentro_a:
        cerrar()
    return tramos


def lineas_de(geometria):
    if geometria is None:
        return []
    if geometria["type"] == "LineString":
        return [geometria["coordinates"]]
    if geometria["type"] == "MultiLineString":
        return geometria["coordinates"]
    sys.exit("[capas-ign] geometria de linea inesperada: %s" % geometria["type"])


def recortar_capa_lineas(limite, crudo, propiedades, orden):
    """Un feature por feature del IGN que tenga algun tramo adentro."""
    features = []
    for f in crudo["features"]:
        tramos = []
        for linea in lineas_de(f["geometry"]):
            tramos.extend(recortar_linea(limite, linea))
        if not tramos:
            continue
        features.append({
            "type": "Feature",
            "properties": propiedades(f["properties"]),
            "geometry": {"type": "MultiLineString", "coordinates": tramos},
        })
    features.sort(key=lambda x: (orden(x["properties"]), json.dumps(x["geometry"]["coordinates"][0][0])))
    return {"type": "FeatureCollection", "features": features}


def numero_de_ruta(prefijo, rtn):
    if rtn in (None, "", 0):
        return prefijo + " s/n"
    return "%s %s" % (prefijo, rtn)


def traducir(dominio, valor, capa, campo):
    if valor not in dominio:
        sys.exit("[capas-ign] %s: valor %r de %s sin traduccion en el dominio del IGN"
                 % (capa, valor, campo))
    return dominio[valor]


def main(entrada, salida, codigo_provincia, ruta_departamentos):
    os.makedirs(salida, exist_ok=True)
    provincia = leer(entrada, "provincia.json")["features"]
    if len(provincia) != 1:
        sys.exit("[capas-ign] se esperaba UNA provincia y vinieron %d" % len(provincia))
    if str(provincia[0]["properties"]["in1"]) != codigo_provincia:
        sys.exit("[capas-ign] provincia.json es la %s y se pidio la %s"
                 % (provincia[0]["properties"]["in1"], codigo_provincia))
    limite = Limite(provincia[0]["geometry"])

    # --- red vial nacional y provincial
    for capa, prefijo, archivo in (("vial_nacional", "RN", "rutas-nacionales.geojson"),
                                   ("vial_provincial", "RP", "rutas-provinciales.geojson")):
        doc = recortar_capa_lineas(
            limite, leer(entrada, capa + ".json"),
            lambda p, prefijo=prefijo, capa=capa: {
                "ruta": numero_de_ruta(prefijo, p.get("rtn")),
                "calzada": traducir(CALZADA_RUTAS, p.get("rst"), capa, "rst"),
            },
            lambda p: (p["ruta"], p["calzada"]))
        print("[capas-ign] %s: %d tramos, %d bytes"
              % (archivo, len(doc["features"]), escribir(salida, archivo, doc)))

    # --- red terciaria: completa, un feature por tipo de calzada
    crudo = leer(entrada, "vial_terciaria.json")
    por_calzada = {}
    for f in crudo["features"]:
        calzada = traducir(CALZADA_TERCIARIA, f["properties"].get("rst"), "vial_terciaria", "rst")
        for linea in lineas_de(f["geometry"]):
            por_calzada.setdefault(calzada, []).extend(recortar_linea(limite, linea))
    features = []
    for calzada in ("Pavimentado", "Consolidado", "Tierra"):
        tramos = sorted(por_calzada.get(calzada, []))
        if tramos:
            features.append({"type": "Feature", "properties": {"calzada": calzada},
                             "geometry": {"type": "MultiLineString", "coordinates": tramos}})
    doc = {"type": "FeatureCollection", "features": features}
    print("[capas-ign] caminos-terciarios.geojson: %s, %d bytes"
          % (", ".join("%s %d" % (f["properties"]["calzada"], len(f["geometry"]["coordinates"]))
                       for f in features),
             escribir(salida, "caminos-terciarios.geojson", doc)))

    # --- ferrocarril: tendidos
    doc = recortar_capa_lineas(
        limite, leer(entrada, "lineas_de_transporte_ferroviario_AN010.json"),
        lambda p: {"ramal": p.get("nam") or p.get("fna") or "Sin nombre",
                   "estado": traducir(ESTADO_FFCC, p.get("fun"), "ferrocarril", "fun")},
        lambda p: (p["ramal"], p["estado"]))
    print("[capas-ign] ferrocarril.geojson: %d tramos, %d bytes"
          % (len(doc["features"]), escribir(salida, "ferrocarril.geojson", doc)))

    # --- ferrocarril: estaciones, apeaderos, desvios y embarcaderos
    crudo = leer(entrada, "puntos_de_transporte_ferroviario_AN070.json")
    features = []
    for f in crudo["features"]:
        p = f["properties"]
        punto = f["geometry"]["coordinates"]
        if f["geometry"]["type"] == "MultiPoint":
            punto = punto[0]
        if not limite.adentro(punto):
            continue
        features.append({
            "type": "Feature",
            "properties": {"nombre": p.get("nam") or p.get("fna"), "tipo": p.get("gna"),
                           "estado": traducir(ESTADO_FFCC, p.get("fun"), "estaciones", "fun")},
            "geometry": {"type": "Point", "coordinates": redondear(punto)},
        })
    features.sort(key=lambda x: (x["properties"]["nombre"] or "", x["geometry"]["coordinates"]))
    doc = {"type": "FeatureCollection", "features": features}
    print("[capas-ign] estaciones-ferrocarril.geojson: %d puntos, %d bytes"
          % (len(features), escribir(salida, "estaciones-ferrocarril.geojson", doc)))

    # --- DESINVENTAR: registros 1970-2015 por departamento
    crudo = leer(entrada, "desinventar_hidrometeorologico_riesgo.json")
    filas = []
    for f in crudo["features"]:
        p = f["properties"]
        geo_id = str(p["in1"])
        if not geo_id.startswith(codigo_provincia):
            continue
        eventos = {nombre: int(p.get(campo) or 0) for campo, nombre in EVENTOS_DESINVENTAR}
        if sum(eventos.values()) != int(p["registros"]):
            sys.exit("[capas-ign] DESINVENTAR %s: la suma por evento (%d) no da el total (%s)"
                     % (geo_id, sum(eventos.values()), p["registros"]))
        filas.append({"geo_id": geo_id, "nombre_ign": p["nam"], "registros": int(p["registros"]),
                      "categoria_ign": p["categoria"], "eventos": eventos})
    filas.sort(key=lambda x: x["geo_id"])
    with open(ruta_departamentos, encoding="utf-8") as f:
        esperados = sorted(x["properties"]["geo_id"] for x in json.load(f)["features"])
    if [x["geo_id"] for x in filas] != esperados:
        sys.exit("[capas-ign] DESINVENTAR no trae los mismos departamentos que %s" % ruta_departamentos)
    doc = {"periodo": "1970-2015", "fuente": "Base DESINVENTAR, IGN",
           "eventos": [nombre for _, nombre in EVENTOS_DESINVENTAR], "departamentos": filas}
    print("[capas-ign] amenazas-desinventar.json: %d departamentos, %d registros, %d bytes"
          % (len(filas), sum(x["registros"] for x in filas),
             escribir(salida, "amenazas-desinventar.json", doc)))

    # --- SINAGIR: la region que contiene a la provincia (por su punto interior mas al centro)
    crudo = leer(entrada, "sinagir_amenazas_hidrometeorologicas_riesgo.json")
    centro = [(limite.caja[0] + limite.caja[2]) / 2, (limite.caja[1] + limite.caja[3]) / 2]
    if not limite.adentro(centro):
        sys.exit("[capas-ign] el centro de la caja no cae en la provincia: elegir otro punto")
    region = None
    for f in crudo["features"]:
        if Limite(f["geometry"]).adentro(centro):
            region = f["properties"]
    if region is None:
        sys.exit("[capas-ign] SINAGIR: ninguna region contiene a la provincia")
    doc = {"region": region["region"], "categoria_ign": region["categoria"],
           "sumatoria": int(region["sumatoria"]), "periodo": "PNRRD 2018-2023",
           "fuente": region["fuente"],
           "amenazas": [{"amenaza": nombre, "nivel": int(region[campo])}
                        for campo, nombre in AMENAZAS_SINAGIR]}
    print("[capas-ign] amenazas-sinagir.json: region %s, sumatoria %d, %d bytes"
          % (doc["region"], doc["sumatoria"], escribir(salida, "amenazas-sinagir.json", doc)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
