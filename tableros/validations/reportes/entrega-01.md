# Pivotal · Control de calidad de la 1ra entrega

**Entrega:** entrega-01 · **Fecha del control:** 5 de agosto de 2026 · **Preparado para:** Juan Carlos Antuña

---

## Resumen en tres líneas

Llegaron las 27 bases prometidas, ninguna faltó. De esas 27 ya procesamos tres: **9 · Cultivos extensivos**, **85 · Movimientos de hacienda bovina (DTE)** y, la última en entrar, **48 · Stock bovino por departamento**. Las otras 24 llegaron completas y están guardadas, pero todavía no las leímos: van en las próximas tandas.

Las tres están **sanas en lo fundamental**. En la 9 los totales de provincia cierran con la suma de sus departamentos y los rendimientos dan la cuenta correcta. En la 85 pasó algo mejor todavía: los totales por año que vos ya tenías calculados a mano en tu hoja "Modelo Análisis" **coinciden exactos** con lo que nos dio leer el detalle, de 2022 a 2025. Y la 48 es la más limpia de las tres: el total de cada departamento da exactamente la suma de sus nueve categorías en las 392 filas, y el total de la provincia cierra con la suma de sus departamentos en los 14 años, sin una sola diferencia. Igual hay **24 cosas para conversar** (13 de cultivos, 5 de hacienda y 6 de stock), casi todas sobre qué significa un dato más que sobre si el dato está bien.

**Se publican las tres bases**, con dos recortes en la 9: dejamos afuera las campañas 2000/01 y 2013/14, y no mostramos por ahora cuánto pesa Santiago en el país para poroto y maní. En la 85 no recortamos nada, pero hay una fila de totales que conviene no mirar. En la 48 hay un año, el 2021, con vacas en decimales, que es lo único que nos gustaría que mires antes de mostrarlo. Todo explicado abajo.

## Estado por base

| | Cantidad | Cuáles |
|---|---|---|
| Bases sin ninguna observación | 0 | — |
| Bases con observaciones (se publican igual) | 3 | 9 · Cultivos extensivos · 85 · DTE bovinos · 48 · Stock bovino |
| Bases bloqueadas (no salen al sitio) | 0 | — |
| Bases recibidas todavía sin procesar | 24 | 30, 33, 38, 53, 56, 57, 75, 92, 93, 100, 101, 110, 111, 132, 134, 135, 136, 137, 144, 145, 151, 196, 197, 198 |

Las 24 pendientes **no son un problema**: los archivos llegaron bien, simplemente todavía no les armamos la receta de lectura. No hace falta que mandes nada de nuevo.

## Lo que sí dio bien (para que quede dicho)

En la base 85, lo más importante del control:

- **Tus números y los nuestros dan lo mismo.** Sumamos el detalle movimiento por movimiento y lo comparamos contra la tabla que vos ya tenías hecha en la hoja "Modelo Análisis". Para 2022, 2023, 2024 y 2025 coincide **exacto**, tanto en documentos emitidos como en cabezas (por ejemplo 2022: 29.209 DTE y 1.030.999 cabezas). Es la mejor señal posible de que estamos leyendo el archivo como vos lo leés.
- **Las dos hojas no se pisan.** La de origen es todo lo que sale de Santiago (incluido lo que se mueve dentro de la provincia) y la de destino es todo lo que entra desde otra provincia. Revisamos las 17.920 filas de la hoja de destino y **no hay ni una sola** cuyo origen sea santiagueño. O sea que se pueden sumar las dos sin contar una cabeza dos veces.
- **La serie está completa.** 53 meses seguidos, de enero 2022 a mayo 2026, **sin un solo mes faltante en el medio**.
- **Están los 27 departamentos**, en las dos puntas. Incluido Salavina, que es el que falta en cultivos extensivos (punto 5 de la base 9): ahí sí hay movimiento de hacienda, así que el departamento existe y está activo, lo que refuerza que en la base 9 lo que falta es el dato agrícola.
- **No hay movimientos repetidos, no hay números negativos y no hay cabezas fraccionarias** (nada de "17.712,5 animales"). Revisamos las 46.032 filas.

Y en la base 9:

- **Los totales de provincia cierran.** Comparamos cada fila de "Total provincia" contra la suma de sus departamentos, cultivo por cultivo y campaña por campaña: **450 de 471 comparaciones dan exacto**. La mayor diferencia entre las que cierran es de 3 toneladas sobre 3 millones, o sea redondeo. Las 21 que no cierran son todas de las dos campañas sueltas (punto 1 de abajo).
- **"Soja total" es exactamente soja de 1ra más soja de 2da**, en las 314 combinaciones de lugar y campaña donde aparece. Tu regla de usar solo el total para sumar se puede aplicar sin riesgo.
- **El rendimiento da la cuenta.** Verificamos producción dividido superficie cosechada por mil en 2.785 filas: cierra en todas menos una, y esa se va 1,4% por redondeo (Tafí del Valle, poroto otros, hoja del NOA).
- **No hay filas repetidas, no hay números negativos, y en ningún caso la superficie cosechada supera a la sembrada.**
- **Los rendimientos son creíbles.** Ninguno se va del rango razonable para su cultivo: el maíz va de 639 a 8.500 kg/ha, la soja de 700 a 4.000, el algodón de 1.000 a 4.000.

Y en la base 48, que es la que mejor salió:

- **Las cuentas cierran para los dos lados.** El "Total" de cada fila da exactamente la suma de las nueve categorías (vacas, vaquillonas, novillos, novillitos, terneros, terneras, toros, toritos y bueyes) en las **392 filas**, sin una sola diferencia. Y la fila "Total" de cada año da exactamente la suma de sus departamentos, en los **14 años**. Es raro que una planilla cierre así de bien en las dos direcciones.
- **Están los 27 departamentos**, todos los años, sin faltar ninguno. Incluido Salavina, que es el que no aparece en cultivos extensivos.
- **La serie está completa**: 14 años seguidos, de 2012 a 2025, sin un año faltante en el medio.
- **No hay filas repetidas ni números negativos.**

---

# Base 9 · Cultivos extensivos (MAGyP)

Archivo: `9 - Cultivos extensivos SDE.xlsx`. Leímos tres hojas: la de Santiago por departamento (2.532 filas), la del NOA (377 filas) y la de totales país (23 filas). No leímos "Calculos Ranking" (los rankings los calculamos nosotros), "Modelo Análisis" (son tus instrucciones, van al armado de las vistas) ni "Hoja1" (está vacía).

## 1. Dos campañas sueltas que no tienen respaldo por departamento

**Qué se ve.** En la hoja de Santiago aparecen 7 filas de "Total provincia" de campañas viejas, mezcladas al final del detalle: 6 de la campaña **2013/14** y 1 de la campaña **2000/01**. Para esas dos campañas el archivo trae el total de la provincia pero **ni un solo departamento**.

Para mirarlo en tu Excel: hoja "9 PB 3 - A", filas 2.444 a 2.521. Ahí vas a ver, por ejemplo, maíz 2013/14 con 728.430 ha sembradas y 4.634.110 tn de producción a nivel provincia, y ningún departamento de esa campaña en ninguna parte de la hoja.

**Por qué llama la atención.** Es el único caso del archivo donde el total no se puede reconstruir sumando. Si publicáramos esas campañas, el mapa de departamentos quedaría en blanco y el número del total provincial igual aparecería arriba. Cualquiera diría que perdimos datos. Además son campañas fuera de lo que vos declaraste para esta entrega (2014/15 en adelante).

**Qué decidimos mientras tanto.** **Dejamos las campañas 2000/01 y 2013/14 afuera del sitio.** La serie arranca en 2014/15, que es lo que vos declaraste. Los datos no se borran de ningún lado: siguen guardados, listos para sumarse si decidís lo contrario.

**Pregunta para vos.** ¿Esas dos campañas quedaron pegadas de una planilla anterior, o las querés mostrar como dato provincial suelto sin apertura por departamento?

## 2. En trigo falta el "Trigo pan"

**Qué se ve.** El archivo trae "Trigo total" y "Trigo candeal", pero **no trae "Trigo pan" en ninguna de las tres hojas**. Lo buscamos en las tres y no está. Y el candeal aparece recién desde la campaña 2020/21, en 4 o 5 departamentos nada más.

Para mirarlo en tu Excel: campaña 2024/25, fila de "Total provincia". Trigo total: 441.340 ha sembradas. Trigo candeal: 3.200 ha. O sea que el candeal es el 0,7% del trigo de la provincia, y el 99,3% restante no tiene apertura.

**Por qué llama la atención.** Vos escribiste que trigo funciona igual que soja: hay un total y hay partes, y para sumar se usa el total. Acá el total está bien, pero de las partes solo llegó una, y es la chica. En 243 de las 279 combinaciones de departamento y campaña ni siquiera está el candeal.

**Qué decidimos mientras tanto.** Publicamos trigo usando siempre **"Trigo total"**, que es lo que vos indicaste para sumas y participaciones. **No mostramos la apertura pan/candeal**, porque daría a entender que en Santiago casi no se hace trigo pan, cuando en realidad es que el dato no vino separado.

**Pregunta para vos.** ¿El "Trigo pan" existe en la fuente del MAGyP y se traspapeló al armar la planilla, o el MAGyP directamente no lo abre para Santiago?

## 3. En poroto falta el "alubia", y las variedades arrancan recién en 2021/22

**Qué se ve.** Dos cosas distintas sobre el mismo cultivo:

- El **"Poroto alubia" aparece en la hoja del NOA y en la del país, pero no en la de Santiago.** En Santiago solo hay "Poroto negro" y "Poroto otros".
- Las variedades de poroto **empiezan en la campaña 2021/22**. De 2014/15 a 2020/21 el archivo trae únicamente "Poroto total", sin ninguna apertura: son 52 combinaciones de departamento y campaña sin detalle.

Para mirarlo en tu Excel: campaña 2019/20, hoja de Santiago. Vas a encontrar "Poroto total" en 9 departamentos (Alberdi, Choya, General Taboada, Guasayán, Jiménez, Juan F. Ibarra, Moreno, Pellegrini y Río Hondo) y ninguna fila de poroto negro ni de poroto otros. Después mirá 2021/22 y vas a ver que ahí sí aparecen las dos.

**Por qué llama la atención.** Un gráfico de "poroto por variedad" mostraría un salto de la nada en 2021/22 que parecería un boom del poroto negro, cuando en realidad es que antes no se abría. Lo bueno: **desde 2021/22 el total cierra perfecto con la suma de las variedades**, en las 84 combinaciones donde hay apertura.

**Qué decidimos mientras tanto.** Publicamos poroto con **"Poroto total"** para toda la serie, y la apertura por variedad **solo desde 2021/22**, con una nota que aclare desde cuándo hay detalle.

**Pregunta para vos.** ¿En Santiago no se siembra poroto alubia, o es que el MAGyP no lo abre para la provincia?

## 4. La hoja de totales país no trae la fila de poroto total ni el maní

**Qué se ve.** La hoja "9 PB 3 - C" (totales Argentina) trae poroto alubia, poroto negro y poroto otros, pero **no trae la fila "Poroto total"**. Y **no trae maní**, que sí está en la hoja de Santiago y en la del NOA.

Para mirarlo en tu Excel: hoja "9 PB 3 - C", campaña 2024/25. Están las tres variedades de poroto (alubia 211.189 ha, negro 268.967 ha, otros 185.723 ha) pero no hay una fila que las totalice, y no hay ninguna fila de maní.

**Por qué llama la atención.** Vos pediste esta hoja justamente "para calcular participación del país". Para poroto no la podemos calcular directo: en Santiago tenemos el total y en el país tenemos las variedades sueltas. Sumar las tres variedades del país seguramente da el total correcto, pero eso es una decisión tuya, no nuestra: nosotros no inventamos totales que la fuente no trajo.

**Qué decidimos mientras tanto.** **No publicamos la participación de Santiago en el país para poroto ni para maní.** El resto de los cultivos sí: por ejemplo, en 2024/25 Santiago es el **40,3% de la superficie nacional de poroto negro** y el **33,9% del algodón**, y esos números salen sin problema.

**Pregunta para vos.** Para el país, ¿armamos el "poroto total" sumando alubia más negro más otros, o nos mandás la fila del total y el maní del país?

## 5. Falta el departamento Salavina

**Qué se ve.** La hoja de Santiago cubre **26 de los 27 departamentos** de la provincia. **Salavina no aparece en ninguna campaña**, ni siquiera con ceros.

Para mirarlo en tu Excel: filtrá la columna Departamento en la hoja "9 PB 3 - A" y vas a ver que van de Aguirre a Silípica sin Salavina en el medio.

**Por qué llama la atención.** En un mapa provincial, un departamento sin dato se ve igual que un departamento con cero, y no es lo mismo. Si Salavina queda en blanco, la primera pregunta de cualquiera que mire el mapa va a ser por qué.

**Qué decidimos mientras tanto.** Pintamos Salavina como **"sin datos"**, con su propio color y su aclaración, nunca como cero.

**Pregunta para vos.** ¿En Salavina no se hace cultivo extensivo, o es un faltante de la planilla del MAGyP? Vos sabés mejor que nosotros si ahí hay o no superficie sembrada.

## 6. Hay 141 filas sembradas que nunca se cosecharon, y hay un patrón claro

**Qué se ve.** 141 filas tienen superficie sembrada mayor a cero y superficie cosechada exactamente cero, con producción cero. No están repartidas al azar: **el 94% son tres cultivos de invierno**.

| Cultivo | Casos | Hectáreas sembradas sin cosechar |
|---|---|---|
| Avena | 84 | 70.940 |
| Centeno | 37 | 117.080 |
| Cebada | 11 | 20.232 |
| El resto (lenteja, maíz, sorgo, algodón, poroto, trigo) | 9 | 3.870 |

Para mirarlo en tu Excel: Robles, avena, cualquier campaña desde 2017/18. Vas a ver 500 ha sembradas y 0 cosechadas, campaña tras campaña.

**Por qué llama la atención.** A primera vista parece un agujero de datos. Pero el patrón dice otra cosa: avena, centeno y cebada son los verdeos de invierno, que se siembran para que coma la hacienda y no se cosechan para grano. O sea, **el dato probablemente esté bien y lo que está mal es cómo lo mostraríamos**: si armamos un mapa de producción, esos departamentos aparecen en cero como si hubieran fracasado.

**Qué decidimos mientras tanto.** Los mostramos como **"sembrado sin cosechar"**, separado de "sin datos" y separado de "producción cero por pérdida".

**Pregunta para vos.** ¿Confirmás que la avena y el centeno con cosecha cero son verdeos para pastoreo? Si es así lo escribimos como regla y lo aclaramos en el sitio.

## 7. Cinco filas que sí cosecharon y declararon producción cero

**Qué se ve.** Distinto del punto anterior: acá hay superficie **cosechada** mayor a cero y producción cero, lo cual no puede pasar.

| Dónde | Campaña | Cultivo | Cosechada | Producción | Fila del Excel |
|---|---|---|---|---|---|
| Quebrachos | 2021/22 | Maíz | 2.000 ha | 0 tn | 886 |
| Ojo de Agua | 2021/22 | Maíz | 1.500 ha | 0 tn | 873 |
| Banda | 2021/22 | Avena | 200 ha | 0 tn | 232 |
| Moreno | 2020/21 | Avena | 180 ha | 0 tn | 306 |
| Anta (Salta) | 2024/25 | Maní | 260 ha | 0 tn | 169 (hoja del NOA) |

**Por qué llama la atención.** Si se cosechó, algo salió. Puede ser que se haya cosechado y perdido todo, o que falte cargar la producción.

**Qué decidimos mientras tanto.** Las mostramos como **"sin dato"** en vez de como cero, así no tiran para abajo los promedios de rendimiento del departamento.

**Pregunta para vos.** ¿Los dos casos de maíz de 2021/22 en Quebrachos y Ojo de Agua fueron pérdida total por seca, o falta el número de producción?

## 8. Hay superficies que se repiten idénticas campaña tras campaña

**Qué se ve.** 81 casos donde el mismo departamento tiene **exactamente el mismo número** de hectáreas para el mismo cultivo durante 5 campañas o más seguidas.

Los más marcados:

- **Silípica, algodón: 4.000 ha exactas durante 10 campañas seguidas** (2015/16 a 2024/25).
- **Robles, algodón: 20.000 ha exactas durante 9 campañas.**
- **Capital, algodón: 5.000 ha exactas durante 9 campañas.**
- **Loreto, trigo: 1.000 ha exactas durante 8 campañas.**

**Por qué llama la atención.** La superficie sembrada de un cultivo no se repite al número exacto diez años seguidos en el mundo real. Esto indica que ese dato departamental es una **estimación fija** de la fuente, no una medición año a año.

**Qué decidimos mientras tanto.** Publicamos los números tal como vinieron, y **agregamos una nota al pie** aclarando que la apertura departamental es estimada por la fuente. No los tocamos.

**Pregunta para vos.** ¿Sabés cómo estima el MAGyP la apertura por departamento? Nos sirve para escribir bien la nota al pie.

## 9. El dato departamental está lleno de números redondos y el del país no

**Qué se ve.** Miramos qué proporción de los valores de cada hoja son múltiplos exactos de 100:

| Hoja | Valores redondos |
|---|---|
| Santiago por departamento | 61,9% |
| NOA por departamento | 40,8% |
| Totales país | 0% |

**Por qué llama la atención.** Es la misma historia del punto anterior, vista desde otro ángulo y sobre todo el archivo. El total del país está medido; la apertura departamental está estimada. Son dos calidades de dato distintas conviviendo en la misma planilla, y conviene que el sitio lo diga en vez de disimularlo.

**Qué decidimos mientras tanto.** Al pie de los cuadros departamentales va a decir que la apertura por departamento es una estimación de la fuente. La fuente ("Fuente: MAGyP") se cita al pie de todo, como pediste.

**Pregunta para vos.** ¿Te parece bien esa aclaración al pie, o preferís otra redacción?

## 10. El archivo cubre mucho menos de lo que dice el índice

**Qué se ve.** En tu índice esta base figura con datos **desde 1969 hasta 2025**. El archivo que llegó arranca en **2014/15** (más las dos campañas sueltas del punto 1) y termina en **2025/26**.

**Por qué llama la atención.** No es un error del archivo: es que el índice describe lo que tiene la fuente completa y vos nos mandaste el recorte que hace falta para la beta. Lo anotamos para que las dos listas queden dichas y nadie después busque los años que faltan.

**Qué decidimos mientras tanto.** Publicamos lo que llegó y **aclaramos al pie el período cubierto**: campañas 2014/15 a 2025/26.

**Pregunta para vos.** ¿Vamos a querer la serie larga desde 1969 en algún momento, o con estas doce campañas alcanza para lo que quiere ver el gobierno?

## 11. La campaña 2025/26 está a medio camino, y se nota

**Qué se ve.** La campaña 2025/26 trae solamente **8 cultivos, todos de invierno**: trigo, cebada, avena, centeno, garbanzo, colza, cártamo y trigo candeal. No hay soja, ni maíz, ni sorgo, ni algodón. Además cubre 23 departamentos en vez de 26.

**Por qué llama la atención.** Es lo esperable de una campaña en curso: lo de invierno ya se cosechó y lo de verano todavía está en el lote. Pero si alguien mira "producción total de la provincia por campaña", 2025/26 va a aparecer como una caída enorme que no existe.

**Qué decidimos mientras tanto.** En los totales por campaña **2025/26 se marca como campaña en curso** y no se compara contra las campañas cerradas. En los gráficos de trigo, cebada, avena y demás cultivos de invierno sí se muestra normal.

**Pregunta para vos.** ¿Cuándo se completa la 2025/26 con los cultivos de verano? Así sabemos cuándo pedirte la actualización.

## 12. El archivo tiene hojas con otro nombre del que figura en el índice

**Qué se ve.** El índice declara una hoja llamada **"CR"** y el archivo la trae como **"Calculos Ranking"**. Además el archivo trae dos hojas que el índice no menciona: **"Modelo Análisis"** (con dos espacios entre las palabras) y **"Hoja1"**, que está vacía.

**Por qué llama la atención.** Ninguna de las tres es un problema: sabemos qué es cada una y ya está resuelto de nuestro lado. Lo anotamos porque cuando llegue la próxima versión del archivo queremos saber si el formato cambió otra vez.

**Qué decidimos mientras tanto.** Nada. El pipeline ya lee el archivo tal como viene. **No hace falta que cambies nada en la planilla.**

## 13. Saltos grandes de una campaña a la otra

**Qué se ve.** 229 casos donde un número se multiplica o se divide por más de 5 de una campaña a la siguiente. Los más grandes:

- **Moreno, trigo:** 275.600 tn en 2019/20 y 6.840 tn en 2020/21.
- **Alberdi, trigo:** 119.000 tn en 2019/20 y 5.460 tn en 2020/21.
- **Belgrano, soja de 1ra:** 27.118 tn en 2017/18 y 228.525 tn en 2018/19.
- **Aguirre, soja de 1ra:** 126.528 tn en 2015/16 y 15.264 tn en 2016/17.

**Por qué llama la atención.** En agricultura estos saltos son normales: se cambia de cultivo según el precio y según cómo viene el agua. Varios de estos coinciden con años conocidos (2020/21 fue un año duro para el trigo). Lo listamos como contexto, no como error.

**Qué decidimos mientras tanto.** Se publica sin tocar nada. La lista completa queda guardada por si querés repasarla.

**Pregunta para vos.** Ninguna, salvo que quieras revisar alguno en particular.

---

# Base 85 · Movimientos de hacienda bovina (DTE, SENASA)

Archivo: `85 - DTE Bovinos SDE.xlsx`. Leímos las dos hojas de datos: la de origen (28.112 movimientos que salen de Santiago) y la de destino (17.920 que entran desde otra provincia). No leímos "Modelo Analisis" (son tus instrucciones, van al armado de las vistas) ni "Hoja2" (está vacía). En total 46.032 movimientos, de enero 2022 a mayo 2026.

## 14. La fila de totales del pie de la hoja de destino no es un total

**Qué se ve.** Abajo de todo de la hoja "Data DESTINO SDE" hay una fila con totales, sin motivo y sin año. Dice **489.284 cabezas**. Pero si sumamos las 17.920 filas de esa misma hoja, dan **2.016.657 cabezas**. La fila del pie muestra menos de la cuarta parte.

Al mirarlo de cerca, ese 489.284 es exactamente **el total del año 2025**, no el de la hoja. Lo mismo pasa columna por columna: en las 24 columnas de esa hoja el pie coincide con 2025 y no con el total.

**Por qué llama la atención.** Es la clase de número que se copia sin querer a una presentación. Si alguien toma esa fila creyendo que es el total de introducción de hacienda a Santiago, se queda con un cuarto del movimiento real.

**Qué decidimos mientras tanto.** La fila queda **marcada como fila de totales** en nuestros datos, separada del detalle, así ninguna vista la suma junto con los movimientos reales. Todos los números que publiquemos salen de sumar el detalle.

**Pregunta para vos.** ¿Esa fila quedó de una versión anterior donde la hoja llegaba hasta 2025? ¿La sacamos del archivo en la próxima entrega o la dejamos como referencia?

## 15. La fila de totales de la hoja de origen quedó desactualizada

**Qué se ve.** El mismo tipo de fila, pero en la hoja de origen, y acá la diferencia es chiquita: el pie dice **4.192.293 cabezas** y el detalle suma **4.192.353**. Son **60 cabezas** de diferencia. Pasa en 8 de las 24 columnas, y siempre para el mismo lado: el detalle tiene un poco más que el total.

Y hay un dato que ata todo: en tu hoja "Modelo Análisis", el 2026 figura con 8.549 DTE y 282.200 cabezas, mientras que el detalle da 8.553 y 282.260. **La diferencia es exactamente la misma: 4 documentos y 60 cabezas.**

**Por qué llama la atención.** No es un error de los datos, es un desfasaje de momento: se agregaron movimientos de 2026 al detalle y no se volvieron a calcular ni la fila del pie ni el resumen de arriba. Los años 2022 a 2025 no están afectados, por eso coinciden exactos.

**Qué decidimos mientras tanto.** Nos guiamos siempre por el detalle, que es lo que está fila por fila. **Ningún número publicado sale de la fila del pie ni del resumen.**

**Pregunta para vos.** ¿Confirmás que el detalle es el que manda y que el resumen quedó viejo? Si querés, cuando cierre 2026 recalculamos todo de una.

## 16. Cinco movimientos donde el total no da la suma de las categorías

**Qué se ve.** En 5 de los 46.032 movimientos, la columna "TOTAL BOVINOS" no coincide con la suma de terneros + terneras + novillitos + novillos + toritos + toros + vacas + vaquillonas. Las diferencias son de entre el 1,1% y el 2,8%.

Para mirarlo en tu Excel, hoja "Data ORIGEN SDE": la fila 237 (mayo 2022) y la fila 6.476 (marzo 2023) son dos de los casos.

**Por qué llama la atención.** En los otros 46.027 movimientos cierra perfecto, así que no es un problema de criterio sino de esos casos puntuales. Puede ser que haya una categoría que SENASA no abre (por ejemplo animales sin clasificar) y que igual entren al total.

**Qué decidimos mientras tanto.** Publicamos usando siempre **"TOTAL BOVINOS"** para los totales, igual que tu regla de usar "soja total" en agrícola. La apertura por categoría se muestra como detalle.

**Pregunta para vos.** ¿Hay alguna categoría de bovinos que el DTE no abre en columna y que igual suma al total?

## 17. En la hoja de destino aparecen motivos que no son de hacienda bovina

**Qué se ve.** La hoja de origen tiene 18 motivos de movimiento, todos esperables: invernada, faena, cría, reproducción, exposición. La de destino tiene 30, y entre los 15 que aparecen solo ahí hay varios que no parecen de bovinos: **"Traslado de Aves Ornamentales"**, "Vareo/Competencia", "Deportes", "Traspatio o autoconsumo", "Venta a forrajerías, agropecuarias y veterinarias".

**Por qué llama la atención.** Sospechamos que la hoja de destino se armó con la clasificación general de motivos de SENASA, que sirve para todas las especies, y no con la lista recortada a bovinos. Si esos motivos traen cabezas cargadas, entran a los totales de introducción.

**Qué decidimos mientras tanto.** **Se ingieren todos, no descartamos ninguno.** Descartar por nuestra cuenta sería corregir el dato en silencio.

**Pregunta para vos.** ¿Esos motivos son residuo de la clasificación general de SENASA? ¿Los dejamos dentro del total de introducción o los mostramos aparte?

## 18. Aparecen búfalos, pero solo entrando a la provincia

**Qué se ve.** El archivo trae, además de los bovinos, las mismas nueve columnas para bubalinos (búfalos). En la hoja de origen están **todas en cero**: no sale un solo búfalo de Santiago. En la de destino suman **845 cabezas** que entran.

**Por qué llama la atención.** No es un error, es un dato: mínimo comparado con los 2 millones de bovinos, pero existe.

**Qué decidimos mientras tanto.** Los guardamos identificados como especie aparte. **Ninguna vista los va a mezclar con bovinos**, ni siquiera en los totales.

**Pregunta para vos.** ¿Te interesa que los búfalos aparezcan en alguna vista o los dejamos guardados sin mostrar?

---

# Base 48 · Stock bovino por departamento y categoría (MAGyP)

Archivo: `48 - Stocks bovinos por depto y categ - SDE.xlsx`. Leímos la hoja **"Data stock SDE"**: 392 filas, los 27 departamentos por cada uno de los 14 años (2012 a 2025), con las cabezas abiertas en nueve categorías. No leímos "Modelo An 01" (son tus instrucciones, van al armado de las vistas) ni "Estratificación" (ver punto 22).

Una aclaración que conviene dejar dicha, porque son dos bases de bovinos y se pueden confundir: acá las cabezas son **stock**, o sea cuántos animales **hay** en un momento; en la base 85 son **movimientos**, o sea cuántos se **movieron** en el año, y un animal que se movió tres veces cuenta tres. No se suman entre sí.

## 19. En 2021 las vacas vienen con decimales

**Qué se ve.** En el año **2021**, y solo en ese año, la columna **Vacas** trae números con decimales en los 26 departamentos y también en el total. El total provincial de vacas de 2021 da **586.810,25**. Como el total general de cada fila incluye a las vacas, arrastra el mismo decimal: el stock total de la provincia en 2021 queda en **1.355.173,25 cabezas**. Los otros 13 años están en números enteros.

**Por qué llama la atención.** Media vaca no existe. Que sea un solo año, una sola categoría, y que el decimal sea siempre 0,25 o 0,50 hace pensar en un reparto o un promedio hecho sobre la planilla, no en un error de tipeo suelto.

**Qué decidimos mientras tanto.** **No tocamos el número.** Lo guardamos tal como vino, y en el sitio los valores se muestran redondeados, como todos los demás. La diferencia es mínima (un cuarto de animal sobre 1,3 millones), así que no cambia ningún gráfico ni ningún ranking. Pero preferimos avisarte antes que corregirlo por nuestra cuenta.

**Pregunta para vos.** ¿Sabés por qué el 2021 tiene las vacas con decimales? ¿Es un promedio de la fuente o algo que quedó de un cálculo intermedio?

## 20. "Cantidad de UP" está cargada recién desde 2022

**Qué se ve.** La columna **"Cantidad de UP"** (unidades productivas) tiene dato en **2022, 2023, 2024 y 2025**, completa en esos cuatro años. En **2012 a 2021 la celda viene vacía**, en todas las filas.

**Por qué llama la atención.** Vacío no es lo mismo que cero. Si lo tomáramos como cero, un gráfico de unidades productivas mostraría diez años en el piso y después un salto, como si los establecimientos hubieran aparecido de golpe en 2022.

**Qué decidimos mientras tanto.** Esa columna **solo se muestra en los años que la tienen**. Nunca se dibuja como cero en los años anteriores.

**Pregunta para vos.** ¿La fuente empezó a informar la cantidad de unidades productivas recién en 2022, o se puede conseguir para los años anteriores?

## 21. El archivo arranca en 2012 y el índice dice 2007

**Qué se ve.** En tu índice esta base figura con datos **desde 2007 hasta 2025**. El archivo que llegó arranca en **2012**. Faltan cinco años respecto de lo declarado. El índice también dice 7.633 registros y el archivo trae 392 filas, pero eso es esperable: ese número parece ser el de la base nacional completa y lo que nos mandaste es el recorte de Santiago.

**Por qué llama la atención.** Es la única diferencia entre lo prometido y lo recibido en esta base. No sabemos si el recorte es a propósito.

**Qué decidimos mientras tanto.** Publicamos lo que llegó y **aclaramos al pie el período cubierto**: 2012 a 2025.

**Pregunta para vos.** ¿Los años 2007 a 2011 los tenés y no entraron en el archivo, o la serie de esta fuente arranca en 2012?

## 22. El archivo trae dos hojas más de las que dice el índice, y una no la leímos

**Qué se ve.** El índice declara una sola hoja, **"Data SDE"**, y el archivo la trae como **"Data stock SDE"**. Además vienen otras dos: **"Modelo An 01"** y **"Estratificación"**.

**Por qué llama la atención.** La de "Modelo An 01" es tu especificación de siempre y ya sabemos qué hacer con ella, pero tiene algo que no está en ningún otro lado: una columna **ZONA** que agrupa los departamentos en zonas productivas. Eso lo vamos a usar para las vistas y no lo teníamos.

La de **"Estratificación"** es otra cosa: establecimientos agrupados por tamaño de rodeo (hasta 20 cabezas, de 21 a 100, y así hasta más de 4.000). No la leímos por dos motivos. Primero, está armada por provincia y no por departamento, así que es otro tipo de tabla y va aparte. Segundo, y más importante, trae **Buenos Aires, Catamarca, Jujuy, Salta, Tucumán, CABA y el total del país**, o sea comparación entre provincias, que es material que no publicamos sin decisión de Francisco.

**Qué decidimos mientras tanto.** El pipeline lee el archivo tal como viene, **no hace falta que cambies nada en la planilla**. La estratificación queda guardada y sin publicar hasta que la charlemos.

**Pregunta para vos.** ¿La estratificación por tamaño de establecimiento la querés en el tablero? Si va, tenemos que definir si se muestra solo Santiago o también la comparación con las otras provincias.

## 23. En Quebrachos hay 2 bueyes, siempre los mismos

**Qué se ve.** En **Quebrachos**, la categoría **Bueyes** dice exactamente **2** en seis años distintos (2018, 2019, 2021, 2022, 2024 y 2025).

**Por qué llama la atención.** Un número chiquito que no se mueve nunca suele ser un dato arrastrado más que un recuento nuevo cada año.

**Qué decidimos mientras tanto.** Se publica sin tocar. Los bueyes son el 0,0002% del stock provincial, así que no mueve ningún número que se vea.

**Pregunta para vos.** Ninguna, salvo que te llame la atención.

## 24. Saltos grandes de un año al otro

**Qué se ve.** 66 casos donde una categoría se multiplica o se divide por más de 5 de un año al siguiente. Los más notorios:

- **Jiménez, toritos:** 635 en 2020 y 4.098 en 2021; al año siguiente vuelve a 781.
- **Guasayán, novillitos:** 406 en 2013 y 2.779 en 2014.
- **Capital, terneros:** 259 en 2015 y 2.039 en 2016.

**Por qué llama la atención.** En ganadería estos saltos suelen ser reales: se mueve hacienda, se recategorizan animales de un año al otro o entra un establecimiento grande al padrón. Los listamos como contexto, no como error. Ojo que varios caen en categorías chicas, donde un solo establecimiento cambia el número entero.

**Qué decidimos mientras tanto.** Se publica sin tocar nada. La lista completa queda guardada por si querés repasarla.

**Pregunta para vos.** Ninguna, salvo que quieras revisar alguno en particular.

---

# Sobre el índice (no es de una base en particular)

## 25. Las bases de la sección INTRANET no estaban quedando en su tema

**Qué se ve.** En tu índice, después del bloque de Clima, hay una fila que dice **INTRANET** y abajo cuelgan varias bases: SISA, el registro de semillas, las estaciones de servicio, el padrón RENSPA y los ingresos de hacienda a Liniers. Al leer el índice, esa fila no se estaba tomando como un título de sección, así que esas bases quedaban clasificadas **como si fueran de Clima**. En la portada del sitio aparecían las estaciones de servicio abajo del título "Clima".

**Por qué llama la atención.** No afecta ningún dato, pero sí lo primero que se ve al entrar al sitio.

**Qué decidimos mientras tanto.** Ya está corregido de nuestro lado: ahora esas bases quedan agrupadas bajo **Intranet**, que es donde vos las pusiste. **No hace falta que cambies nada en el índice.**

Queda una decisión que no es nuestra: esas 18 bases de Intranet **hoy no se muestran en la portada**, y la rama "Registros" quedó sin nada listado. Son padrones de empresas y establecimientos, o sea material de consulta más que de tablero.

**Pregunta para vos.** ¿Las bases de la sección INTRANET las querés visibles en la portada del sitio, o van a quedar solo para la intranet del gobierno?

---

# Preguntas para JC

Listas para copiar y pegar:

1. En cultivos extensivos aparecen dos campañas viejas sueltas (2000/01 y 2013/14) con el total de la provincia pero sin ningún departamento. ¿Las sacamos o conseguís el detalle?
2. En trigo solo vino "Trigo total" y "Trigo candeal", no vino "Trigo pan". ¿Existe abierto en el MAGyP o directamente no lo publican para Santiago?
3. En Santiago no aparece el poroto alubia, y las variedades de poroto (negro y otros) recién arrancan en 2021/22. ¿Es así en la fuente o falta el dato?
4. La hoja de totales país no trae la fila de "Poroto total" ni el maní. Para calcular la participación de Santiago en el país, ¿sumamos las tres variedades de poroto o nos mandás la fila del total?
5. Falta el departamento Salavina en toda la base. ¿Es que ahí no se hace cultivo extensivo o es un faltante de la planilla?
6. Avena, centeno y cebada aparecen sembradas con cosecha cero en 132 casos. ¿Confirmás que son verdeos para pastoreo que no se cosechan para grano?
7. Hay 5 filas con superficie cosechada y producción cero (maíz en Quebrachos y Ojo de Agua 2021/22, entre otras). ¿Fue pérdida total o falta cargar la producción?
8. Hay departamentos con la misma superficie exacta durante 10 campañas seguidas (Silípica, algodón, 4.000 ha). ¿Sabés cómo estima el MAGyP la apertura por departamento? Queremos aclararlo al pie.
9. El índice dice que esta base va desde 1969 y el archivo arranca en 2014/15. ¿Vamos a querer la serie larga o alcanza con estas doce campañas?
10. La campaña 2025/26 solo tiene los cultivos de invierno. ¿Cuándo se completa con soja, maíz, sorgo y algodón?

Sobre movimientos de hacienda (base 85):

11. La fila de totales del pie de la hoja "Data DESTINO SDE" dice 489.284 cabezas, pero es el total de 2025, no el de la hoja (que suma 2.016.657). ¿Quedó de una versión anterior?
12. En la hoja de origen, la fila de totales y tu resumen de 2026 quedaron 60 cabezas y 4 documentos por debajo del detalle. ¿Confirmás que manda el detalle y que el resumen quedó viejo?
13. Hay 5 movimientos donde "TOTAL BOVINOS" no da la suma de las ocho categorías. ¿Hay alguna categoría que el DTE no abre en columna y que igual suma al total?
14. La hoja de destino trae motivos que no parecen de bovinos ("Traslado de Aves Ornamentales", "Deportes", "Vareo/Competencia"). ¿Son residuo de la clasificación general de SENASA? ¿Entran al total de introducción o van aparte?
15. Entran 845 cabezas de búfalos a Santiago y no sale ninguna. ¿Querés que los mostremos en alguna vista o los dejamos guardados sin publicar?

Sobre stock bovino (base 48):

16. En 2021, y solo en ese año, las vacas vienen con decimales (el total provincial da 586.810,25). ¿Es un promedio de la fuente o quedó de un cálculo intermedio?
17. La columna "Cantidad de UP" está cargada recién desde 2022. ¿La fuente empezó ahí o se puede conseguir para los años anteriores?
18. El índice dice que esta base va desde 2007 y el archivo arranca en 2012. ¿Tenés los años 2007 a 2011 o la serie arranca ahí?
19. La hoja "Estratificación" (establecimientos por tamaño de rodeo) trae también Buenos Aires, Salta, Tucumán y el total del país. ¿La querés en el tablero? ¿Solo Santiago o con la comparación entre provincias?
20. En la hoja "Modelo An 01" usás una columna ZONA que agrupa los departamentos en zonas productivas, y no la tenemos en ningún otro lado. ¿Nos confirmás que esa zonificación es la que querés usar en los mapas y los cuadros?

Sobre el índice:

21. Las bases que en tu índice cuelgan de INTRANET (SISA, semillas, estaciones de servicio, RENSPA, ingresos a Liniers) hoy no aparecen en la portada del sitio. ¿Las querés visibles ahí o quedan solo para la intranet del gobierno?

---

*Control hecho sobre 11.728 datos de la base 9, 46.032 movimientos de la base 85 y 392 filas de stock de la base 48. Detalle técnico completo en `validations/hallazgos/entrega-01.yaml`. Fuente de los datos: MAGyP (bases 9 y 48) y SENASA (base 85).*
