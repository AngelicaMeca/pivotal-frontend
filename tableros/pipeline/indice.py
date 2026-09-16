"""Lector del indice de JC ("Bases para Beta - N.xlsx").

Lo corre el agente indexador-contexto. Genera, siempre desde cero y sin estado
externo (mismo Excel -> mismo output byte a byte):

  configs/manifiesto-indice.yaml   manifiesto de bases declaradas por JC
  configs/indice-versiones.yaml    inventario de versiones del indice
  docs/cobertura.md                indice vs entrega recibida vs staging vs sitio

raw/ es de solo lectura: se lee el Excel y no se escribe nada adentro.

Uso:
    .venv/bin/python -m pipeline.indice            # version vigente
    .venv/bin/python -m pipeline.indice --version 2

Reglas (CLAUDE.md): el indice es fuente de verdad de INTENCION, no de datos.
Nunca se cargan datos desde aca. Las hojas de calculo tipo "Calculos Ranking"
no se leen.
"""
import argparse
import hashlib
import os
import re
import sys
import unicodedata
import zipfile
from datetime import date, datetime

import openpyxl
import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_INDICE = os.path.join(RAIZ, "raw", "indice")
DIR_CONFIGS = os.path.join(RAIZ, "configs")

# Version vigente del indice. Cambiar cuando JC manda una nueva.
VERSION_VIGENTE = 2

# Hojas del libro que NO se parsean nunca (son planillas de calculo o data
# pegada por JC dentro del indice; los rankings se recomputan en marts).
HOJAS_IGNORADAS = re.compile(
    r"^(Calculos Ranking|Hoja\d+|Provincia \d+|\d+ PB ?\d+( - [A-Z])?)$"
)

# Las 5 bases de la demo prioritaria (CLAUDE.md).
DEMO_PRIORITARIA = [9, 48, 53, 85, 111]

# Marca de entrega en la hoja "Org tematica" -> carpeta de raw/.
ENTREGAS = {"1ra entrega": "entrega-01", "2da entrega": "entrega-02",
            "3ra entrega": "entrega-03"}

RE_ENTREGA = re.compile(r"^\d+\s*(ra|da|er|ta|va)?\s*entrega$", re.I)
RE_FECHA_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}")
RE_NRO_ARCHIVO = re.compile(r"^(\d+)\s*-")

# Normalizacion de frecuencia: JC escribe "diario"/"diaria", "permanente"/"Permanente".
FRECUENCIAS = {
    "diario": "diaria", "diaria": "diaria", "semanal": "semanal",
    "quincenal": "quincenal", "mensual": "mensual", "trimestral": "trimestral",
    "anual": "anual", "permanente": "permanente", "estacional": "estacional",
    "promedio": "promedio",
}


# ---------------------------------------------------------------- utilidades

def txt(v):
    """Normaliza el valor de una celda a str limpio o None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = re.sub(r"\s+", " ", str(v).replace("\n", " ")).strip()
    return s or None


def entero(v):
    if v is None:
        return None
    s = str(v).replace(".", "").replace(",", "").strip()
    return int(s) if s.isdigit() else None


def slug(texto, largo=60):
    """Slug estable y ASCII a partir de la descripcion de JC."""
    s = unicodedata.normalize("NFKD", texto or "")
    s = s.encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > largo:
        s = s[:largo].rsplit("-", 1)[0]
    return s or "sin-descripcion"


def ruta_indice(version):
    return os.path.join(DIR_INDICE, f"Bases para Beta - {version}.xlsx")


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 16), b""):
            h.update(bloque)
    return h.hexdigest()


def fecha_modificacion(ruta):
    """Fecha que trae el propio xlsx (docProps), no la del filesystem."""
    with zipfile.ZipFile(ruta) as z:
        try:
            core = z.read("docProps/core.xml").decode("utf-8")
        except KeyError:
            return None
    m = re.search(r"<dcterms:modified[^>]*>([^<]+)<", core)
    return m.group(1)[:10] if m else None


# ------------------------------------------------------------------ parseo

def buscar_header(ws, clave, max_scan=10):
    """Ubica la fila de header buscando una celda que empiece con `clave`.
    Nunca se asume la fila 1: JC mueve las cosas."""
    for i, fila in enumerate(ws.iter_rows(min_row=1, max_row=max_scan, values_only=True), 1):
        for celda in fila:
            t = txt(celda)
            if t and t.lower().startswith(clave.lower()):
                return i
    return None


def parse_general(ws):
    """Hoja GENERAL: una fila por base. Devuelve (bases, placeholders, totales)."""
    hfila = buscar_header(ws, "Nro base")
    if hfila is None:
        sys.exit("[indice] No encuentro el header 'Nro base' en la hoja GENERAL.")
    cols = {}
    for j, celda in enumerate(ws[hfila]):
        t = txt(celda.value)
        if t:
            cols[t.lower()] = j

    def val(fila, nombre):
        j = cols.get(nombre)
        return txt(fila[j]) if j is not None and j < len(fila) else None

    bases, placeholders, sueltas = {}, [], []
    for i, fila in enumerate(ws.iter_rows(min_row=hfila + 1, values_only=True), hfila + 1):
        if not any(txt(c) for c in fila):
            continue
        nro = entero(val(fila, "nro base"))
        if nro is None:
            sueltas.append({"fila": i, "registros": entero(val(fila, "registros"))})
            continue
        desc = val(fila, "descripción")
        if desc is None:
            placeholders.append(nro)
            continue
        unidades = [val(fila, f"var unit {k}") for k in (1, 2, 3)]
        geo = [val(fila, f"var geog {k}") for k in (1, 2)]
        frec = val(fila, "frecuencia")
        bases[nro] = {
            "fila": i,
            "nro": nro,
            "descripcion": desc,
            "ubicacion": val(fila, "ubicación"),
            "productos": entero(val(fila, "productos")),
            "unidades": [u for u in unidades if u],
            "geografia": [g for g in geo if g],
            "frecuencia": frec,
            "frecuencia_norm": FRECUENCIAS.get((frec or "").lower()),
            "inicio": val(fila, "inicio"),
            "ultimo": val(fila, "ultimo"),
            "registros": entero(val(fila, "registros")),
            "fuente": val(fila, "fuente"),
            "observaciones": val(fila, "observ"),
        }
    return bases, placeholders, sueltas


def parse_org(ws):
    """Hoja 'Org tematica': arbol tematico + marcas de entrega + notas de JC.

    Estructura observada (se valida sobre la marcha, JC la mueve):
      col B + C  -> nodo nivel 1 numerado (1 Agricultura ... 7 Clima)
      col C + D  -> nodo nivel 2 (1.a Cultivos extensivos)
      col D + E  -> nodo nivel 3 (1.a.1 Granos)
      col E sola -> nodo nivel 4 (Faena, Tambos)
      col C sola -> eje de acceso por territorio (Provincia, Departamento)
      col F      -> fila de base: F desc, G nro, H ubicacion, J entrega, K nota
      col A      -> marcas verticales de bloque (ACCESO POR TEMA / TERRITORIO,
                    BASES GENERICAS, INTRANET)
    """
    filas, marcas = [], []
    bloque = "acceso-por-tema"
    n1 = n2 = n4 = None
    sub_pend, bases_desde_nivel3 = [], False

    for i, fila in enumerate(ws.iter_rows(values_only=True), 1):
        c = {j: txt(v) for j, v in enumerate(fila)}
        marca = c.get(0)
        if marca:
            marcas.append({"fila": i, "texto": marca})
            if "GEN" in marca.upper() and "RICAS" in marca.upper():
                bloque = "bases-genericas"

        if c.get(1) and c.get(2):                      # nivel 1 numerado
            n1, n2, n4 = c[2], None, None
            sub_pend, bases_desde_nivel3 = [], False
            continue
        if c.get(2) and c.get(3):                      # nivel 2
            n2, n4 = c[3], None
            sub_pend, bases_desde_nivel3 = [], False
            continue
        if c.get(2) and not c.get(3) and not c.get(5):  # eje territorial
            bloque = "acceso-por-territorio" if bloque == "acceso-por-tema" else bloque
            n1, n2, n4 = c[2], None, None
            sub_pend, bases_desde_nivel3 = [], False
            continue
        if c.get(3) and c.get(4):                      # nivel 3
            if bases_desde_nivel3:
                sub_pend = []
                bases_desde_nivel3 = False
            sub_pend.append(c[4])
            continue
        if c.get(4) and not c.get(5):                  # nivel 4
            n4 = c[4]
            continue
        if not c.get(5):
            continue

        # Fila con descripcion pero SIN numero de base: no es una base. En el indice v2 hay
        # cinco y son de dos clases, ninguna catalogable:
        #   - "REPITE DE BOVINOS: ..." -> nota de que la base ya aparecio en otro tema.
        #   - "INTRANET"               -> encabezado de seccion; las bases que vienen abajo
        #                                 cuelgan de el.
        # Sin esto el encabezado se cataloga como una base fantasma y, peor, las bases que lo
        # siguen heredan el ultimo nivel 1 que haya quedado colgado: por eso las estaciones de
        # servicio, el padron RENSPA y los ingresos a Liniers aparecian bajo "Clima".
        if not c.get(6):
            if not c[5].upper().startswith("REPITE DE"):
                n1, n2, n4 = c[5].capitalize(), None, None
                sub_pend, bases_desde_nivel3 = [], False
            continue

        # fila de base
        crudo_entrega = c.get(9)
        es_entrega = bool(crudo_entrega) and bool(RE_ENTREGA.match(crudo_entrega))
        notas = [c.get(10)] if c.get(10) else []
        if crudo_entrega and not es_entrega:
            notas.append(crudo_entrega)
        # si hay varios nivel-3 seguidos sin bases en el medio, son un listado
        # de subtemas del bloque: la base cuelga del nivel 2, no del ultimo.
        subtema = sub_pend[0] if len(sub_pend) == 1 else None
        ruta = [x for x in (n1, n2, subtema, n4) if x]
        filas.append({
            "fila": i,
            "bloque": bloque,
            "descripcion": c[5],
            "nro": entero(c.get(6)),
            "ubicacion": c.get(7),
            "entrega": ENTREGAS.get(crudo_entrega) if es_entrega else None,
            "marca_entrega": crudo_entrega if es_entrega else None,
            "ruta": ruta,
            "subtemas_del_bloque": list(sub_pend) if len(sub_pend) > 1 else [],
            "notas": notas,
            "marca": marca,
        })
        bases_desde_nivel3 = True
    return filas, marcas


def parse_lista(ws):
    """Hoja 'Lista de bases y notas': detalle de la entrega (hojas, contenido,
    observaciones y estatus del modelo de analisis). Los items arrancan cuando
    la primera columna trae el numero de orden; el resto son continuaciones."""
    hfila = buscar_header(ws, "Base")
    if hfila is None:
        return [], []
    cols = {}
    for j, celda in enumerate(ws[hfila]):
        t = txt(celda.value)
        if t:
            cols[t.lower()] = j

    def val(fila, *nombres):
        for n in nombres:
            j = cols.get(n)
            if j is not None and j < len(fila):
                t = txt(fila[j])
                if t:
                    return t
        return None

    items, encabezado = [], []
    for i, fila in enumerate(ws.iter_rows(values_only=True), 1):
        if i == hfila or not any(txt(c) for c in fila):
            continue
        if i < hfila:
            encabezado += [txt(c) for c in fila if txt(c)]
            continue
        orden = entero(val(fila, "orden", "nro")) if ("orden" in cols or "nro" in cols) else None
        if orden is None:
            j0 = 0
            orden = entero(txt(fila[j0])) if j0 < len(fila) else None
        ref = val(fila, "base")
        hoja = val(fila, "hoja/s", "hoja")
        contenido = val(fila, "contenido")
        obs = val(fila, "observaciones")
        estatus = val(fila, "estatus")
        if orden is not None and ref:
            items.append({"orden": orden, "ref": ref, "nro": entero(ref.split()[0]),
                          "hojas": [hoja] if hoja else [], "contenido": contenido,
                          "observaciones": [obs] if obs else [], "estatus": estatus})
        elif items:
            it = items[-1]
            if hoja:
                it["hojas"].append(hoja)
                if contenido:
                    it["observaciones"].append(f"{hoja}: {contenido}")
            elif contenido:
                it["observaciones"].append(contenido)
            if obs:
                it["observaciones"].append(obs)
            if estatus and not it["estatus"]:
                it["estatus"] = estatus
        elif obs or contenido:
            encabezado.append(obs or contenido)
    return items, encabezado


# ------------------------------------------------------------ verificaciones

def anomalias_general(bases, placeholders, sueltas):
    """Rarezas del propio indice. No se corrigen: se reportan (CLAUDE.md)."""
    a = []
    if placeholders:
        a.append({"tipo": "numeros-reservados",
                  "detalle": "Numeros de base sin descripcion ni datos: "
                             + ", ".join(str(n) for n in placeholders)
                             + ". Quedan reservados, todavia sin contenido."})
    for s in sueltas:
        a.append({"tipo": "fila-total-embebida",
                  "detalle": f"Fila {s['fila']} sin numero de base con un total de "
                             f"{s['registros']} registros. Es un subtotal de la planilla, "
                             "no una base."})
    for nro, b in sorted(bases.items()):
        for campo in ("inicio", "ultimo"):
            v = b[campo]
            if v and v != "S/D" and not RE_FECHA_ISO.match(v):
                a.append({"tipo": "fecha-invalida", "base": nro,
                          "detalle": f"'{campo}' dice '{v}', que no es una fecha valida."})
        i, u = b["inicio"], b["ultimo"]
        if i and u and RE_FECHA_ISO.match(i) and RE_FECHA_ISO.match(u) and i > u:
            a.append({"tipo": "rango-invertido", "base": nro,
                      "detalle": f"Empieza en {i} y termina en {u}: el inicio es posterior al final."})
        if b["frecuencia"] and not b["frecuencia_norm"]:
            a.append({"tipo": "frecuencia-desconocida", "base": nro,
                      "detalle": f"Frecuencia '{b['frecuencia']}' fuera de la lista conocida."})
    return a


def leer_entregas():
    """Archivos efectivamente recibidos por carpeta raw/entrega-NN/."""
    recibidos, ignorados = {}, []
    raw = os.path.join(RAIZ, "raw")
    for carpeta in sorted(os.listdir(raw)):
        if not carpeta.startswith("entrega-"):
            continue
        ruta = os.path.join(raw, carpeta)
        if not os.path.isdir(ruta):
            continue
        recibidos[carpeta] = {}
        for nombre in sorted(os.listdir(ruta)):
            if nombre.startswith("~$") or nombre.startswith("."):
                ignorados.append(f"{carpeta}/{nombre}")
                continue
            if not nombre.lower().endswith((".xlsx", ".xls", ".csv")):
                ignorados.append(f"{carpeta}/{nombre}")
                continue
            m = RE_NRO_ARCHIVO.match(nombre)
            if not m:
                ignorados.append(f"{carpeta}/{nombre}")
                continue
            recibidos[carpeta][int(m.group(1))] = nombre
    return recibidos, ignorados


def leer_derivados():
    """Bases con parquet en staging/ y con paginas en el sitio (src/tableros/contenido/paginas/)."""
    en_staging, en_sitio = set(), set()
    for base_dir, patron, destino in (
        (os.path.join(RAIZ, "staging"), re.compile(r"(?:^|[^0-9])(\d+)-"), en_staging),
        (os.path.join(RAIZ, "..", "src", "tableros", "contenido", "paginas"), re.compile(r"base-(\d+)"), en_sitio),
    ):
        for dirpath, _, archivos in os.walk(base_dir):
            for nombre in archivos:
                rel = os.path.relpath(os.path.join(dirpath, nombre), base_dir)
                m = patron.search(rel)
                if m:
                    destino.add(int(m.group(1)))
    return en_staging, en_sitio


# ------------------------------------------------------------ construccion

def construir(version):
    ruta = ruta_indice(version)
    if not os.path.exists(ruta):
        sys.exit(f"[indice] No existe {ruta}")
    wb = openpyxl.load_workbook(ruta, data_only=True)
    hojas = list(wb.sheetnames)
    leidas = [h for h in hojas if not HOJAS_IGNORADAS.match(h)]
    ignoradas = [h for h in hojas if HOJAS_IGNORADAS.match(h)]
    esperadas = {"GENERAL", "Org tematica", "Lista de bases y notas"}
    nuevas = [h for h in leidas if h not in esperadas]

    bases, placeholders, sueltas = parse_general(wb["GENERAL"])
    org, marcas = parse_org(wb["Org tematica"]) if "Org tematica" in hojas else ([], [])
    lista, lista_encabezado = (parse_lista(wb["Lista de bases y notas"])
                               if "Lista de bases y notas" in hojas else ([], []))

    # --- org: adherir tema, entrega y notas a cada base
    org_por_nro, cruzadas, huerfanas = {}, [], []
    for f in org:
        if f["nro"] is None:
            cruzadas.append(f)
            continue
        if f["nro"] not in bases:
            huerfanas.append(f)
        org_por_nro.setdefault(f["nro"], []).append(f)

    lista_por_nro = {}
    for it in lista:
        if it["nro"] is not None:
            lista_por_nro.setdefault(it["nro"], []).append(it)

    recibidos, ignorados_raw = leer_entregas()
    en_staging, en_sitio = leer_derivados()

    salida = []
    for nro, b in sorted(bases.items()):
        apariciones = org_por_nro.get(nro, [])
        principal = next((a for a in apariciones if a["bloque"] == "acceso-por-tema"),
                         apariciones[0] if apariciones else None)
        entrega = next((a["entrega"] for a in apariciones if a["entrega"]), None)
        notas = [n for a in apariciones for n in a["notas"]]
        denominaciones = sorted({a["descripcion"] for a in apariciones
                                 if a["descripcion"] != b["descripcion"]})

        reg = {
            "nro": nro,
            "slug": slug(b["descripcion"]),
            "descripcion": b["descripcion"],
            "ubicacion": b["ubicacion"],
            "fuente": b["fuente"],
            "frecuencia": b["frecuencia_norm"] or b["frecuencia"],
            "rango_declarado": {"inicio": b["inicio"], "ultimo": b["ultimo"]},
            "registros_declarados": b["registros"],
            "productos": b["productos"],
            "unidades": b["unidades"],
            "geografia": b["geografia"],
            "tema": None,
            "entrega": entrega,
            "observaciones": b["observaciones"],
            "notas_jc": notas,
            "denominaciones": denominaciones,
            "alias_historicos": [],
        }
        if principal:
            reg["tema"] = {
                "bloque": principal["bloque"],
                "ruta": principal["ruta"],
                "subtemas_del_bloque": principal["subtemas_del_bloque"],
            }
            otros = [{"bloque": a["bloque"], "ruta": a["ruta"], "marca": a["marca"]}
                     for a in apariciones if a is not principal]
            if otros:
                reg["tema_secundario"] = otros
        if nro in DEMO_PRIORITARIA:
            reg["demo_prioritaria"] = True
        if entrega:
            det = lista_por_nro.get(nro, [])
            reg["detalle_entrega"] = {
                "orden_en_lista": det[0]["orden"] if det else None,
                "referencia_jc": det[0]["ref"] if det else None,
                "hojas_declaradas": det[0]["hojas"] if det else [],
                "contenido": det[0]["contenido"] if det else None,
                "estatus_modelo": det[0]["estatus"] if det else None,
                "observaciones_jc": det[0]["observaciones"] if det else [],
                "archivo_recibido": recibidos.get(entrega, {}).get(nro),
            }
        reg["estado"] = {
            "prometida_en": entrega,
            "recibida": bool(entrega and recibidos.get(entrega, {}).get(nro)),
            "en_staging": nro in en_staging,
            "publicada": nro in en_sitio,
        }
        salida.append(reg)

    por_entrega = {}
    for nombre in sorted(set(list(ENTREGAS.values()) + list(recibidos))):
        declaradas = sorted(r["nro"] for r in salida if r["entrega"] == nombre)
        rec = recibidos.get(nombre, {})
        if not declaradas and not rec:
            continue
        por_entrega[nombre] = {
            "marca_en_indice": next((a["marca_entrega"] for a in org
                                     if a["entrega"] == nombre), None),
            "declaradas": len(declaradas),
            "bases_declaradas": declaradas,
            "archivos_recibidos": len(rec),
            "bases_recibidas": sorted(rec),
            "declaradas_sin_recibir": sorted(set(declaradas) - set(rec)),
            "recibidas_sin_declarar": sorted(set(rec) - set(declaradas)),
            "en_staging": sorted(set(declaradas) & en_staging),
            "publicadas": sorted(set(declaradas) & en_sitio),
        }

    anomalias = anomalias_general(bases, placeholders, sueltas)
    for f in huerfanas:
        anomalias.append({"tipo": "base-sin-ficha", "base": f["nro"],
                          "detalle": f"La base {f['nro']} aparece en 'Org tematica' "
                                     "pero no tiene fila en GENERAL."})
    sin_tema = [r["nro"] for r in salida if r["tema"] is None]
    if sin_tema:
        anomalias.append({"tipo": "sin-tema", "detalle":
                          f"{len(sin_tema)} bases de GENERAL no figuran en el arbol "
                          "tematico todavia."})
    for r in salida:
        if r["entrega"] and not r["estado"]["recibida"]:
            anomalias.append({"tipo": "prometida-no-recibida", "base": r["nro"],
                              "detalle": f"Marcada para {r['entrega']} y sin archivo en raw/."})
        if r["entrega"] and not r["fuente"]:
            anomalias.append({"tipo": "sin-fuente", "base": r["nro"],
                              "detalle": "Va en la entrega y no tiene fuente declarada; "
                                         "la fuente es obligatoria al pie de cada cuadro."})
    for nombre, e in por_entrega.items():
        for nro in e["recibidas_sin_declarar"]:
            anomalias.append({"tipo": "recibida-no-declarada", "base": nro,
                              "detalle": f"Llego en {nombre} sin estar marcada en el indice."})

    manifiesto = {
        "indice": {
            "version": version,
            "archivo": os.path.basename(ruta),
            "fecha_version": fecha_modificacion(ruta),
            "sha256": sha256(ruta),
            "baseline": True,
            "version_anterior": None,
            "hojas": hojas,
            "hojas_leidas": leidas,
            "hojas_ignoradas": ignoradas,
            "hojas_nuevas_no_previstas": nuevas,
            "bases_en_general": len(bases),
            "numeros_reservados_sin_contenido": placeholders,
            "notas_de_encabezado": lista_encabezado,
            "marcas_de_navegacion": [m["texto"] for m in marcas],
            "informes_coyunturales": (
                "Esta version no trae hoja 'Informes coyunturales'. Cuando aparezca, sus "
                "filas van a corpus/indice-corpus.yaml, separadas de las bases tabulares."
                if "Informes coyunturales" not in hojas else "ver corpus/indice-corpus.yaml"),
        },
        "convenciones": {
            "fuente_de_verdad": "El indice declara INTENCION (que bases habra), nunca datos.",
            "registros_declarados": ("Conteo de la base nacional completa. El recorte de "
                                     "Santiago del Estero siempre es menor: usar solo como "
                                     "orden de magnitud, nunca como validacion dura."),
            "rango_declarado": "Cobertura que promete la fuente, no la del archivo recibido.",
            "unidades_y_geografia": ("Copia literal de las columnas 'Var unit' y 'Var geog' de "
                                     "JC. A veces traen la unidad ('tn', 'depart') y a veces "
                                     "un conteo ('7' = siete provincias). Son una pista para "
                                     "el config de la base, no un contrato."),
            "alias_historicos": ("Si JC renumera o renombra una base, se anota aca el numero "
                                 "o nombre viejo para no romper configs ni specs."),
        },
        "demo_prioritaria": DEMO_PRIORITARIA,
        "entregas": por_entrega,
        "anomalias_del_indice": anomalias,
        "referencias_cruzadas": [
            {"fila": f["fila"], "texto": f["descripcion"], "ruta": f["ruta"]}
            for f in cruzadas
        ],
        "bases": salida,
    }
    return manifiesto, recibidos, ignorados_raw, en_staging, en_sitio


# --------------------------------------------------------------- escritura

CABECERA = """\
# Manifiesto del indice de JC ("Bases para Beta").
# GENERADO por pipeline/indice.py a partir de raw/indice/{archivo}.
# NO editar a mano: se regenera con `.venv/bin/python -m pipeline.indice`.
#
# Que es: el catalogo de bases que JC declara que existen, con su fuente,
# frecuencia, cobertura y en que entrega vienen. Es intencion, no datos.
# Lo consumen: ingestor-bases (hereda fuente/frecuencia/rango a cada config),
# qa-datos (cobertura temporal declarada) y constructor-reglas (estatus del
# modelo de analisis de cada base).
"""


def escribir_manifiesto(m):
    ruta = os.path.join(RAIZ, "configs", "manifiesto-indice.yaml")
    cuerpo = yaml.safe_dump(m, sort_keys=False, allow_unicode=True,
                            default_flow_style=False, width=100)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(CABECERA.format(archivo=m["indice"]["archivo"]))
        f.write(cuerpo)
    return ruta


def escribir_versiones(m):
    ruta = os.path.join(DIR_CONFIGS, "indice-versiones.yaml")
    versiones = []
    for nombre in sorted(os.listdir(DIR_INDICE)):
        if not nombre.endswith(".xlsx") or nombre.startswith("~$"):
            continue
        r = os.path.join(DIR_INDICE, nombre)
        num = re.search(r"-\s*(\d+)\.xlsx$", nombre)
        v = int(num.group(1)) if num else None
        versiones.append({
            "version": v,
            "archivo": nombre,
            "fecha_version": fecha_modificacion(r),
            "sha256": sha256(r),
            "bytes": os.path.getsize(r),
            "vigente": v == m["indice"]["version"],
        })
    doc = {
        "descripcion": ("Versiones del indice de JC guardadas en raw/indice/. "
                        "raw/ es inmutable: cada version nueva se agrega, ninguna se pisa."),
        "version_vigente": m["indice"]["version"],
        "versiones": sorted(versiones, key=lambda x: (x["version"] is None, x["version"])),
    }
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("# Inventario de versiones del indice de JC (raw/indice/*.xlsx).\n"
                "# GENERADO por pipeline/indice.py. NO editar a mano.\n"
                "# Vive en configs/ y no en raw/ porque raw/ es de solo lectura.\n")
        yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True,
                       default_flow_style=False, width=100)
    return ruta


def marca(ok):
    return "si" if ok else "no"


def rangos(nros):
    """[1,2,3,7,8] -> '1 a 3, 7 y 8'. Para listas largas de numeros de base."""
    nros = sorted(nros)
    if not nros:
        return "ninguna"
    tramos, inicio, previo = [], nros[0], nros[0]
    for n in nros[1:] + [None]:
        if n == previo + 1:
            previo = n
            continue
        if inicio == previo:
            tramos.append(str(inicio))
        elif previo - inicio == 1:      # un par suelto se lee mejor separado
            tramos += [str(inicio), str(previo)]
        else:
            tramos.append(f"{inicio} a {previo}")
        inicio = previo = n
    if len(tramos) == 1:
        return tramos[0]
    return ", ".join(tramos[:-1]) + " y " + tramos[-1]


BLOQUES = {
    "acceso-por-tema": "",
    "acceso-por-territorio": "Acceso por territorio",
    "bases-genericas": "Bases genericas",
}


def nombre_tema(base, niveles=None):
    """Ruta tematica legible, con el bloque de navegacion adelante si no es el tematico."""
    if not base["tema"]:
        return "sin ubicar"
    ruta = base["tema"]["ruta"][:niveles] if niveles else base["tema"]["ruta"]
    prefijo = BLOQUES.get(base["tema"]["bloque"], "")
    return " / ".join(([prefijo] if prefijo else []) + list(ruta))


def escribir_cobertura(m, ignorados_raw):
    ruta = os.path.join(RAIZ, "docs", "cobertura.md")
    ind = m["indice"]
    L = []
    L.append("# Pivotal · Cobertura: que se prometio, que llego, que se publico")
    L.append("")
    L.append(f"> Generado por `pipeline/indice.py` desde `raw/indice/{ind['archivo']}` "
             f"(version {ind['version']}, del {ind['fecha_version']}). "
             "No editar a mano. Se regenera con `.venv/bin/python -m pipeline.indice`.")
    L.append("")
    L.append("Esta es la planilla de control del proyecto: cruza las tres listas que tienen "
             "que cerrar siempre. Lo que JC promete en el indice, lo que efectivamente llego "
             "en Excel, lo que el pipeline ya proceso y lo que ve JC en el sitio.")
    L.append("")
    L.append("## Resumen")
    L.append("")
    L.append(f"- Bases catalogadas en el indice: **{ind['bases_en_general']}**.")
    reservados = ind["numeros_reservados_sin_contenido"]
    if reservados:
        L.append(f"- Numeros de base reservados y todavia vacios: "
                 f"{', '.join(str(n) for n in reservados)}.")
    con_tema = sum(1 for b in m["bases"] if b["tema"])
    L.append(f"- Bases ya ubicadas en el arbol tematico: **{con_tema}** "
             f"de {ind['bases_en_general']}.")
    asignadas = sum(1 for b in m["bases"] if b["entrega"])
    L.append(f"- Bases con entrega asignada: **{asignadas}**. "
             f"El resto todavia no tiene fecha.")
    L.append("")
    for nombre, e in m["entregas"].items():
        L.append(f"### {nombre}")
        L.append("")
        L.append(f"- Prometidas en el indice: **{e['declaradas']}**")
        L.append(f"- Archivos recibidos en `raw/{nombre}/`: **{e['archivos_recibidos']}**")
        L.append(f"- Procesadas (staging): **{len(e['en_staging'])}**")
        L.append(f"- Publicadas en el sitio: **{len(e['publicadas'])}**")
        faltan = e["declaradas_sin_recibir"]
        sobran = e["recibidas_sin_declarar"]
        L.append(f"- Prometidas que no llegaron: "
                 f"{', '.join(str(n) for n in faltan) if faltan else 'ninguna'}")
        L.append(f"- Llegaron sin estar prometidas: "
                 f"{', '.join(str(n) for n in sobran) if sobran else 'ninguna'}")
        L.append("")
    L.append("## Tabla de cobertura")
    L.append("")
    L.append("Solo las bases con entrega asignada. Las demas estan catalogadas en "
             "`configs/manifiesto-indice.yaml` y todavia no tienen fecha de envio.")
    L.append("")
    L.append("| Base | Descripcion | Tema | Prometida en | Recibida | Staging | Publicada | Modelo de analisis |")
    L.append("|---|---|---|---|---|---|---|---|")
    for b in m["bases"]:
        if not b["entrega"]:
            continue
        det = b.get("detalle_entrega", {})
        est = b["estado"]
        demo = " (demo)" if b.get("demo_prioritaria") else ""
        L.append(f"| {b['nro']}{demo} | {b['descripcion']} | {nombre_tema(b)} | {b['entrega']} | "
                 f"{marca(est['recibida'])} | {marca(est['en_staging'])} | "
                 f"{marca(est['publicada'])} | {det.get('estatus_modelo') or '-'} |")
    L.append("")
    L.append(f"Las marcadas *(demo)* son las {len(m['demo_prioritaria'])} bases de la demo "
             "prioritaria: cuentan la historia completa de que se produce, donde, como se "
             "mueve y con que clima.")
    L.append("")
    L.append("## Bases catalogadas sin entrega asignada")
    L.append("")
    sin = [b for b in m["bases"] if not b["entrega"]]
    L.append(f"Son **{len(sin)}**. Estan descriptas en el indice (fuente, frecuencia, "
             "cobertura y volumen) pero JC todavia no las marco para ninguna entrega. "
             "Detalle completo en `configs/manifiesto-indice.yaml`.")
    L.append("")
    L.append("| Tema | Bases |")
    L.append("|---|---|")
    por_tema = {}
    for b in sin:
        tema = nombre_tema(b, niveles=2) if b["tema"] else "sin ubicar en el arbol"
        por_tema.setdefault(tema, []).append(b["nro"])
    for tema in sorted(por_tema, key=lambda t: (t == "sin ubicar en el arbol", t)):
        nros = por_tema[tema]
        L.append(f"| {tema} | {len(nros)}: {rangos(nros)} |")
    L.append("")
    L.append("## Decisiones que JC dejo escritas en el indice")
    L.append("")
    L.append("Textos en mayusculas y notas al margen de la planilla. Suelen ser decisiones "
             "de producto, no comentarios sueltos.")
    L.append("")
    for nota in ind["notas_de_encabezado"]:
        L.append(f"- {nota}")
    for b in m["bases"]:
        for nota in b["notas_jc"]:
            L.append(f"- Base {b['nro']} ({b['descripcion']}): {nota}")
    for c in m["referencias_cruzadas"]:
        L.append(f"- {c['texto']} (aparece de nuevo bajo {' / '.join(c['ruta'])}).")
    L.append("")
    L.append("## Archivos ignorados al contar")
    L.append("")
    if ignorados_raw:
        for x in ignorados_raw:
            L.append(f"- `{x}` (archivo temporal o de bloqueo de Excel, no es una base).")
    else:
        L.append("- Ninguno.")
    L.append("")
    L.append("## Cosas a mirar del indice")
    L.append("")
    L.append("Rarezas detectadas en la planilla de JC. No se corrigen del lado nuestro: "
             "las decide JC.")
    L.append("")
    for a in m["anomalias_del_indice"]:
        base = f"Base {a['base']}: " if a.get("base") else ""
        L.append(f"- {base}{a['detalle']}")
    L.append("")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    return ruta


def main(argv=None):
    p = argparse.ArgumentParser(prog="pipeline.indice")
    p.add_argument("--version", type=int, default=VERSION_VIGENTE)
    ns = p.parse_args(argv)
    m, recibidos, ignorados_raw, _, _ = construir(ns.version)
    r1 = escribir_manifiesto(m)
    r2 = escribir_versiones(m)
    r3 = escribir_cobertura(m, ignorados_raw)
    print(f"[indice] version {ns.version}: {m['indice']['bases_en_general']} bases catalogadas")
    for nombre, e in m["entregas"].items():
        print(f"[indice] {nombre}: {e['declaradas']} prometidas / "
              f"{e['archivos_recibidos']} recibidas / {len(e['en_staging'])} en staging / "
              f"{len(e['publicadas'])} publicadas")
    print(f"[indice] anomalias del indice: {len(m['anomalias_del_indice'])}")
    for r in (r1, r2, r3):
        print(f"[indice] escrito {os.path.relpath(r, RAIZ)}")


if __name__ == "__main__":
    main()
