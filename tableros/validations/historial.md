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

## entrega-01 · bases todavía sin procesar

Las 24 bases restantes (30, 33, 38, 53, 56, 57, 75, 92, 93, 100, 101, 110, 111, 132, 134, 135, 136, 137, 144, 145, 151, 196, 197, 198) llegaron completas y sin faltantes contra el índice. Todavía no tienen receta de lectura, así que no pasaron por validaciones. No hay anomalías que reportar sobre ellas.

Pendiente para cuando entren: la sospecha de copy/paste en las DTV (cebolla, batata, papa, algodón), que es el caso que motivó el check de conteos idénticos entre períodos.
