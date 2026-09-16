"""Adapter de la familia `dte` (DTE agregado SENASA).

Familia dte = movimientos de hacienda agregados por documento de transito (DTE).
Cada fila del Excel es una combinacion motivo + tipo de origen + tipo de destino +
mes + par de departamentos (origen -> destino), y las cabezas vienen WIDE, una
columna por categoria (TERNEROS, TERNERAS, NOVILLITOS, ...). Primera base que la
usa: 85 (bovinos). Las bases 144 (porcinos) y 145 (ovinos) son de la misma familia
pero traen la categoria LONG; cuando entren, el config declara `categoria_long` y
este mismo adapter las lee sin tocar codigo.

Que hace el adapter, y solo eso:

1. Lee las hojas declaradas en `hojas.datos`, cada una con su fila de header (en la
   base 85 la hoja de origen tiene el header en r1 y la de destino en r2, porque
   arriba lleva un rotulo "INTRODUCCION").
2. Renombra columnas origen -> canonico segun `columnas`. Si aparece una columna del
   Excel sin mapeo, FALLA: nada se descarta en silencio.
3. Despivotea las columnas declaradas en `valores` a filas (especie, categoria, rol,
   medida, valor).
4. Resuelve la geografia de las dos puntas contra configs/dims/geo-alias.yaml. Solo
   les pone codigo INDEC a las provincias declaradas en `geo.resolver`; para el resto
   guarda provincia y partido como texto con geo_id nulo. Un departamento de una
   provincia declarada que no matchee FALLA (va al alias, nunca se dropea).
5. Marca las filas de agregado (la fila "total" que las dos hojas traen al pie, sin
   motivo ni anio) con es_agregado_fila=true. Se marcan, no se borran.

Lo que NO hace: no valida calidad (eso es qa-datos), no agrega ni netea flujos (eso
es marts), no dropea filas jamas.

Determinismo: sin timestamps, sin aleatoriedad, y las filas salen en el orden en que
estan en el Excel (hoja por hoja, en el orden del config).
"""
import os

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
    "sentido",
    "es_agregado_fila",
    "motivo",
    "tipo_origen",
    "tipo_destino",
    "grano_tiempo",
    "anio",
    "mes",
    "periodo",
    "orden_periodo",
    "provincia",
    "origen_provincia",
    "origen_provincia_id",
    "origen_departamento",
    "origen_geo_id",
    "destino_provincia",
    "destino_provincia_id",
    "destino_departamento",
    "destino_geo_id",
    "alcance",
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
    "sentido": pl.Utf8,
    "es_agregado_fila": pl.Boolean,
    "motivo": pl.Utf8,
    "tipo_origen": pl.Utf8,
    "tipo_destino": pl.Utf8,
    "grano_tiempo": pl.Utf8,
    "anio": pl.Int64,
    "mes": pl.Int64,
    "periodo": pl.Utf8,
    "orden_periodo": pl.Int64,
    "provincia": pl.Utf8,
    "origen_provincia": pl.Utf8,
    "origen_provincia_id": pl.Int64,
    "origen_departamento": pl.Utf8,
    "origen_geo_id": pl.Utf8,
    "destino_provincia": pl.Utf8,
    "destino_provincia_id": pl.Int64,
    "destino_departamento": pl.Utf8,
    "destino_geo_id": pl.Utf8,
    "alcance": pl.Utf8,
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
    grano = (config.get("tiempo") or {}).get("grano", "anio_mes")

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
    mes = _entero(cruda.get("mes"))
    motivo = _texto(cruda.get("motivo"))

    # Fila de agregado: las dos hojas traen al pie una fila con los totales y sin
    # ninguna de las columnas de clasificacion. Se marca, no se borra.
    es_agregado = anio is None and motivo is None
    geo = _resolver_geo(config, cruda, nro_fila, hoja_cfg["nombre"], alias, es_agregado)

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
            "sentido": hoja_cfg["sentido"],
            "es_agregado_fila": es_agregado,
            "motivo": motivo,
            "tipo_origen": _texto(cruda.get("tipo_origen")),
            "tipo_destino": _texto(cruda.get("tipo_destino")),
            "grano_tiempo": grano,
            "anio": anio,
            "mes": mes,
            "periodo": "%04d-%02d" % (anio, mes) if anio and mes else None,
            # Numero de mes corrido, para poder detectar huecos en la serie. Tiene que ser
            # CONTIGUO entre diciembre y enero: con anio*100+mes, 2022-12 y 2023-01 quedarian
            # a 89 de distancia y cualquier check de huecos inventaria 88 meses faltantes.
            "orden_periodo": anio * 12 + (mes - 1) if anio and mes else None,
            # `variable` es el nombre canonico de la columna del Excel de la que sale este
            # valor. Junto con (sentido, fila_origen) identifica la celda de origen, asi que
            # es la clave unica de la fila de salida y el criterio de orden de los marts.
            "variable": campo,
            "especie": meta.get("especie"),
            "categoria": meta.get("categoria"),
            "categoria_rol": meta.get("rol"),
            "medida": meta.get("medida"),
            "medida_etiqueta": meta.get("etiqueta"),
            "unidad": meta.get("unidad"),
            "agregable": bool(meta.get("agregable", True)),
            "valor": _numero(cruda.get(campo), nro_fila, campo, hoja_cfg["nombre"]),
            "fuente": fuente,
        }
        fila.update(geo)
        salida.append(fila)
    return salida


# ---------------------------------------------------------------------------
# Geografia (dos puntas: origen y destino)
# ---------------------------------------------------------------------------
def _cargar_alias():
    with open(RUTA_ALIAS, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _resolver_geo(config, cruda, nro_fila, nombre_hoja, alias, es_agregado):
    geo_cfg = config.get("geo") or {}
    resolver = set(geo_cfg.get("resolver") or [])
    propia = geo_cfg.get("provincia_propia")

    org = _resolver_punta(cruda.get("origen_provincia"), cruda.get("origen_departamento"),
                          resolver, alias, nro_fila, nombre_hoja, "origen", es_agregado)
    dst = _resolver_punta(cruda.get("destino_provincia"), cruda.get("destino_departamento"),
                          resolver, alias, nro_fila, nombre_hoja, "destino", es_agregado)

    if es_agregado:
        alcance = None
    elif org["provincia_id"] == propia and dst["provincia_id"] == propia:
        alcance = "interno"          # movimiento dentro de Santiago del Estero
    elif org["provincia_id"] == propia:
        alcance = "egreso"           # sale de la provincia
    elif dst["provincia_id"] == propia:
        alcance = "ingreso"          # entra a la provincia (introduccion)
    else:
        alcance = "ajeno"            # ninguna punta es la provincia propia

    return {
        "provincia": geo_cfg.get("particion", "sde"),
        "origen_provincia": org["provincia_nombre"],
        "origen_provincia_id": org["provincia_id"],
        "origen_departamento": org["departamento"],
        "origen_geo_id": org["geo_id"],
        "destino_provincia": dst["provincia_nombre"],
        "destino_provincia_id": dst["provincia_id"],
        "destino_departamento": dst["departamento"],
        "destino_geo_id": dst["geo_id"],
        "alcance": alcance,
    }


def _resolver_punta(provincia, departamento, resolver, alias, nro_fila, nombre_hoja,
                    punta, es_agregado):
    """Una punta del flujo. Codigo INDEC solo para las provincias que pide el config."""
    provincia = _texto(provincia)
    departamento = _texto(departamento)
    if provincia is None:
        if not es_agregado:
            raise ValueError(
                "Fila %d de la hoja %r: no trae provincia de %s y no es la fila de total."
                % (nro_fila, nombre_hoja, punta)
            )
        return {"provincia_nombre": None, "provincia_id": None,
                "departamento": None, "geo_id": None}

    provincia_id = (alias.get("provincia") or {}).get(provincia)
    if provincia_id is None:
        raise ValueError(
            "Fila %d de la hoja %r: la provincia de %s %r no esta en geo-alias.yaml. "
            "Agregala con su codigo INDEC (nunca se dropea una fila por geografia)."
            % (nro_fila, nombre_hoja, punta, provincia)
        )

    if provincia_id not in resolver:
        # Provincia fuera del alcance del proyecto: se guarda el nombre tal cual viene
        # y el geo_id queda nulo. No se inventa un codigo de departamento.
        return {"provincia_nombre": provincia, "provincia_id": provincia_id,
                "departamento": departamento, "geo_id": None}

    deptos = (alias.get("departamentos") or {}).get(provincia_id) or {}
    if departamento not in deptos:
        raise ValueError(
            "Fila %d de la hoja %r: el departamento de %s %r (provincia %s) no esta en "
            "geo-alias.yaml. Agregalo con su codigo INDEC; jamas se dropea la fila."
            % (nro_fila, nombre_hoja, punta, departamento, provincia)
        )
    return {"provincia_nombre": provincia, "provincia_id": provincia_id,
            "departamento": departamento, "geo_id": str(deptos[departamento])}


# ---------------------------------------------------------------------------
# Utilidades chicas
# ---------------------------------------------------------------------------
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
    if valor is None or valor == "":
        return None
    return int(valor)


def _numero(valor, nro_fila, campo, nombre_hoja):
    if valor is None or valor == "":
        return None
    if isinstance(valor, bool):
        raise ValueError("Fila %d, hoja %r, campo %r: valor booleano" % (nro_fila, nombre_hoja, campo))
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip().replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        raise ValueError(
            "Fila %d de la hoja %r: el campo %r trae %r, que no es numero. "
            "Resolvelo en el config, nunca editando el Excel."
            % (nro_fila, nombre_hoja, campo, valor)
        )
