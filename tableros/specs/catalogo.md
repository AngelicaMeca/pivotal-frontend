# Pivotal · Catálogo de vistas

> Todo lo que el sitio va a mostrar, en una tabla. Esta es la lista que Juan Carlos valida contra
> su propia cabeza: si acá falta algo que él pidió, o sobra algo que él no pidió, se corrige acá
> antes de tocar una línea de código.
>
> Última actualización: 10 de agosto de 2026 · Mantenido por `constructor-reglas` y
> `constructor-dashboards`.
>
> Novedad de esta actualización: llegaron el **"Protocolo de formato - Versión 1"** de JC y su
> **mockup propio de la página de cultivos** (Modelo 1.xlsx). El protocolo de presentación pasó a
> versión 2 (`specs/modelos/_protocolo-presentacion.yaml`, sección `formato_v1`), el tablero de
> cultivos se reescribió para calcar el mockup de JC y hay **3 vistas nuevas** de la base 9, las
> tres verificadas contra los números de la hoja "Data" del propio mockup. Quedan pendientes de
> construcción por `constructor-dashboards`. Las ambigüedades nuevas son las preguntas 26 a 36
> del backlog.
>
> **Segunda tanda del mismo 10-ago (Facu, con JC presente):** la captura manda el formato pero
> no el diseño literal (tiene que ser moderno), el menú lateral pasa a estilo discreto, la tabla
> "Datos por campaña" muestra una sola serie sin huecos, el trabajo queda acotado SOLO a
> cultivos (hacienda y stock no se tocan), y se habilitan **"Datos por Departamento"** y
> **"Santiago en el NOA"** (este último por orden de Facu, con la ratificación de Francisco
> pendiente). Detalle en el backlog, "Segunda tanda del 10-ago-2026".
>
> **TERCERA TANDA del mismo 10-ago:** JC RECHAZÓ el rediseño publicado ("Todo
> deformado Facu") y Facu ordenó **arrancar de cero: el mockup Modelo 2 es LITERAL**, formato y
> diseño ("Hay que hacer lo que dice JC, respetá"). Quedan derogados el "diseño moderno", el
> menú discreto y la tabla en una sola serie de la segunda tanda. Además **desaparece el
> esquema tablero+análisis en cultivos**: `analisis.html` no existe más, sin links "ver
> detalle", y las vistas de detalle de la base 9 pasan a **registro (no publicadas)**. Las
> únicas páginas publicadas de cultivos son el **tablero**, la **vista departamental**
> (09-departamento-datos) y **"Santiago en el NOA"** (a ratificar por Francisco). Detalle en el
> backlog, "Tercera tanda del 10-ago-2026", y en
> `_protocolo-presentacion.formato_v1.tercera_tanda`.
>
> **CUARTA TANDA del mismo 10-ago (Facu, revisando la reconstrucción literal):** la
> literalidad del mockup sigue; son 9 ajustes: puesta del logo, escala legible en el gráfico
> de líneas (paso 0,50 de referencia), el panel **"Información relacionada" se dibuja**
> deshabilitado con "Próximamente", **la home va sin menú lateral**, el hover del mapa muestra
> **nombre + datos** (nunca IDs), en la vista departamental el botón de cabecera pasa a decir
> **"Provincia"**, el **anillo va sin cifra central** (excepción a la literalidad, JC valida) y
> queda escrita la regla general de **proporciones sin huecos en blanco**. Detalle en el
> backlog, "Cuarta tanda del 10-ago-2026", y en
> `_protocolo-presentacion.formato_v1.cuarta_tanda`. Pregunta nueva: 41 (asset del logo).

## Cómo leer los estados

| Estado | Qué significa |
|---|---|
| **publicada** | Está en el sitio y JC la puede mirar. |
| **publicada · a confirmar** | Está en el sitio, pero no la pidió JC: la propusimos nosotros. Se construye justamente para que él la vea y diga si la quiere. Si dice que no, se borra el spec y no afecta a ninguna otra vista. |
| **pendiente** | El spec está escrito y los datos están validados. Falta que `constructor-dashboards` la construya. |
| **pendiente de Francisco** | El spec está escrito y la vista está construida, pero compara provincias o expone información comercial. Queda generada en `_privado/`, sin enlazar desde ningún lado, hasta que Francisco decida. |
| **publicada · a ratificar por Francisco** | Sale al sitio por orden de Facu (con fecha y atribución escritas en el spec), pero es material sensible cuya regla dura pide el ok de Francisco. Si Francisco la baja, se vuelve atrás y la vista regresa a `_privado/`. |
| **bloqueada** | Faltan datos. No se promete nada hasta que la base esté cargada y validada. |
| **registro (no publicada)** | El spec existe y sus reglas valen (algunos alimentan paneles del tablero), pero NO se construye página propia. Es el estado de las vistas de detalle de cultivos desde la tercera tanda del 10-ago: "quedate con los tableros". |

Ninguna vista de este catálogo promete datos que `qa-datos` no haya revisado.

---

## Base 9 · Cultivos extensivos (MAGyP)

Datos validados en `validations/reportes/entrega-01.md`. Campañas del demo: **2015/16 a 2024/25** (10 campañas). Cobertura: 26 de los 27 departamentos de la provincia.

**Desde la tercera tanda del 10-ago-2026 la sección de cultivos publica exactamente 3 páginas**,
las del mockup literal de JC. Todo lo demás de la base 9 queda como registro (no publicada):
las reglas siguen valiendo (cuatro de esos specs alimentan paneles del tablero), pero no hay
páginas propias ni links "ver detalle".

### Las 3 páginas publicadas

| Página | Qué muestra | Tipo | Estado |
|---|---|---|---|
| [Tablero de cultivos (index)](modelos/tablero-cultivos-extensivos.yaml) | La página del mockup Modelo 2, LITERAL: mapa grande a la izquierda con "Seleccione departamento" (hover con nombre + datos del departamento, click al dato departamental), chips de cultivo con ícono, 4 KPIs sin variación (sembrada ha, cosechada ha, producción tn, rendimiento kg/ha), gráfico de líneas con eje vertical visible en "Millones" y escala legible, anillo "(fina y gruesa)" sin cifra central, tabla de datos en dos bloques sin huecos, ranking top 10 y panel "Información relacionada" deshabilitado ("Próximamente"). Cabecera con banderas es/en/pt (es activa) y los dos botones. | tablero | publicada · a confirmar (ajustes de la cuarta tanda pendientes de constructor-dashboards) |
| [Datos por departamento](modelos/09-departamento-datos.yaml) | El botón de cabecera "Datos por Departamento" y el destino del click en el mapa: se elige un departamento y un cultivo del catálogo y se ven los KPIs (sin variación), la evolución y la tabla campaña por campaña. Es la única salida de contenido que JC dejó en pie ("salvo el dato departamental"). En esta vista el botón de cabecera pasa a decir "Provincia" y vuelve al tablero (cuarta tanda). | serie | publicada |
| [Cuánto pesa Santiago en el NOA](modelos/09-noa-participacion-provincia.yaml) | La torta de participación de cada provincia del NOA en la producción de un cultivo, campaña 2024/25. Accesible SOLO desde el botón de cabecera "Santiago en el NOA". | torta | publicada · a ratificar por Francisco (habilitada por Facu el 10-ago-2026) |

### Registro: specs que alimentan paneles del tablero (sin página propia)

| Spec | Qué regla guarda | Panel que alimenta | Estado |
|---|---|---|---|
| [Dónde se siembra cada cultivo](modelos/09-cultivo-mapa-sup-sembrada.yaml) | Quintiles, tratamiento de sin-dato (Salavina) y leyenda del mapa. | mapa | registro (no publicada) |
| [Cómo evolucionaron la cosecha y la producción](modelos/09-cultivo-evolucion-cosecha-produccion.yaml) | Las dos series del gráfico de líneas del mockup y los números de la tabla de datos. | tendencia y tabla de datos | registro (no publicada) |
| [Qué parte de la producción pone cada cultivo](modelos/09-cartera-participacion-produccion.yaml) | El anillo top 5 + Resto sobre TODOS los cultivos de la fuente, "(fina y gruesa)". Soja 48,1%, total 6.016.454 tn, validado contra la hoja Data de JC. | anillo | registro (no publicada) |
| [Ranking por superficie sembrada](modelos/09-ranking-cultivo-sup-sembrada.yaml) | El top 10 con el % sobre el total provincial, verificado contra Moreno 355.400 ha y 25,10%. | ranking (top) | registro (no publicada) |

### Registro: el resto de las vistas de la base 9 (sin página propia)

Eran las páginas de `analisis.html`, que ya no existe. Los specs quedan como registro por si
JC pide de vuelta alguna de estas lecturas: se reactivan cambiando el estado, sin reescribir nada.

| Spec | Qué regla guarda | Tipo | Estado |
|---|---|---|---|
| [Cómo evolucionó la superficie sembrada](modelos/09-cultivo-evolucion-sup-sembrada.yaml) | Serie de hectáreas sembradas con variaciones. | serie | registro (no publicada) |
| [Cómo evolucionaron la producción y el rendimiento](modelos/09-cultivo-evolucion-prod-rendimiento.yaml) | Barras de producción + línea de rendimiento. | serie | registro (no publicada) |
| [Detalle por variedad](modelos/09-cultivo-detalle-componentes.yaml) | Soja 1ra/2da y variedades de poroto; trigo y cebada no se abren. | serie | registro (no publicada) |
| [Cartera: cómo cambió la producción](modelos/09-cartera-evolucion-absoluta.yaml) | Barras apiladas por cultivo, verano e invierno separados. | serie | registro (no publicada) |
| [Cartera: cómo cambió su composición](modelos/09-cartera-evolucion-porcentual.yaml) | La misma cartera en porcentaje. | serie | registro (no publicada) |
| [Qué se produce en el departamento](modelos/09-departamento-ficha-cultivos.yaml) | La ficha departamental de todos los cultivos. El click del mapa ahora va a 09-departamento-datos. | lista | registro (no publicada) |
| [Cartera de cultivos del departamento](modelos/09-departamento-cartera.yaml) | Las dos tortas departamentales (verano/invierno). | torta | registro (no publicada) |
| [Cómo evolucionaron los rendimientos](modelos/09-departamento-evolucion-rendimientos.yaml) | Rendimientos del departamento vs provincia. | serie | registro (no publicada) |
| [En qué puesto quedó el departamento](modelos/09-departamento-posicion-ranking.yaml) | La tabla de posiciones por campaña. | tabla-variaciones | registro (no publicada) |
| [Ranking de departamentos por cultivo](modelos/09-ranking-cultivo-produccion.yaml) | Ranking por producción en toneladas. | ranking | registro (no publicada) |
| [Ranking por rendimiento](modelos/09-ranking-cultivo-rendimiento.yaml) | Ranking por kg/ha. | ranking | registro (no publicada) |
| [Ranking por producción total](modelos/09-ranking-total-producido.yaml) | Ranking sumando todos los cultivos. | ranking | registro (no publicada) |
| [Ranking por rendimiento promedio](modelos/09-ranking-rendimiento-promedio-3.yaml) | Promedio de las últimas 3 campañas (reproduce el cálculo a mano de JC). | ranking | registro (no publicada) |
| [En qué cultivos Santiago pesa más en el país](modelos/09-pais-participacion-sde.yaml) | Participación de la provincia en el total nacional por cultivo. | ranking | pendiente de Francisco (nunca se publicó) |

---

## Base 85 · Movimientos de hacienda bovina (SENASA)

Datos validados en `validations/reportes/entrega-01.md`. Años del demo: **2022 a 2025** (2026 llega
hasta mayo y solo se muestra en los cuadros mensuales). Cobertura: **los 27 departamentos**.

Antes de escribir estas vistas se reprodujeron con el pipeline los seis cuadros que JC ya tenía
calculados a mano en su hoja. **Los seis dan exacto.** Está anotado vista por vista.

### Cuánto se mueve

| Vista | Qué muestra | Tipo | Estado |
|---|---|---|---|
| [Cómo evolucionaron los movimientos](modelos/85-evolucion-movimientos.yaml) | Cabezas movidas y documentos emitidos por año, con las tres variaciones. Se puede abrir por categoría de hacienda. Es el cuadro madre: los tres que siguen son el mismo, con otro recorte. | serie | publicada |
| [Movimientos dentro de la provincia](modelos/85-evolucion-internos.yaml) | Solo los traslados que arrancan y terminan en Santiago. En 2025 fueron el 40% del total. | serie | publicada |
| [Hacienda que sale de la provincia](modelos/85-evolucion-extraccion.yaml) | La extracción: lo que se va a otra provincia. El 60% restante. | serie | publicada |
| [Hacienda que entra a la provincia](modelos/85-evolucion-introduccion.yaml) | La introducción. Nunca se suma a los totales: son animales que no estaban en Santiago. | serie | publicada |
| [Balance: lo que entra menos lo que sale](modelos/85-balance-introduccion-extraccion.yaml) | El cuadro que mejor cuenta qué tipo de provincia ganadera es Santiago: entran terneros y terneras, salen novillitos, novillos y vaquillonas. | serie | publicada |
| [Qué categorías se mueven](modelos/85-participacion-categorias.yaml) | La composición porcentual por categoría, con selector de recorte. La composición cambia mucho entre lo que entra y lo que sale. | serie | publicada |

### Cuándo y para qué

| Vista | Qué muestra | Tipo | Estado |
|---|---|---|---|
| [En qué meses se mueve la hacienda](modelos/85-estacionalidad-mensual.yaml) | La estacionalidad: los meses en el eje y un año por línea. Es lo que JC pidió al escribir "mensualizar los mismos cuadros". | serie | publicada |
| [Para qué se mueve la hacienda](modelos/85-movimientos-por-motivo.yaml) | Ranking por motivo del traslado. Invernada y faena se llevan el 80%. | ranking | publicada |
| [Tambos y engorde a corral](modelos/85-tambos-engorde-corral.yaml) | Ingresos y egresos de estos establecimientos. **Ya están contados en los cuadros de arriba**: JC lo escribió en mayúscula y la vista lo avisa en pantalla. | serie | publicada |

### Por departamento

| Vista | Qué muestra | Tipo | Estado |
|---|---|---|---|
| [Ranking de departamentos](modelos/85-ranking-departamento-origen.yaml) | Quién mueve más hacienda, con el porcentaje de la provincia y la variación. Moreno, Robles y Jiménez encabezan 2025. | ranking | publicada |
| [Cómo evolucionó cada departamento](modelos/85-departamento-evolucion.yaml) | La serie de un departamento con las tres variaciones. JC anticipó que después va a la ficha departamental única. | serie | publicada |
| [De qué departamento a qué departamento](modelos/85-matriz-od-interna.yaml) | La matriz origen-destino de los movimientos internos, 27 por 27. JC la dejó dibujada y vacía con la instrucción "COMPLETAR TODA LA MATRIZ": son 729 celdas por año, y es el mejor ejemplo de lo que el pipeline le resuelve. | flujo-od | publicada |
| [Desde qué departamentos sale la hacienda](modelos/85-mapa-movimientos-departamento.yaml) | El mapa provincial de cabezas movidas por departamento de origen. **Esta no la pidió JC**: la proponemos para que ganadería se lea igual que cultivos. | mapa | publicada · a confirmar |

### Con otras provincias

| Vista | Qué muestra | Tipo | Estado |
|---|---|---|---|
| [A qué provincias va la hacienda santiagueña](modelos/85-extraccion-por-provincia-destino.yaml) | Ranking de provincias de destino. En 2025: Santa Fe, Córdoba y Tucumán. | ranking | pendiente de Francisco |
| [De qué provincias viene la que entra](modelos/85-introduccion-por-provincia-origen.yaml) | Ranking de provincias de origen. En 2025: Chaco, Santa Fe y Corrientes. Puesta al lado de la anterior cuenta sola el negocio ganadero santiagueño. | ranking | pendiente de Francisco |

---

## Los títulos, uno por uno

**Tercera tanda del 10-ago (manda sobre lo que sigue para el tablero de cultivos):** JC pidió
respetar su protocolo de títulos y su mockup de forma LITERAL ("No son los mismos títulos. Los
gráficos tampoco"). Los títulos de los paneles del tablero de cultivos se calcan del mockup, sin
reescrituras, dinámicos solo en cultivo, campaña y ventana:

| Panel del tablero | Título literal (con soja, 2024/25) |
|---|---|
| KPIs | Superficie sembrada · Superficie cosechada · Producción · Rendimiento promedio (solo valor + unidad, sin variación) |
| Gráfico de líneas | Soja - Sgo del Estero - Total - Evolución de la superficie cosechada y producción - Campañas 2015/16 a 2024/25 |
| Anillo | Sgo del Estero - Campaña 2024/25 - Participación porcentual por cultivo en el total de la producción (fina y gruesa) |
| Ranking | Ranking de sup. Sembrada sobre el total provincial |
| Mapa | Sin título de panel: "Seleccione departamento" arriba y "Fuente: MAGyP (Ministerio de Agricultura, Ganadería y Pesca)" al pie |

El período del gráfico sale de las campañas realmente graficadas (el mockup dice "2013/14 a
2024/25"; la ventana sigue en 10 mientras JC no la amplíe, pregunta 32).

Lo que sigue abajo es el compositor de títulos de la versión 1, que queda vigente para las
otras bases y para los specs de la base 9 que quedaron como registro.

JC mandó el protocolo de títulos: arriba de cada cuadro, mapa o gráfico tiene que decir **área
geográfica, sector o subsector, variable y período**. Ninguno de estos títulos está escrito a mano:
los arma el sistema con los componentes que declara cada vista, así que cuando cambiás de cultivo o
de campaña el título cambia solo y nunca queda desfasado del dato.

Esta es la lista con los valores por defecto de cada vista (soja, campaña 2024/25, departamento
Moreno como ejemplo cuando hace falta uno).

| Vista | Así se va a ver el título |
|---|---|
| Dónde se siembra cada cultivo | Santiago del Estero - soja - Superficie sembrada por departamento - campaña 2024/25 |
| Cómo evolucionó la superficie sembrada | Evolución de la superficie sembrada de soja - Santiago del Estero - campañas 2015/16 a 2024/25 |
| Cómo evolucionaron la producción y el rendimiento | Evolución de la producción y el rendimiento de soja - Santiago del Estero - campañas 2015/16 a 2024/25 |
| Detalle por variedad | Evolución de la producción de soja por variedad - Santiago del Estero - campañas 2015/16 a 2024/25 |
| Cartera: cómo cambió la producción | Evolución de la producción de los cultivos de verano por cultivo - Santiago del Estero - campañas 2015/16 a 2024/25 |
| Cartera: cómo cambió su composición | Distribución porcentual de la producción de los cultivos de verano por cultivo - Santiago del Estero - campañas 2015/16 a 2024/25 |
| Qué se produce en el departamento | Superficie, producción y rendimiento de los cultivos extensivos - MORENO (Santiago del Estero) - campaña 2024/25 |
| Cartera de cultivos del departamento | Distribución porcentual de la producción de los cultivos de verano por cultivo - MORENO (Santiago del Estero) - campaña 2024/25 (y la misma de invierno al lado) |
| Cómo evolucionaron los rendimientos | Evolución del rendimiento de los cultivos extensivos por cultivo - MORENO (Santiago del Estero) - campañas 2015/16 a 2024/25 |
| En qué puesto quedó el departamento | Posición en el ranking de la producción de los cultivos extensivos - MORENO (Santiago del Estero) - campañas 2015/16 a 2024/25 |
| Ranking de departamentos por cultivo | Ranking de producción de soja por departamento - Santiago del Estero - campaña 2024/25 |
| Ranking por rendimiento | Ranking de rendimiento de soja por departamento - Santiago del Estero - campaña 2024/25 |
| Ranking por producción total | Ranking de producción de los cultivos extensivos por departamento - Santiago del Estero - campaña 2024/25 |
| Ranking por rendimiento promedio | Ranking de rendimiento promedio de soja por departamento - Santiago del Estero - campañas 2022/23 a 2024/25 |
| Cómo evolucionaron la cosecha y la producción | Evolución de la superficie cosechada y producción de soja - Santiago del Estero - campañas 2015/16 a 2024/25 |
| Qué parte de la producción pone cada cultivo | Participación porcentual en el total de la producción (fina y gruesa) por cultivo - Santiago del Estero - campaña 2024/25 |
| Ranking por superficie sembrada | Ranking de superficie sembrada de soja por departamento - Santiago del Estero - campaña 2024/25 |
| Cuánto pesa Santiago en el NOA | Distribución porcentual de la producción de soja por provincia - NOA - campaña 2024/25 |
| En qué cultivos Santiago pesa más en el país | Participación en el total del país de la superficie sembrada por cultivo - Santiago del Estero/País - campaña 2024/25 |

Y los de la base 85 (valores por defecto: cabezas, año 2025, Moreno como departamento de ejemplo).
Acá aparece el paréntesis que usa el propio JC en su hoja para decir qué recorte está mirando
("sin introducción", "extracción"): es un componente más del título y cambia solo cuando se
cambia de selector.

| Vista | Así se va a ver el título |
|---|---|
| Cómo evolucionaron los movimientos | Evolución de las cabezas movidas de la hacienda bovina (sin introducción) - Santiago del Estero - años 2022 a 2025 |
| Movimientos dentro de la provincia | Evolución de las cabezas movidas de la hacienda bovina (movimientos internos) - Santiago del Estero - años 2022 a 2025 |
| Hacienda que sale de la provincia | Evolución de las cabezas movidas de la hacienda bovina (extracción) - Santiago del Estero - años 2022 a 2025 |
| Hacienda que entra a la provincia | Evolución de las cabezas movidas de la hacienda bovina (introducción) - Santiago del Estero - años 2022 a 2025 |
| Balance: lo que entra menos lo que sale | Balance de cabezas de la hacienda bovina por categoría - Santiago del Estero - año 2025 |
| Qué categorías se mueven | Distribución porcentual de las cabezas movidas de la hacienda bovina (sin introducción) por categoría - Santiago del Estero - años 2022 a 2025 |
| En qué meses se mueve la hacienda | Evolución de las cabezas movidas de la hacienda bovina (sin introducción) por mes - Santiago del Estero - años 2022 a 2026 |
| Para qué se mueve la hacienda | Ranking de cabezas movidas de la hacienda bovina (sin introducción) por motivo - Santiago del Estero - año 2025 |
| Tambos y engorde a corral | Evolución de ingresos y egresos de los engordes a corral - Santiago del Estero - años 2022 a 2025 |
| Ranking de departamentos | Ranking de cabezas movidas de la hacienda bovina (sin introducción) por departamento - Santiago del Estero - año 2025 |
| Cómo evolucionó cada departamento | Evolución de las cabezas movidas de la hacienda bovina (sin introducción) - MORENO (Santiago del Estero) - años 2022 a 2025 |
| De qué departamento a qué departamento | Cabezas movidas de la hacienda bovina (movimientos internos) por departamento de origen y de destino - Santiago del Estero - año 2025 |
| Desde qué departamentos sale la hacienda | Santiago del Estero - ganado bovino - Cabezas movidas (sin introducción) por departamento - año 2025 |
| A qué provincias va la hacienda santiagueña | Ranking de cabezas movidas de la hacienda bovina (extracción) por provincia de destino - Santiago del Estero - año 2025 |
| De qué provincias viene la que entra | Ranking de cabezas movidas de la hacienda bovina (introducción) por provincia de origen - Santiago del Estero - año 2025 |

Fijate que el mapa de hacienda arranca por el área geográfica ("Santiago del Estero - ganado
bovino - ...") y los demás por la variable. No es una inconsistencia: son los dos órdenes que usa
JC en su propio documento, cada uno con su ejemplo, y el sistema respeta los dos.

Los nombres cortos de la primera columna siguen existiendo: son los del menú, los links y la
pestaña del navegador. Un menú con treinta títulos de cien caracteres no se puede usar.

Debajo de cada cuadro va siempre la cita de la fuente (**MAGyP** en cultivos, **SENASA** en
hacienda), que se arma leyendo el propio dato, así que no puede quedar mal citada.

---

## Protocolo de presentación

Lo que se adoptó del documento de JC, en criollo:

| Regla | Cómo quedó |
|---|---|
| Título con área, sector, variable y período | Se arma solo, con la estructura de sus dos ejemplos: los mapas arrancan por el área geográfica ("Chaco - ganado bovino - ...") y los gráficos por la variable ("Distribución porcentual del ... - Santiago del Estero/País - año 2010"). |
| Separador | Guion medio con espacios, el mismo en todo el sitio. |
| Período | "campaña 2024/25" o "campañas 2015/16 a 2024/25". Nunca "año 2024": una campaña arranca en un año y termina en el siguiente, y llamarla año sería decir algo que no es. La palabra "año" queda para las bases que sí son anuales, como las de SENASA. |
| Mapa: escala en quintiles | 5 clases por cantidad de departamentos, con el mínimo y el máximo de cada una en la referencia. Los departamentos van rotulados con su nombre. |
| Mapa: departamentos sin dato | Salavina se dibuja en gris y rotulado "sin datos", y no entra al cálculo de los quintiles. Un hueco en el mapa se lee como un error nuestro. |
| Misma escala de colores para el mismo tipo de variable | Superficie siempre verde (termina en el verde institucional), producción siempre ocre, rendimiento siempre azul. Cuando entre el stock bovino, "cabezas" tiene su propia escala, marrón, y no se toca más. |
| Eje vertical con 5 marcas como mínimo | Hay una regla de cálculo única para todo el sitio, no lo elige cada gráfico. Está calibrada contra el propio gráfico de JC: con su serie, la regla elige los mismos intervalos de 5% que eligió él. |
| Fuente al pie | Obligatoria en todos lados, armada con el dato. |
| Tablas: total arriba y Var % al lado de cada valor | Adoptado en los rankings: la fila de la provincia va arriba, sombreada, y cada columna de valor lleva su variación pegada a la derecha. |
| Numeración "Tabla 2 - ..." | Adoptada **dentro de cada página** ("Gráfico 1", "Gráfico 2") y solo si la página tiene dos o más cuadros del mismo tipo. Numerar entre páginas sería frágil en un sitio: se agrega una vista y se renumera todo lo demás. |
| Tablas partidas en "parte I" y "parte II" | No se adopta: en pantalla no hay borde de hoja. Va scroll horizontal con la primera columna fija. |

Lo que quedó para confirmar con JC está en `specs/preguntas/backlog.md`, preguntas 14 a 20.

**Actualización del 10-ago-2026: llegó el "Protocolo de formato - Versión 1"**, que suma reglas
nuevas (versión 2 del protocolo, sección `formato_v1`):

| Regla nueva | Cómo quedó |
|---|---|
| Secuencia de variables siempre la misma | Sembrada, cosechada, producción, rendimiento, en todos los componentes. El mapa del tablero la tenía al revés y se corrigió. |
| El rendimiento no se mezcla entre cultivos | El indicador de rendimiento solo aparece con un cultivo elegido. Con "Todos" no existe. |
| Las superficies no se suman entre estaciones | Verano e invierno comparten lote. Con "Todos" queda la producción, rotulada "(fina y gruesa)" como la rotula JC. |
| Todo explícito, nada tácito | La campaña y el universo se escriben siempre (tarjeta de contexto con cultivo + campaña, "Provincia" en la ruta). |
| Cultivo sin datos, fuera del selector | Nada de entrar a un cultivo y encontrar "sin datos". Y desde la corrección del 10-ago (Facu, con JC): los chips los define el catálogo de JC (los 14 cultivos con ícono del mockup) ∩ con datos; Lenteja y Alpiste salen de la vista, pero sus datos siguen dentro de los totales y del anillo "(fina y gruesa)" (pregunta 37). |
| Los links conservan la selección | "Ver detalle" mantiene cultivo y campaña. Era el bug que JC encontró (Algodón 2020/21 lo llevaba a Soja 2024/25). |
| Sin leyendas de tipo de gráfico | Los badges "Anillo", "Mapa", "Líneas", "Barras" del tablero se sacan. |
| Tipografía Calibri (o Arial) | Pendiente de marketing: Calibri no es libre para la web (pregunta 27). |
| Iconografía de flaticon | Entra al sitio: chips de cultivo y tarjeta de contexto con ícono (decisión de Facu del 10-ago, en persona con JC). La licencia se verifica en paralelo, ya no bloquea (pregunta 26). |

**Decisiones del mismo 10-ago (Facu, en persona con JC presente):** cinco de las preguntas nuevas
quedaron decididas el mismo día; el detalle está en el backlog, sección "Decisiones del
10-ago-2026".

| Decisión | Cómo quedó |
|---|---|
| Subdivisión temática (pregunta 28) | Aprobada: la estructura del Modelo 2 manda (menú lateral por sector + breadcrumb jerárquico). Esta pasada solo cultivos; el resto migra después. |
| Panel UTILIDADES e idiomas (pregunta 33) | Utilidades entra con íconos deshabilitados y rótulo "Próximamente" (Asistente IA, Exportar PDF); los idiomas es/en/pt no entran todavía. |
| Botón "Datos por Departamento" (pregunta 34) | Entra deshabilitado con "Próximamente"; la sección territorial completa va en una pasada posterior. **Superada por la segunda tanda: se habilita** (tabla siguiente). |
| Branding provincial (pregunta 35) | Aprobado: logo provincial en cabecera y pie vía `site/theme.yaml`. Falta el asset del logo, va placeholder sobrio. |
| "Santiago en el NOA" (pregunta 11) | Sigue afuera: material sensible interprovincial, lo habilita Francisco, no JC. **Superada por la segunda tanda: Facu ordenó habilitarla, con la ratificación de Francisco pendiente** (tabla siguiente). |
| Tema visual | Llegó la captura final de la página de cultivos (10-ago, 11:09): lienzo blanco, cromo verde, paneles en cajas con borde. Es la regla de cómo tiene que VERSE la sección (`_protocolo-presentacion.formato_v1.tema_visual`); deroga el lienzo greige para cultivos. |

**Segunda tanda del mismo día** (Facu, en persona con JC presente, después de ver la primera
construcción):

| Decisión | Cómo quedó |
|---|---|
| Formato sí, diseño literal no | La captura manda la estructura y los elementos, no el pixel a pixel. El diseño tiene que ser moderno: los paneles de datos son los protagonistas y el cromo acompaña sin competir (`formato_v1.tema_visual.principio_formato_no_diseno`). |
| Menú lateral discreto | La columna verde saturada competía con los cuadros. Pasa a fondo claro/neutro, acentos verdes solo en el ítem activo, más angosto. Criterio: no compite con la visualización (`formato_v1.tema_visual.menu_lateral_discreto`). |
| Tabla "Datos por campaña", una sola cosa | Una fila por campaña, sin partir en dos bloques lado a lado y sin huecos blancos. Si las métricas no entran: selector de métrica o solo las que entren limpias. |
| Solo cultivos | Todo el trabajo de diseño y formato es exclusivamente sobre cultivos extensivos. Hacienda y stock bovino no se tocan hasta nueva orden (`formato_v1.alcance.solo_cultivos_desde_el_10_ago`). |
| "Datos por Departamento" habilitado | El botón de cabecera pasa a funcionar: vista departamental de cultivos (elegir departamento y ver KPIs, evolución y tabla por campaña, con el selector de cultivo del catálogo). Pendiente de construcción. |
| "Santiago en el NOA" habilitado | Por orden de Facu (10-ago-2026, con JC presente): la vista pasa a ser pública dentro de cultivos y el botón funciona. **Pendiente la ratificación de Francisco: si la baja, se vuelve atrás.** |

**TERCERA TANDA del mismo día (la vigente):** JC rechazó el rediseño publicado y Facu ordenó
arrancar de cero, "hay que hacer lo que dice JC". Registrada entera en el backlog ("Tercera
tanda del 10-ago-2026") y en `_protocolo-presentacion.formato_v1.tercera_tanda`:

| Decisión | Cómo quedó |
|---|---|
| El mockup Modelo 2 es LITERAL | Formato Y diseño: la página tiene que quedar como la captura. Quedan derogados el "formato sí, diseño no", el menú lateral discreto (vuelve el verde de la captura) y la tabla en una sola serie (vuelven los dos bloques de JC, pregunta 38). |
| Títulos literales (pregunta 31, resuelta) | Los títulos de KPI y de gráficos del tablero se calcan del mockup y del protocolo de títulos de JC. Sin reescrituras propias. |
| KPIs sin variación | "NO había que poner la diferencia con la campaña anterior": solo el valor con su unidad. |
| Eje vertical visible | El gráfico de líneas lleva eje vertical con escala, en "Millones" como el mockup, un solo eje. |
| Solo tableros (pregunta 28, ampliada) | `analisis.html` desaparece, sin "ver detalle". Únicas salidas: los dos botones de cabecera y el click del mapa hacia el dato departamental. Las vistas de detalle de la base 9 pasan a registro (no publicadas). |
| Banderas de idiomas (pregunta 33, resuelta) | Entran en la cabecera, donde estaba el título duplicado: es activa, en/pt "Próximamente". |
| Mapa grande | Columna izquierda entera, proporción geográfica correcta, "Seleccione departamento" y "Fuente: MAGyP (Ministerio de Agricultura, Ganadería y Pesca)" al pie (esto último responde la pregunta 14). |

**CUARTA TANDA del mismo día** (Facu, revisando la reconstrucción literal que terminó
constructor-dashboards; la literalidad del mockup sigue, son ajustes). Registrada entera en el
backlog ("Cuarta tanda del 10-ago-2026") y en `_protocolo-presentacion.formato_v1.cuarta_tanda`:

| Decisión | Cómo quedó |
|---|---|
| Logo provincial bien puesto | Se corrige la puesta del asset actual (tamaño, alineación, respiro, sin deformar). Si se busca un asset mejor lo decide Francisco/marketing (pregunta 41, no bloquea). |
| Escala legible en el gráfico de líneas | El paso 1,00 aplastaba las curvas; JC dibujó 0,50. Paso más fino y/o rango ajustado al dato, manteniendo el eje único en "Millones". |
| "Información relacionada" se dibuja | El panel entra con los links del mockup deshabilitados y "Próximamente" (misma excepción acotada que utilidades y banderas). Los destinos siguen bloqueados por la pregunta 8. |
| Home sin menú lateral | El menú lateral aparece recién dentro de las secciones; la home raíz va sin sidebar. |
| Tooltips con nombre y datos (regla GENERAL) | Nunca códigos internos en un tooltip. El hover del mapa muestra el nombre del departamento más sus datos para el cultivo/campaña activos; el click al dato departamental se mantiene. |
| Botón "Provincia" en la vista departamental | En 09-departamento-datos el botón de cabecera deja de decir "Datos por Departamento": dice "Provincia" y vuelve al tablero conservando la selección. |
| Anillo sin cifra central | El número del medio achicaba el gráfico: se saca y el total "(fina y gruesa)" va fuera del centro. Excepción a la literalidad decidida por Facu; JC valida. |
| Proporciones sin huecos (regla GENERAL) | Los paneles se dimensionan para llenar su espacio, sin espacios en blanco (ej. la tabla de campañas). Sin deformar: el mapa mantiene su proporción geográfica. Confirma la interpretación de la pregunta 38. |

Lo que sigue abierto para confirmar está en las preguntas 26 (licencia), 27, 29, 30, 32, 36,
39, 40 y la nueva 41 del backlog (la 38 quedó confirmada por la cuarta tanda).

---

## Lo que JC pidió y todavía no está

| Pedido | De dónde salió | Por qué no está |
|---|---|---|
| VBP (valor bruto de la producción) y series de precios | Modelo Análisis base 9, filas 32 y 41 | Falta la base de precios y fletes. Lo condicionó el propio JC: "lo vamos a colocar luego de que arme la base de precios". |
| Integrar ganadería y datos económicos en la ficha del departamento | Modelo Análisis base 9, fila 158 | Falta la base 48 (stock bovino). La 85 ya está. |
| Tambos y engorde a corral abiertos por provincia de origen y destino | Modelo Análisis base 85, filas 253 y 254 | Atado a la misma decisión de sensibilidad que las dos vistas provinciales: la define Francisco. |
| Stock bovino por departamento y categoría | Modelo Análisis base 48 | La base 48 todavía no está procesada. |
| Movimientos de algodón | Modelo Análisis base 53 | La base 53 todavía no está procesada. |
| Clima por estación y cruce con campañas | Modelo Análisis base 111 | La base 111 todavía no está procesada. |

---

## Lo que hace falta para construir las vistas

| Qué falta | Para qué vista | Quién lo consigue |
|---|---|---|
| Confirmación de la temporada de 5 cultivos | Las carteras y las tortas | JC (pregunta 6 del backlog) |
| Ratificación de "Santiago en el NOA" (habilitada por Facu el 10-ago; si Francisco la baja, se vuelve atrás) y decisión sobre la comparación con el país | La vista del NOA (ya pública a ratificar) y la del país (sigue en `_privado/`) | Francisco (pregunta 11 del backlog) |
| Decisión sobre publicar los flujos por provincia de contraparte | Las dos vistas provinciales de la base 85 | Francisco (pregunta 21 del backlog) |
| Confirmar si quiere mapa en ganadería | La vista del mapa de movimientos, que ya está construida y se puede mirar | JC (pregunta 22 del backlog) |
| Confirmar 5 puntos del protocolo de presentación (quintiles, cortes del mapa, numeración, nombres de departamento, nombre del sector). La cita de fuente (pregunta 14) quedó respondida por el mockup literal: "Fuente: MAGyP (Ministerio de Agricultura, Ganadería y Pesca)". | Todas. Ninguna se frena: cada punto se resolvió con la opción más simple y quedó anotado. | JC (preguntas 15 a 19 del backlog) |
| Decidir si se agrega el tipo de vista `distribucion` | Todavía ninguna. Hace falta para el gráfico de estratos de la base 48. | Francisco (pregunta 20 del backlog) |

El **mapa de los departamentos de Santiago del Estero** ya está resuelto: el GeoJSON con los códigos
INDEC está en el repositorio (`configs/dims/sde-departamentos.geojson`, bajado del Instituto
Geográfico Nacional), con su procedencia documentada y el cruce verificado contra los 26
departamentos que tienen datos. La vista del mapa ya no está trabada por eso.

---

## Recortes de datos que hay que saber

Estas decisiones están escritas en `specs/modelos/_comunes-base-9.yaml` con su motivo, y salen del control de calidad de la entrega. No están escondidas en el código: si JC decide otra cosa, se cambia el YAML.

1. **Las campañas 2000/01 y 2013/14 no se muestran.** Traen el total de la provincia pero ningún departamento: el mapa quedaría vacío con un total arriba.
2. **La campaña 2025/26 solo se muestra en los cultivos de invierno**, rotulada como campaña en curso. Todavía no tiene los cultivos de verano y en un total aparecería como un derrumbe que no existe.
3. **No se calcula la participación de Santiago en el país para poroto ni para maní.** La hoja del país no trae esos totales y el porcentaje no se puede calcular sin inventarlo.
4. **El trigo no se abre en pan y candeal.** Solo llegó el candeal, que es el 0,7%.
5. **El detalle de variedades de poroto arranca en 2021/22.** Antes la fuente no lo abría.
6. **Salavina se muestra como "sin datos", nunca como cero.** No figura en ninguna campaña de la base.
7. **Los números por departamento se muestran redondeados.** El dato departamental es una estimación de la fuente, no una medición: mostrarlo al kilo exacto le daría una precisión que no tiene. Los cálculos internos usan siempre el número completo.

Y de la base 85, escritas en `specs/modelos/_comunes-base-85.yaml`:

8. **Ningún total sale de la fila de totales del Excel.** Todo se calcula sumando el detalle. Las dos filas de totales del archivo están mal: una es en realidad el subtotal de 2025 y la otra quedó 60 cabezas corta.
9. **2026 no entra en los cuadros anuales**, porque llega hasta mayo. Sí entra en los mensuales, donde cada mes se compara contra el mismo mes de otros años.
10. **Los movimientos de tambo y de engorde a corral no se suman a los totales.** Son un recorte de los mismos animales ya contados. Lo escribió JC en mayúscula y la vista lo avisa en pantalla.
11. **Los búfalos no se muestran.** Son 845 cabezas, todas entrando a la provincia. Es otra especie y no se mezcla con bovinos.
12. **Los flujos con otras provincias llegan hasta el grano provincia, no partido.** Aparecen 122 partidos de destino y 273 de origen de otras provincias, y no tenemos cargado el padrón nacional de departamentos. Para abrirlos habría que cargarlo primero.
