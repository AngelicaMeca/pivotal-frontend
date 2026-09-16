"""Validaciones de calidad sobre staging/ y marts/. Etapa `check` de pipeline/cli.py.

Lo corre el agente qa-datos. NO corrige nada: detecta, cuantifica y deja los hallazgos
en validations/hallazgos/<entrega>.yaml. El reporte en castellano para JC
(validations/reportes/entrega-NN.md) lo escribe el agente leyendo esa salida.

Como estan escritos los checks: son GENERICOS. Ninguno sabe de la base 9. Cada uno
declara que columnas necesita; si el parquet de la base no las tiene, el check se
saltea. Los parametros (que columna es el periodo, que medidas se suman, que rangos
aplican) salen de validations/reglas.yaml y validations/rangos.yaml.

Severidades:
  bloqueante  distorsiona un numero que se va a ver en el sitio -> la base o el recorte
              afectado no se publica hasta que JC responda.
  observacion hay que contarlo y preguntarlo, pero se puede publicar con nota al pie.
  informativo perfil del dato, sirve de contexto. No se pregunta.

Determinismo: sin timestamps, sin aleatoriedad, todo ordenado explicitamente. Dos
corridas dan el mismo YAML byte a byte.

Uso:
    .venv/bin/python -m pipeline.cli check
    .venv/bin/python -m pipeline.cli check --entrega entrega-01
    .venv/bin/python -m pipeline.cli check --estricto   # sale 1 si hay bloqueantes
"""
import argparse
import os
import sys

import duckdb
import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_CONFIGS_BASES = os.path.join(RAIZ, "configs", "bases")
DIR_ENTREGAS = os.path.join(RAIZ, "configs", "entregas")
DIR_VALIDATIONS = os.path.join(RAIZ, "validations")
DIR_HALLAZGOS = os.path.join(DIR_VALIDATIONS, "hallazgos")
RUTA_REGLAS = os.path.join(DIR_VALIDATIONS, "reglas.yaml")
RUTA_RANGOS = os.path.join(DIR_VALIDATIONS, "rangos.yaml")
RUTA_MANIFIESTO = os.path.join(RAIZ, "configs", "manifiesto-indice.yaml")
RUTA_GEO_ALIAS = os.path.join(RAIZ, "configs", "dims", "geo-alias.yaml")
from pipeline.rutas import DIR_RAW  # noqa: E402  (la carpeta de OneDrive, ver rutas.py)

# Cuantos ejemplos concretos se guardan por hallazgo. Son para que JC los pueda ir a
# mirar en su propio Excel, no para listar el universo.
MAX_EJEMPLOS = 12

# Registro de checks. Se llena con el decorador @check de abajo, en orden de definicion.
CHECKS_ENTREGA = []   # firma: (ctx) -> [hallazgo]
CHECKS_BASE = []      # firma: (ctx, base) -> [hallazgo]


# ---------------------------------------------------------------------------
# Infraestructura minima
# ---------------------------------------------------------------------------
def cargar_yaml(ruta, por_defecto=None):
    if not os.path.exists(ruta):
        return {} if por_defecto is None else por_defecto
    with open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def check_entrega(fn):
    CHECKS_ENTREGA.append(fn)
    return fn


def check_base(fn):
    CHECKS_BASE.append(fn)
    return fn


def hallazgo(check, severidad, titulo, casos, base=None, detalle=None,
             ejemplos=None, propuesta=None, pregunta_jc=None):
    """Un hallazgo. `titulo` y `detalle` se escriben pensando en que JC los va a leer."""
    h = {
        "check": check,
        "severidad": severidad,
        "base": base,
        "titulo": titulo,
        "casos": casos,
    }
    if detalle:
        h["detalle"] = detalle
    if ejemplos:
        h["ejemplos"] = ejemplos[:MAX_EJEMPLOS]
    if propuesta:
        h["propuesta"] = propuesta
    if pregunta_jc:
        h["pregunta_jc"] = pregunta_jc
    return h


def q(con, sql):
    """Ejecuta y devuelve [dict]. Boring on purpose."""
    r = con.execute(sql)
    cols = [d[0] for d in r.description]
    return [dict(zip(cols, fila)) for fila in r.fetchall()]


def uno(con, sql, campo):
    filas = q(con, sql)
    return filas[0][campo] if filas else None


def q_contando(con, sql, tope=200):
    """(cuantos hay en total, las primeras `tope` filas).

    El conteo tiene que ser el real: si se reportara len(filas) despues de un LIMIT, una
    base grande diria siempre "200 casos" y el reporte mentiria.
    """
    total = uno(con, "SELECT count(*) n FROM (%s)" % sql, "n") or 0
    if not total:
        return 0, []
    return total, q(con, "%s LIMIT %d" % (sql, tope))


def lit(valor):
    """Literal SQL para strings que salen de YAML nuestro."""
    return "'" + str(valor).replace("'", "''") + "'"


def num(valor):
    """Numero formateado a la argentina, para que el hallazgo se lea sin traducir."""
    if valor is None:
        return "sin dato"
    if isinstance(valor, float) and valor == int(valor):
        valor = int(valor)
    if isinstance(valor, int):
        return "{:,}".format(valor).replace(",", ".")
    return "{:,.2f}".format(valor).replace(",", "@").replace(".", ",").replace("@", ".")


# ---------------------------------------------------------------------------
# Contexto: todo lo que los checks necesitan leer, cargado una sola vez
# ---------------------------------------------------------------------------
class Contexto:
    """Bolsa de datos de una corrida. Sin logica, solo lo que ya se leyo del disco."""

    def __init__(self, entrega, con):
        self.entrega = entrega
        self.con = con
        self.reglas = cargar_yaml(RUTA_REGLAS)
        self.rangos = cargar_yaml(RUTA_RANGOS)
        self.manifiesto = cargar_yaml(RUTA_MANIFIESTO)
        self.geo_alias = cargar_yaml(RUTA_GEO_ALIAS)
        self.manifiesto_entrega = cargar_yaml(
            os.path.join(DIR_ENTREGAS, "%s.yaml" % entrega))
        self.configs = {}
        for nombre in sorted(os.listdir(DIR_CONFIGS_BASES)):
            if not nombre.endswith(".yaml") or nombre.startswith("_"):
                continue
            cfg = cargar_yaml(os.path.join(DIR_CONFIGS_BASES, nombre))
            self.configs[int(cfg["base"])] = cfg

    def defaults(self):
        return self.reglas.get("defaults") or {}

    def dflt(self, clave, si_falta=None):
        return self.defaults().get(clave, si_falta)

    def reglas_de(self, base):
        return ((self.reglas.get("bases") or {}).get(base)) or {}

    def base_del_indice(self, base):
        for b in self.manifiesto.get("bases") or []:
            if b.get("nro") == base:
                return b
        return {}

    def bases_ingeridas(self):
        """[(nro, ruta_parquet)] de las bases que esta entrega dejo en staging."""
        salida = []
        for arch in self.manifiesto_entrega.get("archivos") or []:
            if arch.get("estado") != "ingerida" or not arch.get("staging"):
                continue
            ruta = os.path.join(RAIZ, arch["staging"])
            if os.path.exists(ruta):
                salida.append((int(arch["base"]), ruta))
        return sorted(set(salida))


class Base:
    """Una base ingerida, ya conectada a su parquet de staging."""

    def __init__(self, ctx, nro, ruta):
        self.ctx = ctx
        self.nro = nro
        self.ruta = ruta
        self.config = ctx.configs.get(nro) or {}
        self.reglas = ctx.reglas_de(nro)
        self.etiqueta = self.reglas.get("etiqueta") or self.config.get("slug") or str(nro)
        self.tabla = "read_parquet(%s)" % lit(ruta)
        self.columnas = [f["column_name"] for f in
                         q(ctx.con, "DESCRIBE SELECT * FROM %s" % self.tabla)]
        self.filas = uno(ctx.con, "SELECT count(*) n FROM %s" % self.tabla, "n")

    def tiene(self, *cols):
        return all(c in self.columnas for c in cols)

    def col(self, clave, si_falta=None):
        """Nombre de columna segun reglas.yaml -> columnas.<clave>."""
        nombre = (self.reglas.get("columnas") or {}).get(clave, si_falta)
        return nombre if nombre in self.columnas else None


# ---------------------------------------------------------------------------
# CHECKS DE ENTREGA (no miran datos, miran que las listas cierren)
# ---------------------------------------------------------------------------
@check_entrega
def cobertura_de_entrega(ctx):
    """Prometidas en el indice de JC vs recibidas en raw/ vs presentes en staging.

    Las tres listas tienen que cerrar (CLAUDE.md). Lo que llego pero todavia no se
    proceso NO es un error: es cobertura pendiente, y se informa como tal.
    """
    decl = ((ctx.manifiesto.get("entregas") or {}).get(ctx.entrega)) or {}
    prometidas = set(decl.get("bases_declaradas") or [])
    recibidas = set()
    for arch in ctx.manifiesto_entrega.get("archivos") or []:
        recibidas.add(int(arch["base"]))
    en_staging = set(n for n, _ in ctx.bases_ingeridas())

    salida = []
    faltan = sorted(prometidas - recibidas)
    if faltan:
        salida.append(hallazgo(
            "cobertura-entrega", "bloqueante",
            "Bases prometidas en el indice que no llegaron en los archivos",
            len(faltan), detalle="Numeros de base: %s" % ", ".join(str(b) for b in faltan),
            propuesta="Pedirle los archivos a JC antes de publicar la entrega.",
            pregunta_jc="Estas bases estaban en la lista de la entrega y no vinieron: %s. "
                        "Las mandas o las pasamos a la proxima?" % ", ".join(str(b) for b in faltan)))
    sobran = sorted(recibidas - prometidas)
    if sobran:
        salida.append(hallazgo(
            "cobertura-entrega", "observacion",
            "Archivos que llegaron sin estar en la lista de la entrega",
            len(sobran), detalle="Numeros de base: %s" % ", ".join(str(b) for b in sobran),
            propuesta="Confirmar con JC si entran en esta entrega o quedan para la siguiente."))
    pendientes = sorted(recibidas - en_staging)
    if pendientes:
        salida.append(hallazgo(
            "cobertura-entrega", "informativo",
            "Bases recibidas que todavia no se procesaron",
            len(pendientes),
            detalle="Llegaron completas y estan guardadas, pero todavia no se leyeron. "
                    "Numeros de base: %s" % ", ".join(str(b) for b in pendientes),
            propuesta="Se procesan en las proximas tandas. No es un problema del archivo."))
    return salida


@check_entrega
def archivos_de_la_entrega(ctx):
    """Archivos que se ignoraron al inventariar raw/ (temporales de Excel, ocultos)."""
    ignorados = ctx.manifiesto_entrega.get("archivos_ignorados") or []
    if not ignorados:
        return []
    return [hallazgo(
        "cobertura-entrega", "informativo",
        "Archivos de la carpeta que no se contaron como base", len(ignorados),
        detalle="Son archivos temporales o de bloqueo que deja Excel cuando una planilla "
                "queda abierta. No son datos.",
        ejemplos=sorted(ignorados),
        propuesta="Ninguna. Se ignoran solos en cada corrida.")]


@check_entrega
def geo_alias_pendientes(ctx):
    """Nombres de lugar sin codigo INDEC confirmado. Nunca se dropea una fila por geo."""
    pendientes = ctx.geo_alias.get("alias_pendientes") or []
    a_verificar = [a for a in pendientes if a.get("verificar")]
    salida = []
    if a_verificar:
        salida.append(hallazgo(
            "geo", "observacion",
            "Nombres de departamento sin codigo oficial confirmado", len(a_verificar),
            detalle="El pipeline les propuso un codigo mirando el nombre, pero nadie lo "
                    "confirmo todavia. Ninguna fila se descarto.",
            ejemplos=[str(a) for a in a_verificar],
            pregunta_jc="Estos nombres de departamento, a que departamento corresponden? %s"
                        % ", ".join(str(a.get("nombre", a)) for a in a_verificar[:8])))
    sin_verificar = [a for a in pendientes if not a.get("verificar")]
    if sin_verificar:
        salida.append(hallazgo(
            "geo", "informativo",
            "Nombres de departamento resueltos por alias", len(sin_verificar),
            ejemplos=[str(a) for a in sin_verificar]))
    return salida


@check_entrega
def cambios_de_formato(ctx):
    """Drift: lo que ingestor-bases dejo anotado en los configs como tipo `drift`.

    Verificado contra el archivo: si la nota dice que una hoja cambio de nombre, se
    comprueba que la hoja que el config declara siga existiendo en staging.
    """
    salida = []
    for nro, cfg in sorted(ctx.configs.items()):
        for nota in cfg.get("notas") or []:
            if nota.get("tipo") != "drift":
                continue
            salida.append(hallazgo(
                "drift", "observacion", base=nro,
                titulo="Cambio de formato respecto de lo declarado en el indice",
                casos=1,
                detalle=" ".join((nota.get("texto") or "").split()),
                propuesta="No se corrige el archivo: el pipeline ya sabe leerlo como viene."))
    return salida


@check_entrega
def hojas_no_leidas(ctx):
    """Hojas del Excel que el config decide no leer. Se listan para que quede a la vista."""
    salida = []
    for nro, cfg in sorted(ctx.configs.items()):
        ignoradas = ((cfg.get("hojas") or {}).get("ignorar")) or []
        if not ignoradas:
            continue
        salida.append(hallazgo(
            "cobertura-hojas", "informativo", base=nro,
            titulo="Hojas del archivo que no se leyeron", casos=len(ignoradas),
            ejemplos=["%s: %s" % (h.get("nombre"), " ".join((h.get("motivo") or "").split()))
                      for h in ignoradas],
            propuesta="Son hojas de calculo o de instrucciones, no de datos."))
    return salida


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · duplicados y copy/paste
# ---------------------------------------------------------------------------
@check_base
def clave_repetida(ctx, base):
    """La clave que identifica una observacion no se puede repetir.

    Si se repite, al sumar se cuenta dos veces el mismo dato.
    """
    clave = [c for c in (base.reglas.get("clave_unica") or []) if c in base.columnas]
    if not clave:
        return []
    cols = ", ".join(clave)
    total, filas = q_contando(ctx.con, """
        SELECT %s, count(*) veces FROM %s GROUP BY %s HAVING count(*) > 1
        ORDER BY veces DESC, %s
    """ % (cols, base.tabla, cols, cols))
    if not total:
        return []
    return [hallazgo(
        "duplicados", "bloqueante", base=base.nro,
        titulo="Hay datos repetidos que se contarian dos veces al sumar",
        casos=total,
        detalle="La combinacion de %s tendria que aparecer una sola vez y aparece mas de una."
                % " + ".join(clave),
        ejemplos=[" | ".join("%s=%s" % (k, v) for k, v in f.items()) for f in filas],
        propuesta="Dejar la base afuera del sitio hasta saber cual de las filas repetidas vale.",
        pregunta_jc="Aparecen filas repetidas para el mismo lugar, periodo y producto. "
                    "Es un error de la planilla o cada una significa algo distinto?")]


@check_base
def filas_identicas(ctx, base):
    """Filas 100% duplicadas (todas las columnas de contenido iguales)."""
    ignorar = {"fila_origen", "entrega"}
    cols = [c for c in base.columnas if c not in ignorar]
    if not cols:
        return []
    lista = ", ".join(cols)
    n = uno(ctx.con, """
        SELECT count(*) n FROM (SELECT %s, count(*) v FROM %s GROUP BY %s HAVING count(*) > 1)
    """ % (lista, base.tabla, lista), "n")
    if not n:
        return []
    filas = q(ctx.con, """
        SELECT %s, count(*) veces FROM %s GROUP BY %s HAVING count(*) > 1
        ORDER BY veces DESC LIMIT 10
    """ % (lista, base.tabla, lista))
    return [hallazgo(
        "duplicados", "observacion", base=base.nro,
        titulo="Filas exactamente iguales, repetidas en el archivo", casos=n,
        detalle="Son filas donde todo coincide: mismo lugar, mismo periodo, mismo producto "
                "y mismo numero.",
        ejemplos=[" | ".join("%s=%s" % (k, v) for k, v in f.items() if v is not None)
                  for f in filas],
        propuesta="Publicar sin ellas seria corregir en silencio: se dejan y se pregunta.",
        pregunta_jc="Hay filas repetidas identicas. Se pueden descartar las copias?")]


@check_base
def conteos_identicos_entre_periodos(ctx, base):
    """Copy/paste: dos periodos (o dos hojas) con exactamente el mismo CONTENIDO.

    Caso real que motivo el check: DTV Cebolla con 2.864 movimientos identicos en 2022,
    2023 y 2024.

    El conteo de filas solo no alcanza como senal. En una base anual, que dos anios
    tengan la misma cantidad exacta de registros es rarisimo; en una mensual con 53
    meses de 400 filas cada uno, que dos coincidan es esperable por azar (es el
    problema del cumpleanios). Por eso el check compara la huella del contenido: dos
    periodos se reportan solo si ademas de la cantidad coinciden los valores, que es
    cuando de verdad hubo un copiar y pegar.
    """
    periodo = base.col("periodo")
    if not periodo or "fila_origen" not in base.columnas:
        return []
    minimo = ctx.dflt("copypaste_min_filas", 50)
    particion = base.col("particion")
    grupo = "%s, %s" % (particion, periodo) if particion else periodo
    # La huella ignora el periodo a proposito: si dos meses son "el mismo mes copiado",
    # todo tiene que coincidir MENOS la etiqueta del periodo.
    cols_huella = [c for c in base.columnas
                   if c not in ("fila_origen", "entrega", periodo, "orden_periodo",
                                "anio", "mes")]
    huella = "md5(string_agg(%s, '|' ORDER BY %s))" % (
        " || '~' || ".join("coalesce(CAST(%s AS VARCHAR), '')" % c for c in cols_huella),
        ", ".join(cols_huella))
    filas = q(ctx.con, """
        WITH c AS (
            SELECT %s, count(DISTINCT fila_origen) filas, %s AS huella
            FROM %s WHERE %s IS NOT NULL GROUP BY %s
        )
        SELECT filas, count(*) periodos, string_agg(%s, ', ' ORDER BY %s) cuales
        FROM c WHERE filas >= %d GROUP BY filas, huella HAVING count(*) > 1
        ORDER BY filas DESC
    """ % (grupo, huella, base.tabla, periodo, grupo, periodo, periodo, minimo))
    if not filas:
        return []
    return [hallazgo(
        "copy-paste", "observacion", base=base.nro,
        titulo="Periodos distintos con exactamente el mismo contenido",
        casos=len(filas),
        detalle="Estos periodos no solo tienen la misma cantidad de registros: los datos "
                "son identicos fila por fila. Es la senal tipica de que un periodo se "
                "copio sobre el otro al armar la planilla.",
        ejemplos=["%s: %s registros identicos" % (f["cuales"], num(f["filas"])) for f in filas],
        propuesta="No publicar los periodos repetidos hasta que JC confirme cual es el bueno.",
        pregunta_jc="Estos periodos tienen exactamente los mismos datos, fila por fila. "
                    "Puede ser que uno se haya copiado sobre otro al armar la planilla?")]


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · totales embebidos y agregados
# ---------------------------------------------------------------------------
@check_base
def totales_embebidos(ctx, base):
    """Filas de total mezcladas entre el detalle: el total tiene que dar la suma.

    Compara cada fila marcada como agregado geografico contra la suma de su propio
    detalle, para el mismo periodo, la misma categoria y la misma medida.
    """
    if not base.tiene("es_agregado_geo", "medida", "valor"):
        return []
    periodo = base.col("periodo")
    categoria = base.col("categoria")
    if not periodo:
        return []
    sumables = base.reglas.get("medidas_sumables") or []
    filtro_medida = ("AND medida IN (%s)" % ", ".join(lit(m) for m in sumables)) if sumables else ""
    tol = float(ctx.dflt("tolerancia_agregado_pct", 0.5))
    llaves = [c for c in (base.col("particion"), "provincia", periodo, categoria, "medida") if c]
    on = ", ".join(llaves)

    # Una hoja que es toda agregado (ej. la hoja de totales pais) no tiene detalle propio
    # contra el cual compararse: no es una anomalia, es su naturaleza. Se saltea entera.
    particion = base.col("particion")
    solo_agregado = ""
    if particion:
        puras = q(ctx.con, """
            SELECT %s p FROM %s GROUP BY 1 HAVING sum(CASE WHEN es_agregado_geo THEN 0 ELSE 1 END) = 0
        """ % (particion, base.tabla))
        if puras:
            solo_agregado = "AND %s NOT IN (%s)" % (
                particion, ", ".join(lit(f["p"]) for f in puras))

    filas = q(ctx.con, """
        WITH t AS (SELECT %(on)s, valor v_tot FROM %(tab)s
                   WHERE es_agregado_geo %(fm)s %(sa)s),
             d AS (SELECT %(on)s, sum(valor) v_det, count(*) n FROM %(tab)s
                   WHERE NOT es_agregado_geo %(fm)s GROUP BY %(on)s)
        SELECT %(on)s, v_tot, coalesce(v_det, 0) v_det, coalesce(n, 0) n_detalle,
               CASE WHEN v_tot = 0 THEN 0
                    ELSE (coalesce(v_det, 0) - v_tot) / v_tot * 100 END pct
        FROM t LEFT JOIN d USING (%(on)s)
    """ % {"on": on, "tab": base.tabla, "fm": filtro_medida, "sa": solo_agregado})

    total = len(filas)
    if not total:
        return []
    malas = [f for f in filas if abs(f["pct"] or 0) > tol]
    huerfanas = [f for f in malas if f["n_detalle"] == 0]
    discrepan = [f for f in malas if f["n_detalle"] > 0]
    salida = []

    if huerfanas:
        def clave(f):
            return " / ".join(str(f[k]) for k in llaves if k != "medida")
        agrupadas = sorted(set(clave(f) for f in huerfanas))
        salida.append(hallazgo(
            "totales-embebidos", "bloqueante", base=base.nro,
            titulo="Totales de la provincia sin ningun departamento que los respalde",
            casos=len(agrupadas),
            detalle="Hay filas de 'Total provincia' para periodos en los que el archivo no "
                    "trae ni un solo departamento. Si esos periodos se publican, el mapa "
                    "queda vacio y el total de la provincia igual muestra un numero.",
            ejemplos=["%s: total %s y detalle departamental %s"
                      % (clave(f), num(f["v_tot"]), num(f["v_det"])) for f in huerfanas],
            propuesta="Dejar esos periodos afuera del sitio hasta que JC confirme.",
            pregunta_jc="Hay totales de provincia para periodos sin detalle por departamento. "
                        "Los sacamos o conseguis el detalle?"))
    if discrepan:
        salida.append(hallazgo(
            "totales-embebidos", "bloqueante", base=base.nro,
            titulo="El total de la provincia no coincide con la suma de sus departamentos",
            casos=len(discrepan),
            detalle="Diferencia mayor a %s%% entre la fila de total y la suma del detalle." % num(tol),
            ejemplos=["%s: total %s, suma de departamentos %s (%s%% de diferencia)"
                      % (" / ".join(str(f[k]) for k in llaves), num(f["v_tot"]),
                         num(f["v_det"]), num(round(f["pct"], 2)))
                      for f in sorted(discrepan, key=lambda f: (-abs(f["pct"]),
                                      [str(f[k]) for k in llaves]))],
            propuesta="Publicar el detalle departamental y calcular el total sumando, "
                      "no tomando la fila de total.",
            pregunta_jc="El total provincial no da la suma de los departamentos. "
                        "Cual de los dos numeros es el bueno?"))
    if total - len(malas):
        salida.append(hallazgo(
            "totales-embebidos", "informativo", base=base.nro,
            titulo="Totales de provincia que si cierran contra la suma de departamentos",
            casos=total - len(malas),
            detalle="De %s comparaciones, %s cierran dentro del %s%%."
                    % (num(total), num(total - len(malas)), num(tol))))
    return salida


@check_base
def fila_total_al_pie(ctx, base):
    """Fila de totales al pie de una hoja: tiene que dar la suma de toda esa hoja.

    Distinto de `totales_embebidos`, que compara un total GEOGRAFICO (una fila "Total
    provincia" mezclada entre los departamentos) contra su propio detalle en el mismo
    periodo. Aca el total es de la hoja entera, sin periodo ni lugar: es la fila que
    Excel deja abajo de todo cuando alguien arrastra un =SUMA(). Se compara columna por
    columna contra la suma de todo el detalle de la hoja.

    Caso real que motivo el check: la base 85 trae una de estas al pie de cada hoja, y
    ninguna de las dos cierra. Una se quedo 60 cabezas corta y la otra no es un total
    sino el subtotal de un ano.
    """
    if not base.tiene("es_agregado_fila", "valor"):
        return []
    variable = base.col("variable") or ("variable" if "variable" in base.columnas else None)
    particion = base.col("particion")
    if not variable:
        return []
    llaves = [c for c in (particion, variable) if c]
    on = ", ".join(llaves)

    filas = q(ctx.con, """
        WITH t AS (SELECT %(on)s, sum(valor) v_tot FROM %(tab)s
                   WHERE es_agregado_fila GROUP BY %(on)s),
             d AS (SELECT %(on)s, sum(valor) v_det, count(*) n FROM %(tab)s
                   WHERE NOT es_agregado_fila GROUP BY %(on)s)
        SELECT %(on)s, v_tot, coalesce(v_det, 0) v_det, coalesce(n, 0) n_detalle,
               CASE WHEN v_tot = 0 THEN 0
                    ELSE (coalesce(v_det, 0) - v_tot) / v_tot * 100 END pct
        FROM t LEFT JOIN d USING (%(on)s)
        ORDER BY %(on)s
    """ % {"on": on, "tab": base.tabla})
    if not filas:
        return []

    # Sin tolerancia: la fila del pie es un =SUMA() de la propia hoja, tiene que dar
    # exacto. Una diferencia de 60 cabezas sobre 4 millones es 0,0014% y pasaria
    # cualquier tolerancia porcentual, pero igual significa que alguien agrego filas y
    # no recalculo, que es justamente lo que hay que avisar.
    malas = [f for f in filas if f["v_tot"] != f["v_det"]]
    salida = []

    # Un hallazgo por hoja, no uno solo con todo junto. Dos hojas pueden fallar por
    # motivos completamente distintos (una porque el total quedo viejo por unas pocas
    # cabezas, otra porque lo que dice "total" en realidad es el subtotal de un ano), y
    # mezclarlas en una sola lista ordenada por porcentaje deja la mas sutil al final,
    # justo la que hay que mirar.
    por_hoja = {}
    for f in malas:
        por_hoja.setdefault(f[particion] if particion else "", []).append(f)

    for hoja in sorted(por_hoja):
        fs = sorted(por_hoja[hoja], key=lambda f: -abs(f["pct"]))
        desvio = max(abs(f["pct"] or 0) for f in fs)
        if desvio > 50:
            lectura = ("La diferencia es tan grande que esa fila no parece ser el total de "
                       "la hoja sino el subtotal de una parte (por ejemplo, un solo ano).")
        else:
            lectura = ("Las diferencias son chicas y siempre para el mismo lado: el detalle "
                       "tiene mas que el total. Es lo que pasa cuando se agregan filas al "
                       "final y no se vuelve a calcular la suma de arriba.")
        salida.append(hallazgo(
            "total-al-pie", "observacion", base=base.nro,
            titulo="En %s la fila de totales del pie no coincide con el detalle" % hoja
                   if hoja else "La fila de totales del pie no coincide con el detalle",
            casos=len(fs),
            detalle="Esa hoja cierra con una fila de totales. Comparada contra la suma de "
                    "todas sus filas, no da en %d de las %d columnas. %s"
                    % (len(fs), len([f for f in filas
                                     if not particion or f[particion] == hoja]), lectura),
            ejemplos=["%s: el pie dice %s y el detalle suma %s (diferencia de %s)"
                      % (f[variable], num(f["v_tot"]), num(f["v_det"]),
                         num(round(f["v_det"] - f["v_tot"], 2)))
                      for f in fs],
            propuesta="Usar siempre la suma del detalle, nunca la fila del pie. Queda "
                      "marcada en los datos para no confundirla con un movimiento real.",
            pregunta_jc="La fila de totales que esta al pie de la hoja %s no coincide con la "
                        "suma del detalle. Nos guiamos por el detalle, que es lo que esta fila "
                        "por fila. Confirmas?" % hoja))
    if len(filas) - len(malas):
        salida.append(hallazgo(
            "total-al-pie", "informativo", base=base.nro,
            titulo="Columnas donde la fila de totales del pie si cierra",
            casos=len(filas) - len(malas),
            detalle="De %s columnas comparadas, %s coinciden con la suma del detalle."
                    % (num(len(filas)), num(len(filas) - len(malas)))))
    return salida


@check_base
def agregado_vs_componentes(ctx, base):
    """El producto 'total' tiene que dar la suma de sus partes (soja total = 1ra + 2da).

    Regla de JC: para totales y participaciones se usa SOLO el 'total'. Este check
    verifica que el total y sus partes sean consistentes, y detecta partes ausentes.
    """
    rol = base.col("rol_categoria")
    grupo = base.col("grupo_categoria")
    if not rol or not grupo or not base.tiene("medida", "valor"):
        return []
    periodo = base.col("periodo")
    sumables = base.reglas.get("medidas_sumables") or []
    filtro_medida = ("AND medida IN (%s)" % ", ".join(lit(m) for m in sumables)) if sumables else ""
    sin_comp = base.reglas.get("grupos_sin_componentes") or []
    filtro_grupo = ("AND %s NOT IN (%s)" % (grupo, ", ".join(lit(g) for g in sin_comp))) if sin_comp else ""
    tol = float(ctx.dflt("tolerancia_agregado_pct", 0.5))
    # Unidad de observacion: la columna que identifica UNA observacion, o sea el grano al
    # que el total y sus partes tienen que cerrar. En las bases tidy es la geografia
    # (geo_id); en las de flujo (dte) es la fila del Excel, porque cada fila es un
    # movimiento con su propio total y sus propias categorias. Si no se declara ninguna,
    # el total se compararia contra la suma de TODAS las filas del periodo y no cerraria nunca.
    unidad = base.col("unidad") or ("geo_id" if "geo_id" in base.columnas else None)
    llaves = [c for c in (base.col("particion"), unidad, periodo, grupo) if c]
    on = ", ".join(llaves)

    filas = q(ctx.con, """
        WITH a AS (SELECT %(on)s, medida, valor v_agg FROM %(tab)s
                   WHERE %(rol)s = 'agregado' %(fm)s %(fg)s),
             c AS (SELECT %(on)s, medida, sum(valor) v_comp, count(*) n FROM %(tab)s
                   WHERE %(rol)s = 'componente' %(fm)s %(fg)s GROUP BY %(on)s, medida)
        SELECT %(on)s,
               max(CASE WHEN v_agg <> 0 AND abs(coalesce(v_comp, 0) - v_agg) > abs(v_agg) * %(tol)f / 100
                        THEN 1 ELSE 0 END) falla,
               max(coalesce(n, 0)) partes,
               min(CASE WHEN v_agg = 0 THEN NULL
                        ELSE (coalesce(v_comp, 0) - v_agg) / v_agg * 100 END) pct
        FROM a LEFT JOIN c USING (%(on)s, medida)
        GROUP BY %(on)s
    """ % {"on": on, "tab": base.tabla, "rol": rol, "fm": filtro_medida,
           "fg": filtro_grupo, "tol": tol})
    if not filas:
        return []

    salida = []
    por_grupo = {}
    for f in filas:
        por_grupo.setdefault(f[grupo], []).append(f)
    for nombre_grupo in sorted(por_grupo):
        fs = por_grupo[nombre_grupo]
        malas = [f for f in fs if f["falla"]]
        if not malas:
            salida.append(hallazgo(
                "agregado-vs-partes", "informativo", base=base.nro,
                titulo="'%s total' coincide con la suma de sus partes" % nombre_grupo,
                casos=len(fs),
                detalle="Verificado en %s combinaciones de lugar y periodo." % num(len(fs))))
            continue
        sin_partes = [f for f in malas if f["partes"] == 0]
        con_partes = [f for f in malas if f["partes"] > 0]
        faltante = None
        if con_partes:
            pcts = sorted(f["pct"] for f in con_partes if f["pct"] is not None)
            if pcts:
                faltante = pcts[len(pcts) // 2]
        salida.append(hallazgo(
            "agregado-vs-partes", "observacion", base=base.nro,
            titulo="El detalle de %s no suma el total de %s" % (nombre_grupo, nombre_grupo),
            casos=len(malas),
            detalle=("De %s combinaciones de lugar y periodo, %s no cierran. En %s de ellas "
                     "el archivo no trae ninguna de las partes; en %s trae algunas y falta "
                     "tipicamente el %s%% del total."
                     % (num(len(fs)), num(len(malas)), num(len(sin_partes)), num(len(con_partes)),
                        num(abs(round(faltante, 1))) if faltante is not None else "?")),
            ejemplos=["%s: falta el %s%% del total"
                      % (" / ".join(str(f[k]) for k in llaves),
                         num(abs(round(f["pct"], 1))) if f["pct"] is not None else "?")
                      for f in sorted(con_partes, key=lambda f: (f["pct"] or 0,
                                      [str(f[k]) for k in llaves]))[:6]],
            propuesta="Usar siempre el 'total' para sumas y participaciones (regla de JC) y "
                      "mostrar el detalle solo donde exista.",
            pregunta_jc="En %s, el total no da la suma de las partes que trae el archivo. "
                        "Falta alguna categoria en la planilla?" % nombre_grupo))
    return salida


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · valores imposibles
# ---------------------------------------------------------------------------
def _describir(base, fila, extra=""):
    """Etiqueta legible de una fila, para que JC la pueda buscar en su Excel."""
    partes = []
    for clave in ("hoja", "campania", "periodo", "geo_nombre", "departamento",
                  "cultivo", "categoria", "medida"):
        if clave in fila and fila[clave] is not None:
            texto = str(fila[clave])
            if texto not in partes:   # geo_nombre y departamento suelen traer lo mismo
                partes.append(texto)
    if "fila_origen" in fila and fila["fila_origen"] is not None:
        partes.append("fila %s del Excel" % fila["fila_origen"])
    return " / ".join(partes) + (": " + extra if extra else "")


def _cols_ubicacion(base):
    posibles = ["hoja", "campania", "geo_nombre", "departamento", "cultivo",
                "medida", "fila_origen"]
    return [c for c in posibles if c in base.columnas]


@check_base
def valores_negativos(ctx, base):
    """Superficies, stocks y produccion no pueden ser negativos."""
    if not base.tiene("medida", "valor"):
        return []
    medidas = base.reglas.get("medidas_no_negativas") or []
    filtro = ("medida IN (%s) AND " % ", ".join(lit(m) for m in medidas)) if medidas else ""
    cols = _cols_ubicacion(base)
    total, filas = q_contando(ctx.con, "SELECT %s, valor FROM %s WHERE %s valor < 0 ORDER BY valor, 1"
                              % (", ".join(cols + ["valor"]) if cols else "valor", base.tabla, filtro))
    if not total:
        return []
    return [hallazgo(
        "valores-imposibles", "bloqueante", base=base.nro,
        titulo="Hay valores negativos donde no puede haberlos", casos=total,
        detalle="Una superficie, una produccion o un stock no pueden dar menos que cero.",
        ejemplos=[_describir(base, f, num(f["valor"])) for f in filas],
        propuesta="Dejar afuera del sitio lo que dependa de esos numeros hasta que JC confirme.",
        pregunta_jc="Aparecen numeros negativos en superficies o produccion. "
                    "Son correcciones a la baja o errores de carga?")]


@check_base
def valores_fraccionarios(ctx, base):
    """Cabezas de ganado (y todo lo que se cuenta de a uno) no pueden ser fraccionarias."""
    if not base.tiene("medida", "valor"):
        return []
    medidas = base.reglas.get("medidas_enteras") or []
    if not medidas:
        return []
    cols = _cols_ubicacion(base)
    total, filas = q_contando(ctx.con, """
        SELECT %s, valor FROM %s WHERE medida IN (%s) AND valor IS NOT NULL
          AND valor <> floor(valor) ORDER BY %s
    """ % (", ".join(cols + ["valor"]), base.tabla, ", ".join(lit(m) for m in medidas),
           # `valor` al final desempata: una misma ubicacion puede tener varios valores (una
           # categoria por columna) y sin desempate el orden de los ejemplos variaba entre corridas
           ", ".join(cols + ["valor"])))
    if not total:
        return []
    return [hallazgo(
        "valores-imposibles", "bloqueante", base=base.nro,
        titulo="Cantidades con decimales donde solo puede haber numeros enteros",
        casos=total,
        detalle="Media cabeza de ganado no existe. Suele pasar cuando la planilla trae un "
                "promedio en la columna de cantidad.",
        ejemplos=[_describir(base, f, num(f["valor"])) for f in filas],
        propuesta="No publicar esa columna hasta saber que significa.",
        pregunta_jc="Hay cantidades de cabezas con decimales. Es un promedio o un error?")]


@check_base
def fuera_de_rango(ctx, base):
    """Valores fuera del rango razonable de validations/rangos.yaml."""
    if not base.tiene("medida", "valor"):
        return []
    salida = []
    for medida, spec in sorted((base.reglas.get("rangos") or {}).items()):
        tabla = ctx.rangos.get(spec.get("tabla")) or {}
        por = spec.get("por")
        if not tabla or por not in base.columnas:
            continue
        cols = _cols_ubicacion(base)
        filas = q(ctx.con, "SELECT %s, %s AS grupo, valor FROM %s WHERE medida = %s AND valor > 0"
                  % (", ".join(cols), por, base.tabla, lit(medida)))
        fuera = []
        for f in filas:
            rango = tabla.get(f["grupo"]) or tabla.get("_default")
            if not rango:
                continue
            if f["valor"] < rango.get("min", float("-inf")) or f["valor"] > rango.get("max", float("inf")):
                fuera.append((f, rango))
        if not fuera:
            continue
        salida.append(hallazgo(
            "valores-imposibles", "observacion", base=base.nro,
            titulo="Valores de %s fuera del rango razonable" % medida, casos=len(fuera),
            detalle="Rangos definidos en validations/rangos.yaml. Un valor fuera de rango no "
                    "es necesariamente un error, pero conviene mirarlo.",
            ejemplos=[_describir(base, f, "%s (rango esperado %s a %s)"
                                 % (num(f["valor"]), num(r.get("min")), num(r.get("max"))))
                      for f, r in sorted(fuera, key=lambda x: (-x[0]["valor"],
                                         [str(v) for v in x[0].values()]))],
            pregunta_jc="Estos valores se van del rango habitual. Los das por buenos?"))
    return salida


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · coherencia entre columnas
# ---------------------------------------------------------------------------
def _pivot(base, medidas):
    """Sub-consulta que vuelve a poner una medida por columna, para cruzarlas."""
    cols = _cols_ubicacion(base)
    cols = [c for c in cols if c != "medida"]
    llaves = [c for c in cols if c != "fila_origen"]
    if "fila_origen" in base.columnas:
        llaves = llaves + ["fila_origen"]
    seleccion = ", ".join(llaves) + ", " + ", ".join(
        "max(CASE WHEN medida = %s THEN valor END) AS %s" % (lit(m), m) for m in medidas)
    return "(SELECT %s FROM %s GROUP BY %s)" % (seleccion, base.tabla, ", ".join(llaves)), llaves


@check_base
def una_medida_mayor_que_otra(ctx, base):
    """Reglas del tipo 'la cosechada nunca supera a la sembrada'."""
    reglas = base.reglas.get("no_mayor_que") or []
    if not reglas or not base.tiene("medida", "valor"):
        return []
    salida = []
    for regla in reglas:
        menor, mayor = regla["menor"], regla["mayor"]
        sub, llaves = _pivot(base, [menor, mayor])
        total, filas = q_contando(ctx.con, """
            SELECT %s, %s AS a, %s AS b FROM %s WHERE %s IS NOT NULL AND %s IS NOT NULL AND %s > %s
            ORDER BY %s - %s DESC, %s
        """ % (", ".join(llaves), menor, mayor, sub, menor, mayor, menor, mayor,
               menor, mayor, ", ".join(llaves)))
        if not total:
            continue
        salida.append(hallazgo(
            "coherencia", "bloqueante", base=base.nro,
            titulo="Hay filas donde %s" % (regla.get("texto") or "%s supera a %s" % (menor, mayor)),
            casos=total,
            ejemplos=[_describir(base, f, "%s = %s contra %s = %s"
                                 % (menor, num(f["a"]), mayor, num(f["b"]))) for f in filas],
            propuesta="No publicar esas filas hasta que JC diga cual de las dos columnas vale.",
            pregunta_jc="Hay casos de %s. Cual de los dos numeros esta mal?"
                        % (regla.get("texto") or "una medida que supera a la otra")))
    return salida


@check_base
def columna_calculada(ctx, base):
    """El rendimiento (o cualquier columna calculada) tiene que dar su propia cuenta.

    Sirve para detectar columnas intercambiadas y cuentas viejas que quedaron pegadas.
    """
    derivadas = base.reglas.get("derivadas") or []
    if not derivadas or not base.tiene("medida", "valor"):
        return []
    tol = float(ctx.dflt("tolerancia_derivada_pct", 1.0))
    salida = []
    for d in derivadas:
        res, nume, deno = d["resultado"], d["numerador"], d["denominador"]
        factor = float(d.get("factor", 1))
        sub, llaves = _pivot(base, [res, nume, deno])
        malas, filas = q_contando(ctx.con, """
            SELECT %(k)s, %(r)s AS declarado, %(n)s / %(d)s * %(f)f AS calculado
            FROM %(s)s WHERE %(d)s > 0 AND %(n)s > 0 AND %(r)s IS NOT NULL
              AND abs(%(r)s - %(n)s / %(d)s * %(f)f) > abs(%(n)s / %(d)s * %(f)f) * %(t)f / 100
            ORDER BY abs(%(r)s - %(n)s / %(d)s * %(f)f) DESC, %(k)s
        """ % {"k": ", ".join(llaves), "r": res, "n": nume, "d": deno,
               "f": factor, "s": sub, "t": tol})
        total = uno(ctx.con, "SELECT count(*) n FROM %s WHERE %s > 0 AND %s > 0"
                    % (sub, deno, nume), "n")
        if not malas:
            salida.append(hallazgo(
                "coherencia", "informativo", base=base.nro,
                titulo="La columna calculada %s cierra contra su propia cuenta" % res,
                casos=total,
                detalle="Verificado en %s filas: %s." % (num(total), d.get("texto") or "")))
            continue
        salida.append(hallazgo(
            "coherencia", "observacion", base=base.nro,
            titulo="La columna %s no da la cuenta que deberia" % res, casos=malas,
            detalle="Se esperaba %s (tolerancia %s%%). Sobre %s filas comparadas."
                    % (d.get("texto") or "%s / %s" % (nume, deno), num(tol), num(total)),
            ejemplos=[_describir(base, f, "dice %s y la cuenta da %s"
                                 % (num(f["declarado"]), num(round(f["calculado"], 1))))
                      for f in filas],
            pregunta_jc="El %s de estas filas no coincide con la cuenta de produccion sobre "
                        "superficie. Cual es el bueno?" % res))
    return salida


@check_base
def actividad_sin_resultado(ctx, base):
    """Si hubo superficie cosechada tiene que haber produccion, y equivalentes."""
    reglas = base.reglas.get("coherencia_actividad") or []
    if not reglas or not base.tiene("medida", "valor"):
        return []
    salida = []
    for regla in reglas:
        a, b = regla["si"], regla["entonces"]
        sub, llaves = _pivot(base, [a, b])
        total, filas = q_contando(ctx.con, """
            SELECT %s, %s AS a, %s AS b FROM %s WHERE %s > 0 AND %s = 0 ORDER BY %s DESC, %s
        """ % (", ".join(llaves), a, b, sub, a, b, a, ", ".join(llaves)))
        if not total:
            continue
        salida.append(hallazgo(
            "coherencia", "observacion", base=base.nro,
            titulo="Hay filas donde no se cumple que %s"
                   % (regla.get("texto") or "%s > 0 implica %s > 0" % (a, b)),
            casos=total,
            ejemplos=[_describir(base, f, "%s = %s pero %s = 0" % (a, num(f["a"]), b))
                      for f in filas],
            propuesta="Mostrarlas como 'sin dato' en vez de como cero.",
            pregunta_jc="Estas filas tienen superficie cosechada pero produccion cero. "
                        "Se perdio la cosecha o falta el dato?"))
    return salida


@check_base
def sembrado_sin_cosechar(ctx, base):
    """Superficie sembrada > 0 con cosechada 0: tipico de cultivo que fue a pastoreo.

    No es un error, pero cambia como se lee un mapa de produccion: hay que distinguir
    'no se cosecho' de 'no hay dato'.
    """
    reglas = base.reglas.get("no_mayor_que") or []
    if not reglas or not base.tiene("medida", "valor"):
        return []
    menor, mayor = reglas[0]["menor"], reglas[0]["mayor"]
    categoria = base.col("categoria")
    if not categoria:
        return []
    sub, llaves = _pivot(base, [menor, mayor])
    filas = q(ctx.con, """
        SELECT %s, count(*) n, sum(%s) sup FROM %s WHERE %s > 0 AND %s = 0 GROUP BY 1
        ORDER BY n DESC, 1
    """ % (categoria, mayor, sub, mayor, menor))
    if not filas:
        return []
    total = sum(f["n"] for f in filas)
    return [hallazgo(
        "coherencia", "observacion", base=base.nro,
        titulo="Superficie sembrada que nunca se cosecho", casos=total,
        detalle="Son filas con superficie sembrada y cero superficie cosechada. Se concentran "
                "en %s. En un mapa de produccion estas filas aparecen en cero, que no es lo "
                "mismo que 'no se sembro'." % ", ".join(str(f[categoria]) for f in filas[:3]),
        ejemplos=["%s: %s casos, %s ha sembradas sin cosechar"
                  % (f[categoria], num(f["n"]), num(f["sup"])) for f in filas],
        propuesta="Distinguir en el sitio 'sembrado sin cosechar' de 'sin datos'.",
        pregunta_jc="Estos cultivos aparecen sembrados y con cero cosechado. Entiendo que es "
                    "porque se destinan a pastoreo y no se cosechan para grano. Confirmas?")]


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · unidades
# ---------------------------------------------------------------------------
@check_base
def unidades_declaradas(ctx, base):
    """Unidades que aparecen en el archivo vs las que declara el config de la base.

    En las bases DTV la unidad viene fila por fila y tiene que ser Kg. o Tn.: cualquier
    otra cosa (bultos, cajones, unidades) rompe cualquier suma de peso.
    """
    if "unidad" not in base.columnas:
        return []
    vistas = [f["unidad"] for f in q(
        ctx.con, "SELECT DISTINCT unidad FROM %s WHERE unidad IS NOT NULL ORDER BY 1" % base.tabla)]
    admitidas = base.reglas.get("unidades_admitidas")
    if admitidas is None:
        # Si reglas.yaml no las declara, valen las que ya declaro el config de la base.
        # Cada familia guarda las columnas de valor con un nombre distinto: `medidas` en
        # tidy, `valores` en dte. Se miran las dos.
        declaradas = dict(base.config.get("medidas") or {})
        declaradas.update(base.config.get("valores") or {})
        admitidas = sorted({m.get("unidad") for m in declaradas.values() if m.get("unidad")})
    salida = []
    raras = [u for u in vistas if u not in admitidas]
    if raras:
        conteos = q(ctx.con, """
            SELECT unidad, count(*) n FROM %s WHERE unidad IN (%s) GROUP BY 1 ORDER BY n DESC
        """ % (base.tabla, ", ".join(lit(u) for u in raras)))
        salida.append(hallazgo(
            "unidades", "bloqueante", base=base.nro,
            titulo="Unidades de medida que no estaban previstas", casos=len(raras),
            detalle="El archivo trae unidades distintas de las esperadas (%s). Si se suman "
                    "sin convertir, el total no significa nada." % ", ".join(admitidas),
            ejemplos=["%s: %s filas" % (f["unidad"], num(f["n"])) for f in conteos],
            propuesta="No publicar totales de peso hasta definir la conversion.",
            pregunta_jc="Aparecen estas unidades de medida: %s. A cuanto equivale cada una "
                        "en kilos?" % ", ".join(raras)))
    conversiones = ((base.config.get("unidades") or {}).get("conversiones")) or []
    if conversiones:
        salida.append(hallazgo(
            "unidades", "informativo", base=base.nro,
            titulo="Conversiones de unidad aplicadas al leer el archivo",
            casos=len(conversiones),
            ejemplos=[str(c) for c in conversiones]))
    return salida


@check_base
def producto_de_columnas(ctx, base):
    """CANT x PESO_UNITARIO = PESO_TOTAL, con tolerancia. Detecta columnas cambiadas.

    Pensado para las bases DTV, donde el peso total y el peso unitario a veces vienen
    en el orden invertido y la suma queda mil veces mas grande.
    """
    reglas = base.reglas.get("producto") or []
    if not reglas or not base.tiene("medida", "valor"):
        return []
    tol = float(ctx.dflt("tolerancia_producto_pct", 1.0))
    salida = []
    for r in reglas:
        a, b, total = r["factor_a"], r["factor_b"], r["total"]
        sub, llaves = _pivot(base, [a, b, total])
        cuantas, filas = q_contando(ctx.con, """
            SELECT %(k)s, %(a)s AS fa, %(b)s AS fb, %(t)s AS tot FROM %(s)s
            WHERE %(a)s > 0 AND %(b)s > 0 AND %(t)s > 0
              AND abs(%(a)s * %(b)s - %(t)s) > %(t)s * %(tol)f / 100
            ORDER BY abs(%(a)s * %(b)s - %(t)s) DESC, %(k)s
        """ % {"k": ", ".join(llaves), "a": a, "b": b, "t": total, "tol": tol, "s": sub})
        if not cuantas:
            continue
        salida.append(hallazgo(
            "unidades", "bloqueante", base=base.nro,
            titulo="Cantidad por peso unitario no da el peso total", casos=cuantas,
            detalle="Suele significar que dos columnas de la planilla estan intercambiadas.",
            ejemplos=[_describir(base, f, "%s x %s deberia dar %s"
                                 % (num(f["fa"]), num(f["fb"]), num(f["tot"]))) for f in filas],
            propuesta="No publicar pesos de esta base hasta confirmar el orden de las columnas.",
            pregunta_jc="En estas filas la cantidad por el peso unitario no da el peso total. "
                        "Puede ser que las columnas esten cambiadas de lugar?"))
    return salida


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · cobertura temporal y geografica
# ---------------------------------------------------------------------------
@check_base
def cobertura_temporal(ctx, base):
    """Periodos presentes vs los que JC declaro para la entrega, y huecos internos."""
    periodo = base.col("periodo")
    orden = base.col("orden_periodo") or periodo
    if not periodo:
        return []
    filas = q(ctx.con, """
        SELECT %s AS periodo, min(%s) AS orden, count(*) n FROM %s
        WHERE %s IS NOT NULL GROUP BY 1 ORDER BY 2
    """ % (periodo, orden, base.tabla, periodo))
    if not filas:
        return []
    declarado = base.reglas.get("periodos_declarados") or {}
    desde, hasta = declarado.get("desde"), declarado.get("hasta")
    presentes = [f["periodo"] for f in filas]
    salida = []

    if desde and hasta:
        dentro = [f for f in filas if desde <= f["periodo"] <= hasta]
        fuera = [f for f in filas if not (desde <= f["periodo"] <= hasta)]
        if fuera:
            salida.append(hallazgo(
                "cobertura-temporal", "observacion", base=base.nro,
                titulo="Periodos que aparecen fuera de lo que se habia declarado",
                casos=len(fuera),
                detalle="Se esperaba de %s a %s y el archivo trae ademas: %s."
                        % (desde, hasta, ", ".join(f["periodo"] for f in fuera)),
                ejemplos=["%s: %s filas" % (f["periodo"], num(f["n"])) for f in fuera],
                propuesta="Dejarlos afuera del sitio salvo que JC los quiera.",
                pregunta_jc="El archivo trae ademas los periodos %s, fuera de lo acordado. "
                            "Los mostramos o los sacamos?" % ", ".join(f["periodo"] for f in fuera)))
        # huecos internos dentro del rango declarado
        if dentro:
            ordenes = [f["orden"] for f in dentro if f["orden"] is not None]
            if ordenes:
                faltan = [o for o in range(min(ordenes), max(ordenes) + 1) if o not in ordenes]
                if faltan:
                    salida.append(hallazgo(
                        "cobertura-temporal", "bloqueante", base=base.nro,
                        titulo="Faltan periodos en el medio de la serie", casos=len(faltan),
                        detalle="Entre el primero y el ultimo periodo del archivo hay saltos: "
                                "un grafico de serie va a dibujar una linea recta sobre el hueco.",
                        ejemplos=[str(o) for o in faltan],
                        propuesta="Marcar el corte en el grafico en vez de unir los puntos.",
                        pregunta_jc="Faltan estos periodos en el medio: %s. Los conseguis?"
                                    % ", ".join(str(o) for o in faltan)))

    fuente = base.reglas.get("periodos_declarados_fuente") or {}
    if fuente.get("desde"):
        salida.append(hallazgo(
            "cobertura-temporal", "observacion", base=base.nro,
            titulo="El archivo cubre mucho menos que lo que declara el indice", casos=1,
            detalle="El indice dice que la fuente tiene datos desde %s hasta %s. El archivo "
                    "que llego arranca en %s y termina en %s."
                    % (fuente.get("desde"), fuente.get("hasta"), presentes[0], presentes[-1]),
            propuesta="Publicar lo que llego y aclarar el periodo cubierto al pie.",
            pregunta_jc="El indice dice que esta base va desde %s, pero el archivo arranca en "
                        "%s. Nos mandas la serie larga o trabajamos con este recorte?"
                        % (fuente.get("desde"), presentes[0])))

    salida.append(hallazgo(
        "cobertura-temporal", "informativo", base=base.nro,
        titulo="Periodos que trae el archivo", casos=len(presentes),
        detalle="De %s a %s." % (presentes[0], presentes[-1]),
        ejemplos=["%s: %s filas" % (f["periodo"], num(f["n"])) for f in filas]))
    return salida


@check_base
def medida_con_cobertura_parcial(ctx, base):
    """Una medida que la fuente informa solo en algunos periodos.

    Caso que lo motivo: la base 48 trae "Cantidad de UP" (unidades productivas) cargada
    recien desde 2022, y vacia en 2012-2021. Sin este aviso, un grafico de esa medida
    arranca en cero diez anios y parece que los establecimientos aparecieron de la nada.

    No confundir con un hueco en el medio de la serie (eso lo mira `cobertura_temporal`):
    aca la serie de la base esta completa y lo que esta parcial es UNA medida.
    """
    periodo = base.col("periodo")
    if not periodo or not base.tiene("medida", "valor"):
        return []
    filas = q(ctx.con, """
        WITH universo AS (SELECT count(DISTINCT %(per)s) n FROM %(tab)s)
        SELECT medida,
               count(DISTINCT %(per)s) FILTER (WHERE valor IS NOT NULL) AS con_dato,
               (SELECT n FROM universo) AS total,
               string_agg(DISTINCT CAST(%(per)s AS VARCHAR), ', '
                          ORDER BY CAST(%(per)s AS VARCHAR))
                   FILTER (WHERE valor IS NOT NULL) AS cuales
        FROM %(tab)s GROUP BY medida ORDER BY medida
    """ % {"per": periodo, "tab": base.tabla})
    salida = []
    for f in filas:
        # 0 de N no es cobertura parcial: es una medida que la base no trae, y de eso ya
        # avisa el propio config al declararla.
        if not f["con_dato"] or f["con_dato"] >= f["total"]:
            continue
        salida.append(hallazgo(
            "cobertura-temporal", "observacion", base=base.nro,
            titulo="La columna %s viene cargada solo en algunos periodos" % f["medida"],
            casos=f["total"] - f["con_dato"],
            detalle="De %d periodos del archivo, %s tiene dato en %d. En los otros la celda "
                    "viene vacia, que no es lo mismo que cero."
                    % (f["total"], f["medida"], f["con_dato"]),
            ejemplos=["con dato: %s" % f["cuales"]],
            propuesta="Mostrar esa medida solo en los periodos que la tienen, nunca como "
                      "cero en los demas.",
            pregunta_jc="La columna %s esta cargada solo en %s. La fuente empezo a informarla "
                        "ahi o se puede conseguir para los anios anteriores?"
                        % (f["medida"], f["cuales"])))
    return salida


@check_base
def padron_geografico(ctx, base):
    """Faltan unidades geograficas respecto del padron oficial (ej. 27 deptos de SDE)."""
    padrones = base.reglas.get("padron_geo") or []
    if not padrones or "provincia_id" not in base.columnas:
        return []
    salida = []
    for p in padrones:
        pid = p["provincia_id"]
        nivel = "AND nivel_geo = 'departamento'" if "nivel_geo" in base.columnas else ""
        vistos = q(ctx.con, """
            SELECT DISTINCT geo_id, geo_nombre FROM %s WHERE provincia_id = %d %s ORDER BY 1
        """ % (base.tabla, pid, nivel))
        esperadas = int(p.get("unidades_esperadas") or 0)
        if not esperadas or len(vistos) >= esperadas:
            continue
        conocidos = (ctx.geo_alias.get("departamentos") or {}).get(pid) or {}
        nombres_vistos = set(v["geo_nombre"] for v in vistos)
        salida.append(hallazgo(
            "geo", "observacion", base=base.nro,
            titulo="Faltan departamentos respecto del total de la provincia",
            casos=esperadas - len(vistos),
            detalle="%s tiene %d departamentos y el archivo trae %d. Los que faltan no "
                    "aparecen en ninguna campania, ni siquiera en cero."
                    % (p.get("nombre", pid), esperadas, len(vistos)),
            ejemplos=["en el archivo aparecen: %s" % ", ".join(sorted(nombres_vistos)),
                      "en la tabla de departamentos conocidos hay %d nombres" % len(conocidos)],
            propuesta="Pintar el departamento faltante como 'sin datos' en el mapa, nunca "
                      "como cero.",
            pregunta_jc="En esta base falta %d departamento(s) de %s. Es porque ahi no se "
                        "siembra este tipo de cultivo, o falta el dato en la fuente?"
                        % (esperadas - len(vistos), p.get("nombre", pid))))
    return salida


@check_base
def categorias_entre_particiones(ctx, base):
    """Productos que estan en una hoja y no en otra.

    Importa para las comparaciones: si el total pais no trae el mismo producto que la
    provincia, la participacion no se puede calcular.
    """
    particion = base.col("particion")
    categoria = base.col("categoria")
    referencia = base.reglas.get("particiones_de_referencia") or []
    if not particion or not categoria or not referencia:
        return []
    principal = q(ctx.con, "SELECT DISTINCT %s p FROM %s WHERE %s NOT IN (%s)"
                  % (particion, base.tabla, particion,
                     ", ".join(lit(r) for r in referencia)))
    if not principal:
        return []
    nombre_principal = sorted(f["p"] for f in principal)[0]
    cats = {}
    for f in q(ctx.con, "SELECT DISTINCT %s p, %s c FROM %s ORDER BY 1, 2"
               % (particion, categoria, base.tabla)):
        cats.setdefault(f["p"], set()).add(f["c"])
    base_cats = cats.get(nombre_principal, set())
    salida = []
    for ref in sorted(referencia):
        if ref not in cats:
            continue
        faltan_en_ref = sorted(base_cats - cats[ref])
        if not faltan_en_ref:
            continue
        salida.append(hallazgo(
            "cobertura-productos", "observacion", base=base.nro,
            titulo="Productos que estan en '%s' y no en '%s'" % (nombre_principal, ref),
            casos=len(faltan_en_ref),
            detalle="Sin el mismo producto en las dos hojas no se puede calcular cuanto pesa "
                    "la provincia sobre ese total.",
            ejemplos=faltan_en_ref,
            propuesta="Dejar afuera la comparacion de esos productos, o armar el total "
                      "sumando las categorias que si estan, con una regla escrita.",
            pregunta_jc="En la hoja '%s' no figura %s, que si esta en la hoja de la provincia. "
                        "Lo armamos sumando las variedades o nos mandas la fila del total?"
                        % (ref, ", ".join(faltan_en_ref[:3]))))
    return salida


# ---------------------------------------------------------------------------
# CHECKS DE DATOS · forma de la serie (perfil del dato, no error)
# ---------------------------------------------------------------------------
@check_base
def valor_repetido_entre_periodos(ctx, base):
    """El mismo numero exacto repetido muchos periodos seguidos para el mismo lugar.

    Puede ser un dato arrastrado de un ano al otro, o una estimacion fija. Cambia como
    hay que leer una serie: si la superficie 'no se movio' en 10 campanias, capaz nunca
    se midio.
    """
    periodo = base.col("periodo")
    categoria = base.col("categoria")
    if not periodo or not categoria or "geo_id" not in base.columnas:
        return []
    minimo = int(ctx.dflt("repeticion_min_periodos", 5))
    nivel = "AND nivel_geo = 'departamento'" if "nivel_geo" in base.columnas else ""
    filas = q(ctx.con, """
        SELECT geo_nombre, %s AS categoria, medida, valor, count(*) periodos,
               string_agg(%s, ', ' ORDER BY %s) cuales
        FROM %s WHERE valor > 0 %s
        GROUP BY 1, 2, 3, 4 HAVING count(*) >= %d
        ORDER BY periodos DESC, valor DESC, geo_nombre, categoria, medida
    """ % (categoria, periodo, periodo, base.tabla, nivel, minimo))
    if not filas:
        return []
    return [hallazgo(
        "serie", "observacion", base=base.nro,
        titulo="El mismo numero repetido en %d o mas periodos seguidos" % minimo,
        casos=len(filas),
        detalle="Para un mismo lugar y una misma categoria, el valor no cambia nunca en varios "
                "periodos seguidos. Suele indicar una estimacion fija mas que una medicion.",
        ejemplos=["%s, %s: %s = %s en %s periodos (%s)"
                  % (f["geo_nombre"], f["categoria"], f["medida"], num(f["valor"]),
                     num(f["periodos"]), f["cuales"]) for f in filas],
        propuesta="Publicar igual, con nota al pie de que hay valores estimados.",
        # Neutro a proposito: el mismo check corre sobre cultivos y sobre hacienda, y hablar de
        # "superficie sembrada" en el reporte de una base ganadera confunde al que lo lee.
        pregunta_jc="Hay lugares donde el mismo valor se repite exactamente todos los anos. "
                    "Son estimaciones de la fuente?")]


@check_base
def saltos_de_serie(ctx, base):
    """Un valor que se multiplica o se divide por mucho de un periodo al siguiente."""
    periodo = base.col("periodo")
    orden = base.col("orden_periodo")
    categoria = base.col("categoria")
    if not periodo or not orden or not categoria or "geo_id" not in base.columnas:
        return []
    factor = float(ctx.dflt("salto_serie_factor", 5))
    nivel = "AND nivel_geo = 'departamento'" if "nivel_geo" in base.columnas else ""
    sumables = base.reglas.get("medidas_sumables") or []
    filtro = ("AND medida IN (%s)" % ", ".join(lit(m) for m in sumables)) if sumables else ""
    filas = q(ctx.con, """
        WITH x AS (
            SELECT geo_nombre, %(cat)s AS categoria, medida, %(per)s AS periodo, %(ord)s AS orden, valor,
                   lag(valor) OVER (PARTITION BY geo_id, %(cat)s, medida ORDER BY %(ord)s) prev,
                   lag(%(per)s) OVER (PARTITION BY geo_id, %(cat)s, medida ORDER BY %(ord)s) prev_p,
                   lag(%(ord)s) OVER (PARTITION BY geo_id, %(cat)s, medida ORDER BY %(ord)s) prev_o
            FROM %(tab)s WHERE valor IS NOT NULL %(niv)s %(fil)s
        )
        SELECT geo_nombre, categoria, medida, prev_p, prev, periodo, valor
        FROM x WHERE prev > 0 AND valor > 0 AND orden = prev_o + 1
          AND (valor / prev > %(f)f OR prev / valor > %(f)f)
        ORDER BY abs(valor - prev) DESC, geo_nombre, categoria, medida, periodo
    """ % {"cat": categoria, "per": periodo, "ord": orden, "tab": base.tabla,
           "niv": nivel, "fil": filtro, "f": factor})
    if not filas:
        return []
    return [hallazgo(
        "serie", "informativo", base=base.nro,
        titulo="Saltos grandes de un periodo al siguiente (mas de %sx)" % num(factor),
        casos=len(filas),
        detalle="Saltos asi suelen ser reales: en agricultura se cambia de cultivo segun el "
                "precio y la lluvia, y en ganaderia se mueve o se recategoriza la hacienda. "
                "Se listan para que JC confirme los mas grandes.",
        ejemplos=["%s, %s: %s pasa de %s en %s a %s en %s"
                  % (f["geo_nombre"], f["categoria"], f["medida"], num(f["prev"]),
                     f["prev_p"], num(f["valor"]), f["periodo"]) for f in filas],
        propuesta="Publicar sin tocar. Es informacion de contexto para leer los graficos.")]


@check_base
def numeros_redondos(ctx, base):
    """Cuanto del dato son numeros redondos: separa lo medido de lo estimado.

    Si el 80% de los rendimientos de una hoja son multiplos exactos de 100 y en otra
    hoja ninguno lo es, las dos hojas no se armaron igual.
    """
    if not base.tiene("medida", "valor"):
        return []
    particion = base.col("particion")
    if not particion:
        return []
    filas = q(ctx.con, """
        SELECT %s AS particion, count(*) n,
               sum(CASE WHEN valor > 0 AND valor %% 100 = 0 THEN 1 ELSE 0 END) redondos
        FROM %s WHERE valor > 0 GROUP BY 1 ORDER BY 1
    """ % (particion, base.tabla))
    filas = [f for f in filas if f["n"] >= 50]
    if len(filas) < 2:
        return []
    pcts = [(f["particion"], f["n"], round(f["redondos"] * 100.0 / f["n"], 1)) for f in filas]
    if max(p[2] for p in pcts) - min(p[2] for p in pcts) < 30:
        return []
    return [hallazgo(
        "serie", "observacion", base=base.nro,
        titulo="Una parte del archivo esta cargada con numeros redondos y otra no",
        casos=len(pcts),
        detalle="Los numeros redondos (multiplos exactos de 100) suelen ser estimaciones. "
                "La diferencia entre hojas indica que no se armaron con el mismo criterio.",
        ejemplos=["%s: %s%% de los valores son numeros redondos (%s valores)"
                  % (p[0], num(p[2]), num(p[1])) for p in pcts],
        propuesta="Aclarar al pie que el dato departamental es estimado.",
        pregunta_jc="El dato por departamento viene con muchos numeros redondos y el total "
                    "pais no. Entiendo que lo departamental es una estimacion de la fuente. "
                    "Lo aclaramos al pie del cuadro?")]


# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------
ORDEN_SEVERIDAD = {"bloqueante": 0, "observacion": 1, "informativo": 2}


def escribir_hallazgos(entrega, hallazgos, resumen):
    os.makedirs(DIR_HALLAZGOS, exist_ok=True)
    ruta = os.path.join(DIR_HALLAZGOS, "%s.yaml" % entrega)
    doc = {
        "descripcion": (
            "Hallazgos de las validaciones. GENERADO por pipeline/validations.py, no "
            "editar a mano. El reporte para JC se escribe a partir de esto en "
            "validations/reportes/%s.md" % entrega
        ),
        "entrega": entrega,
        "resumen": resumen,
        "hallazgos": hallazgos,
    }
    with open(ruta, "w", encoding="utf-8") as f:
        yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True,
                       default_flow_style=False, width=100)
    return ruta


def correr(entrega, con):
    ctx = Contexto(entrega, con)
    hallazgos = []
    for fn in CHECKS_ENTREGA:
        hallazgos.extend(fn(ctx) or [])
    bases = []
    for nro, ruta in ctx.bases_ingeridas():
        base = Base(ctx, nro, ruta)
        bases.append(base)
        for fn in CHECKS_BASE:
            hallazgos.extend(fn(ctx, base) or [])

    hallazgos.sort(key=lambda h: (ORDEN_SEVERIDAD.get(h["severidad"], 9),
                                  h["base"] if h["base"] is not None else -1,
                                  h["check"], h["titulo"]))
    resumen = {
        "bases_ingeridas": [b.nro for b in bases],
        "filas_revisadas": sum(b.filas for b in bases),
        "checks_corridos": len(CHECKS_ENTREGA) + len(CHECKS_BASE) * len(bases),
        "bloqueantes": sum(1 for h in hallazgos if h["severidad"] == "bloqueante"),
        "observaciones": sum(1 for h in hallazgos if h["severidad"] == "observacion"),
        "informativos": sum(1 for h in hallazgos if h["severidad"] == "informativo"),
    }
    return hallazgos, resumen


def main(args=None):
    p = argparse.ArgumentParser(prog="pipeline.validations")
    p.add_argument("--entrega", help="ej. entrega-01. Por defecto, todas las de configs/entregas/")
    p.add_argument("--estricto", action="store_true",
                   help="salir con codigo 1 si hay hallazgos bloqueantes")
    ns = p.parse_args(args)

    if ns.entrega:
        entregas = [ns.entrega]
    else:
        entregas = sorted(
            n[:-5] for n in os.listdir(DIR_ENTREGAS)
            if n.startswith("entrega-") and n.endswith(".yaml")
        )
    if not entregas:
        print("[check] No hay manifiestos en configs/entregas/. Corre antes: make ingest")
        return

    bloqueantes = 0
    con = duckdb.connect()
    try:
        for entrega in entregas:
            hallazgos, resumen = correr(entrega, con)
            ruta = escribir_hallazgos(entrega, hallazgos, resumen)
            bloqueantes += resumen["bloqueantes"]
            print("[check] %s: %d filas revisadas en %d base(s), %d checks"
                  % (entrega, resumen["filas_revisadas"],
                     len(resumen["bases_ingeridas"]), resumen["checks_corridos"]))
            for h in hallazgos:
                print("[check]   %-11s base %-4s %s (%s)"
                      % (h["severidad"], h["base"], h["titulo"], num(h["casos"])))
            print("[check] %d bloqueante(s), %d observacion(es), %d informativo(s) -> %s"
                  % (resumen["bloqueantes"], resumen["observaciones"],
                     resumen["informativos"], os.path.relpath(ruta, RAIZ)))
    finally:
        con.close()

    if ns.estricto and bloqueantes:
        sys.exit("[check] Hay %d hallazgo(s) bloqueante(s)." % bloqueantes)


if __name__ == "__main__":
    main(sys.argv[1:])
