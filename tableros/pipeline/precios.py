"""Acceso a los precios mayoristas del MCBA (base 8), para el panel de la maqueta "Agri 2".

El mismo papel que pipeline/vegetales.py para las DTV de hortalizas, pipeline/hacienda.py para
la base 85 y pipeline/stock.py para la 48: resuelve en un solo init todo lo que necesita la
capa de presentacion, para que los constructores de paneles no escriban SQL.

QUE ES EL DATO
marts/hecho_precios_mayoristas.parquet: cotizaciones DIARIAS del Mercado Central de Buenos
Aires de productos con procedencia Santiago del Estero, del 2-ene-2017 al 9-abr-2026. Seis
dimensiones de producto (grupo, especie, variedad, envase, calidad, tamaño) y una sola medida,
`precio_kg`, en $/kg corrientes.

LA REGLA DURA: EL PRECIO NO SE SUMA
El mart marca la medida `agregable: false`, `agregacion: promedio`, `ponderacion: sin
ponderar`, y esas tres columnas viajan en CADA fila. Este archivo las verifica al cargar y
corta si alguna cambia: el dia que la fuente empiece a informar volumen comercializado, el
promedio deja de ser simple y el sitio no puede seguir publicandolo como si nada.

Todo agregado de este modulo es un PROMEDIO SIMPLE:
  - de un dia con mas de una cotizacion (pasa 73 veces, todas en zanahoria), el promedio de
    esas cotizaciones;
  - de un mes, el promedio simple de los promedios diarios;
  - de varias combinaciones a la vez (los selectores en "Todas"), el promedio simple de las
    cotizaciones que entran.
No esta ponderado por volumen porque la fuente no informa volumen: un dia con una sola
operacion pesa lo mismo que un dia de plena zafra. Eso se dice al pie del panel, no se esconde.

LA OTRA REGLA, la que escribio JC en su hoja "Modelo analisis": "Rangos solo donde aparece la
especie para evitar resultados vacios". Con seis dimensiones independientes la mayoria de las
combinaciones no tiene ni una fila, asi que aca no se arma ningun producto cartesiano: se
parte de las combinaciones que EXISTEN (`combos`) y de ahi salen tanto los selectores
encadenados como los meses que ofrece el rango.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MARTS = os.path.join(RAIZ, "marts")

# Las cuatro dimensiones que la maqueta dibuja como desplegables, en el orden de la hoja
# (celdas AF11..AR12): Variedad, Envase, Calidad y Tamaño. El grupo (Hortalizas/Frutas) y la
# especie no estan aca: son las sub-pestañas y los chips, otro nivel de filtrado.
DIMENSIONES = ("variedad", "envase", "calidad", "tamanio")

# Lo que el mart declara sobre la medida. Si alguna de las tres cambia, el panel deja de ser
# el que este codigo sabe dibujar y el build corta.
MEDIDA = "precio_kg"
AGREGABLE = False
AGREGACION = "promedio"

MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

# Una fila por (grupo, especie, las cuatro dimensiones, fecha). El ORDER BY no es cosmetico:
# abajo se promedian floats y el promedio de floats no es asociativo. Sin orden fijo el JSON
# del sitio sale distinto byte a byte entre corridas (misma trampa que documenta
# pipeline/stock.py).
SQL = """
    SELECT grupo, especie, variedad, envase, calidad, tamanio,
           strftime(fecha, '%%Y-%%m-%%d'), valor
    FROM read_parquet('%s')
    WHERE NOT es_agregado_fila
      AND valor IS NOT NULL
      AND variable = '%s'
    ORDER BY grupo, especie, variedad, envase, calidad, tamanio, fecha, valor
"""

SQL_CONTRATO = """
    SELECT DISTINCT variable, unidad, expresion_precio, agregable, agregacion, ponderacion,
           fuente, mercado, origen_provincia
    FROM read_parquet('%s')
    WHERE NOT es_agregado_fila
    ORDER BY ALL
"""


class Precios:
    """Las cotizaciones del MCBA, indexadas por combinacion de producto y por dia.

    Estructuras publicas:
      grupos        {grupo -> [especies con dato]}, en orden alfabetico
      combos        {especie -> [(variedad, envase, calidad, tamanio)]} que EXISTEN en el mart
      valores       {especie -> {(variedad, envase, calidad, tamanio) -> {fecha -> (precio, n)}}}
      opciones      {especie -> {dimension -> [valores presentes]}}
      fuentes       set de organismos (para el pie)
      unidad        la unidad declarada por el mart ("$/kg")
      expresion     "corrientes" | lo que declare el mart

    Las dimensiones vacias NO se dropean: 619 filas no traen variedad (REMOLACHA, PEREJIL,
    SANDIA, ACELGA, TUNA), 105 no traen tamaño, 79 no traen envase (todas SANDIA) y 48 no
    traen calidad (todas ZAPALLO). Si se filtraran, esas especies desaparecerian del panel al
    primer clic. Viajan como el valor vacio y el build les pone rotulo.
    """

    SIN_DATO = ""   # el valor que representa "la fuente no declaro esta dimension"

    def __init__(self, con):
        ruta = os.path.join(DIR_MARTS, "hecho_precios_mayoristas.parquet")
        if not os.path.exists(ruta):
            sys.exit("[site] Falta marts/hecho_precios_mayoristas.parquet. "
                     "Corre antes: make ingest && make marts")
        self.ruta_sql = ruta.replace("'", "''")

        self.fuentes = set()
        self.unidad = None
        self.expresion = None
        self.mercado = None
        self.origen = None
        self._verificar_contrato(con)

        self.grupos = {}      # grupo -> [especie]
        self.combos = {}      # especie -> [(variedad, envase, calidad, tamanio)]
        self.valores = {}     # especie -> combo -> {fecha -> (precio, cotizaciones)}
        self.opciones = {}    # especie -> dimension -> [valores]
        self.grupo_de = {}    # especie -> grupo
        self._cargar(con)

    # -- carga -----------------------------------------------------------
    def _verificar_contrato(self, con):
        """El mart declara como se puede leer su medida. Si cambia, el panel no se publica.

        Es la condicion de existencia del panel: todo lo que dibuja es un promedio simple y
        sin ponderar, y eso solo vale mientras el mart siga diciendo que la medida no es
        agregable, que se agrega promediando y que no hay ponderador.
        """
        filas = con.execute(SQL_CONTRATO % self.ruta_sql).fetchall()
        for (variable, unidad, expresion, agregable, agregacion, ponderacion,
             fuente, mercado, origen) in filas:
            if variable != MEDIDA:
                raise ValueError(
                    "marts/hecho_precios_mayoristas.parquet trae la variable %r y el panel de "
                    "precios solo sabe leer %r" % (variable, MEDIDA))
            if agregable is not AGREGABLE or agregacion != AGREGACION:
                raise ValueError(
                    "El mart de precios cambio su contrato de agregacion: agregable=%r, "
                    "agregacion=%r. El panel publica un promedio simple y no puede seguir "
                    "haciendolo si el mart dice otra cosa." % (agregable, agregacion))
            if not ponderacion or not ponderacion.startswith("sin ponderar"):
                raise ValueError(
                    "El mart de precios declara la ponderacion %r. El panel dice al pie que "
                    "el promedio NO esta ponderado: si la fuente empezo a informar volumen, "
                    "hay que rehacer el calculo antes de publicar." % (ponderacion,))
            self.fuentes.add(fuente)
            self.unidad = unidad
            self.expresion = expresion
            self.mercado = mercado
            self.origen = origen

    def _cargar(self, con):
        crudo = {}    # especie -> combo -> fecha -> [precios]
        grupos = {}
        for fila in con.execute(SQL % (self.ruta_sql, MEDIDA)).fetchall():
            grupo, especie, variedad, envase, calidad, tamanio, fecha, valor = fila
            combo = tuple((v if v is not None else self.SIN_DATO)
                          for v in (variedad, envase, calidad, tamanio))
            grupos.setdefault(grupo, set()).add(especie)
            self.grupo_de[especie] = grupo
            crudo.setdefault(especie, {}).setdefault(combo, {}).setdefault(fecha, []).append(valor)

        self.grupos = {g: sorted(e) for g, e in sorted(grupos.items())}
        for especie in sorted(crudo):
            por_combo = {}
            for combo in sorted(crudo[especie]):
                dias = {}
                for fecha in sorted(crudo[especie][combo]):
                    precios = crudo[especie][combo][fecha]
                    # Promedio de las cotizaciones del dia. Pasa 73 veces en todo el mart y
                    # siempre en zanahoria: dos filas del mismo dia, misma combinacion,
                    # precios distintos. No se elige una ni se suman: se promedian, que es la
                    # unica agregacion que el mart habilita.
                    dias[fecha] = (sum(precios) / len(precios), len(precios))
                por_combo[combo] = dias
            self.valores[especie] = por_combo
            self.combos[especie] = sorted(por_combo)
            self.opciones[especie] = {
                dim: sorted({combo[i] for combo in por_combo})
                for i, dim in enumerate(DIMENSIONES)
            }

    # -- accesos ---------------------------------------------------------
    def especies(self, grupo):
        return list(self.grupos.get(grupo, []))

    def cotizaciones(self, especie):
        """Cuantas cotizaciones diarias tiene la especie en todo el mart.

        La usa el build para elegir con que especie abre una sub-pestaña que JC no dibujo (la
        de frutas): la que mas pesa, no la primera del alfabeto. Con el criterio alfabetico la
        pestaña abria en LIMON, que tiene UNA sola cotizacion en todo el periodo, y el cuadro
        arrancaba con un grafico de un punto.
        """
        return sum(len(dias) for dias in self.valores[especie].values())

    def combos_que_cumplen(self, especie, seleccion):
        """Las combinaciones de la especie que cumplen `seleccion`.

        `seleccion` es una tupla de cuatro elementos donde None quiere decir "Todas". Es la
        regla 4 de JC ("pueden seleccionarse todas o elegir la disponible") y la que hace que
        el valor vacio -la dimension que la fuente no declara- siga siendo elegible.
        """
        salida = []
        for combo in self.combos[especie]:
            if all(pedido is None or combo[i] == pedido
                   for i, pedido in enumerate(seleccion)):
                salida.append(combo)
        return salida

    def serie_diaria(self, especie, combos):
        """[(fecha, precio, cotizaciones)] de la union de `combos`, ordenada por fecha.

        Promedio simple entre combinaciones: si un dia tiene cotizacion de bolsa y de caja, el
        punto es el promedio de las dos, no la suma ni la de la mas vendida (la fuente no dice
        cual se vendio mas). `cotizaciones` cuenta las filas del mart que entraron en ese
        punto, que es lo que el tooltip muestra para que se vea sobre que se promedio.
        """
        por_fecha = {}
        for combo in combos:
            for fecha, (precio, n) in self.valores[especie][combo].items():
                acumulado, cotizaciones = por_fecha.get(fecha, (0.0, 0))
                por_fecha[fecha] = (acumulado + precio * n, cotizaciones + n)
        return [(fecha, por_fecha[fecha][0] / por_fecha[fecha][1], por_fecha[fecha][1])
                for fecha in sorted(por_fecha)]

    def serie_mensual(self, especie, combos):
        """[(periodo, precio, cotizaciones, dias)] de la union de `combos`.

        El punto del mes es el PROMEDIO SIMPLE de los promedios diarios de ese mes, que es lo
        que el mart habilita. `dias` es cuantos dias con cotizacion entraron y `cotizaciones`
        cuantas filas del mart hay detras: los dos viajan al tooltip.
        """
        por_mes = {}
        for fecha, precio, n in self.serie_diaria(especie, combos):
            periodo = fecha[:7]
            suma, dias, cotizaciones = por_mes.get(periodo, (0.0, 0, 0))
            por_mes[periodo] = (suma + precio, dias + 1, cotizaciones + n)
        return [(periodo, suma / dias, cotizaciones, dias)
                for periodo, (suma, dias, cotizaciones) in sorted(por_mes.items())]
