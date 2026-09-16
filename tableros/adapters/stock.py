"""Adapter de la familia `stock` (existencias por categoria).

Familia stock = una foto de cuantos animales HAY, con las categorias abiertas a lo ancho:
una fila por anio y unidad geografica, y una columna por categoria (Vacas, Vaquillonas,
Novillos, ...) mas una columna de total. Primera base que la usa: 48 (stocks bovinos por
departamento, MAGyP).

Por que es una familia y no una de las ocho de CLAUDE.md: no es `tidy` (ahi 1 fila = 1
observacion y lo que se despivotea son MEDIDAS distintas), no es `dte` (no hay origen-destino,
ni motivo, ni mes) y no es `wide-mes` (lo que abre a lo ancho es la categoria, no el mes).

Que hace el adapter, y solo eso:

1. Lee las hojas declaradas en `hojas.datos`, cada una con su fila de header. Las hojas de
   `hojas.ignorar` y `hojas.pendientes` ni se abren.
2. Renombra columnas origen -> canonico segun `columnas`. Si aparece una columna del Excel
   sin mapeo, FALLA: nada se descarta en silencio.
3. Despivotea las columnas declaradas en `valores` a filas (categoria, rol, medida, valor).
4. Resuelve la geografia contra configs/dims/geo-alias.yaml. Si el config pide
   `geo.normalizar_nombre`, el nombre se busca normalizado (mayusculas, sin tildes): la
   fuente escribe el mismo departamento de varias formas y eso es errata de tipeo, no un
   nombre alternativo. Un departamento sin match FALLA (va al alias, nunca se dropea).
5. Marca las filas de agregado (las que traen en la columna de departamento una de las
   etiquetas de `geo.agregados.nombres_total`) con es_agregado_geo=true. Se marcan, no se
   borran, y no entran a ningun total: el que suma es marts.

Lo que NO hace: no valida calidad (eso es qa-datos), no calcula participaciones ni variaciones
(eso es marts), no corrige un valor jamas (las cabezas fraccionarias de la base 48 entran tal
cual vienen) y no dropea filas.

Determinismo: sin timestamps, sin aleatoriedad, y las filas salen en el orden en que estan en
el Excel (hoja por hoja, en el orden del config).
"""
import os
import unicodedata

import openpyxl
import polars as pl
import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_ALIAS = os.path.join(RAIZ, "configs", "dims", "geo-alias.yaml")

# Columnas canonicas de salida, en orden fijo. El schema es el mismo para toda la familia.
COLUMNAS_SALIDA = [
    "base_id",
    "entrega",
    "hoja",
    "ambito",
    "fila_origen",
    "grano_tiempo",
    "anio",
    "provincia",
    "provincia_nombre",
    "provincia_id",
    "nivel_geo",
    "departamento",
    "geo_nombre",
    "geo_id",
    "es_agregado_geo",
    "variable",
    "especie",
    "categoria",
    "categoria_rol",
    "medida",
    "medida_etiqueta",
    "unidad",
    "agregable",
    "valor",
    "fuente",
]

ESQUEMA_SALIDA = {
    "base_id": pl.Int64,
    "entrega": pl.Utf8,
    "hoja": pl.Utf8,
    "ambito": pl.Utf8,
    "fila_origen": pl.Int64,
    "grano_tiempo": pl.Utf8,
    "anio": pl.Int64,
    "provincia": pl.Utf8,
    "provincia_nombre": pl.Utf8,
    "provincia_id": pl.Int64,
    "nivel_geo": pl.Utf8,
    "departamento": pl.Utf8,
    "geo_nombre": pl.Utf8,
    "geo_id": pl.Utf8,
    "es_agregado_geo": pl.Boolean,
    "variable": pl.Utf8,
    "especie": pl.Utf8,
    "categoria": pl.Utf8,
    "categoria_rol": pl.Utf8,
    "medida": pl.Utf8,
    "medida_etiqueta": pl.Utf8,
    "unidad": pl.Utf8,
    "agregable": pl.Boolean,
    "valor": pl.Float64,
    "fuente": pl.Utf8,
}


def parse(config, path, entrega=None):
    """Devuelve un polars.DataFrame tidy con las columnas de COLUMNAS_SALIDA."""
    alias = _cargar_alias()
    filas = []
    libro = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        for hoja_cfg in config["hojas"]["datos"]:
            filas.extend(_parsear_hoja(config, libro, hoja_cfg, entrega, alias))
    finally:
        libro.close()
    return pl.DataFrame(filas, schema=ESQUEMA_SALIDA).select(COLUMNAS_SALIDA)


# ---------------------------------------------------------------------------
# Hoja
# ---------------------------------------------------------------------------
def _parsear_hoja(config, libro, hoja_cfg, entrega, alias):
    nombre_hoja = hoja_cfg["nombre"]
    if nombre_hoja not in libro.sheetnames:
        raise ValueError(
            "La hoja %r que declara el config no esta en el archivo. Hojas presentes: %s"
            % (nombre_hoja, libro.sheetnames)
        )
    hoja = libro[nombre_hoja]
    header_fila = int(hoja_cfg.get("header_fila", 1))

    mapeo = dict(config.get("columnas") or {})
    mapeo.update(hoja_cfg.get("columnas") or {})
    mapeo = {_texto(k): v for k, v in mapeo.items()}

    valores = config["valores"]
    fuente = (config.get("indice") or {}).get("fuente")
    grano = (config.get("tiempo") or {}).get("grano", "anio")

    filas = []
    posiciones = None
    for nro_fila, celdas in enumerate(hoja.iter_rows(values_only=True), start=1):
        if nro_fila < header_fila:
            continue
        if nro_fila == header_fila:
            posiciones = _mapear_header(celdas, mapeo, nombre_hoja)
            continue
        if all(_es_vacia(c) for c in celdas):
            continue  # fila totalmente vacia (relleno del Excel), no es un dato
        cruda = {campo: _celda(celdas, pos) for campo, pos in posiciones.items()}
        if _es_vacia(cruda.get("anio")):
            continue  # pie de tabla del Excel (ej. "Fuente: SENASA"), no es una observacion
        filas.extend(
            _filas_de_observacion(config, hoja_cfg, cruda, nro_fila, entrega, valores,
                                  fuente, grano, alias)
        )
    return filas


def _mapear_header(celdas, mapeo, nombre_hoja):
    """Header origen -> {campo_canonico: indice_de_columna}. Falla si sobra una columna."""
    posiciones = {}
    sin_mapeo = []
    for i, celda in enumerate(celdas):
        titulo = _texto(celda)
        if not titulo:
            continue
        if titulo not in mapeo:
            sin_mapeo.append(titulo)
            continue
        posiciones[mapeo[titulo]] = i
    if sin_mapeo:
        raise ValueError(
            "La hoja %r tiene columnas sin mapeo en el config: %s. "
            "Agregalas a `columnas` (o a hojas.datos[].columnas) antes de ingerir."
            % (nombre_hoja, sin_mapeo)
        )
    return posiciones


def _filas_de_observacion(config, hoja_cfg, cruda, nro_fila, entrega, valores,
                          fuente, grano, alias):
    """Una fila del Excel -> una fila de salida por cada columna de valor declarada."""
    anio = _entero(cruda.get("anio"))
    if anio is None:
        raise ValueError(
            "Fila %d de la hoja %r: el anio %r no es un numero."
            % (nro_fila, hoja_cfg["nombre"], cruda.get("anio"))
        )
    geo = _resolver_geo(config, cruda, nro_fila, hoja_cfg["nombre"], alias)

    salida = []
    for campo, meta in valores.items():
        if campo not in cruda:
            continue  # la hoja no trae esa columna; se anota por ausencia, no se inventa
        fila = {
            "base_id": int(config["base"]),
            "entrega": entrega,
            "hoja": hoja_cfg["nombre"],
            "ambito": hoja_cfg.get("ambito"),
            "fila_origen": nro_fila,
            "grano_tiempo": grano,
            "anio": anio,
            # `variable` es el nombre canonico de la columna del Excel de la que sale este
            # valor. Junto con fila_origen identifica la celda de origen, asi que es la clave
            # unica de la fila de salida y el criterio de orden de los marts.
            "variable": campo,
            "especie": meta.get("especie"),
            "categoria": meta.get("categoria"),
            "categoria_rol": meta.get("rol"),
            "medida": meta.get("medida"),
            "medida_etiqueta": meta.get("etiqueta"),
            "unidad": meta.get("unidad"),
            "agregable": bool(meta.get("agregable", True)),
            # Nulo y cero NO son lo mismo: "Cantidad de UP" viene vacia en los anios que la
            # fuente no informa, y eso tiene que llegar al mart como nulo.
            "valor": _numero(cruda.get(campo), nro_fila, campo, hoja_cfg["nombre"]),
            "fuente": fuente,
        }
        fila.update(geo)
        salida.append(fila)
    return salida


# ---------------------------------------------------------------------------
# Geografia (una sola punta)
# ---------------------------------------------------------------------------
def _cargar_alias():
    with open(RUTA_ALIAS, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _resolver_geo(config, cruda, nro_fila, nombre_hoja, alias):
    geo_cfg = config.get("geo") or {}
    normalizar = bool(geo_cfg.get("normalizar_nombre"))
    nombres_total = set((geo_cfg.get("agregados") or {}).get("nombres_total") or [])

    provincia = _texto(cruda.get("provincia_nombre"))
    departamento = _texto(cruda.get("departamento"))

    if provincia is None:
        raise ValueError(
            "Fila %d de la hoja %r: no trae provincia." % (nro_fila, nombre_hoja)
        )
    provincia_id = (alias.get("provincia") or {}).get(provincia)
    if provincia_id is None:
        raise ValueError(
            "Fila %d de la hoja %r: la provincia %r no esta en geo-alias.yaml. Agregala con "
            "su codigo INDEC (nunca se dropea una fila por geografia)."
            % (nro_fila, nombre_hoja, provincia)
        )

    # Fila de agregado embebida entre el detalle. Se marca y se le deja el geo de la
    # provincia; no se le inventa un codigo de departamento.
    if departamento in nombres_total:
        return {
            "provincia": geo_cfg.get("particion", "sde"),
            "provincia_nombre": provincia,
            "provincia_id": provincia_id,
            "nivel_geo": "provincia",
            "departamento": departamento,
            # `geo_nombre` es el nombre CANONICO (mayusculas, sin tildes): es el vocabulario
            # que usan las otras familias, los checks genericos y dim_geo. `departamento`
            # guarda el nombre tal cual lo escribe el Excel, con sus erratas, para poder
            # rastrear cada dato hasta su celda de origen.
            "geo_nombre": _normalizar(provincia),
            "geo_id": None,
            "es_agregado_geo": True,
        }

    if departamento is None:
        raise ValueError(
            "Fila %d de la hoja %r: no trae departamento y tampoco es una fila de total."
            % (nro_fila, nombre_hoja)
        )

    if provincia_id not in set(geo_cfg.get("resolver") or []):
        # Provincia fuera del alcance declarado: se guarda el nombre tal cual viene y el
        # geo_id queda nulo. No se inventa un codigo de departamento.
        return {
            "provincia": geo_cfg.get("particion", "sde"),
            "provincia_nombre": provincia,
            "provincia_id": provincia_id,
            "nivel_geo": "departamento",
            "departamento": departamento,
            "geo_nombre": _normalizar(departamento),
            "geo_id": None,
            "es_agregado_geo": False,
        }

    deptos = (alias.get("departamentos") or {}).get(provincia_id) or {}
    if normalizar:
        # La tabla de alias ya esta escrita en mayusculas y sin tildes, asi que normalizar el
        # nombre de la fuente lo hace matchear sin agregar una entrada por cada errata.
        indice = {_normalizar(k): v for k, v in deptos.items()}
        clave = _normalizar(departamento)
    else:
        indice = deptos
        clave = departamento
    if clave not in indice:
        raise ValueError(
            "Fila %d de la hoja %r: el departamento %r (provincia %s) no esta en "
            "geo-alias.yaml. Agregalo con su codigo INDEC; jamas se dropea la fila."
            % (nro_fila, nombre_hoja, departamento, provincia)
        )
    return {
        "provincia": geo_cfg.get("particion", "sde"),
        "provincia_nombre": provincia,
        "provincia_id": provincia_id,
        "nivel_geo": "departamento",
        "departamento": departamento,
        "geo_nombre": _normalizar(departamento),
        "geo_id": str(indice[clave]),
        "es_agregado_geo": False,
    }


# ---------------------------------------------------------------------------
# Utilidades chicas
# ---------------------------------------------------------------------------
def _normalizar(texto):
    """Mayusculas, sin tildes y con los espacios colapsados. Determinista."""
    if texto is None:
        return None
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", str(texto))
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(sin_tildes.upper().split())


def _texto(valor):
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def _es_vacia(celda):
    return celda is None or (isinstance(celda, str) and not celda.strip())


def _celda(celdas, pos):
    return celdas[pos] if pos < len(celdas) else None


def _entero(valor):
    if _es_vacia(valor):
        return None
    try:
        return int(str(valor).strip())
    except ValueError:
        return None


def _numero(valor, nro_fila, campo, nombre_hoja):
    """Numero o nulo. Un texto en una columna de valor FALLA: no se convierte a cero."""
    if _es_vacia(valor):
        return None
    if isinstance(valor, bool):
        raise ValueError(
            "Fila %d de la hoja %r: la columna %r trae un booleano."
            % (nro_fila, nombre_hoja, campo)
        )
    try:
        return float(valor)
    except (TypeError, ValueError):
        raise ValueError(
            "Fila %d de la hoja %r: la columna %r trae %r, que no es un numero. "
            "No se convierte a cero: el dato se revisa en el Excel."
            % (nro_fila, nombre_hoja, campo, valor)
        )
