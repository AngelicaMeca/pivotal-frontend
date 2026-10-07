# Pivotal · Control de calidad de la base 43 · Recursos forrajeros

**Base:** 43 · PB 11 · Producción de materia seca de recursos forrajeros, Santiago del Estero
**Archivo:** `43 - Recursos forrajeros SDE.xlsx`, hoja "Santiago 2"
**Fuente:** Observatorio Forrajero Nacional (INTA – CREA – FAUBA – IPCVA)
**Preparado para:** Juan Carlos Antuña · **Fecha:** 6 de octubre de 2026

---

## En un párrafo

La base llegó completa y es más grande de lo que mostrabas en la maqueta: **va de enero de 2020
a abril de 2026**, por quincena y por departamento, 3.849 filas con dato. La estructura es
limpia y se entiende de entrada. Pero **hay una cosa que necesitamos que mires antes de
publicar el cuadro en hectáreas**: la columna "Promedio (40% de los años) en ha" trae siempre
el mismo número durante cuatro años y medio. Aparece también en tu propia maqueta, así que es
muy probable que ya lo hayas visto. El cuadro en **porcentaje no está afectado** y se puede
publicar tal cual.

---

## Lo que trae la base

| | |
|---|---|
| Período | enero 2020 → abril 2026 |
| Grano | **quincena** (1ra y 2da de cada mes) |
| Geografía | los 27 departamentos de la provincia |
| Filas con dato | 3.849 |
| Qué mide | cuánta superficie quedó en cada banda de productividad, en hectáreas y en porcentaje |

Vale la pena dejar escrito qué significa, porque es la parte que más se presta a confusión:
**no mide cuánto pasto hubo, mide si hubo más o menos que lo habitual**. Las bandas reparten
los *años* de la serie histórica, no el territorio: "Promedio" cubre el 40% de los años,
"Bajo" y "Alto" un 25% cada una, y "Muy bajo" y "Muy alto" apenas un 5%. Por eso ver un 20% de
la superficie en "Muy alto" es una noticia, y no un dato más.

---

## 1. La columna "Promedio en hectáreas" repite el mismo número durante cuatro años y medio

**Qué pasa.** De enero de 2020 a junio de 2024, la columna "Promedio (40% de los años) en ha"
dice **2.397,55 hectáreas en todos los departamentos y en todos los meses**. Son 2.738 de las
3.849 filas. Los valores reales recién empiezan en julio de 2024.

**Dónde se ve.** En tu maqueta, hoja "Agri 3", la columna "Promedio (3)" del cuadro en
hectáreas dice **64.734** en todos los meses hasta julio de 2024. Ese número es exactamente
27 × 2.397,55, o sea la suma provincial de la constante repetida.

**Qué efecto tiene.** El gráfico de líneas en hectáreas te va a quedar con una de sus seis
series completamente plana durante cuatro años y medio, y después saltando a valores normales.
No es un error de dibujo nuestro: es lo que dice la fuente.

**Lo que no hicimos.** No la tocamos ni la rellenamos. Entra tal cual viene.

**Lo que necesitamos de vos.** ¿Es un problema conocido del Observatorio para esos años, o
conviene que pidamos el archivo de nuevo? Mientras tanto podemos hacer tres cosas, y elegís:
publicar el cuadro en hectáreas completo con una nota al pie que lo explique, publicarlo
arrancando en julio de 2024, o dejarlo afuera y mostrar solo el de porcentaje.

---

## 2. Los dos bloques, hectáreas y porcentaje, no se derivan uno del otro

**Qué pasa.** Los porcentajes cierran perfecto: suman 100,0000% en todas las filas. Pero si uno
toma las hectáreas de una banda y las divide por la suma de las cinco bandas, el resultado
coincide con el porcentaje de esa misma fila solo en 120 de las 1.111 filas que no tienen la
constante del punto 1.

**Qué efecto tiene.** Ninguno si cada cuadro usa su propia columna, que es como lo vamos a
hacer. Lo dejamos escrito para que nadie "corrija" un bloque con el otro más adelante: son dos
series distintas y las dos vienen de la fuente.

**Un detalle que confirmamos**, porque era una duda razonable: el porcentaje se calcula sobre
las **cinco bandas**, sin contar la superficie sin clasificar. Verificado con enero de 2023:
3.848.473 ha de "Muy bajo" sobre 8.971.809 ha de las cinco bandas da 42,9%, que es el número
que escribís en tu cuadro. Por eso tu tabla en porcentaje cierra en 100% y no lleva la columna
(6), mientras que el gráfico apilado sí la incluye. **Las dos cuentas están bien** y son
distintas a propósito.

---

## 3. Tu "promedio mensual" es, en realidad, la primera quincena

**Qué pasa.** Tus cuadros y tus gráficos se titulan "Evolución del **promedio mensual**", pero
los números son exactamente los de la **primera quincena** de cada mes. Lo verificamos contra
tu propia maqueta: enero de 2023, "Muy bajo", tu cuadro dice 3.848.473 ha; la primera quincena
da 3.848.473 y la segunda da 3.033.720. El promedio de las dos daría 3.441.096.

**Y tenés un buen motivo para haberlo hecho así**, aunque no lo digas: la primera quincena es
la serie **completa** (los 12 meses de todos los años), y a la segunda le falta un mes por año.

**Lo que necesitamos de vos.** ¿Lo dejamos como lo armaste —la primera quincena de cada mes— y
corregimos el título para que diga lo que muestra? ¿O preferís el promedio real de las dos
quincenas, sabiendo que entonces los números no van a coincidir con los de tu maqueta?

---

## 4. Tres cosas chicas, ya resueltas

**El departamento Juan F. Ibarra está escrito de dos formas**, con coma y con punto
("JUAN F, IBARRA" en 73 filas y "JUAN F. IBARRA" en 69). Las dos conviven en los mismos años,
así que es tipeo. Lo resolvemos con la tabla de nombres alternativos que ya usamos para el
resto de las bases; no se pierde ninguna fila.

**La columna "Total en ha" llega como texto en 100 filas** (con coma decimal, "605861,20", en
vez de como número). No la usamos: el total lo calculamos sumando las seis bandas, que es como
calculamos todos los totales del repositorio.

**Hay una fila suelta al pie de la hoja** (la 3.853) sin año, mes ni departamento, pero con dos
números: 227.310,06 y 490.677,03. Parece un cálculo que quedó. No entra.

---

## 5. Huecos en la serie, para que no sorprendan

La **primera quincena está completa**: los 12 meses de los 7 años. A la **segunda le falta un
mes en cada año** (trae 11 de 12). Y hay **7 períodos que no traen los 27 departamentos**: dos
traen un solo departamento, uno trae 18, tres traen 26 y uno trae 25. Son agosto y diciembre de
2022, marzo de 2024, junio y julio de 2025, entre otros.

No los rellenamos. Si en los cuadros ves un mes que corta, es esto.

---

## Resumen de lo que necesitamos que decidas

| # | Tema | Pregunta |
|---|---|---|
| 1 | "Promedio en ha" constante hasta jul-2024 | ¿Pedimos el archivo de nuevo, o publicamos con nota al pie / desde jul-2024 / solo el cuadro en %? |
| 3 | El "promedio mensual" es la 1ra quincena | ¿Dejamos tu criterio y corregimos el título, o querés el promedio real de las dos? |

Lo demás se publica sin recortes.
