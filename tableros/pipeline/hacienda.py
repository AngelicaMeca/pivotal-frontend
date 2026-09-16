"""Capa de datos de la base 85 (movimientos de hacienda, familia dte) para el sitio.

Lo usa pipeline/site_build.py. Aca NO hay nada de presentacion: ni titulos, ni colores, ni
formato de numeros. Solo agregados.

Por que este archivo existe aparte de la clase `Hechos` de la base 9: el hecho de cultivos son
11.728 filas y entran enteras en memoria, asi que la clase levanta todo y despues filtra en
Python. El hecho de hacienda son 1.104.768 filas (46.032 movimientos por 24 columnas del Excel)
y no tiene sentido pasarlas de a una por el interprete: los agregados se hacen en DuckDB, que
para eso esta, y lo que sube a Python son las tablas ya resumidas (unas pocas miles de filas).

LOS CUATRO UNIVERSOS son la definicion mas importante del archivo y estan copiados de
specs/modelos/_comunes-base-85.yaml. Si alguna vez cambian, cambian en los dos lados y se
vuelve a correr la verificacion contra la planilla de JC.

Dos filtros se aplican SIEMPRE, en todas las consultas:
  - `especie = 'bovinos'`: el archivo trae ademas 845 cabezas de bufalos, que son otra especie.
  - `NOT es_agregado_fila`: las dos hojas cierran con una fila de totales que no es un
    movimiento (y que ademas no cierra, ver el reporte de la entrega). Todos los totales del
    sitio se calculan sumando el detalle.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MARTS = os.path.join(RAIZ, "marts")

# id de universo -> el WHERE que lo define. Ver _comunes-base-85.universos.
RECORTES = {
    "totales_sin_introduccion": "sentido = 'salida'",
    "internos": "alcance = 'interno'",
    "extraccion": "alcance = 'egreso'",
    "introduccion": "sentido = 'entrada'",
}

# Los recortes cuyo ORIGEN es un departamento de Santiago. Son los unicos sobre los que tiene
# sentido un ranking o un mapa departamental: en la introduccion el origen esta en otra
# provincia y el departamento santiaguenio es el destino, que es otra pregunta.
RECORTES_CON_ORIGEN_PROPIO = ["totales_sin_introduccion", "internos", "extraccion"]

MEDIDAS = ["cabezas", "documentos"]
MEDIDAS_ESTABLECIMIENTO = ["ingreso_establecimiento", "egreso_establecimiento"]

UNIDAD = {"cabezas": "cabezas", "documentos": "dte",
          "ingreso_establecimiento": "cabezas", "egreso_establecimiento": "cabezas",
          "balance_cabezas": "cabezas"}

ETIQUETA_MEDIDA = {"cabezas": "Cabezas movidas", "documentos": "DTE emitidos",
                   "ingreso_establecimiento": "Ingresos", "egreso_establecimiento": "Egresos"}

NOMBRE_EJE = {"cabezas": "Cabezas", "dte": "Documentos"}

PROVINCIA_PROPIA = 86      # INDEC Santiago del Estero. `provincia` es parametro (CLAUDE.md).

# Un DTE puede amparar animales de varias categorias, asi que la fuente informa un solo conteo
# de documentos por movimiento y no lo abre por categoria. En el mart eso queda como
# categoria = 'Total'. Las vistas que combinan un selector de medida con uno de categoria
# tienen que saberlo: para `documentos` la categoria elegida no cambia el numero.
CATEGORIA_DE_DOCUMENTOS = "Total"


def _filtro(recorte):
    return "especie = 'bovinos' AND NOT es_agregado_fila AND " + RECORTES[recorte]


class Hacienda:
    """Todos los agregados que necesitan las 15 vistas de la base 85, resueltos en un init."""

    def __init__(self, con):
        ruta = os.path.join(DIR_MARTS, "hecho_movimientos_hacienda.parquet")
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/hecho_movimientos_hacienda.parquet. "
                     "Corre antes: make ingest && make marts")
        self.tabla = "read_parquet('%s')" % ruta.replace("'", "''")

        self.anual = {}         # (recorte, anio, categoria, medida) -> valor
        self.depto = {}         # (recorte, anio, geo_id, categoria, medida) -> valor
        self.mes = {}           # (recorte, anio, mes, categoria, medida) -> valor
        self.motivo = {}        # (recorte, anio, motivo, categoria, medida) -> valor
        self.contraparte = {}   # (recorte, anio, provincia, categoria, medida) -> valor
        self.od = {}            # (anio, geo_origen, geo_destino, categoria, medida) -> valor
        self.establecimiento = {}   # (anio, tipo, geo_id_o_None, medida) -> valor

        self.motivos = {}       # recorte -> [motivo] ordenados por volumen total
        self.contrapartes = {}  # recorte -> [provincia] ordenadas por volumen total
        self.fuentes = set()

        self._cargar(con)
        self._cargar_geo(con)

    # -- carga -----------------------------------------------------------
    def _consulta(self, con, recorte, campos, extra=""):
        """Un GROUP BY sobre un recorte. `campos` son las columnas de apertura."""
        lista = ", ".join(campos)
        sql = """
            SELECT %s, categoria, medida, sum(valor)
            FROM %s
            WHERE %s AND medida IN ('cabezas', 'documentos') %s
            GROUP BY ALL
        """ % (lista, self.tabla, _filtro(recorte), extra)
        return con.execute(sql).fetchall()

    def _cargar(self, con):
        for fuente, in con.execute(
                "SELECT DISTINCT fuente FROM %s ORDER BY 1" % self.tabla).fetchall():
            self.fuentes.add(fuente)

        anios = set()
        for recorte in sorted(RECORTES):
            for anio, categoria, medida, valor in self._consulta(con, recorte, ["anio"]):
                if anio is None:
                    continue
                anios.add(anio)
                self.anual[(recorte, anio, categoria, medida)] = valor

            for anio, mes, categoria, medida, valor in self._consulta(
                    con, recorte, ["anio", "mes"]):
                if anio is None or mes is None:
                    continue
                self.mes[(recorte, anio, mes, categoria, medida)] = valor

            for motivo, anio, categoria, medida, valor in self._consulta(
                    con, recorte, ["motivo", "anio"], "AND motivo IS NOT NULL"):
                if anio is None:
                    continue
                self.motivo[(recorte, anio, motivo, categoria, medida)] = valor

        for recorte in RECORTES_CON_ORIGEN_PROPIO:
            for geo, anio, categoria, medida, valor in self._consulta(
                    con, recorte, ["origen_geo_id", "anio"],
                    "AND origen_provincia_id = %d AND origen_geo_id IS NOT NULL"
                    % PROVINCIA_PROPIA):
                if anio is None:
                    continue
                self.depto[(recorte, anio, geo, categoria, medida)] = valor

        # La contraparte del movimiento: a que provincia se fue la hacienda que salio, y de
        # cual vino la que entro. Es la unica apertura geografica posible fuera de Santiago:
        # los partidos de destino no se resuelven a codigo INDEC (son 122 y no hay padron).
        for recorte, columna in (("extraccion", "destino_provincia"),
                                 ("introduccion", "origen_provincia")):
            for nombre, anio, categoria, medida, valor in self._consulta(
                    con, recorte, [columna, "anio"], "AND %s IS NOT NULL" % columna):
                if anio is None:
                    continue
                self.contraparte[(recorte, anio, nombre, categoria, medida)] = valor

        for origen, destino, anio, categoria, medida, valor in self._consulta(
                con, "internos", ["origen_geo_id", "destino_geo_id", "anio"],
                "AND origen_geo_id IS NOT NULL AND destino_geo_id IS NOT NULL"):
            if anio is None or not valor:
                continue
            self.od[(anio, origen, destino, categoria, medida)] = valor

        # Tambos y engorde a corral. No son una categoria mas: son un recorte de los mismos
        # animales ya contados en los cuadros de arriba (JC lo escribio en mayuscula). Van con
        # su propia clave para que ninguna suma los agarre por accidente.
        filas = con.execute("""
            SELECT anio, categoria, origen_geo_id, medida, sum(valor)
            FROM %s
            WHERE %s AND medida IN ('ingreso_establecimiento', 'egreso_establecimiento')
            GROUP BY ALL
        """ % (self.tabla, _filtro("totales_sin_introduccion"))).fetchall()
        for anio, tipo, geo, medida, valor in filas:
            if anio is None:
                continue
            self.establecimiento[(anio, tipo, geo, medida)] = \
                self.establecimiento.get((anio, tipo, geo, medida), 0.0) + valor
            self.establecimiento[(anio, tipo, None, medida)] = \
                self.establecimiento.get((anio, tipo, None, medida), 0.0) + valor

        self.anios = sorted(anios)
        self.motivos = {r: self._por_volumen(self.motivo, r) for r in sorted(RECORTES)}
        self.contrapartes = {r: self._por_volumen(self.contraparte, r)
                             for r in ("extraccion", "introduccion")}

    def _por_volumen(self, tabla, recorte):
        """Los valores de una apertura, ordenados por su volumen total en toda la serie.

        El orden es de la LISTA DE OPCIONES, no del cuadro: el cuadro se ordena por el año que
        el usuario tenga elegido. Se hace sobre la serie completa para que la lista no cambie
        de orden cada vez que se cambia de año.
        """
        totales = {}
        for (rec, _anio, valor_apertura, categoria, medida), valor in tabla.items():
            if rec != recorte or categoria != "Total" or medida != "cabezas":
                continue
            totales[valor_apertura] = totales.get(valor_apertura, 0.0) + valor
        return [k for k in sorted(totales, key=lambda k: (-totales[k], k))]

    def _cargar_geo(self, con):
        self.nombre, self.deptos = {}, []
        ruta = os.path.join(DIR_MARTS, "dim_geo.parquet")
        for geo_id, nivel, nombre, provincia in con.execute(
                "SELECT geo_id, nivel_geo, nombre, provincia FROM read_parquet('%s') "
                "ORDER BY geo_id" % ruta).fetchall():
            self.nombre[geo_id] = nombre
            if nivel == "departamento" and provincia == "sde":
                self.deptos.append(geo_id)

    # -- accesos ---------------------------------------------------------
    def categoria_efectiva(self, medida, categoria):
        """Para `documentos` la categoria elegida no aplica: ver CATEGORIA_DE_DOCUMENTOS."""
        return CATEGORIA_DE_DOCUMENTOS if medida == "documentos" else categoria

    def total_anual(self, recorte, anio, categoria, medida):
        return self.anual.get(
            (recorte, anio, self.categoria_efectiva(medida, categoria), medida))

    def total_depto(self, recorte, anio, geo, categoria, medida):
        return self.depto.get(
            (recorte, anio, geo, self.categoria_efectiva(medida, categoria), medida))

    def total_mes(self, recorte, anio, mes, categoria, medida):
        return self.mes.get(
            (recorte, anio, mes, self.categoria_efectiva(medida, categoria), medida))

    def total_motivo(self, recorte, anio, motivo, categoria, medida):
        return self.motivo.get(
            (recorte, anio, motivo, self.categoria_efectiva(medida, categoria), medida))

    def total_contraparte(self, recorte, anio, nombre, categoria, medida):
        return self.contraparte.get(
            (recorte, anio, nombre, self.categoria_efectiva(medida, categoria), medida))

    def total_od(self, anio, origen, destino, categoria, medida):
        return self.od.get(
            (anio, origen, destino, self.categoria_efectiva(medida, categoria), medida))

    def deptos_con_movimiento(self, recorte):
        """Los departamentos que aparecen como origen en el recorte, en algun año."""
        vistos = {clave[2] for clave in self.depto if clave[0] == recorte}
        return [g for g in self.deptos if g in vistos]
