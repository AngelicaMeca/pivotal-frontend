"""Marts: staging/*.parquet -> hechos + dimensiones (DuckDB).

Lo corre el agente ingestor-bases. Es la etapa `marts` de pipeline/cli.py.

Salida (todo regenerable, marts/ esta gitignoreado):

  marts/dim_geo.parquet                    geo_id INDEC -> nombre, nivel, provincia
  marts/dim_tiempo_campania.parquet        campania 2014/15 -> anio inicio / anio fin / orden
  marts/dim_tiempo_mes.parquet             periodo 2022-01 -> anio / mes / orden / etiqueta
  marts/dim_tiempo_dia.parquet             fecha -> anio / mes / dia / periodo / orden
  marts/hecho_cultivos.parquet             una fila por base-geo-campania-cultivo-medida
  marts/hecho_movimientos_hacienda.parquet una fila por base-flujo-periodo-categoria-medida
  marts/hecho_movimientos_vegetales.parquet una fila por base-DTV-medida (grano diario)
  marts/hecho_precios_mayoristas.parquet   una fila por base-cotizacion-medida (grano diario)

Que base alimenta que hecho lo dice el config de la base (`salida.mart`), no este
codigo. Lo que si sabe este codigo es que cada FAMILIA de schema tiene su propia forma
(la familia `tidy` es una observacion por geografia; la familia `dte` es un flujo, con
geografia en las dos puntas), asi que hay una proyeccion SQL por familia y las
dimensiones se arman uniendo lo que aporta cada una.

Los rankings, variaciones y participaciones NO se materializan todavia: se calculan
sobre estos hechos cuando constructor-reglas defina los specs (CLAUDE.md: nunca se
ingieren de las hojas de calculo del Excel).

Determinismo: todo ordenado explicitamente, sin timestamps.
"""
import argparse
import os
import sys

import duckdb
import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_CONFIGS_BASES = os.path.join(RAIZ, "configs", "bases")
DIR_STAGING = os.path.join(RAIZ, "staging")
DIR_MARTS = os.path.join(RAIZ, "marts")

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


# --------------------------------------------------------------------- configs

def bases_activas():
    """[(familia, mart, ruta_staging)] de los configs activos cuyo staging ya existe."""
    bases = []
    for nombre in sorted(os.listdir(DIR_CONFIGS_BASES)):
        if not nombre.endswith(".yaml") or nombre.startswith("_"):
            continue
        with open(os.path.join(DIR_CONFIGS_BASES, nombre), encoding="utf-8") as f:
            config = yaml.safe_load(f)
        if config.get("estado", "activa") != "activa":
            continue
        salida = config.get("salida") or {}
        mart, staging = salida.get("mart"), salida.get("staging")
        if not mart or not staging:
            continue
        ruta = os.path.join(RAIZ, staging)
        if os.path.exists(ruta):
            bases.append((config["familia"], mart, ruta))
    return bases


def rutas_de_familia(bases, familia):
    return sorted(ruta for f, _, ruta in bases if f == familia)


def lista_sql(rutas):
    return "[" + ", ".join("'%s'" % r.replace("'", "''") for r in rutas) + "]"


def copiar(con, consulta, destino):
    con.execute("COPY (%s) TO '%s' (FORMAT PARQUET, COMPRESSION ZSTD)" % (consulta, destino))
    return con.execute("SELECT count(*) FROM (%s)" % consulta).fetchone()[0]


# ------------------------------------------------------------------ dimensiones

def sql_geo_tidy(rutas):
    """Familia tidy: una unidad geografica por fila."""
    return """
        SELECT DISTINCT
            geo_id,
            nivel_geo,
            coalesce(departamento, provincia_nombre, geo_nombre) AS nombre,
            provincia,
            provincia_id,
            provincia_nombre,
            departamento_id,
            es_agregado_geo
        FROM read_parquet(%s)
        WHERE geo_id IS NOT NULL
    """ % lista_sql(rutas)


def sql_geo_dte(rutas):
    """Familia dte: dos puntas por fila (origen y destino), cada una es una unidad.

    Los departamentos de las provincias que no resolvemos a codigo INDEC entran a la
    dimension a nivel PROVINCIA (geo_id = codigo de provincia), que es el grano al que
    se pueden agregar los flujos hacia afuera de Santiago.
    """
    fuentes = lista_sql(rutas)
    punta = """
        SELECT
            %(pref)s_geo_id           AS geo_id,
            %(pref)s_provincia_id     AS provincia_id,
            %(pref)s_provincia        AS provincia_nombre,
            %(pref)s_departamento     AS departamento
        FROM read_parquet(%(f)s)
        WHERE %(pref)s_provincia IS NOT NULL
    """
    return """
        WITH puntas AS (
            %s
            UNION ALL
            %s
        )
        SELECT DISTINCT
            coalesce(geo_id, CAST(provincia_id AS VARCHAR)) AS geo_id,
            CASE WHEN geo_id IS NULL THEN 'provincia' ELSE 'departamento' END AS nivel_geo,
            CASE WHEN geo_id IS NULL THEN provincia_nombre ELSE departamento END AS nombre,
            CASE WHEN provincia_id = 86 THEN 'sde' ELSE NULL END AS provincia,
            provincia_id,
            provincia_nombre,
            CASE WHEN geo_id IS NULL THEN NULL
                 ELSE CAST(geo_id AS BIGINT) - provincia_id * 1000 END AS departamento_id,
            geo_id IS NULL AS es_agregado_geo
        FROM puntas
    """ % (punta % {"pref": "origen", "f": fuentes}, punta % {"pref": "destino", "f": fuentes})


def sql_geo_stock(rutas):
    """Familia stock: una unidad geografica por fila, igual que tidy.

    Usa `geo_nombre`, que es el nombre canonico que ya normalizo el adapter, y no el que
    escribe el Excel. La base 48 nombra al mismo departamento de hasta tres formas ("Ojo De
    Agua", "Ojo de Agua", "Ojo de agua"), y dim_geo guarda todos los nombres vistos en
    `nombres_vistos`: con el nombre crudo, las erratas de tipeo de la fuente terminarian
    listadas como si fueran alias legitimos del departamento.

    Las filas de agregado (el "Total" provincial embebido) no entran: tienen geo_id nulo.
    """
    return """
        SELECT DISTINCT
            geo_id,
            nivel_geo,
            geo_nombre AS nombre,
            provincia,
            provincia_id,
            provincia_nombre,
            CAST(geo_id AS BIGINT) - provincia_id * 1000 AS departamento_id,
            es_agregado_geo
        FROM read_parquet(%s)
        WHERE geo_id IS NOT NULL
    """ % lista_sql(rutas)


def sql_geo_precios(rutas):
    """Familia precios: la unica geografia de la fila es el ORIGEN de la mercaderia.

    Es una unidad de nivel PROVINCIA (el precio se forma en el mercado, no en el
    departamento), asi que entra a dim_geo con el codigo INDEC de provincia y
    es_agregado_geo=true: no pinta ningun departamento del mapa.
    """
    return """
        SELECT DISTINCT
            origen_geo_id                        AS geo_id,
            nivel_geo,
            origen_provincia                     AS nombre,
            provincia,
            origen_provincia_id                  AS provincia_id,
            origen_provincia                     AS provincia_nombre,
            CAST(NULL AS BIGINT)                 AS departamento_id,
            TRUE                                 AS es_agregado_geo
        FROM read_parquet(%s)
        WHERE origen_geo_id IS NOT NULL
    """ % lista_sql(rutas)


def sql_tiempo_campania(rutas):
    return """
        SELECT DISTINCT
            campania,
            campania_inicio,
            campania_fin,
            campania_inicio AS orden,
            campania AS etiqueta
        FROM read_parquet(%s)
        WHERE grano_tiempo = 'campania' AND campania IS NOT NULL
        ORDER BY campania_inicio
    """ % lista_sql(rutas)


def sql_tiempo_mes(rutas):
    casos = " ".join(
        "WHEN %d THEN '%s'" % (i + 1, nombre) for i, nombre in enumerate(MESES)
    )
    return """
        SELECT DISTINCT
            periodo,
            anio,
            mes,
            orden_periodo AS orden,   -- mes corrido y contiguo, ver adapters/dte.py
            (CASE mes %s END) || ' de ' || CAST(anio AS VARCHAR) AS etiqueta
        FROM read_parquet(%s)
        WHERE periodo IS NOT NULL
        ORDER BY orden
    """ % (casos, lista_sql(rutas))


def sql_tiempo_dia(rutas):
    """Grano diario. Lo alimentan las familias que traen una FECHA por fila.

    Existe porque la base 8 (precios) se mira en los dos granos: JC pide en el mismo panel
    "Precio prom. mensual" y "Precio prom diario". `orden` son dias corridos desde el
    1-ene-1970, asi que ordena y resta igual que `orden` de dim_tiempo_mes ordena meses.
    """
    casos = " ".join(
        "WHEN %d THEN '%s'" % (i + 1, nombre) for i, nombre in enumerate(MESES)
    )
    return """
        SELECT DISTINCT
            fecha,
            anio,
            mes,
            day(fecha)                                   AS dia,
            isodow(fecha)                                AS dia_semana,
            periodo,
            orden_periodo,
            datediff('day', DATE '1970-01-01', fecha)    AS orden,
            CAST(day(fecha) AS VARCHAR) || ' de ' || (CASE mes %s END)
                || ' de ' || CAST(anio AS VARCHAR)       AS etiqueta
        FROM read_parquet(%s)
        WHERE fecha IS NOT NULL
        ORDER BY fecha
    """ % (casos, lista_sql(rutas))


# ----------------------------------------------------------------------- hechos

def sql_hecho_tidy(rutas):
    return """
        SELECT
            base_id, entrega, ambito,
            provincia, geo_id, nivel_geo, es_agregado_geo,
            campania, campania_inicio,
            cultivo, cultivo_grupo, cultivo_rol,
            medida, unidad, agregable, valor,
            fuente
        FROM read_parquet(%s)
        ORDER BY base_id, provincia, geo_id, campania_inicio, cultivo, medida
    """ % lista_sql(rutas)


def sql_hecho_dte(rutas):
    # El orden es (sentido, fila_origen, variable) y no algo "de negocio" a proposito:
    # esa terna identifica la celda del Excel de la que sale cada fila, asi que no tiene
    # empates. Un ORDER BY con empates deja que DuckDB devuelva las filas empatadas en
    # cualquier orden y el parquet cambia de una corrida a la otra.
    return """
        SELECT
            base_id, entrega, ambito, provincia,
            sentido, alcance, es_agregado_fila,
            motivo, tipo_origen, tipo_destino,
            anio, mes, periodo, orden_periodo,
            origen_provincia_id, origen_geo_id, origen_departamento, origen_provincia,
            destino_provincia_id, destino_geo_id, destino_departamento, destino_provincia,
            variable, especie, categoria, categoria_rol,
            medida, unidad, agregable, valor,
            fuente,
            hoja, fila_origen
        FROM read_parquet(%s)
        ORDER BY base_id, sentido, fila_origen, variable
    """ % lista_sql(rutas)


def sql_hecho_stock(rutas):
    # Mismo criterio de orden que dte: (fila_origen, variable) identifica la celda del Excel
    # de la que sale cada fila, asi que no hay empates y el parquet no cambia entre corridas.
    return """
        SELECT
            base_id, entrega, ambito, provincia,
            anio,
            geo_id, nivel_geo, provincia_id, provincia_nombre,
            -- `geo_nombre` es el nombre canonico (lo normaliza el adapter) y `departamento`
            -- el que escribe el Excel, con sus erratas: los dos viajan al mart para poder
            -- rastrear cualquier dato hasta su celda de origen.
            geo_nombre, departamento,
            es_agregado_geo,
            variable, especie, categoria, categoria_rol,
            medida, unidad, agregable, valor,
            fuente,
            hoja, fila_origen
        FROM read_parquet(%s)
        ORDER BY base_id, fila_origen, variable
    """ % lista_sql(rutas)


def sql_hecho_dtv(rutas):
    """Familia dtv: una DTV emitida por fila del Excel, con las dos puntas del viaje.

    El grano que llega al mart es el mismo que trae la fuente (diario, una declaracion por
    fila): es lo que permite cortar despues por anio, por mes, por departamento de origen,
    por provincia de destino, por tipo de movimiento, por acondicionamiento y por producto
    sin volver al Excel. Las columnas `*_origen` son el dato crudo de SENASA (cantidad,
    peso unitario, peso total y la U.M. de esa fila); `valor` con medida='peso' ya viene en
    toneladas, que es lo que pide JC.

    Mismo criterio de orden que dte y stock: (hoja, fila_origen, variable) identifica la
    celda del Excel de la que sale cada fila, asi que no hay empates y el parquet no cambia
    entre corridas.
    """
    return """
        SELECT
            base_id, entrega, ambito, provincia,
            alcance, es_agregado_fila, geo_sin_dato,
            nro_dtv,
            fecha_hora, fecha, anio, mes, periodo, orden_periodo,
            origen_provincia_id, origen_geo_id, origen_departamento, origen_provincia,
            destino_provincia_id, destino_geo_id, destino_departamento, destino_provincia,
            producto, acondicionamiento, tipo_movimiento, tipo_origen,
            um_origen, um_canonica, factor_tn,
            cantidad_origen, peso_unitario_origen, peso_total_origen,
            variable, medida, medida_etiqueta, unidad, agregable, valor,
            fuente,
            hoja, fila_origen
        FROM read_parquet(%s)
        ORDER BY base_id, hoja, fila_origen, variable
    """ % lista_sql(rutas)


# Las dimensiones de producto de la familia precios, en el mismo orden que declara
# adapters/precios.py. Se listan acá para que la proyeccion del hecho sea explicita.
DIMENSIONES_PRECIOS = ("grupo", "especie", "variedad", "envase", "calidad", "tamanio")


def sql_hecho_precios(rutas):
    """Familia precios: una cotizacion diaria por fila del Excel.

    El grano que llega al mart es el de la fuente (un precio de un dia para un producto
    concreto). Los promedios -diario, mensual, anual, por variedad o por envase- se
    calculan sobre este hecho: NO se materializan acá, igual que los rankings y las
    variaciones (CLAUDE.md).

    OJO AL AGREGAR: `valor` con medida='precio' NO SE SUMA. Cada fila trae `agregable`
    (false), `agregacion` ('promedio') y `ponderacion` (la frase que explica que el
    promedio es simple porque la fuente no informa volumen). Una vista que sume esta
    columna esta mal, y el texto de `ponderacion` es el que tiene que ir al pie.

    `mercado` es donde se forma el precio (MCBA, en Buenos Aires) y `origen_*` de donde
    sale la mercaderia (Santiago). Son dos lugares distintos a proposito.

    Mismo criterio de orden que las otras familias: (hoja, fila_origen, variable)
    identifica la celda del Excel de la que sale cada fila, asi que no hay empates y el
    parquet no cambia entre corridas.
    """
    dims = ",\n            ".join(
        "%s, %s_origen, %s_clase" % (d, d, d) for d in DIMENSIONES_PRECIOS
    )
    return """
        SELECT
            base_id, entrega, ambito, provincia,
            es_agregado_fila,
            fecha, anio, mes, dia, periodo, orden_periodo,
            anio_declarado, mes_declarado, tiempo_declarado_coincide,
            mercado, mercado_nombre,
            procedencia_origen, origen_provincia, origen_provincia_id, origen_geo_id,
            nivel_geo, geo_sin_dato,
            %s,
            variable, medida, medida_etiqueta, unidad, moneda, expresion_precio,
            agregable, agregacion, ponderacion, valor,
            fuente,
            hoja, fila_origen
        FROM read_parquet(%s)
        ORDER BY base_id, hoja, fila_origen, variable
    """ % (dims, lista_sql(rutas))


HECHOS_POR_FAMILIA = {
    "tidy": sql_hecho_tidy,
    "dte": sql_hecho_dte,
    "dtv": sql_hecho_dtv,
    "stock": sql_hecho_stock,
    "precios": sql_hecho_precios,
}

GEO_POR_FAMILIA = {
    "tidy": sql_geo_tidy,
    "dte": sql_geo_dte,
    # La familia dtv tiene la geografia en las dos puntas y con los mismos nombres de
    # columna que dte (origen_* / destino_*), asi que reusa su proyeccion tal cual.
    "dtv": sql_geo_dte,
    "stock": sql_geo_stock,
    "precios": sql_geo_precios,
}

# Familias cuyo grano se agrega a mes y por lo tanto alimentan dim_tiempo_mes. La dtv y la
# precios son diarias, pero traen `periodo` y `orden_periodo` ya calculados por el adapter:
# el mes es el corte que pide el modelo de JC ("Unid temporal: mes y ano" en las DTV,
# "Precio prom. mensual" en el panel de precios).
FAMILIAS_CON_MES = ("dte", "dtv", "precios")

# Familias con una FECHA por fila, que alimentan dim_tiempo_dia. Las dos tienen las mismas
# columnas de tiempo (fecha, anio, mes, periodo, orden_periodo), asi que comparten SQL.
FAMILIAS_CON_DIA = ("dtv", "precios")


# ------------------------------------------------------------------ construccion

def construir():
    os.makedirs(DIR_MARTS, exist_ok=True)
    bases = bases_activas()
    if not bases:
        sys.exit("[marts] No hay nada en staging/. Corre antes: make ingest ENTREGA=entrega-01")
    familias = sorted({f for f, _, _ in bases})
    desconocidas = [f for f in familias if f not in HECHOS_POR_FAMILIA]
    if desconocidas:
        sys.exit(
            "[marts] Familias sin proyeccion SQL en pipeline/marts.py: %s. "
            "Agregale una entrada a HECHOS_POR_FAMILIA y a GEO_POR_FAMILIA." % desconocidas
        )

    con = duckdb.connect()
    escritos = []

    # dim_geo: union de lo que aporta cada familia, colapsada a UNA fila por geo_id.
    #
    # El colapso no es cosmetico. Dos bases pueden nombrar distinto al mismo departamento
    # (la 9 dice "BANDA" y la 85 "LA BANDA", las dos son 86035). Si las dos filas quedan,
    # la dimension deja de tener clave, cualquier join la duplica y el ORDER BY empata,
    # con lo cual el parquet cambia de una corrida a la otra. Se elige un nombre canonico
    # deterministico (el primero alfabeticamente) y se guardan TODOS los nombres vistos en
    # `nombres_vistos`, para que el alias siga siendo rastreable y no se pierda nada.
    partes = [GEO_POR_FAMILIA[f](rutas_de_familia(bases, f)) for f in familias]
    sql_geo = """
        SELECT
            geo_id,
            min(nivel_geo)          AS nivel_geo,
            min(nombre)             AS nombre,
            min(provincia)          AS provincia,
            min(provincia_id)       AS provincia_id,
            min(provincia_nombre)   AS provincia_nombre,
            min(departamento_id)    AS departamento_id,
            bool_or(es_agregado_geo) AS es_agregado_geo,
            string_agg(DISTINCT nombre, ' | ' ORDER BY nombre) AS nombres_vistos
        FROM (%s)
        GROUP BY geo_id
        ORDER BY nivel_geo, geo_id
    """ % "\n UNION \n".join("SELECT * FROM (%s)" % p for p in partes)
    escritos.append(("dim_geo", copiar(con, sql_geo, os.path.join(DIR_MARTS, "dim_geo.parquet"))))

    # dim_tiempo: un archivo por grano. Cada uno se arma con las familias que lo traen.
    rutas_campania = rutas_de_familia(bases, "tidy")
    if rutas_campania:
        escritos.append(("dim_tiempo_campania", copiar(
            con, sql_tiempo_campania(rutas_campania),
            os.path.join(DIR_MARTS, "dim_tiempo_campania.parquet"))))
    rutas_mes = sorted(
        r for f in FAMILIAS_CON_MES for r in rutas_de_familia(bases, f))
    if rutas_mes:
        escritos.append(("dim_tiempo_mes", copiar(
            con, sql_tiempo_mes(rutas_mes),
            os.path.join(DIR_MARTS, "dim_tiempo_mes.parquet"))))
    rutas_dia = sorted(
        r for f in FAMILIAS_CON_DIA for r in rutas_de_familia(bases, f))
    if rutas_dia:
        escritos.append(("dim_tiempo_dia", copiar(
            con, sql_tiempo_dia(rutas_dia),
            os.path.join(DIR_MARTS, "dim_tiempo_dia.parquet"))))

    # hechos declarados por los configs. Un mart junta bases de la misma familia.
    por_mart = {}
    for familia, mart, ruta in bases:
        entrada = por_mart.setdefault(mart, (familia, []))
        if entrada[0] != familia:
            sys.exit(
                "[marts] El mart '%s' recibe bases de dos familias distintas ('%s' y '%s'). "
                "Un mart junta bases de la misma forma: separalos en dos marts."
                % (mart, entrada[0], familia)
            )
        entrada[1].append(ruta)
    for mart, (familia, rutas) in sorted(por_mart.items()):
        sql = HECHOS_POR_FAMILIA[familia](sorted(rutas))
        escritos.append((mart, copiar(con, sql, os.path.join(DIR_MARTS, "%s.parquet" % mart))))

    con.close()
    return escritos


def main(args=None):
    argparse.ArgumentParser(prog="pipeline.marts").parse_args(args)
    for tabla, filas in construir():
        print("[marts] %-28s %7d filas -> marts/%s.parquet" % (tabla, filas, tabla))


if __name__ == "__main__":
    main(sys.argv[1:])
