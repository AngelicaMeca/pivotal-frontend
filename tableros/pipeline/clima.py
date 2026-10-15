"""Acceso a los hechos de la base 111 (datos diarios de las estaciones del INTA en Santiago).

El mismo papel que pipeline/forrajeras.py para la base 43: resuelve en un solo init lo que
necesita la capa de presentacion, para que los constructores de la pagina "Estaciones
agrometeorologicas INTA" no escriban SQL.

Lo que este archivo NO decide (lo decide el spec, _comunes-agroclima.yaml):
  - que variables se muestran y en que orden (las 11 columnas de la maqueta de JC);
  - cuantos dias abarca "el ultimo anio";
  - que tramos de que estacion no se publican (los recortes del control de calidad).

Lo que si hace cumplir:
  1. Nulo es nulo. Un dia que la hoja no trae y un dia que trae vacio son los dos "sin dato";
     nunca se convierten en cero.
  2. "No se mide en esta estacion" es una propiedad de la HOJA, no del periodo: una variable
     que la estacion no trae como columna, o que trae vacia en TODA su serie, no la mide. Una
     variable con datos en la historia y ninguno en el ultimo anio SI la mide (se muestra sin
     dato), y esa diferencia es la que JC pide que se vea ("NO TODAS LAS ESTACIONES TIENEN LAS
     MISMAS VARIABLES (DEBEN ESPECIFICARSE)").
  3. El periodo cubierto de cada estacion es el que traen los DATOS (primer y ultimo dia con
     algun valor), no el declarado en la hoja "Estaciones" (reporte entrega-03, punto 16).
"""
import datetime
import os
import sys

DIR_MARTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "marts")
MART = "hecho_clima_diario.parquet"


def _ruta():
    ruta = os.path.join(DIR_MARTS, MART)
    if not os.path.exists(ruta):
        sys.exit("[site] Falta marts/%s. Corre antes: make ingest && python -m pipeline.marts"
                 % MART)
    return ruta.replace("'", "''")


class ClimaDiario:
    """Las estaciones y sus valores diarios de la ventana publicada, resueltos en un init.

    `variables` es la lista de variables CANONICAS que se van a leer (las del spec). `dias` es
    el largo de la ventana: termina en el ultimo dia con algun dato de TODA la base (no de cada
    estacion), asi que todas las estaciones se miran sobre el mismo anio.
    """

    def __init__(self, con, variables, dias):
        ruta = _ruta()
        self.variables = list(variables)
        lista = ", ".join("'%s'" % v for v in self.variables)
        con_dato = "(valor IS NOT NULL OR valor_texto IS NOT NULL)"

        # El ultimo dia con algun dato en toda la base: el fin de la ventana.
        self.hasta = con.execute(
            "SELECT max(fecha) FROM read_parquet('%s') WHERE %s" % (ruta, con_dato)).fetchone()[0]
        self.desde = self.hasta - datetime.timedelta(days=dias - 1)
        self.fechas = [self.desde + datetime.timedelta(days=i) for i in range(dias)]

        # Las estaciones, con lo que dice la hoja "Estaciones" y el periodo que traen los datos.
        self.estaciones = {}
        for fila in con.execute("""
                SELECT estacion_id, any_value(estacion), any_value(estacion_nombre),
                       any_value(estacion_tipo), any_value(localidad),
                       any_value(latitud), any_value(longitud), any_value(altura),
                       any_value(estacion_desde_declarado), any_value(estacion_hasta_declarado),
                       min(fecha) FILTER (WHERE %s), max(fecha) FILTER (WHERE %s),
                       any_value(fuente)
                FROM read_parquet('%s')
                GROUP BY estacion_id
                ORDER BY estacion_id
                """ % (con_dato, con_dato, ruta)).fetchall():
            (eid, corto, nombre, tipo, localidad, lat, lon, altura,
             desde_decl, hasta_decl, primero, ultimo, fuente) = fila
            self.estaciones[int(eid)] = {
                "id": int(eid), "nombre": corto, "nombre_inta": nombre, "tipo": tipo,
                "localidad": localidad, "latitud": lat, "longitud": lon, "altura": altura,
                "desde_declarado": desde_decl, "hasta_declarado": hasta_decl,
                "primer_dato": primero, "ultimo_dato": ultimo, "fuente": fuente,
            }

        # Que variables trae cada hoja (columna presente) y cuales tienen ALGUN dato en toda
        # la serie de esa estacion. Una variable presente y vacia de punta a punta no se mide.
        self.trae = {e: set() for e in self.estaciones}
        self.mide = {e: set() for e in self.estaciones}
        for eid, variable, con_valor in con.execute("""
                SELECT estacion_id, variable, count(*) FILTER (WHERE %s)
                FROM read_parquet('%s')
                WHERE variable IN (%s)
                GROUP BY ALL ORDER BY ALL
                """ % (con_dato, ruta, lista)).fetchall():
            self.trae[int(eid)].add(variable)
            if con_valor:
                self.mide[int(eid)].add(variable)

        # Los valores de la ventana: (estacion_id, fecha, variable) -> valor. Solo los que
        # tienen dato; lo que no esta en el diccionario es "sin dato".
        self.valor = {}
        for eid, fecha, variable, valor in con.execute("""
                SELECT estacion_id, fecha, variable, valor
                FROM read_parquet('%s')
                WHERE variable IN (%s) AND fecha BETWEEN DATE '%s' AND DATE '%s'
                  AND valor IS NOT NULL
                ORDER BY ALL
                """ % (ruta, lista, self.desde.isoformat(), self.hasta.isoformat())).fetchall():
            self.valor[(int(eid), fecha, variable)] = valor

        self.fuentes = sorted({e["fuente"] for e in self.estaciones.values() if e["fuente"]})

    def dato(self, estacion, fecha, variable):
        return self.valor.get((estacion, fecha, variable))

    def dias_con_dato(self, estacion):
        """Los dias de la ventana en que la estacion trae ALGUNA de las variables leidas."""
        return sorted({f for (e, f, _v) in self.valor if e == estacion})
