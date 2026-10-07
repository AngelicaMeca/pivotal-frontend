"""Acceso a los hechos de la base 43 (recursos forrajeros, Observatorio Forrajero Nacional).

El mismo papel que pipeline/stock.py para la base 48: resuelve en un solo init todos los
agregados que necesita la capa de presentacion, para que los constructores de vistas no
escriban SQL.

Que mide la base, porque es lo que mas se presta a confusion: NO mide cuanto pasto hubo. Mide
si hubo mas o menos que lo habitual. Cada quincena el Observatorio compara la produccion de
materia seca estimada contra el promedio historico de esa misma quincena y clasifica cada
porcion del territorio en una de cinco bandas. "Alto" quiere decir mas pasto que lo normal para
esa epoca del anio en ese lugar, no mucho pasto.

Dos reglas del dato que este archivo hace cumplir:

  1. La banda 6 ("Sin dato o agricultura") NO es una banda de productividad: es el resto del
     territorio que la fuente no clasifica. Entra en las hectareas y en el grafico de
     composicion, pero NUNCA en el denominador de un porcentaje. Por eso `participacion` se
     lee del dato y no se recalcula: la fuente ya la trae sobre las cinco bandas.
  2. El total provincial se calcula SUMANDO departamentos, igual que en las otras bases: el
     mart no trae fila provincial.

El grano que llega es el de la fuente, la QUINCENA. El mes es una lectura encima, y cual de las
dos quincenas lo representa lo decide el spec (hoy la primera, que es como lo arma JC y es
ademas la serie completa): este archivo ofrece las dos y no elige.
"""
import os
import sys

DIR_MARTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "marts")

# El orden de las bandas es el de la escala, de peor a mejor, con la sin-clasificar al final.
# No es alfabetico ni se puede reordenar: es una escala ORDENADA y el grafico apilado la dibuja
# en este orden.
BANDAS = ["muy_bajo", "bajo", "promedio", "alto", "muy_alto", "sin_dato"]

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

SQL = """
    SELECT anio, mes, quincena, orden_periodo, geo_id, banda, medida, sum(valor)
    FROM read_parquet('%s')
    WHERE valor IS NOT NULL
    GROUP BY ALL
    ORDER BY anio, mes, quincena, geo_id, banda, medida
"""


class Forrajeras:
    """Todos los agregados de la base 43, resueltos en un init."""

    def __init__(self, con):
        ruta = os.path.join(DIR_MARTS, "hecho_recursos_forrajeros.parquet")
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/hecho_recursos_forrajeros.parquet. "
                     "Corre antes: make ingest && python -m pipeline.marts")
        self.dato = {}          # (anio, mes, quincena, geo_id, banda, medida) -> valor
        self.periodos = []      # [(anio, mes, quincena)] ordenados
        self.deptos = []
        self.nombre = {}
        self.fuentes = set()
        self._cargar(con, ruta)
        self._cargar_geo(con)

    def _cargar(self, con, ruta):
        periodos = set()
        for fila in con.execute(SQL % ruta.replace("'", "''")).fetchall():
            anio, mes, quincena, _orden, geo, banda, medida, valor = fila
            anio, mes = int(anio), int(mes)
            self.dato[(anio, mes, quincena, geo, banda, medida)] = valor
            periodos.add((anio, mes, quincena))
        self.periodos = sorted(periodos)
        for fuente, in con.execute(
                "SELECT DISTINCT fuente FROM read_parquet('%s')"
                % ruta.replace("'", "''")).fetchall():
            if fuente:
                self.fuentes.add(fuente)

    def _cargar_geo(self, con):
        ruta = os.path.join(DIR_MARTS, "dim_geo.parquet")
        for geo_id, nivel, nombre, provincia in con.execute(
                "SELECT geo_id, nivel_geo, nombre, provincia FROM read_parquet('%s') "
                "ORDER BY geo_id" % ruta).fetchall():
            self.nombre[geo_id] = nombre
            if nivel == "departamento" and provincia == "sde":
                self.deptos.append(geo_id)

    # -- lecturas --------------------------------------------------------
    def anios(self):
        return sorted({p[0] for p in self.periodos})

    def meses_de(self, quincena):
        """[(anio, mes)] que tienen esa quincena, ordenados. Es la serie que se dibuja."""
        return sorted({(p[0], p[1]) for p in self.periodos if p[2] == quincena})

    def valor(self, anio, mes, quincena, banda, medida, geo=None):
        """Un numero. Sin `geo`, el total provincial: la suma de los departamentos.

        Para `participacion` la suma NO tiene sentido (es un porcentaje de cada departamento),
        asi que a nivel provincial se recalcula desde las hectareas. Es la unica cuenta que
        hace este archivo, y la hace para no mentir: promediar porcentajes de areas distintas
        daria un numero que no es el de la provincia.
        """
        if geo is not None:
            return self.dato.get((anio, mes, quincena, geo, banda, medida))
        if medida == "participacion":
            return self._participacion_provincial(anio, mes, quincena, banda)
        total, hubo = 0.0, False
        for g in self.deptos:
            v = self.dato.get((anio, mes, quincena, g, banda, medida))
            if v is not None:
                total += v
                hubo = True
        return total if hubo else None

    def _participacion_provincial(self, anio, mes, quincena, banda):
        """La participacion de la banda en la provincia, sobre las CINCO bandas.

        La sexta no entra en el denominador: no es una banda de productividad sino el
        territorio que la fuente no clasifica. Es la misma cuenta que hace la fuente fila por
        fila, verificada contra su propio dato.
        """
        if banda == "sin_dato":
            return None
        propia = self.valor(anio, mes, quincena, banda, "superficie_ha")
        if propia is None:
            return None
        cinco = 0.0
        for b in BANDAS:
            if b == "sin_dato":
                continue
            v = self.valor(anio, mes, quincena, b, "superficie_ha")
            if v is not None:
                cinco += v
        return propia / cinco if cinco else None

    def deptos_con_dato(self):
        vistos = {clave[3] for clave in self.dato}
        return [g for g in self.deptos if g in vistos]
