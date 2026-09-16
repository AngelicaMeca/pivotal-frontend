"""Ingesta de una entrega de Excels: raw/entrega-NN/ -> staging/*.parquet.

Lo corre el agente ingestor-bases. Es la etapa `ingest` de pipeline/cli.py.

Que hace:
  1. Inventaria raw/<entrega>/: nombre, sha256, tamanio, fecha del archivo y numero de
     base sacado del nombre (^NN - ). Si un archivo no matchea el patron, FALLA y lo
     reporta: no se adivina el numero de base.
  2. Para cada config de configs/bases/*.yaml con estado: activa, busca el archivo de
     la entrega que matchee `archivo.patron` y lo parsea con el adapter de su familia.
     Las bases sin config todavia se listan como pendientes y no frenan la corrida.
  3. Escribe un parquet tidy por base en staging/ y el manifiesto de la entrega en
     configs/entregas/<entrega>.yaml (raw/ es de solo lectura, ahi no se escribe
     nada nunca).

Determinismo: sin timestamps ni mtime del filesystem (la fecha sale de los docProps del
propio xlsx), sin aleatoriedad, orden de filas = orden del Excel. Correr dos veces da el
mismo parquet byte a byte.

Uso:
    .venv/bin/python -m pipeline.cli ingest entrega-01
    .venv/bin/python -m pipeline.cli ingest --todas
"""
import argparse
import os
import re
import sys

import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if RAIZ not in sys.path:
    sys.path.insert(0, RAIZ)  # para importar el paquete adapters/ de la raiz del repo

from pipeline.indice import fecha_modificacion, sha256  # noqa: E402

DIR_RAW = os.path.join(RAIZ, "raw")
DIR_CONFIGS_BASES = os.path.join(RAIZ, "configs", "bases")
DIR_MANIFIESTOS = os.path.join(RAIZ, "configs", "entregas")

RE_NRO_ARCHIVO = re.compile(r"^(\d+) - ")
EXTENSIONES = (".xlsx", ".xls", ".csv")

# familia -> modulo con parse(config, path, entrega). Una entrada por familia de
# CLAUDE.md a medida que se van implementando.
ADAPTERS = {
    "tidy": "adapters.tidy",
    "dte": "adapters.dte",
    "stock": "adapters.stock",
}


# ------------------------------------------------------------------ inventario

def listar_entregas():
    return sorted(
        c for c in os.listdir(DIR_RAW)
        if c.startswith("entrega-") and os.path.isdir(os.path.join(DIR_RAW, c))
    )


def inventariar(entrega):
    """[(nro_base, nombre_archivo)] + lista de ignorados. Falla si un nombre no matchea."""
    ruta = os.path.join(DIR_RAW, entrega)
    if not os.path.isdir(ruta):
        sys.exit("[ingest] No existe la carpeta raw/%s" % entrega)
    archivos, ignorados, sin_numero = [], [], []
    for nombre in sorted(os.listdir(ruta)):
        if nombre.startswith("~$") or nombre.startswith("."):
            ignorados.append(nombre)  # temporal de Excel u oculto del sistema
            continue
        if not nombre.lower().endswith(EXTENSIONES):
            ignorados.append(nombre)
            continue
        m = RE_NRO_ARCHIVO.match(nombre)
        if not m:
            sin_numero.append(nombre)
            continue
        archivos.append((int(m.group(1)), nombre))
    if sin_numero:
        sys.exit(
            "[ingest] Archivos de raw/%s que no siguen el patron 'NN - Nombre.xlsx': %s\n"
            "         No se adivina el numero de base. Pedile a JC que los renombre o "
            "renombralos al copiarlos." % (entrega, sin_numero)
        )
    return archivos, ignorados


def cargar_configs():
    """[(ruta, config)] de configs/bases/, sin el template, ordenado por nro de base."""
    configs = []
    for nombre in sorted(os.listdir(DIR_CONFIGS_BASES)):
        if not nombre.endswith(".yaml") or nombre.startswith("_"):
            continue
        ruta = os.path.join(DIR_CONFIGS_BASES, nombre)
        with open(ruta, encoding="utf-8") as f:
            configs.append((ruta, yaml.safe_load(f)))
    configs.sort(key=lambda x: int(x[1]["base"]))
    return configs


# --------------------------------------------------------------------- ingesta

def parsear(config, ruta_archivo, entrega):
    familia = config["familia"]
    if familia not in ADAPTERS:
        sys.exit(
            "[ingest] La base %s es de la familia '%s' y todavia no hay adapter. "
            "Lo escribe ingestor-bases en adapters/%s.py" % (config["base"], familia, familia)
        )
    modulo = __import__(ADAPTERS[familia], fromlist=["parse"])
    return modulo.parse(config, ruta_archivo, entrega)


def ruta_staging(config):
    salida = (config.get("salida") or {}).get("staging")
    if not salida:
        salida = "staging/base-%02d-%s.parquet" % (int(config["base"]), config["slug"])
    return os.path.join(RAIZ, salida)


def resumen_por_hoja(df):
    """{hoja: {filas_salida, observaciones_excel}} en orden de aparicion."""
    resumen = {}
    for hoja in df["hoja"].to_list():
        if hoja not in resumen:
            resumen[hoja] = None
    for hoja in list(resumen):
        parcial = df.filter(df["hoja"] == hoja)
        resumen[hoja] = {
            "filas_staging": parcial.height,
            "filas_excel": parcial["fila_origen"].n_unique(),
        }
    return resumen


def procesar_entrega(entrega, configs):
    archivos, ignorados = inventariar(entrega)
    por_nro = {}
    for nro, nombre in archivos:
        por_nro.setdefault(nro, []).append(nombre)

    entradas = []
    for nro, nombres in sorted(por_nro.items()):
        for nombre in nombres:
            ruta_archivo = os.path.join(DIR_RAW, entrega, nombre)
            entrada = {
                "archivo": nombre,
                "base": nro,
                "sha256": sha256(ruta_archivo),
                "bytes": os.path.getsize(ruta_archivo),
                "fecha_archivo": fecha_modificacion(ruta_archivo),
                "familia": None,
                "config": None,
                "estado": "sin-config",
                "staging": None,
                "filas_staging": None,
                "hojas": None,
                "valores_nulos": None,
            }
            cfg = next((c for c in configs if _matchea(c[1], nro, nombre)), None)
            if cfg is not None:
                ruta_cfg, config = cfg
                entrada["config"] = os.path.relpath(ruta_cfg, RAIZ)
                entrada["familia"] = config["familia"]
                if config.get("estado", "activa") != "activa":
                    entrada["estado"] = "diferida"
                else:
                    df = parsear(config, ruta_archivo, entrega)
                    destino = ruta_staging(config)
                    os.makedirs(os.path.dirname(destino), exist_ok=True)
                    df.write_parquet(destino, compression="zstd", statistics=False)
                    entrada["estado"] = "ingerida"
                    entrada["staging"] = os.path.relpath(destino, RAIZ)
                    entrada["filas_staging"] = df.height
                    entrada["hojas"] = resumen_por_hoja(df)
                    entrada["valores_nulos"] = int(df["valor"].null_count())
                    print("[ingest] base %-4s %-40s %6d filas -> %s"
                          % (nro, config["slug"], df.height, entrada["staging"]))
            entradas.append(entrada)
    return entradas, ignorados


def _matchea(config, nro, nombre):
    if int(config["base"]) != nro:
        return False
    patron = (config.get("archivo") or {}).get("patron")
    return bool(re.search(patron, nombre)) if patron else True


# ----------------------------------------------------------------- manifiesto

def escribir_manifiesto(entrega, entradas, ignorados):
    os.makedirs(DIR_MANIFIESTOS, exist_ok=True)
    ruta = os.path.join(DIR_MANIFIESTOS, "%s.yaml" % entrega)
    manifiesto = {
        "descripcion": (
            "Manifiesto de la entrega: que archivos llegaron, con que hash, y que dejo "
            "cada uno en staging. GENERADO por pipeline/ingest.py, no editar a mano. "
            "Vive en configs/ y no en raw/ porque raw/ es de solo lectura."
        ),
        "entrega": entrega,
        "archivos_recibidos": len(entradas),
        "bases_ingeridas": sorted(e["base"] for e in entradas if e["estado"] == "ingerida"),
        "bases_sin_config": sorted(e["base"] for e in entradas if e["estado"] == "sin-config"),
        "bases_diferidas": sorted(e["base"] for e in entradas if e["estado"] == "diferida"),
        "archivos_ignorados": ignorados,
        "archivos": entradas,
    }
    with open(ruta, "w", encoding="utf-8") as f:
        yaml.safe_dump(manifiesto, f, sort_keys=False, allow_unicode=True,
                       default_flow_style=False, width=100)
    return ruta


# ------------------------------------------------------------------------ main

def main(args=None):
    p = argparse.ArgumentParser(prog="pipeline.ingest")
    p.add_argument("entrega", nargs="?", help="ej. entrega-01")
    p.add_argument("--todas", action="store_true", help="procesar todas las entregas de raw/")
    ns = p.parse_args(args)

    if ns.todas:
        entregas = listar_entregas()
    elif ns.entrega:
        entregas = [ns.entrega]
    else:
        p.error("indica una entrega (ej. entrega-01) o --todas")

    configs = cargar_configs()
    print("[ingest] configs de base activos: %s"
          % ", ".join(str(c["base"]) for _, c in configs) or "ninguno")

    for entrega in entregas:
        entradas, ignorados = procesar_entrega(entrega, configs)
        ruta = escribir_manifiesto(entrega, entradas, ignorados)
        ingeridas = [e for e in entradas if e["estado"] == "ingerida"]
        pendientes = [e for e in entradas if e["estado"] == "sin-config"]
        print("[ingest] %s: %d archivos recibidos, %d ingeridos, %d sin config todavia"
              % (entrega, len(entradas), len(ingeridas), len(pendientes)))
        print("[ingest] manifiesto en %s" % os.path.relpath(ruta, RAIZ))


if __name__ == "__main__":
    main(sys.argv[1:])
