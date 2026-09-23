"""Acceso a los hechos de las DTV de hortalizas (bases 56 batata, 57 cebolla, 75 papa).

El mismo papel que pipeline/hacienda.py para la base 85 y pipeline/stock.py para la 48:
resuelve en un solo init todos los agregados que necesita la capa de presentacion, para que
los constructores de vistas no escriban SQL.

Las tres bases comparten UN mart (marts/hecho_movimientos_vegetales.parquet, familia `dtv`) y
se leen juntas porque son la misma cosa contada por producto: una DTV es una Declaracion de
Transito Vegetal emitida por SENASA para mover carga desde la provincia. El mart trae tambien
las cuatro filas de algodon de la base 53, que NO son de esta familia (el algodon es cultivo
extensivo): por eso el init recibe la lista de productos y filtra por ella.

Tres reglas del dato que este archivo hace cumplir, todas confirmadas por la ingesta:

  1. `cantidad` (bultos) se agrega SOLO por producto y acompaniada de su composicion de
     acondicionamiento. El mart la marca `agregable=false` porque el bulto no es una unidad
     homogenea: sumar toda la tabla mezclaria bolsas con fardos, rollos y modulos de algodon.
     Dentro de UN producto de hortaliza la mezcla se puede medir, y por eso este archivo
     devuelve siempre las dos cosas juntas: el total (`total_bultos`) y de que esta hecho
     (`composicion_acondicionamiento`). Quien rotule el eje sin mirar la composicion esta
     inventando un rotulo que la fuente no sostiene. Lo pide JC en su maqueta "Agri 2"
     ("Cant bolsas y tn por año"); la condicion la puso Francisco el 23-sep-2026.
  2. `es_agregado_fila` se filtra SIEMPRE: las hojas de SENASA traen una fila de total al pie
     que ya esta marcada en el mart y que, sumada, contaria el año dos veces.
  3. El total provincial se calcula SUMANDO departamentos de origen, igual que en las otras
     bases: asi el numero de la cabecera siempre coincide con lo que se ve en el mapa.

El grano del mart es diario; aca se agrega a año y a año-mes, que son los dos granos que el
sitio dibuja. Los meses importan: la cebolla concentra casi todo su volumen en septiembre,
octubre y noviembre, y la papa SOLO se entrega de septiembre a diciembre (asi la manda la
fuente, no es un faltante).
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MARTS = os.path.join(RAIZ, "marts")

# Las dos medidas agregables sin condiciones. `cantidad` se lee aparte (`_cargar_bultos`)
# porque su total solo se puede leer junto con su composicion de acondicionamiento.
MEDIDAS = ("peso_tn", "movimientos")
UNIDAD = {"peso_tn": "tn", "movimientos": "dtv"}
ETIQUETA_MEDIDA = {"peso_tn": "Toneladas movidas", "movimientos": "DTV emitidas"}
# Nombre del eje vertical por unidad. El de los bultos es generico a proposito: el rotulo
# real ("Bolsas" o "Bultos") lo decide la composicion de acondicionamiento del producto y lo
# pisa el build (site_build.composicion_de_bultos).
NOMBRE_EJE = {"tn": "Toneladas", "dtv": "DTV emitidas", "ha": "Hectáreas", "bultos": "Bultos"}

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

# Una fila por (producto, año, mes, departamento de origen, tipo de movimiento, provincia de
# destino, variable). El ORDER BY no es cosmetico: abajo se acumulan floats y la suma de
# floats no es asociativa. Sin orden fijo el JSON del sitio sale distinto byte a byte entre
# corridas (misma trampa que documenta pipeline/stock.py).
SQL = """
    SELECT producto, anio, mes, origen_geo_id, tipo_movimiento, destino_provincia,
           variable, sum(valor)
    FROM read_parquet('%s')
    WHERE NOT es_agregado_fila
      AND valor IS NOT NULL
      AND variable IN ('peso_tn', 'movimientos')
    GROUP BY ALL
    ORDER BY producto, anio, mes, origen_geo_id, tipo_movimiento, destino_provincia, variable
"""


# Los bultos, aparte. Se agregan por (producto, año) y por (producto, acondicionamiento):
# el primero es el total que dibuja la barra y el segundo es de que esta hecho ese total, que
# es lo que decide como se puede rotular el eje. Mismo ORDER BY fijo, por el mismo motivo.
SQL_BULTOS = """
    SELECT producto, anio, acondicionamiento, sum(valor)
    FROM read_parquet('%s')
    WHERE NOT es_agregado_fila
      AND valor IS NOT NULL
      AND variable = 'cantidad'
    GROUP BY ALL
    ORDER BY producto, anio, acondicionamiento
"""


def _sumar(destino, clave, valor):
    destino[clave] = destino.get(clave, 0.0) + valor


class Vegetales:
    """Todos los agregados de la familia DTV de hortalizas, resueltos en un init.

    `productos` es la lista de productos que entran (la declara el spec de comunes): hoy
    Cebolla, Batata y Papa. Lo que no este en la lista no se lee, ni siquiera para totales.
    """

    def __init__(self, con, productos):
        ruta = os.path.join(DIR_MARTS, "hecho_movimientos_vegetales.parquet")
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/hecho_movimientos_vegetales.parquet. "
                     "Corre antes: make ingest && make marts")
        self.ruta_sql = ruta.replace("'", "''")
        self.tabla = "read_parquet('%s')" % self.ruta_sql
        self.productos = list(productos)

        self.anual = {}        # (producto, anio, medida) -> valor
        self.depto = {}        # (producto, anio, geo_id, medida) -> valor
        self.mes = {}          # (producto, anio, mes, medida) -> valor
        self.movimiento = {}   # (producto, anio, tipo_movimiento, medida) -> valor
        self.destino = {}      # (producto, anio, destino_provincia, medida) -> valor
        self.depto_mes = {}    # (producto, anio, geo_id, mes, medida) -> valor
        self.bultos = {}       # (producto, anio) -> bultos declarados
        self.acondicionamiento = {}   # (producto, anio, acondicionamiento) -> bultos declarados

        self.anios = []
        self.meses_con_dato = {}   # producto -> [meses presentes en el mart, ordenados]
        self.tipos_movimiento = []
        self.provincias_destino = []
        self.fuentes = set()

        self._cargar(con, productos)
        self._cargar_bultos(con, productos)
        self._cargar_geo(con)

    # -- carga -----------------------------------------------------------
    def _cargar(self, con, productos):
        for fuente, in con.execute(
                "SELECT DISTINCT fuente FROM %s WHERE NOT es_agregado_fila AND producto IN %s "
                "ORDER BY 1" % (self.tabla, self._lista(productos))).fetchall():
            self.fuentes.add(fuente)

        anios, movimientos, destinos = set(), set(), set()
        meses = {}
        for fila in con.execute(SQL % self.ruta_sql).fetchall():
            (producto, anio, mes, geo, tipo_mov, destino, medida, valor) = fila
            if producto not in productos:
                continue
            anio = int(anio)
            mes = int(mes)
            anios.add(anio)
            meses.setdefault(producto, set()).add(mes)
            movimientos.add(tipo_mov)
            destinos.add(destino)
            _sumar(self.anual, (producto, anio, medida), valor)
            _sumar(self.depto, (producto, anio, geo, medida), valor)
            _sumar(self.mes, (producto, anio, mes, medida), valor)
            _sumar(self.movimiento, (producto, anio, tipo_mov, medida), valor)
            _sumar(self.destino, (producto, anio, destino, medida), valor)
            _sumar(self.depto_mes, (producto, anio, geo, mes, medida), valor)

        self.anios = sorted(anios)
        self.meses_con_dato = {p: sorted(m) for p, m in meses.items()}
        self.tipos_movimiento = sorted(movimientos)
        self.provincias_destino = sorted(destinos)

    def _cargar_bultos(self, con, productos):
        """Los bultos por año y su composicion de acondicionamiento, en la misma pasada.

        Se cargan juntos a proposito: el total sin la composicion no se puede rotular, y la
        unica forma de que nadie use uno sin el otro es que salgan del mismo lugar.
        """
        for fila in con.execute(SQL_BULTOS % self.ruta_sql).fetchall():
            (producto, anio, acond, valor) = fila
            if producto not in productos:
                continue
            _sumar(self.bultos, (producto, int(anio)), valor)
            _sumar(self.acondicionamiento, (producto, int(anio), acond), valor)

    @staticmethod
    def _lista(valores):
        return "(%s)" % ", ".join("'%s'" % v.replace("'", "''") for v in valores)

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
    def total_anual(self, producto, anio, medida="peso_tn"):
        return self.anual.get((producto, anio, medida))

    def total_depto(self, producto, anio, geo, medida="peso_tn"):
        return self.depto.get((producto, anio, geo, medida))

    def total_mes(self, producto, anio, mes, medida="peso_tn"):
        return self.mes.get((producto, anio, mes, medida))

    def total_depto_mes(self, producto, anio, geo, mes, medida="peso_tn"):
        return self.depto_mes.get((producto, anio, geo, mes, medida))

    def total_movimiento(self, producto, anio, tipo, medida="peso_tn"):
        return self.movimiento.get((producto, anio, tipo, medida))

    def total_destino(self, producto, anio, provincia, medida="peso_tn"):
        return self.destino.get((producto, anio, provincia, medida))

    def deptos_con_movimiento(self, producto, anio=None):
        """Departamentos de origen con al menos una DTV. Con `anio`, los de ese año.

        La cobertura es baja a proposito: solo hay DTV donde hubo movimiento registrado
        (7 departamentos de 27 en cebolla, 6 en batata, 4 en papa). No es un faltante.
        """
        vistos = {clave[2] for clave in self.depto
                  if clave[0] == producto and clave[3] == "peso_tn"
                  and (anio is None or clave[1] == anio)}
        return [g for g in self.deptos if g in vistos]

    def destinos_con_movimiento(self, producto, anio=None):
        vistos = {clave[2] for clave in self.destino
                  if clave[0] == producto and clave[3] == "peso_tn"
                  and (anio is None or clave[1] == anio)}
        return sorted(vistos)

    def total_bultos(self, producto, anio):
        """Bultos declarados del producto en el año. NUNCA se dibuja sin su composicion."""
        return self.bultos.get((producto, anio))

    def composicion_acondicionamiento(self, producto, anios):
        """[(acondicionamiento, bultos)] del producto en esos años, de mayor a menor.

        De aca sale el rotulo del eje de bultos. La lista no se recorta: el que decide como se
        llama el eje tiene que ver la cola. En cebolla el 99,6% son "Bolsas/Bolsitas" y el eje
        puede decir "bolsas"; en batata y papa la cola pesa mas y el eje dice "bultos".

        Se filtra por la MISMA ventana de años que dibuja el grafico: el rotulo tiene que
        describir lo que se esta viendo, no el historico completo.
        """
        ventana = set(anios)
        juntos = {}
        for (p, anio, acond), valor in self.acondicionamiento.items():
            if p != producto or anio not in ventana:
                continue
            juntos[acond] = juntos.get(acond, 0.0) + valor
        partes = [(acond, valor) for acond, valor in juntos.items() if valor]
        partes.sort(key=lambda par: (-par[1], par[0]))
        return partes

    def movimientos_con_dato(self, producto):
        vistos = {clave[2] for clave in self.movimiento
                  if clave[0] == producto and clave[3] == "peso_tn"}
        return [t for t in self.tipos_movimiento if t in vistos]
