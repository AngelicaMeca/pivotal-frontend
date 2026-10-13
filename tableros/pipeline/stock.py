"""Acceso a los hechos de la base 48 (stock bovino por departamento y categoria).

El mismo papel que pipeline/hacienda.py para la base 85: resuelve en un solo init todos los
agregados que necesita la capa de presentacion, para que los constructores de vistas no
escriban SQL.

Una decision que conviene tener presente al leer los numeros: el total provincial se calcula
SUMANDO LOS DEPARTAMENTOS, no leyendo la fila "Total" que la fuente trae embebida. Las dos dan
lo mismo (qa-datos lo verifico en los 14 anios, 154 de 154 comparaciones), pero sumando el
detalle el total de la cabecera siempre coincide con lo que se ve en el mapa. Si algun anio
dejaran de coincidir, el tablero mostraria el numero que se puede auditar mirando la pagina.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MARTS = os.path.join(RAIZ, "marts")

UNIDAD = {"cabezas": "cabezas", "unidades_productivas": "up"}
ETIQUETA_MEDIDA = {"cabezas": "Cabezas", "unidades_productivas": "Unidades productivas"}
NOMBRE_EJE = {"cabezas": "Cabezas", "up": "Unidades productivas"}


class Stock:
    """Todos los agregados de la base 48, resueltos en un init."""

    def __init__(self, con):
        ruta = os.path.join(DIR_MARTS, "hecho_stock_bovino.parquet")
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/hecho_stock_bovino.parquet. "
                     "Corre antes: make ingest && make marts")
        self.tabla = "read_parquet('%s')" % ruta.replace("'", "''")

        self.anual = {}   # (anio, categoria, medida) -> valor  (suma de departamentos)
        self.depto = {}   # (anio, geo_id, categoria, medida) -> valor
        self.anios = []
        self.categorias = []
        self.fuentes = set()

        self._cargar(con)
        self._cargar_geo(con)

    # -- carga -----------------------------------------------------------
    def _cargar(self, con):
        for fuente, in con.execute(
                "SELECT DISTINCT fuente FROM %s ORDER BY 1" % self.tabla).fetchall():
            self.fuentes.add(fuente)

        # NOT es_agregado_geo: la fila "Total" de cada anio no entra, se recalcula sumando.
        #
        # El ORDER BY no es cosmetico: abajo se acumula el total provincial sumando float a
        # float, y la suma de floats NO es asociativa. Sin un orden fijo, DuckDB puede devolver
        # las filas en distinto orden entre corridas y el total cambia en los ultimos bits; con
        # eso el JSON del tablero sale distinto byte a byte cada vez que se construye el sitio.
        # Se nota con esta base porque el stock de 2021 viene con decimales.
        filas = con.execute("""
            SELECT anio, geo_id, categoria, medida, sum(valor)
            FROM %s
            WHERE NOT es_agregado_geo AND valor IS NOT NULL
            GROUP BY ALL
            ORDER BY anio, geo_id, categoria, medida
        """ % self.tabla).fetchall()

        anios, categorias = set(), set()
        for anio, geo_id, categoria, medida, valor in filas:
            self.depto[(anio, geo_id, categoria, medida)] = valor
            clave = (anio, categoria, medida)
            self.anual[clave] = self.anual.get(clave, 0.0) + valor
            anios.add(anio)
            if medida == "cabezas":
                categorias.add(categoria)
        self.anios = sorted(anios)
        self.categorias = sorted(categorias)

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
    def total_anual(self, anio, categoria, medida="cabezas"):
        return self.anual.get((anio, categoria, medida))

    def total_depto(self, anio, geo, categoria, medida="cabezas"):
        return self.depto.get((anio, geo, categoria, medida))

    def deptos_con_stock(self, anio=None):
        """Los departamentos con al menos una cabeza. Con `anio`, los de ese anio."""
        vistos = {clave[1] for clave in self.depto
                  if clave[3] == "cabezas" and (anio is None or clave[0] == anio)}
        return [g for g in self.deptos if g in vistos]

    # -- relaciones entre categorias (bloque de JC, ver _comunes-base-48) -----
    def relacion(self, anio, nombre, geo=None):
        """Un ratio del rodeo, sobre la provincia o sobre un departamento.

        Se recalcula siempre desde las cabezas, nunca promediando los ratios de los
        departamentos: el promedio de cocientes no es el cociente de las sumas, y la diferencia
        no es chica cuando un departamento concentra el 20% del rodeo.
        """
        def cab(categoria):
            valor = (self.total_depto(anio, geo, categoria) if geo
                     else self.total_anual(anio, categoria))
            return valor or 0.0

        vacas = cab("Vacas")
        if nombre == "participacion_vientres":
            total = cab("Total")
            return (vacas / total) if total else None
        if not vacas:
            return None
        if nombre == "destete":
            return (cab("Terneros") + cab("Terneras")) / vacas
        if nombre == "reposicion":
            return cab("Vaquillonas") / vacas
        if nombre == "invernada":
            return (cab("Novillos") + cab("Novillitos")) / vacas
        if nombre == "servicio":
            return (cab("Toros") + cab("Toritos")) / vacas
        raise KeyError("relacion desconocida: %r (ver _comunes-base-48.relaciones)" % nombre)


# ==========================================================================
# Las otras especies de ganaderia (maqueta "Maqueta Ganad VF", 9-oct-2026)
# ==========================================================================
def _orden_de_estrato(texto):
    """'10. Mas de 5.000 caprinos' -> 10. El numero que JC le pone adelante ES el orden."""
    cabeza = (texto or "").split(".", 1)[0].strip()
    return (int(cabeza) if cabeza.isdigit() else 999, texto or "")


class StockEspecie:
    """Los agregados de UNA especie, con la misma interfaz publica que `Stock`.

    Cada especie llega en hasta tres marts (`_comunes-stock-<especie>.yaml`, bloque `marts`):

    - `principal`: la serie provincial y, si la trae, el detalle por departamento. En ovinos
      y caprinos son DOS bases en el mismo mart (la serie provincial desde 2008/2009 y la foto
      por departamento de 2025); en porcinos y equinos es una sola con los 27 departamentos
      todos los anios.
    - `estrato`: el tramo de tamanio del establecimiento, con establecimientos y RENSPA.
    - `departamentos_desde_estrato`: en bubalinos no hay base por departamento sin estrato, asi
      que el detalle departamental sale de SUMAR los estratos de la base 153.

    El total provincial sigue la regla de la base 48: si hay departamentos se SUMAN (asi el
    numero de la cabecera coincide con el del mapa); si no, se usa la fila provincial de la
    fuente. Si dos filas provinciales del mismo anio dijeran cosas distintas el build corta:
    no se elige una en silencio.
    """

    def __init__(self, con, marts, agregado="Total"):
        self.agregado = agregado
        self.anual, self.depto, self.fuentes = {}, {}, set()
        self.estrato = {}          # (anio, geo, estrato, categoria, medida) -> valor
        self.estratos_por_anio = {}
        provinciales = {}          # (anio, categoria, medida) -> {valores}

        principal = self._tabla(marts["principal"])
        for fuente, in con.execute("SELECT DISTINCT fuente FROM %s" % principal).fetchall():
            self.fuentes.add(fuente)
        # Las filas de CONTEO (establecimientos, UP) no tienen categoria: son del
        # establecimiento entero, que es lo mismo que el agregado.
        for anio, geo, agregada, categoria, medida, valor in con.execute("""
                SELECT anio, geo_id, es_agregado_geo, coalesce(categoria, '%s'), medida,
                       sum(valor)
                FROM %s
                WHERE valor IS NOT NULL
                GROUP BY ALL
                ORDER BY ALL
                """ % (agregado, principal)).fetchall():
            if agregada:
                provinciales.setdefault((anio, categoria, medida), set()).add(valor)
            else:
                self.depto[(anio, geo, categoria, medida)] = valor

        if marts.get("estrato"):
            tabla = self._tabla(marts["estrato"])
            for fuente, in con.execute("SELECT DISTINCT fuente FROM %s" % tabla).fetchall():
                self.fuentes.add(fuente)
            for anio, geo, estrato, categoria, medida, valor in con.execute("""
                    SELECT anio, geo_id, estrato, coalesce(categoria, '%s'), medida, sum(valor)
                    FROM %s
                    WHERE valor IS NOT NULL AND NOT es_agregado_geo
                    GROUP BY ALL
                    ORDER BY ALL
                    """ % (agregado, tabla)).fetchall():
                self.estrato[(anio, geo, estrato, categoria, medida)] = valor
                self.estratos_por_anio.setdefault(anio, set()).add(estrato)
                if marts.get("departamentos_desde_estrato"):
                    clave = (anio, geo, categoria, medida)
                    self.depto[clave] = self.depto.get(clave, 0.0) + valor

        # Total provincial: suma de departamentos, y la fila de la fuente donde no los hay.
        for (anio, geo, categoria, medida), valor in sorted(self.depto.items()):
            clave = (anio, categoria, medida)
            self.anual[clave] = self.anual.get(clave, 0.0) + valor
        for clave, valores in sorted(provinciales.items()):
            if clave in self.anual:
                continue
            if len(valores) > 1:
                raise ValueError(
                    "%s trae %d totales provinciales distintos para %r: %s"
                    % (marts["principal"], len(valores), clave, sorted(valores)))
            self.anual[clave] = valores.pop()

        self.anios = sorted({a for (a, c, m) in self.anual if m == "cabezas"})
        self.anios_depto = sorted({a for (a, g, c, m) in self.depto if m == "cabezas"})
        self.categorias = sorted({c for (a, c, m) in self.anual
                                  if m == "cabezas" and c != agregado})
        self.categorias_depto = sorted({c for (a, g, c, m) in self.depto
                                        if m == "cabezas" and c != agregado})
        self.categorias_estrato = sorted({k[3] for k in self.estrato
                                          if k[4] == "cabezas" and k[3] != agregado})
        self.medidas_depto = sorted({m for (a, g, c, m) in self.depto})
        Stock._cargar_geo(self, con)

    @staticmethod
    def _tabla(mart):
        ruta = os.path.join(DIR_MARTS, "%s.parquet" % mart)
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/%s.parquet. Corre antes: make ingest && make marts"
                     % mart)
        return "read_parquet('%s')" % ruta.replace("'", "''")

    total_anual = Stock.total_anual
    total_depto = Stock.total_depto
    deptos_con_stock = Stock.deptos_con_stock

    # -- estratos ----------------------------------------------------------
    def estratos(self, anio):
        """Los tramos del anio, en el orden que les pone la fuente (el numero de adelante)."""
        return sorted(self.estratos_por_anio.get(anio, ()), key=_orden_de_estrato)

    def total_estrato(self, anio, estrato, categoria, medida="cabezas", geo=None):
        """Un tramo en la provincia (suma de departamentos) o en un departamento."""
        if geo:
            return self.estrato.get((anio, geo, estrato, categoria, medida))
        valores = [v for (a, g, e, c, m), v in self.estrato.items()
                   if a == anio and e == estrato and c == categoria and m == medida]
        return sum(valores) if valores else None

    def total_estratos_depto(self, anio, geo, medida):
        """Una medida de conteo (RENSPA, establecimientos) del departamento, sumando tramos."""
        valores = [v for (a, g, e, c, m), v in self.estrato.items()
                   if a == anio and g == geo and c == self.agregado and m == medida]
        return sum(valores) if valores else None

    def total_estratos_provincia(self, anio, medida):
        valores = [v for (a, g, e, c, m), v in self.estrato.items()
                   if a == anio and c == self.agregado and m == medida]
        return sum(valores) if valores else None
