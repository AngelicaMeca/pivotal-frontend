# Pivotal · Historial de calidad

Memoria de calidad del proyecto: **anomalía → fecha → respuesta de JC → regla resultante en configs**.

Cada anomalía que se detecta entra acá cuando se reporta, con la respuesta vacía. Cuando JC contesta (WhatsApp, llamada, mail) se completa la respuesta y se anota qué regla quedó escrita en `configs/` o en `specs/`. Una anomalía cerrada sin regla escrita no está cerrada.

Regla de oro: acá no se corrige nada. La corrección siempre termina siendo una línea explícita en un YAML.

## Estados

- `abierta`: reportada, sin respuesta de JC todavía.
- `respondida`: JC contestó, falta escribir la regla.
- `cerrada`: hay regla escrita en config y el reporte de la próxima entrega ya no la levanta.

---

## entrega-01 · base 9 · Cultivos extensivos

Reportadas el 2026-07-30 en `validations/reportes/entrega-01.md`.

| # | Anomalía | Detectada | Estado | Respuesta de JC | Regla resultante |
|---|---|---|---|---|---|
| 1 | Campañas 2000/01 y 2013/14 con total provincial y cero departamentos (7 filas) | 2026-07-30 | abierta | | Provisoria: las dos campañas quedan fuera del sitio. Falta escribirla como filtro explícito en el spec de la base 9. |
| 2 | Falta "Trigo pan": solo hay "Trigo total" y "Trigo candeal" (candeal = 0,7% del total) | 2026-07-30 | abierta | | Provisoria: trigo se publica solo con "Trigo total", sin apertura pan/candeal. |
| 3 | Falta "Poroto alubia" en Santiago; variedades de poroto solo desde 2021/22 | 2026-07-30 | abierta | | Provisoria: poroto con "Poroto total" en toda la serie; apertura por variedad solo desde 2021/22. |
| 4 | La hoja país no trae "Poroto total" ni maní | 2026-07-30 | abierta | | Provisoria: no se publica participación en el país para poroto ni maní. |
| 5 | Falta el departamento Salavina (26 de 27) | 2026-07-30 | abierta | | Provisoria: Salavina se pinta "sin datos", nunca cero. |
| 6 | 141 filas sembradas sin cosechar, 132 de ellas avena, centeno y cebada | 2026-07-30 | abierta | | Provisoria: se muestran como "sembrado sin cosechar", distinto de "sin datos". |
| 7 | 5 filas con superficie cosechada y producción cero | 2026-07-30 | abierta | | Provisoria: se muestran como "sin dato" y no entran al promedio de rendimiento. |
| 8 | 81 casos de superficie idéntica repetida 5 campañas o más (Silípica algodón: 10 campañas) | 2026-07-30 | abierta | | Provisoria: se publica sin tocar, con nota al pie de dato estimado. |
| 9 | Dato departamental con 61,9% de números redondos; país con 0% | 2026-07-30 | abierta | | Provisoria: nota al pie aclarando que la apertura departamental es estimada. |
| 10 | El índice declara 1969-2025; el archivo trae 2014/15 a 2025/26 | 2026-07-30 | abierta | | Provisoria: se publica el recorte recibido con el período aclarado al pie. |
| 11 | Campaña 2025/26 incompleta: solo cultivos de invierno, 23 de 26 departamentos | 2026-07-30 | abierta | | Provisoria: 2025/26 se marca "campaña en curso" y no se compara contra campañas cerradas. |
| 12 | La hoja "CR" del índice llega como "Calculos Ranking"; dos hojas no declaradas | 2026-07-30 | cerrada | No hace falta preguntar: es cosmético. | `configs/bases/9-cultivos-extensivos.yaml`, bloque `hojas.ignorar` y nota de tipo `drift`. |
| 13 | 229 saltos de más de 5x entre campañas consecutivas | 2026-07-30 | cerrada | No hace falta preguntar: es propio del cultivo. | Ninguna. Queda como informativo en el reporte de cada entrega. |

### Verificado y sano en la base 9 (no genera anomalía)

Se anota para no volver a levantarlo en cada entrega si el resultado se mantiene.

| Qué se verificó | Resultado | Fecha |
|---|---|---|
| Total provincia contra suma de departamentos | 450 de 471 comparaciones exactas; las 21 restantes son las de la anomalía 1 | 2026-07-30 |
| "Soja total" = soja 1ra + soja 2da | Cierra en las 314 combinaciones de lugar y campaña | 2026-07-30 |
| Rendimiento = producción / superficie cosechada x 1.000 | Cierra en 2.784 de 2.785 filas; la restante se va 1,4% por redondeo | 2026-07-30 |
| Clave repetida (lugar + campaña + cultivo + medida) | Sin duplicados | 2026-07-30 |
| Valores negativos en superficies y producción | Ninguno | 2026-07-30 |
| Superficie cosechada mayor que la sembrada | Ningún caso | 2026-07-30 |
| Rendimientos fuera de rango razonable por cultivo | Ninguno (rangos en `validations/rangos.yaml`) | 2026-07-30 |

---

## entrega-01 · base 48 · Stock bovino por departamento

Reportadas el 2026-08-05 en `validations/reportes/entrega-01.md`.

| # | Anomalía | Detectada | Estado | Respuesta de JC | Regla resultante |
|---|---|---|---|---|---|
| 19 | Vacas con decimales en 2021, en los 26 departamentos y en el total (586.810,25 vacas provinciales) | 2026-08-05 | abierta | | Provisoria: el valor se ingiere tal cual y se muestra redondeado, como todas las cifras del sitio. Si JC confirma que es un promedio, hay que decidir si se publica ese año. |
| 20 | "Cantidad de UP" cargada solo en 2022-2025; vacía en 2012-2021 | 2026-08-05 | abierta | | Provisoria: la medida se muestra solo en los años que la tienen. Nunca como cero en los anteriores. Escrita en `validations/reglas.yaml` (check `medida_con_cobertura_parcial`). |
| 21 | El índice declara 2007-2025 y el archivo arranca en 2012 | 2026-08-05 | abierta | | Provisoria: se publica 2012-2025 y se aclara el período al pie. `periodos_declarados_fuente` en `validations/reglas.yaml` deja la diferencia a la vista en cada entrega. |
| 22 | Hoja "Data SDE" del índice llega como "Data stock SDE"; dos hojas no declaradas ("Modelo An 01" y "Estratificación") | 2026-08-05 | cerrada | No hace falta preguntar: es cosmético. | `configs/bases/48-stocks-bovinos.yaml`, bloques `hojas.ignorar` / `hojas.pendientes` y nota de tipo `drift`. |
| 23 | Quebrachos, bueyes = 2 en seis años (2018, 2019, 2021, 2022, 2024, 2025) | 2026-08-05 | cerrada | No hace falta preguntar: son 2 animales sobre 1,3 millones. | Ninguna. Queda como informativo en el reporte de cada entrega. |
| 24 | 66 saltos de más de 5x entre años consecutivos | 2026-08-05 | cerrada | No hace falta preguntar: es propio de la ganadería. | Ninguna. Queda como informativo en el reporte de cada entrega. |
| 25 | La estratificación por tamaño de establecimiento trae otras provincias y el total país | 2026-08-05 | abierta | | Provisoria: la hoja no se ingiere. Es material comparativo interprovincial y necesita decisión de Francisco antes de publicarse (CLAUDE.md). |

### Verificado y sano en la base 48 (no genera anomalía)

| Qué se verificó | Resultado | Fecha |
|---|---|---|
| "Total" de cada fila contra la suma de sus nueve categorías | Cierra exacto en las 392 filas | 2026-08-05 |
| Total provincial contra suma de departamentos | Cierra en los 14 años, 154 de 154 comparaciones | 2026-08-05 |
| Padrón geográfico | Los 27 departamentos, todos los años | 2026-08-05 |
| Serie temporal | 14 años seguidos (2012-2025), sin huecos | 2026-08-05 |
| Clave repetida (año + departamento + columna) | Sin duplicados | 2026-08-05 |
| Valores negativos | Ninguno | 2026-08-05 |
| Lectura contra el Excel original | El parquet reproduce los 14 totales anuales exactos | 2026-08-05 |

---

## entrega-01 · índice de JC (no es de una base)

| # | Anomalía | Detectada | Estado | Respuesta de JC | Regla resultante |
|---|---|---|---|---|---|
| 26 | La fila "INTRANET" del índice se leía como una base y las bases que le siguen heredaban el último tema de nivel 1: quedaban clasificadas como Clima | 2026-08-05 | cerrada | No hace falta preguntar: es un error de lectura nuestro, no del índice. | `pipeline/indice.py`, `parse_org`: una fila con descripción y sin número de base no es una base; si no empieza con "REPITE DE" es un encabezado de sección y corta el arrastre del tema. |
| 27 | Las 18 bases de la sección INTRANET no se muestran en la portada y la rama "Registros" quedó sin nada listado | 2026-08-05 | abierta | | Ninguna todavía. Es decisión de producto: si se muestran, hay que agregar la rama en `site/navegacion.yaml`. |

---

## entrega-01 · familia DTV · bases 53 (algodón), 56 (batata), 57 (cebolla) y 75 (papa)

Reportadas el 2026-09-23 en `validations/reportes/entrega-01.md`.

| # | Anomalía | Detectada | Estado | Respuesta de JC | Regla resultante |
|---|---|---|---|---|---|
| 28 | **Base 53.** 7 filas con U.M. "U." que leídas en toneladas dan movimientos de 12.820 a 21.000 tn (el 6,5% del peso de la base). Leídas en kilos dan 12,8 a 21 tn, o sea un camión. Distorsiona la variación interanual: con ellas 2022 crece 0,6% sobre 2021, sin ellas cae 4% | 2026-09-23 | abierta | | Provisoria: el peso en toneladas de 2021, 2022 y 2023 de la base 53 NO sale al sitio. El resto de la base (mapa, destinos, movimientos, productos, y el peso de 2024 y 2025) sí. Recomendación escrita a JC: leerlas con factor 0,001 como ya se hace en las bases 56, 57 y 75, y congelar el control contra la hoja "Modelo analisis" sobre la columna cruda. Si JC acepta, la regla es una línea en `configs/bases/53-dtv-algodon.yaml` y la reingesta |
| 29 | U.M. fuera de {Kg., Tn.} en las cuatro bases: `Kg-Tn` (9.762 filas, base 53) y `U.` (1.350 filas: 231 en la 53, 1.088 en la 57, 24 en la 75 y 7 en la 56). La anotación de la ingesta decía 1.326 porque no contaba la base 75 | 2026-09-23 | abierta | | Provisoria: `Kg-Tn` queda cerrada como entendida (`unidades_explicadas` en `validations/reglas.yaml`: el peso total ya viene en toneladas, verificado contra 8.873 filas y contra el control de JC). `U.` sigue bloqueando en las cuatro bases hasta que JC diga qué significa. Ojo: hoy el pipeline la lee como toneladas en la 53 y como kilos en la 56, 57 y 75 |
| 30 | **Base 53.** 160 filas donde CANT × PESO UNITARIO no da PESO TOTAL ni directo ni dividiendo por 1.000: 139 con `Kg-Tn` (el unitario trae el total copiado adentro) y 21 con `Tn.`, todas en la hoja de 2024. Suman 887 tn sobre 1.690.821 (0,05%) | 2026-09-23 | abierta | | Provisoria: manda siempre PESO TOTAL, que es la columna que usa JC y la única que reproduce sus totales de control. No se recalcula nada y la base se publica. Corrección a la nota de ingesta: las 21 de `Tn.` no son todas redondeos del 1%; solo 7 lo son, las otras 14 se van entre 8% y 929% |
| 31 | **Bases 53 y 57.** 21 filas en algodón y 1 en cebolla donde CANT. y PESO UNITARIO traen el mismo número y el PESO TOTAL queda en ese número al cuadrado (15 × 15 = 225 tn; 1.050 × 1.050 = 1.102 tn). Hallazgo nuevo, no venía anotado por la ingesta. 4.501 tn en la 53 (0,27%) y 1.102,5 tn en la 57 (0,64%) | 2026-09-23 | abierta | | Provisoria: se publican sin tocar (cambiarlas sería corregir en silencio). Check nuevo `columnas_que_no_deberian_coincidir` en `pipeline/validations.py`, parametrizado en `validations/reglas.yaml` (`columnas_distintas`) |
| 32 | 77 movimientos por encima de las 45 tn que puede llevar un camión: 67 en la 53 (hasta 700 tn), 8 en la 57 y 2 en la 56. Excluidos los 8 imposibles del punto 28 | 2026-09-23 | abierta | | Provisoria: se publican; son el 0,4% del peso. Rango nuevo `peso_por_movimiento_tn` en `validations/rangos.yaml`, con dos niveles: avisa a las 45 tn y bloquea a las 1.000 tn |
| 33 | **Base 53.** FECHA VENCIMIENTO llega como número de serie de Excel en 8.536 celdas (4.775 en la hoja de 2021 y 3.761 en la de 2022) | 2026-09-23 | cerrada | No hace falta preguntar: la columna no se usa en ninguna vista del modelo de JC. | Ninguna. Se mapea y no se ingiere. Verificado además que los seriales usan la época estándar de Excel y decodifican al año correcto (vencimiento = emisión + 5 a 8 días), así que si alguna vez hace falta se recupera sin ambigüedad |
| 34 | **Base 53.** El archivo trae 5 hojas y 102.380 filas donde el perfil declaraba 3 hojas y 53.512 filas; la segunda columna dice "mes" y no el número de DTV; la primera se titula "FECHA " en dos hojas y "FECHA EMISIÓN" en las otras tres | 2026-09-23 | cerrada | No hace falta preguntar: llegó el doble de dato del esperado. | `configs/bases/53-dtv-algodon.yaml`, nota de tipo `drift` y mapeo por hoja. Consecuencia que sí queda abierta: sin número de DTV no se puede controlar carga duplicada en las bases 53 y 56 |
| 35 | **Base 57.** 6 números de DTV que figuran en 2 renglones cada uno. Verificado uno por uno: mismo número, misma fecha, mismo origen y destino, pero CANTIDADES DISTINTAS. No son copias: parecen dos partidas del mismo envío | 2026-09-23 | abierta | | Provisoria: se cuentan los movimientos por renglón y no se borra ninguno. Check nuevo `documento_repetido` en `pipeline/validations.py` (`columnas.documento` en reglas.yaml). Si JC confirma que son partidas, la cantidad de DTV emitidas hay que contarla por número distinto (11.086) y no por renglón (11.092) |
| 36 | Meses sin ninguna declaración: 9 en la base 56, 9 en la 75 y febrero de 2025 en la 57 | 2026-09-23 | abierta | | Provisoria: se muestran en cero, nunca como "sin dato". `periodos_vacios_son_cero: true` en `validations/reglas.yaml` los baja de bloqueante a observación: en una base transaccional un mes vacío es un mes sin movimientos |
| 37 | **Base 56.** Base chica y concentrada: 635 movimientos en 5 años, 6 departamentos de origen. 21 de 27 departamentos quedan en gris en el mapa | 2026-09-23 | cerrada | No hace falta preguntar: la batata es un cultivo muy concentrado y el propio archivo lo refleja. | Ninguna en configs. Es una consecuencia de diseño que va al spec del tablero: la batata se cuenta con lista o ranking además del mapa |
| 38 | **Base 75.** Las 177 declaraciones caen todas entre septiembre y diciembre (28/8/14/127). Enero a agosto no existen, ningún año | 2026-09-23 | cerrada | No hace falta preguntar: el índice de JC titula la base "DTV - Papa (septiembre a diciembre)". | `meses_de_la_fuente: [9, 10, 11, 12]` en `validations/reglas.yaml`, para que el check de cobertura no reporte 32 meses faltantes. Consecuencia dura para el tablero: ninguna vista puede llamar "total del año" a lo que suma esta base, y va al pie de cada cuadro |
| 39 | Falso positivo NUESTRO, no de los datos: el check `fila_total_al_pie` reportaba que las bases 53 y 57 no cerraban, y cierran exacto. Comparaba el pie de UNA hoja contra el detalle de las CINCO (faltaba `columnas.particion`) y además comparaba flotantes sin margen: el propio texto se delataba diciendo "diferencia de 0" | 2026-09-23 | cerrada | No hace falta preguntar: es un error de configuración del control, no del archivo. | Dos arreglos: `columnas: {particion: hoja}` para las bases 53, 56, 57 y 75 en `validations/reglas.yaml`, y `RUIDO_FLOTANTE = 1e-9` en `pipeline/validations.py` para que 4 milmillonésimas de tonelada no cuenten como diferencia. Verificado que el hallazgo real de la base 85 (60 cabezas de diferencia) se sigue reportando |

### Verificado y sano en la familia DTV (no genera anomalía)

Se anota para no volver a levantarlo en cada entrega si el resultado se mantiene.

| Qué se verificó | Resultado | Fecha |
|---|---|---|
| Totales 2021 por producto de la base 53 contra la hoja "Modelo analisis" de JC | Idénticos al último decimal: algodón en bruto 324.969,726 tn; grano 66.291,20479; semilla 10.004,888; desperdicios 5.472,80201 | 2026-09-23 |
| Ranking 2021 de algodón en bruto por departamento de origen contra el de JC | Las 18 filas dan exacto, incluida "S/D" con 6.691 tn | 2026-09-23 |
| Fila de totales al pie contra el detalle de su hoja | Cierra exacto en las 5 hojas de la base 53 y en la hoja Sgo 25 de la 57 | 2026-09-23 |
| Sospecha de copy/paste en DTV Cebolla ("2.865 filas en 2022, 2023 y 2024") | **Descartada.** Las 2.865 son dimensión arrastrada en el XML del Excel, no datos. Las filas reales son 1.633 / 2.576 / 2.248 / 2.864 / 1.771. La comparación de contenido completo entre años tampoco encuentra dos años iguales | 2026-09-23 |
| Declaraciones duplicadas (clave completa, con fecha y hora) | Ninguna en las cuatro bases | 2026-09-23 |
| Valores negativos y movimientos fraccionarios | Ninguno en las cuatro bases | 2026-09-23 |
| Departamentos sin código INDEC y alias pendientes de confirmar | Ninguno. Los 22 nombres de departamento que usan las DTV ya estaban cargados por las bases 9 y 85; las 8 provincias de destino nuevas entraron con código INDEC oficial, no con propuesta | 2026-09-23 |
| Cobertura de entrega (índice vs recibido vs publicado) | Las 3 listas cierran: 27 declaradas, 27 recibidas, 7 con receta de lectura y 7 publicadas | 2026-09-23 |
| Bases 9, 48 y 85 después de incorporar las DTV | Sin un solo cambio: los 35 hallazgos dan idénticos en título, cantidad, severidad, detalle y ejemplos | 2026-09-23 |

---

## entrega-01 · bases todavía sin procesar

Las 20 bases restantes (30, 33, 38, 92, 93, 100, 101, 110, 111, 132, 134, 135, 136, 137, 144, 145, 151, 196, 197, 198) llegaron completas y sin faltantes contra el índice. Todavía no tienen receta de lectura, así que no pasaron por validaciones. No hay anomalías que reportar sobre ellas.

Actualización 2026-09-23: las cuatro DTV (53, 56, 57 y 75) ya salieron de esta lista y tienen su sección propia más arriba. El pendiente que quedaba anotado acá, la sospecha de copy/paste en cebolla, quedó **descartado**.
