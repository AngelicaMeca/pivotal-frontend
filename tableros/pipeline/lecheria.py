"""Acceso a los hechos de la cuenca lechera (bases 184, 185, 186, 188 y 194, familia
serie-mensual) para la pagina "Producc. Leche" de bovinos (hoja "GanBov LACT").

El mismo papel que pipeline/stock.py: resuelve en un init lo que necesita la capa de
presentacion. Ninguna de estas medidas se suma entre si: son promedios, precios y
porcentajes (cada una declara su `agregacion` en el mart).

Los LITROS no vienen en la fuente: la base 184 informa la cantidad de tambos y los litros por
tambo por dia. JC los calcula en su hoja asi, y asi se calculan aca:
    litros por dia      = tambos x litros por tambo por dia
    litros mensuales    = litros por dia x 30          (mes de 30 dias, convencion de JC)
    VBP mensual         = litros mensuales x precio por litro
Con esas cuentas su banda de 2025 da exacta: 83.472.039 litros, 6.956.003 de promedio mensual
y $ 36.988 millones de VBP. Que el mes sea de 30 dias y no el calendario es una convencion
suya que queda anotada en el spec de la pagina.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MARTS = os.path.join(RAIZ, "marts")

DIAS_DEL_MES = 30


def _tabla(mart):
    ruta = os.path.join(DIR_MARTS, "%s.parquet" % mart)
    if not os.path.exists(ruta):
        sys.exit("[site] Falta marts/%s.parquet. Corre antes: make ingest && make marts" % mart)
    return "read_parquet('%s')" % ruta.replace("'", "''")


class Lecheria:
    def __init__(self, con, provincia, nacional):
        self.provincia, self.nacional = provincia, nacional
        self.cuenca = {}     # (anio, mes) -> {variable: valor}   (base 184, la provincia)
        self.precios = {}    # (variable, provincia, anio, mes) -> valor (185, 186, 194)
        self.calidad = {}    # (hoja, provincia, anio, mes) -> fraccion (188)
        # Una cita por mart: la 184 escribe "Lechería" con tilde y las otras sin ella, y
        # juntarlas haria que el pie cite dos veces al mismo organismo.
        self.fuentes = {"cuenca": set(), "precios": set(), "calidad": set()}

        tabla = _tabla("hecho_lecheria_cuenca")
        for anio, mes, variable, valor, fuente in con.execute(
                "SELECT anio, mes, variable, valor, fuente FROM %s "
                "WHERE valor IS NOT NULL ORDER BY ALL" % tabla).fetchall():
            self.cuenca.setdefault((anio, mes), {})[variable] = valor
            self.fuentes["cuenca"].add(fuente)
        tabla = _tabla("hecho_lecheria_precios")
        for variable, prov, anio, mes, valor, fuente in con.execute(
                "SELECT variable, provincia_nombre, anio, mes, valor, fuente FROM %s "
                "WHERE valor IS NOT NULL ORDER BY ALL" % tabla).fetchall():
            self.precios[(variable, prov, anio, mes)] = valor
            self.fuentes["precios"].add(fuente)
        tabla = _tabla("hecho_lecheria_calidad")
        for hoja, prov, anio, mes, valor, fuente in con.execute(
                "SELECT hoja, provincia_nombre, anio, mes, valor, fuente FROM %s "
                "WHERE valor IS NOT NULL ORDER BY ALL" % tabla).fetchall():
            self.calidad[(hoja, prov, anio, mes)] = valor
            self.fuentes["calidad"].add(fuente)

        self.meses = sorted(self.cuenca)

    # -- la cuenca de la provincia (base 184) -------------------------------------
    def valor(self, anio, mes, variable):
        return (self.cuenca.get((anio, mes)) or {}).get(variable)

    def litros_dia(self, anio, mes):
        tambos, por_tambo = self.valor(anio, mes, "tambos"), self.valor(
            anio, mes, "litros_por_tambo_dia")
        return tambos * por_tambo if tambos is not None and por_tambo is not None else None

    def litros_mes(self, anio, mes):
        dia = self.litros_dia(anio, mes)
        return dia * DIAS_DEL_MES if dia is not None else None

    def vbp_mes(self, anio, mes):
        litros, precio = self.litros_mes(anio, mes), self.valor(anio, mes, "precio_litro")
        return litros * precio if litros is not None and precio is not None else None

    def meses_del_anio(self, anio):
        return [m for a, m in self.meses if a == anio]

    # -- precios y calidad por provincia (185, 186, 188, 194) ---------------------
    def precio(self, variable, provincia, anio, mes):
        return self.precios.get((variable, provincia, anio, mes))

    def porcentaje(self, hoja, provincia, anio, mes):
        """La base 188 viene en fraccion (0,0383): se devuelve en puntos (3,83)."""
        valor = self.calidad.get((hoja, provincia, anio, mes))
        return valor * 100.0 if valor is not None else None
