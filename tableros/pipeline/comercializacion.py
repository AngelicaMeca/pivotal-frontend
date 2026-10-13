"""Acceso a los hechos de comercializacion para faena (Siocarnes, bases 89 y 90).

El mismo papel que pipeline/stock.py: resuelve en un solo init los agregados que necesita la
capa de presentacion, para que los constructores no escriban SQL.

La regla que manda en esta familia: el PRECIO no se suma nunca. Cada linea de venta trae sus
kilos y su precio por kilo, y el precio promedio de un grupo de lineas es el PROMEDIO SIMPLE de
los precios de las lineas que lo informaron. Es la cuenta de JC en su maqueta (decision de la
usuaria del 13-oct-2026, backlog 85): con ella dan exactos sus numeros de control (novillito
bubalino 2.518 $/kg, VBP bubalino 3.581; Hibrida Materna ene-25 1.035, Yorkshire 1.514, Capon
1.155, Cerda 807). El ponderado por kilos seria mas preciso -una venta de una tonelada pesa lo
mismo que una de diez kilos en el promedio simple- y queda anotado para JC por si lo quiere.

El VBP es la cuenta de JC (hoja "GanBov RAZ", celda E129): "Cantidad de tn * 1.000 * precio
promedio", por SUBCATEGORIA, y el VBP de un grupo es la suma de los de sus subcategorias. Por
eso `valor` de un acumulado es tn x 1.000 x su propio promedio simple: vale como VBP cuando el
acumulado es UNA subcategoria (o un grupo que JC trata como una sola fila, los bubalinos en
la pagina de razas bovinas); para un grupo de varias hay que sumar las de sus partes.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MARTS = os.path.join(RAIZ, "marts")


class Comercializacion:
    """Las lineas de venta de un mart, opcionalmente solo las de un prefijo de categoria.

    `prefijo` filtra por el comienzo del nombre de la categoria: los bubalinos viajan en el
    mismo archivo que los bovinos (base 89) y se distinguen porque su categoria empieza con
    "Bubalino".
    """

    def __init__(self, con, mart, prefijo=None):
        ruta = os.path.join(DIR_MARTS, "%s.parquet" % mart)
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/%s.parquet. Corre antes: make ingest && make marts"
                     % mart)
        tabla = "read_parquet('%s')" % ruta.replace("'", "''")
        filtro = ("AND categoria LIKE '%s%%'" % prefijo.replace("'", "''")) if prefijo else ""

        self.fuentes = {f for f, in con.execute(
            "SELECT DISTINCT fuente FROM %s WHERE true %s" % (tabla, filtro)).fetchall()}
        # Una fila por LINEA de venta (hoja + fila_origen), con sus medidas lado a lado. El
        # ORDER BY fija el orden de la suma de floats: sin el, el JSON cambia entre corridas.
        filas = con.execute("""
            SELECT anio, mes, categoria, raza, geo_id,
                   max(valor) FILTER (WHERE variable = 'peso_tn')   AS tn,
                   max(valor) FILTER (WHERE variable = 'cabezas')   AS cabezas,
                   max(valor) FILTER (WHERE variable = 'precio_kg') AS precio_kg
            FROM %s
            WHERE true %s
            GROUP BY base_id, hoja, fila_origen, anio, mes, categoria, raza, geo_id
            ORDER BY anio, mes, categoria, base_id, hoja, fila_origen
        """ % (tabla, filtro)).fetchall()

        # Las lineas quedan en memoria (son unas 150.000 en bovinos) para poder abrirlas por
        # cualquier dimension sin volver a la base: `por(anio, dimension)`.
        self.lineas = filas
        self._cache = {}
        self.anual, self.mensual = {}, {}
        for anio, mes, categoria, _raza, _geo, tn, cabezas, precio_kg in filas:
            for clave, destino in (((anio, categoria), self.anual),
                                   ((anio, mes, categoria), self.mensual)):
                _sumar(destino.setdefault(clave, _acumulado()), tn, cabezas, precio_kg)
        for destino in (self.anual, self.mensual):
            for acum in destino.values():
                _cerrar(acum)
        self.categorias = sorted({c for (_, c) in self.anual})
        self.meses = sorted({(a, m) for (a, m, _) in self.mensual if m})

    def tn(self, anio, categoria):
        return (self.anual.get((anio, categoria)) or {}).get("tn")

    def vbp(self, anio, categoria):
        """Valor bruto de la produccion de una subcategoria: tn x 1.000 x su precio promedio."""
        acum = self.anual.get((anio, categoria))
        return acum["valor"] if acum and acum["n_precio"] else None

    def precio_promedio(self, anio, categoria, mes=None):
        """$/kg: promedio simple de los precios de las lineas que lo informaron."""
        acum = (self.mensual.get((anio, mes, categoria)) if mes
                else self.anual.get((anio, categoria)))
        return self.precio_de(acum)

    # -- aperturas por dimension (raza, departamento, grupo de categoria) ------------
    DIMENSIONES = {"categoria": 2, "raza": 3, "geo": 4}

    def por(self, dimension, anio=None, mes=None, grupo_de=None, geo=None, raza=None):
        """{valor de la dimension: acumulado} para un anio (o un mes). Cada acumulado trae
        tn, cabezas, n_precio, suma_precio y valor (tn x 1.000 x promedio simple), como `anual`.

        `grupo_de` es una funcion que lleva el valor de la dimension a su grupo (la
        subcategoria "Bovino Novillo Regular..." a "Novillo"): se agrupa antes de acumular.
        """
        clave_cache = (dimension, anio, mes, grupo_de, geo, raza)
        if clave_cache in self._cache:
            return self._cache[clave_cache]
        indice = self.DIMENSIONES[dimension]
        salida = {}
        for linea in self.lineas:
            a, m, tn, cabezas, precio_kg = linea[0], linea[1], linea[5], linea[6], linea[7]
            if (anio is not None and a != anio) or (mes is not None and m != mes):
                continue
            if geo is not None and linea[4] != geo:
                continue
            if raza is not None and linea[3] != raza:
                continue
            valor = linea[indice]
            if grupo_de:
                valor = grupo_de(valor)
            _sumar(salida.setdefault(valor, _acumulado()), tn, cabezas, precio_kg)
        for acum in salida.values():
            _cerrar(acum)
        self._cache[clave_cache] = salida
        return salida

    @staticmethod
    def precio_de(acum):
        """$/kg: promedio simple de los precios de las lineas que lo informaron."""
        return acum["suma_precio"] / acum["n_precio"] if acum and acum["n_precio"] else None


def _acumulado():
    return {"tn": 0.0, "cabezas": 0.0, "n_precio": 0, "suma_precio": 0.0, "valor": 0.0}


def _sumar(acum, tn, cabezas, precio_kg):
    acum["tn"] += tn or 0.0
    acum["cabezas"] += cabezas or 0.0
    # Toda linea con precio entra en el promedio, como en la cuenta de JC (AVERAGE de Excel
    # sobre la columna de precio).
    if precio_kg is not None:
        acum["n_precio"] += 1
        acum["suma_precio"] += precio_kg


def _cerrar(acum):
    """El VBP del acumulado como UNA fila de JC: tn x 1.000 x su promedio simple."""
    precio = Comercializacion.precio_de(acum)
    acum["valor"] = acum["tn"] * 1000.0 * precio if precio is not None else 0.0
