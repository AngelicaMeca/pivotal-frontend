# Pivotal · Control de calidad de la entrega de clima

**Entrega:** entrega-03 (clima) · **Preparado para:** Juan Carlos Antuña
**Fecha del control:** 14 de octubre de 2026
**Base revisada:** 111 · Datos diarios de las estaciones agrometeorológicas del INTA en Santiago del Estero (archivo "111 -Estaciones SDE.xlsx")

> **En un párrafo.** Llegó una sola base, la de las 8 estaciones del INTA, con 38.746 días de datos (La María desde 1988, las otras siete desde 2010-2015 y Vaca Huañuna desde enero de 2025). La planilla está bien armada: no hay días repetidos (salvo uno de La María que ya resolvimos), las fechas son todas válidas y cada estación trae lo que dice traer. **El problema está en algunos sensores en el último año, que es justo lo que muestra tu maqueta.** Lo más serio: **las temperaturas de Los Juríes desde diciembre de 2025 dan entre 6 y 14 grados más que las demás estaciones** (una media de 34 grados en abril, cuando el resto anda en 21). Además, **Sachayoj no tiene datos desde el 4 de julio de 2025**, **la humedad de Malbrán no sirve en todo el año** y **la de Vaca Huañuna se va a cero desde febrero**. Para que ninguno de esos números llegue a la pantalla, **sacamos esos tramos del tablero**, estación por estación y variable por variable. Las otras variables y estaciones se publican. Abajo va cada caso explicado, y al final están las preguntas listas para pegar en WhatsApp.

---

## Estado de la entrega

| | Cantidad | Cuáles |
|---|---|---|
| Bases sin ninguna observación | 0 | |
| Bases con observaciones (se publican con recortes) | 1 | 111 · Clima diario INTA |
| Bases bloqueadas enteras (no salen al sitio) | 0 | |

El tablero de clima **todavía no está armado**. Los recortes de este reporte son las instrucciones para cuando se arme: hoy no hay ningún número de clima a la vista en el sitio, así que nada de lo que sigue apura una corrección.

**Qué vamos a mostrar y contra qué lo controlamos.** Tu maqueta muestra, por estación, el **último año de datos diarios**: temperatura de abrigo media, máxima y mínima, temperatura de suelo a 10 cm, lluvia pluviométrica, lluvia cronológica, lluvia máxima en 30 minutos, humedad media, humedad 8-14-20, rocío y horas de frío, más un gráfico de líneas de temperatura. El último día con algún dato en todo el archivo es el **29 de mayo de 2026**, así que "el último año" es **del 30 de mayo de 2025 al 29 de mayo de 2026**. Todo lo que cae en ese año y en esas once columnas es lo que más nos importa; lo de años anteriores se cuenta igual, pero no frena nada.

**Es el mismo archivo que mandaste en julio.** Lo comparamos hoja por hoja con el "111 - Detalle estaciones SDE del INTA.xlsx" de la primera entrega: las nueve hojas son idénticas, valor por valor. Cambió solo el nombre del archivo. O sea que **no hay datos nuevos desde mayo**: el tablero va a mostrar un "último año" que terminó hace cuatro meses y medio (ver pregunta 1).

**Las listas cierran.** Tu índice anotaba la base 111 en la 1ra entrega; llegó entonces, quedó guardada sin leer, y ahora volvió con otro nombre y se leyó. No falta ni sobra nada. El aviso de "archivo que llegó sin estar en la lista de la entrega" que da nuestro control es solo porque el índice no tiene una "3ra entrega" anotada: no es un problema.

## Lo que sí dio bien

- **No hay días repetidos.** Cada estación tiene cada día una sola vez. El único caso, el 07/10/2016 de La María (filas 10417 y 10418), es una segunda fila que repite los mismos valores de la primera con menos columnas cargadas: usamos la primera y no se pierde nada.
- **Las fechas son todas válidas.** Siete días de La María traen la hora 01:00 en vez de 00:00 (01/12/1988, 15/10/1989, 21/10/1990, 20/10/1991, 18/10/1992, 30/12/2007 y 19/10/2008): son los días en que empezó el horario de verano y esa medianoche no existió. Es un detalle de cómo se exportó el archivo, no del dato. Tomamos el día.
- **Ninguna variable trae un texto raro.** Las direcciones del viento usan las ocho direcciones más la "C".
- **La lluvia cierra entre los dos instrumentos.** En el último año, la pluviométrica y la cronológica suman casi lo mismo en cada estación (Quimilí 1.135 y 1.135 mm; Los Juríes 984 y 981; Bandera 951 y 944).
- **Las temperaturas del aire del último año son creíbles en todas las estaciones con datos salvo Los Juríes** (Bandera, La María, Malbrán, Monte Quemado, Quimilí y Vaca Huañuna): se mueven juntas día a día, con diferencias de uno a tres grados entre ellas, que es lo que se espera en la llanura.
- **Las coordenadas de cada estación caen en el departamento que propusimos**, salvo La María (ver punto 13).

---

## Base 111 · Lo que afecta el último año (lo que se va a ver)

Ordenado por cuánto pesa en lo que se publica.

### 1. Los Juríes: las temperaturas desde diciembre de 2025 están muy por encima de las demás estaciones

**Qué se ve.** Desde mediados de diciembre de 2025, la temperatura de Los Juríes se despega de todas las otras y la diferencia crece mes a mes. Promedio de la temperatura media del mes, Los Juríes contra lo que dan las otras estaciones:

| Mes | Los Juríes | Las demás (valor del medio) | Diferencia |
|---|---|---|---|
| enero 2026 | 33,0 | 27,1 | +5,9 |
| febrero 2026 | 34,1 | 27,4 | +6,7 |
| marzo 2026 | 34,2 | 25,1 | +9,1 |
| abril 2026 | 34,1 | 20,7 | +13,4 |
| mayo 2026 | 23,5 | 14,8 | +8,7 |

Un día concreto: el 31/03/2026 Los Juríes da 41,7 de media; Bandera 30,6, Malbrán 30,7, Quimilí 29,6. Hay máximas de 50,1 a 51,7 entre el 30/03 y el 03/04/2026 (filas 3689 a 3693 de su hoja) y mínimas de hasta 36,8. En mayo de 2026 Los Juríes da **0 horas de frío** cuando el resto da entre 76 y 155. Lo mismo con el rocío (hasta 39,97 el 16/04/2026, cuando en el último año ninguna otra estación pasa de 30) y con la tensión de vapor por encima de 50 casi todos los días entre el 17/02 y el 22/04/2026 (máximo 74,05 el 16/04), que es lo que ya habíamos anotado al leer el archivo.

**Por qué llama la atención.** Los Juríes está a unos 45 km de Bandera y a 110 de Quimilí, en la misma llanura. Durante diez años anduvo pareja con ellas. Que de golpe dé 13 grados más en promedio de un mes entero no es clima: parece el sensor de temperatura y humedad del abrigo corrido o dañado. Es el error que más se vería, porque cae en el gráfico de líneas.

**Qué decidimos mientras tanto.** **Sacamos del tablero la temperatura de abrigo (media, máxima y mínima), el rocío y las horas de frío de Los Juríes desde el 1 de diciembre de 2025.** Lo anterior a esa fecha se publica. La lluvia y la humedad de Los Juríes se publican: andan parecidas a las de Quimilí.

**Pregunta para JC.** ¿Sabés si el INTA tuvo problemas con el sensor de Los Juríes desde fines de 2025? ¿Lo podés consultar?

### 2. Sachayoj: no tiene datos desde el 4 de julio de 2025

**Qué se ve.** El último dato de Sachayoj es del 04/07/2025. Después la hoja salta directo al 29/04/2026 (297 días sin ninguna fila) y esa última fila viene vacía. En el último año, Sachayoj tiene dato en 35 o 36 días de 365 (los del 30/05 al 04/07/2025), y ninguno en lluvia máxima en 30 minutos. La hoja "Estaciones" dice "Hasta 29/04/2026", pero los datos terminan diez meses antes.

**Por qué llama la atención.** Si el tablero muestra "el último año" de Sachayoj, son once meses en blanco. Si en cambio muestra su propio último año (julio 2024 a julio 2025), el usuario va a creer que está viendo lo mismo que en las otras estaciones y está viendo otra época.

**Qué decidimos mientras tanto.** **Sachayoj sale del tablero del último año.** Figura en la lista de estaciones con la leyenda "sin datos desde el 04/07/2025". Su historia hasta esa fecha queda guardada.

**Pregunta para JC.** Ver pregunta 3.

### 3. Malbrán: la humedad no sirve en todo el último año

**Qué se ve.** La humedad media de Malbrán promedia entre 1 y 24% por mes en todo el último año, cuando las demás estaciones dan entre 50 y 85%. Hay **139 días con humedad media exactamente en 0%**, desde junio de 2019 hasta el 29/05/2026. La humedad 8-14-20 también viene baja (entre 8 y 28% de promedio mensual) y el rocío tiene dato en solo 11 días de 365. La tensión de vapor de esos mismos días es casi cero.

**Por qué llama la atención.** Una humedad relativa de 0% de promedio en un día no existe en la atmósfera, y menos en Santiago en junio. Todo junto apunta a un sensor de humedad caído desde 2019.

**Qué decidimos mientras tanto.** **Sacamos del tablero la humedad media, la humedad 8-14-20 y el rocío de Malbrán en todo el último año.** Las temperaturas, la lluvia y las horas de frío de Malbrán se publican.

**Pregunta para JC.** ¿El INTA sabe que el sensor de humedad de Malbrán no anda desde 2019?

### 4. Vaca Huañuna: la humedad se va a cero desde febrero de 2026, y le faltan tres meses de 2025

**Qué se ve.** La humedad media de Vaca Huañuna baja mes a mes desde febrero de 2026 (46% en febrero, 26% en marzo, 7% en abril, 0% en mayo), mientras las demás andan entre 60 y 85%. Son 52 días en 0%, todos entre marzo y mayo de 2026. Además, la hoja salta del 02/07/2025 al 08/10/2025 (97 días sin filas) y tiene 38 días vacíos dentro del último año. Resultado: en el último año, Vaca Huañuna tiene temperatura en unos 185 a 196 días de 365, y rocío en 83. La dirección del viento, también a 2 metros, viene siempre "C".

**Por qué llama la atención.** Es una estación nueva (empezó en enero de 2025) y el mismo patrón que Malbrán: el sensor de humedad se apaga de a poco.

**Qué decidimos mientras tanto.** **Sacamos del tablero la humedad media y la humedad 8-14-20 de Vaca Huañuna desde el 1 de febrero de 2026.** El resto se publica, y el gráfico corta la línea en el hueco de julio a octubre de 2025 en vez de unir los dos extremos.

### 5. Quimilí: la temperatura del suelo da bajo cero en mayo de 2026 y viene baja todo el año

**Qué se ve.** La temperatura de suelo a 10 cm de Quimilí es **negativa 18 días seguidos, del 12/05/2026 al 29/05/2026** (el último dato de la entrega), con un mínimo de **-8,19 el 23/05/2026** (fila 3834 de su hoja). Esos mismos días, Los Juríes da entre 8 y 14 y Malbrán entre 13 y 16. Y no es solo mayo: en todo el último año el suelo de Quimilí da entre 4 y 7 grados menos que el resto (octubre 2025: 20,2 contra 26,6; enero 2026: 20,9 contra 27,7), y el promedio anual viene bajando desde 2023 (24,3 en 2023; 21,5 en 2024; 19,4 en 2025; 17,1 en 2026).

**Por qué llama la atención.** A 10 cm de profundidad el suelo amortigua el frío: con heladas fuertes puede rozar el cero, pero -8 grados de promedio diario no ocurre en Santiago. La caída de a poco desde 2023 parece un sensor que se fue corriendo.

**Qué decidimos mientras tanto.** **Sacamos del tablero la temperatura de suelo de Quimilí en todo el último año.** El resto de Quimilí se publica.

### 6. Bandera: la temperatura del suelo se queda clavada en 28 grados desde mediados de abril de 2026

**Qué se ve.** Desde la segunda quincena de abril de 2026, el suelo de Bandera se queda entre 25 y 33 grados todos los días, sin acompañar el enfriamiento: en mayo promedia 28,1 contra 14,9 de las demás. El 23/05/2026, con -8 en Quimilí y 13 en Malbrán, Bandera da 25,7. El aire de Bandera ese mes promedia 14,8. Ya le había pasado algo parecido entre junio y septiembre de 2023 (34 a 37 grados de promedio mensual contra 18 a 22 del resto).

**Por qué llama la atención.** El suelo no puede estar 13 grados más caliente que el aire durante un mes entero de otoño.

**Qué decidimos mientras tanto.** **Sacamos del tablero la temperatura de suelo de Bandera desde el 16 de abril de 2026.**

### 7. La María: hay variables que no mide y otras que mide a medias

**Qué se ve.** La María es la única estación convencional (las otras siete son automáticas) y trae columnas distintas. En el último año:
- **No mide nunca** la humedad media (la columna viene vacía en toda la serie), ni la lluvia cronológica, ni la máxima en 30 minutos (esas dos columnas directamente no están en su hoja).
- **No tiene ningún dato de horas de frío** en el último año.
- La temperatura de suelo, la humedad 8-14-20 y el rocío tienen dato en 112 días de 365.
- La hoja "Estaciones" dice "Hasta 31/05/2026"; el último día de su hoja es el 28/05/2026.

**Por qué llama la atención.** No es un error: es otra estación con otro equipo, y tu nota en la hoja "Estaciones" ya lo dice ("NO TODAS LAS ESTACIONES TIENEN LAS MISMAS VARIABLES"). Lo que importa es que la tabla no muestre un casillero vacío como si faltara el dato.

**Qué decidimos mientras tanto.** Se publica. En las variables que La María no mide, la tabla dice "no se mide en esta estación" en vez de dejar la columna en blanco; en las que mide a medias, los días sin dato se ven como "sin dato" y el gráfico corta la línea.

### 8. Monte Quemado: termina dos meses antes y la humedad media viene baja varios meses

**Qué se ve.** Monte Quemado llega hasta el 03/04/2026 (la hoja dice "Hasta 04/04/2026" y ese día viene vacío). En el último año tiene 309 días con temperatura y 107 con rocío. Su humedad media viene bastante más baja que la de las demás entre septiembre de 2025 y enero de 2026 (octubre: 25% contra 57 a 62% de Bandera, Los Juríes y Quimilí), con **10 días en 0% exacto** (entre el 24/07/2025 y el 09/01/2026; seis de ellos en octubre). Su humedad 8-14-20, en cambio, no se separa tanto (44% contra 50 a 55%).

**Por qué llama la atención.** Monte Quemado es la estación más al norte y la más seca, así que una humedad algo más baja es esperable. Pero los días en 0% no son posibles, y que la media y la 8-14-20 no cuenten la misma historia hace pensar en el mismo problema de sensor que Malbrán, todavía en sus comienzos.

**Qué decidimos mientras tanto.** Monte Quemado se publica, con la fecha de su último dato a la vista, **salvo la humedad media del último año, que sacamos** hasta que nos contestes. La humedad 8-14-20 se publica.

**Pregunta para JC.** Ver pregunta 4.

### 9. Faltan las unidades de casi todas las variables

**Qué se ve.** La planilla no trae unidades. Las únicas que da tu texto de definiciones son: milímetros para la lluvia y la lluvia máxima en 30 minutos; horas para heliofanía efectiva, follaje mojado y horas de frío; y porcentaje para heliofanía relativa y humedades. **No tienen unidad declarada** las temperaturas (abrigo, suelo e intemperie), el rocío, la lluvia cronológica, la tensión de vapor, el viento, la presión, la radiación y las unidades de frío.

**Por qué llama la atención.** Por los valores, las temperaturas serían grados centígrados y la presión hectopascales, pero preferimos no ponerle una unidad a un número que la fuente no la dice. En el viento sí es una duda real: puede ser km/h o m/s, y la diferencia es de casi cuatro veces.

**Qué decidimos mientras tanto.** El tablero se publica con las unidades que vos diste. En el resto, el eje y la tabla dicen "unidad a confirmar" hasta que nos contestes. La lluvia cronológica se rotula igual que la pluviométrica recién cuando lo confirmes.

### 10. Detalles chicos dentro del último año

- **Lluvia máxima en 30 minutos mayor que la lluvia de todo el día** (cronológica): 79 días en toda la serie, 11 en el último año. Ejemplo: Quimilí, 16/02/2026, 5,5 mm en 30 minutos y 2,25 mm en el día.
- **Rocío por encima de la temperatura media del aire:** 62 días en toda la serie, 10 en el último año (por ejemplo Monte Quemado, 05/07/2025: rocío 16,43 y media 15,15). No es posible: el rocío nunca supera la temperatura del aire.
- **Días que figuran pero vienen totalmente vacíos dentro del último año:** 2 en Bandera, 2 en Los Juríes, 1 en Malbrán, 1 en Monte Quemado, 2 en Sachayoj y 38 en Vaca Huañuna.

**Qué decidimos mientras tanto.** Se publican sin tocar. Los días vacíos se muestran como "sin dato", nunca como cero.

---

## Base 111 · Lo que está en la historia (no se ve en el tablero del último año)

Esto no frena nada, pero queda anotado para cuando se muestren series largas.

### 11. Bandera: temperaturas imposibles en 2014 y en 2018-2019

**Qué se ve.** Mínimas de -10 a -30 grados en septiembre-octubre de 2014 y en decenas de días entre diciembre de 2018 y agosto de 2019 (por ejemplo -29,3 el 22/06/2019, fila 2528; -28,3 el 19/12/2018, en pleno verano). Máximas de 48 a 59,9 en julio-agosto de 2019 (59,9 el 13/08/2019, fila 2580). Una media de -15,1 el 10/10/2014 (fila 970). En julio de 2019 la mínima promedia -17,9 cuando las demás dan 7. La radiación global llega a 49,9 el 27/07/2017, más de lo que llega del sol fuera de la atmósfera en el día más largo del año a esta latitud.

**Por qué llama la atención.** Ninguna de esas temperaturas ocurrió en Santiago. Es un sensor roto en esos tramos.

**Qué decidimos.** No entra en el tablero del último año. Si alguna vez se muestra la serie larga de Bandera, esos tramos van como "sin dato".

### 12. Quimilí: 300 y 441 mm de lluvia en dos días de febrero de 2023

**Qué se ve.** Lluvia pluviométrica de 300,5 mm el 16/02/2023 (fila 2653) y 441,25 mm el 17/02/2023 (fila 2654): 742 mm en dos días. Esos mismos dos días, las otras estaciones juntaron entre 4 y 10 mm. La cronológica de Quimilí da 83 mm el 16/02 y nada el 17/02.

**Por qué llama la atención.** Sería una lluvia histórica para la provincia y ninguna otra estación la registró. Parece un error de carga.

**Qué decidimos.** Fuera del último año. Si se publica una serie anual de lluvia de Quimilí, febrero de 2023 va con nota o afuera, según lo que digas.

**Pregunta para JC.** ¿Sabés si llovió de verdad algo así en Quimilí en febrero de 2023?

### 13. Temperatura de suelo bajo cero en Malbrán (2017-2018) y en La María (2018)

**Qué se ve.** Malbrán: 21 días entre el 16/10/2017 y el 24/01/2018, en primavera y verano, con mínimo de -9,9. En esos meses su suelo promedia 7 grados cuando el de las demás estaciones da 28 a 30. La María: un día, el 26/08/2018, con -2,5.

**Qué decidimos.** Fuera del último año, no se publica. Mismo criterio que Bandera.

### 14. Humedad media en 0% en la historia

Además de Malbrán y Vaca Huañuna (puntos 3 y 4), hay días con humedad media exactamente en 0% en Quimilí (266 días, de diciembre de 2020 a septiembre de 2021), Bandera (207, entre 2014 y 2022), Monte Quemado (29, entre 2023 y enero de 2026; 10 de ellos en el último año, punto 8), Sachayoj (20) y Los Juríes (13).

### 15. Tramos largos sin datos

Además de Sachayoj y Vaca Huañuna (puntos 2 y 4), estos son los tramos de más de 30 días en que la hoja no trae ni una fila:

- Bandera: del 31/05/2012 al 29/05/2013 (362 días), del 04/02/2015 al 28/04/2015 (82), del 15/01/2019 al 08/03/2019 (51) y del 28/02/2025 al 05/05/2025 (65).
- Monte Quemado: del 14/02/2020 al 07/10/2020 (235 días).
- Sachayoj: del 11/07/2018 al 11/03/2019 (242), del 25/10/2023 al 24/01/2024 (90), del 20/06/2024 al 13/09/2024 (84) y del 05/04/2016 al 02/06/2016 (57).
- Los Juríes: del 28/06/2024 al 28/08/2024 (60).

Y días que figuran pero vienen totalmente vacíos, en toda la serie: Bandera 53, Los Juríes 103, Malbrán 38, Monte Quemado 257, Quimilí 43, Sachayoj 174, Vaca Huañuna 42 y La María ninguno. Todos entran como "sin dato", nunca como cero.

### 16. Las fechas "Desde/Hasta" de la hoja Estaciones no coinciden con los datos

- **Quimilí** dice "desde 09/07/2006" y su hoja arranca el 10/09/2015.
- **Vaca Huañuna** dice "desde 07/01/2025" y arranca el 09/01/2025.
- **La María** dice "hasta 31/05/2026" y termina el 28/05/2026.
- **Monte Quemado** dice "hasta 04/04/2026" y su último dato es del 03/04/2026.
- **Sachayoj** dice "hasta 29/04/2026" y su último dato es del 04/07/2025 (punto 2).
- En Bandera, Los Juríes, Malbrán, Monte Quemado y Sachayoj el primer día de la hoja viene vacío: es el día de instalación, no importa.

**Qué decidimos.** El tablero muestra el período que traen los datos, no el declarado.

**Pregunta para JC.** ¿Quimilí tiene datos de 2006 a 2015 en otro lado?

### 17. Otras variables que no se publican pero vienen raras

- **Heliofanía efectiva de más de 14,5 horas:** 223 días, casi todos en Quimilí (196, hasta 17 horas) y Los Juríes. Entre los 26 y los 30 grados de latitud el día más largo del año tiene menos de 14 horas de sol posible.
- **Presiones fuera de lo esperable para la altura de cada estación:** Los Juríes 902,3 el 04/10/2023 y Sachayoj 851,6 el 12/03/2019 (estaciones a 78 y 197 metros; esas presiones corresponden a estar a cientos de metros de altura).
- **Evapotranspiración potencial de 21,97** en La María el 16/02/2004.

---

## Base 111 · Lo que viene raro en la forma del archivo

### 18. La dirección del viento a 10 metros viene siempre "C"

En las siete estaciones automáticas, todas las filas con dato dicen "C" (entre 3.100 y 4.700 días por estación; en Vaca Huañuna también a 2 metros). Parece un valor de relleno, no una medición. Por convención meteorológica "C" es "calma", pero tu hoja no lo define. **No se publica** la dirección del viento a 10 metros.

### 19. Unidades de frío: el mismo -23,90403 en más de mil días por estación

El valor exacto -23,90403 se repite en todas las estaciones automáticas: 1.835 días en Sachayoj, 1.446 en Bandera, 1.360 en Quimilí, 1.313 en Monte Quemado, 1.215 en Los Juríes y 1.034 en Malbrán. Es siempre el mínimo, y +23,90403 aparece una vez como máximo. Parece un tope del cálculo, no una medición. No está en tu maqueta, así que **no se publica** hasta saber qué modelo usa el INTA.

### 20. Columnas que vienen vacías de punta a punta

- En las ocho estaciones: Temperatura_Inte_5cm, Temperatura_Intemperie_150cm_Minima y Humedad_Suelo.
- En La María, además: Humedad_Media, Duracion_Follaje_Mojado, Direccion_Viento_200cm, Presion_Media, Evaporacion_Tanque y Profundidad_Napa (Velocidad_Viento_Maxima y Unidad_Frio también vienen vacías en ella).
- En Vaca Huañuna: Heliofania_Efectiva, Heliofania_Relativa, Radiacion_Global, Presion_Media y Duracion_Follaje_Mojado.
- Las temperaturas de intemperie a 5 y a 50 cm y la de suelo a 5 cm solo las mide La María; en las otras siete vienen vacías.

No se publican. Solo queda constancia.

### 21. Las definiciones de la hoja Estaciones perdieron algunas comas

Varias definiciones tienen dos espacios seguidos donde había una coma ("la lluvia y el viento  permitiendo"), y la de Precipitación cronológica quedó partida en dos celdas ("(horas" | " días o meses)"). Las publicamos tal cual hasta que las revises.

### 22. Nombre del archivo, índice y departamentos

- **Nombre del archivo:** llegó como "111 -Estaciones SDE.xlsx", sin espacio después del guion. Lo leímos igual, pero si lo renombrás "111 - Estaciones SDE.xlsx" nos ahorrás una excepción.
- **Índice:** dice "Datos 114 estaciones meteorológicas INTA", 642.097 registros y período 2008 a mayo 2026. La planilla trae 8 estaciones, 38.746 días, y La María arranca en 1988. Sospechamos que "114" es una errata por "111" (el número de la base), y la cantidad de registros no coincide con ninguna cuenta de la planilla.
- **Departamentos:** la hoja "Estaciones" da la localidad, no el departamento (salvo Malbrán, "Dto Aguirre", y Vaca Huañuna, "Departamento Figueroa"). Propusimos: Bandera → Belgrano; La María → Silípica; Los Juríes → General Taboada; Malbrán → Aguirre; Monte Quemado → Copo; Quimilí → Moreno; Sachayoj → Alberdi; Vaca Huañuna → Figueroa. Las coordenadas de siete caen en esos departamentos. **La María es la excepción:** la hoja dice localidad "Silipica", pero su coordenada (-28,02; -64,23) cae en Capital, cerca del límite. Hasta que confirmes, no usamos el departamento de las estaciones para pintar mapas por departamento.

---

## Qué controles no aplican a esta base

Nuestros controles de siempre están pensados para producción, stock y movimientos, no para clima. No aplican acá: totales escondidos entre el detalle, unidades en kilos o toneladas, cabezas con decimales, cantidad por peso unitario, y meses copiados de un año a otro (en un archivo diario por estación no tiene sentido comparar un año contra otro buscando copias). El control de unidades, al principio, marcaba "mm", "horas" y "%" como unidades desconocidas: era un aviso equivocado nuestro y ya está corregido. Para esta base sumamos controles nuevos: días repetidos, tramos sin datos, rangos físicos por variable, coherencia entre variables del mismo día (mínima, media y máxima; rocío y temperatura), valores clavados muchos días seguidos, y la comparación de cada estación contra las demás mes a mes, que fue la que encontró el problema de Los Juríes.

Un aviso sobre esa comparación: en humedad, Malbrán y Vaca Huañuna (que vienen en cero) arrastran hacia abajo el valor de referencia, y por eso el control también marca como "muy alta" la humedad de Los Juríes, Quimilí y Bandera en marzo-mayo de 2026. Miradas contra Quimilí y entre ellas, esas tres son normales para un otoño con lluvias de 290 a 370 mm en abril: no las sacamos.

---

## Preguntas para JC

1. El archivo de clima es el mismo que mandaste en julio y termina el 29/05/2026. ¿Podés pedirle al INTA los datos de junio a octubre de 2026, así el "último año" del tablero llega a hoy?
2. Las temperaturas de Los Juríes desde diciembre de 2025 dan entre 6 y 14 grados más que las otras estaciones (34 de media en abril contra 21 del resto). ¿Sabés si el sensor tuvo una falla? Mientras tanto no mostramos temperatura, rocío ni horas de frío de Los Juríes desde el 1/12/2025.
3. Sachayoj no tiene datos desde el 04/07/2025. ¿La estación está fuera de servicio o el INTA tiene los datos? ¿Preferís que no aparezca en el tablero del último año (lo que hicimos), o que muestre su último año propio (julio 2024 a julio 2025) con la fecha bien visible?
4. La humedad de Malbrán da casi cero desde 2019, la de Vaca Huañuna se va a cero desde febrero de 2026 y Monte Quemado tiene días sueltos en 0% en el último año. ¿Lo damos por sensor roto y no las mostramos (lo que hicimos), o tenés otra fuente?
5. La temperatura de suelo de Quimilí da bajo cero 18 días de mayo de 2026 (hasta -8,2) y la de Bandera queda en 28 grados todo mayo. ¿Las dejamos afuera hasta que el INTA las revise?
6. La planilla no trae unidades. ¿Nos confirmás: temperaturas, suelo y rocío en °C; lluvia cronológica en mm; tensión de vapor y presión en hPa; radiación en MJ/m²; y el viento, en km/h o m/s?
7. A qué departamento pertenece cada estación: Bandera → Belgrano, La María → Silípica (su coordenada cae en Capital), Los Juríes → General Taboada, Malbrán → Aguirre, Monte Quemado → Copo, Quimilí → Moreno, Sachayoj → Alberdi, Vaca Huañuna → Figueroa. ¿Están bien?
8. La dirección del viento a 10 m viene siempre "C" en las siete estaciones automáticas. ¿"C" es calma? Como siempre dice lo mismo, ¿la dejamos afuera?
9. Las unidades de frío traen el mismo -23,90403 en más de mil días por estación. ¿Sabés qué modelo usa el INTA? Por ahora no las mostramos.
10. Quimilí registra 300,5 mm el 16/02/2023 y 441,25 mm el 17/02/2023; ese día las otras estaciones juntaron menos de 10 mm. ¿Es un error de carga?
11. En el índice la base dice "114 estaciones", 642.097 registros y desde 2008. La planilla trae 8 estaciones y La María arranca en 1988. ¿"114" es "111"? ¿Corregimos el índice?
12. La hoja "Estaciones" dice que Quimilí tiene datos desde 2006, pero arranca en septiembre de 2015. ¿Hay datos de Quimilí de 2006 a 2015?
