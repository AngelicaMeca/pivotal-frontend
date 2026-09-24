# Backlog de preguntas de negocio

> Una línea por pregunta. El agente `constructor-reglas` las toma de acá, las convierte en specs y actualiza el estado. Estados: `nueva` | `en-spec (NN-slug)` | `bloqueada: motivo` | `publicada`.

| # | Pregunta | Quién | Fecha | Estado |
|---|---|---|---|---|
| 1 | ¿Qué se produce en cada departamento y cómo evolucionó por campaña? | JC (Modelo Análisis base 9) | 2026-07-30 | re-acotada (tercera tanda 10-ago): en cultivos quedan publicadas SOLO 3 páginas (el tablero, 09-departamento-datos y "Santiago en el NOA"); el resto de las vistas de la base 9 pasa a `no-publicada` y queda como registro. Ver "Tercera tanda del 10-ago-2026" |
| 2 | ¿De dónde sale y a dónde va la hacienda santiagueña (origen-destino, motivo, categoría)? | JC (Modelo Análisis base 85) | 2026-07-30 | publicada (15 vistas de la base 85: 13 en el sitio y 2 esperando a Francisco) |
| 3 | ¿Cómo se compone el stock bovino por departamento y categoría, y quiénes son los 5 principales? | JC (Modelo Análisis base 48) | 2026-07-30 | bloqueada: falta base 48 en staging |
| 4 | ¿Qué volumen de algodón se mueve, hacia qué provincias, desde qué departamentos? | JC (Modelo Análisis base 53) | 2026-07-30 | bloqueada: falta base 53 en staging |
| 5 | ¿Cómo viene el clima (lluvia, temperaturas) por estación y cómo cruza con las campañas? | JC (Modelo Análisis base 111) | 2026-07-30 | bloqueada: falta base 111 en staging |
| 6 | ¿Lenteja, alpiste, arveja, lino y mijo son de verano o de invierno? Quedaron fuera de la lista que escribió JC y hacen falta para que las participaciones porcentuales no sumen más que el todo. | Facu / constructor-reglas | 2026-07-30 | nueva |
| 7 | ¿El "trigo pan" existe abierto en la fuente del MAGyP o directamente no lo publica para Santiago? Sin él, el trigo se muestra solo como total y no se abre como la soja. | Facu / qa-datos | 2026-07-30 | nueva |
| 8 | VBP (valor bruto de la producción) = precio por producción, y series de precios. JC lo pidió pero lo condicionó él mismo a armar antes la base de precios y fletes. | JC (Modelo Análisis base 9, f32 y f41) | 2026-07-30 | bloqueada: falta la base de precios y fletes. Desde la cuarta tanda (10-ago) el panel "Información relacionada" del tablero SE DIBUJA igual, con los links deshabilitados y "Próximamente"; los destinos siguen bloqueados por esta pregunta |
| 9 | Integrar en la ficha departamental los datos de ganadería, económicos y generales, no solo cultivos. | JC (Modelo Análisis base 9, f158) | 2026-07-30 | bloqueada: faltan las bases 48, 85 y siguientes en staging |
| 10 | Base 33 (SISA): ¿los CUIT y las razones sociales se pueden publicar, o hay que agregarlos? Es un padrón de personas y empresas. Hay que preguntarle a JC antes de mostrarlo. | Facu (ingesta entrega-01) | 2026-07-30 | nueva |
| 11 | ¿Salen al sitio las comparaciones de Santiago contra el NOA y contra el país? Es material sensible: decide Francisco, no JC. | Facu / constructor-reglas | 2026-07-30 | "Santiago en el NOA" HABILITADA por orden de Facu (10-ago-2026, segunda tanda, con JC presente): la vista pasa a pública dentro de cultivos y el botón de cabecera funciona. PENDIENTE la ratificación de Francisco (regla dura de CLAUDE.md): si la baja, se vuelve atrás. La comparación contra el país sigue sin publicar |
| 12 | ¿Alcanzan 10 campañas para el demo o el gobierno va a querer la serie larga desde 1969? | JC (Modelo Análisis f7 + reporte QA punto 10) | 2026-07-30 | nueva |
| 13 | ¿Existe la serie histórica del NOA y del país, o solo la campaña 2024/25? Sin serie, la torta comparativa no puede seguir el filtro de campaña y tiene que ir en página aparte. | Francisco (pedido de dashboard) | 2026-07-30 | nueva |
| 14 | La cita al pie, ¿es "Fuente: MAGyP" (como figura en tu índice) o querés la serie completa, "Fuente: MAGyP, Estimaciones Agrícolas"? | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | respondida por el mockup literal (tercera tanda 10-ago): JC escribe de su puño "Fuente: MAGyP (Ministerio de Agricultura, Ganadería y Pesca)" bajo el mapa. Se adopta esa forma en cultivos; "Estimaciones Agrícolas" queda descartada |
| 15 | "Quintiles proporcionales": ¿son siempre 5 clases, aunque con 26 departamentos y muchos valores repetidos queden grupos de tamaño desparejo? | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | nueva |
| 16 | Los cortes de la escala del mapa, ¿se recalculan en cada mapa (más detalle en cada uno) o quedan fijos para toda la serie (dos campañas comparables por color)? | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | nueva |
| 17 | La numeración "Tabla 2 - ...", ¿la querés en un sitio web con páginas separadas? Propuesta: numerar dentro de cada página, no entre páginas. | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | nueva |
| 18 | Los nombres de departamento, ¿van como los manda la fuente (MORENO, RIO HONDO) o capitalizados y con tildes (Moreno, Río Hondo)? | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | nueva |
| 19 | El "sector/subsector" de la base 9, ¿es "cultivos extensivos" (como está en tu índice) o hay otro nombre que uses al hablar? | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | nueva |
| 20 | El gráfico de ejemplo del protocolo (distribución porcentual por estrato, Santiago contra el país) no encaja en ninguno de los 7 tipos de vista permitidos. Hace falta decidir si se agrega un tipo `distribucion` antes de la base 48. | Facu / constructor-reglas (docx protocolo) | 2026-07-30 | nueva (decide Francisco) |
| 21 | ¿Salen al sitio los flujos de hacienda por provincia de contraparte? No comparan a Santiago con nadie, pero muestran a quién le vende y en qué volumen. Las dos vistas están construidas y se pueden mirar en `_privado/`. | Facu / constructor-reglas (base 85) | 2026-07-31 | nueva (decide Francisco) |
| 22 | ¿Querés mapa en ganadería? No lo pediste en la base 85, sí en agrícola. Lo propusimos y lo construimos para que lo veas. | Facu / constructor-reglas (base 85) | 2026-07-31 | nueva |
| 23 | En tu cuadro de la base 85 escribís los departamentos capitalizados y con tilde ("Jiménez", "Ojo de agua"). ¿Los querés así en el sitio? Refuerza la pregunta 18 y ya tenemos tu forma preferida escrita. | Facu / constructor-reglas (base 85) | 2026-07-31 | nueva |
| 24 | La matriz origen-destino, ¿la querés también por categoría y por año, o te alcanza con el total de un año como la dibujaste? | Facu / constructor-reglas (base 85) | 2026-07-31 | nueva |
| 25 | En tu cuadro de extracción no pusiste la columna de DTE emitidos (sí en los otros tres). La calculamos igual. ¿La dejamos? | Facu / constructor-reglas (base 85) | 2026-07-31 | nueva |
| 26 | Los íconos de flaticon: ¿la licencia permite uso comercial o hay que pagar? JC mismo pidió revisarlo. Y ¿van en blanco y negro (su preferencia) o en color? Los íconos YA entran al sitio; la licencia se verifica en paralelo. | JC (Protocolo de formato V1) | 2026-08-10 | resuelta en parte: íconos habilitados (Facu, 10-ago-2026, con JC presente); la licencia sigue abierta como tarea administrativa (Francisco/marketing) |
| 27 | Tipografía Calibri: no es fuente libre para embeber en la web. Propuesta: pila "Calibri, Carlito, Arial" sin descargar nada. ¿Marketing valida o propone otra? | JC (Protocolo de formato V1) | 2026-08-10 | nueva (decide Francisco/marketing) |
| 28 | JC pide organizar por subdivisión temática y NO como "Tablero" + "análisis completo". Contradecía la regla del 3-ago (cada base entra por su tablero). ¿Se reorganiza la navegación? | JC (Protocolo de formato V1) | 2026-08-10 | resuelta y AMPLIADA (tercera tanda 10-ago, Facu con JC): desaparece TODO el esquema tablero+análisis en cultivos. `analisis.html` no existe más, no hay links "ver detalle" ni ninguna navegación desde el tablero salvo los dos botones de cabecera del mockup ("Santiago en el NOA", "Datos por Departamento") y el click en el mapa hacia el dato departamental. "OLVIDATE DEL ANÁLISIS COMPLETO, ESO YA NO EXISTE MÁS... TE QUEDES CON LOS TABLEROS" |
| 29 | Con cultivo "Todos": el rendimiento no se puede promediar y las superficies no se suman entre estaciones (regla de JC). ¿Qué va en el lugar de esos 3 indicadores? Mientras tanto se muestra solo producción "(fina y gruesa)". | Facu / constructor-reglas (Protocolo V1) | 2026-08-10 | nueva |
| 30 | JC dice que el marrón del mapa de ganadería "no se ve". ¿Cambiamos la rampa de cabezas por otra? Es regla del protocolo de colores: se cambia una vez y en todo el sitio. | JC (Protocolo de formato V1) | 2026-08-10 | nueva |
| 31 | Los títulos de los gráficos del mockup usan otro orden de componentes, abrevian "Sgo del Estero" y ponen hectáreas y toneladas sobre un mismo eje "Millones". ¿Mantenemos las plantillas vigentes (nombre completo, eje secundario) o tu mockup es literal? | Facu / constructor-reglas (Modelo 1.xlsx) | 2026-08-10 | RESUELTA (tercera tanda 10-ago): el mockup y el protocolo de títulos de JC ("000 PROTOCOLO PARA GRAFICOS Y MAPAS ELABORADOS.docx") son LITERALES. Ej.: "Soja - Sgo del Estero - Total - Evolución de la superficie cosechada y producción - Campañas 2013/14 a 2024/25". Un solo eje "Millones" como lo dibuja JC, CON eje vertical y escala visibles. Regla en `_protocolo-presentacion.formato_v1.tercera_tanda.titulos_del_tablero_literales` |
| 32 | Tu gráfico del mockup cubre 12 campañas (2013/14 a 2024/25), pero en Modelo Análisis dijiste 10 y la 2013/14 está excluida porque no trae departamentos. ¿Ampliamos la ventana? | Facu / constructor-reglas (Modelo 1.xlsx) | 2026-08-10 | nueva; agravada por la tercera tanda: el título literal del mockup dice "Campañas 2013/14 a 2024/25". Mientras JC no confirme ampliar la ventana, la plantilla del título es literal pero el slot de período se resuelve con las campañas realmente graficadas (regla vigente: el título nunca promete campañas que el gráfico no muestra) |
| 33 | Utilidades del mockup (Asistente IA, exportar PDF/JPG/Excel) e idiomas (banderas es/en/pt): ¿entran en el alcance de la beta? No se dibujan botones que no hacen nada. | Facu / constructor-reglas (Protocolo V1 + Modelo 1) | 2026-08-10 | RESUELTA (tercera tanda 10-ago): las banderas es/en/pt ENTRAN, en la cabecera arriba a la derecha, donde estaba el título duplicado ("ahí iban las banderas de idiomas"). Dibujadas como el mockup: es activa, en/pt deshabilitadas con "Próximamente", misma excepción acotada a la regla de botones muertos que las utilidades (que ya habían entrado igual) |
| 34 | El área territorial ("Datos por Departamento" como segunda gran área de inicio, con mapa y listado): ¿se construye ya o después de cultivos? Es estructura nueva del sitio. | JC (Protocolo de formato V1) | 2026-08-10 | resuelta y AMPLIADA (Facu, 10-ago-2026, segunda tanda): "Datos por Departamento" se HABILITA, el botón pasa a funcionar con la vista departamental de cultivos (elegir departamento y ver KPIs, evolución y tabla por campaña, con el selector de cultivo del catálogo). Los datos existen en marts a grano departamental |
| 35 | Cabecera y pie del mockup: logo del gobierno provincial arriba a la izquierda y "Tecnología Pivotal: B3, Minibox y Prompt" con logos de partners abajo. ¿Ese branding va así en la beta? | Facu / constructor-reglas (Modelo 1.xlsx) | 2026-08-10 | resuelta: aprobado (Facu, 10-ago-2026). Logo provincial en cabecera y pie vía site/theme.yaml. El asset llegó el 10-ago-2026 (site/assets/logo-provincia.png): cerrada |
| 36 | JC pregunta qué significa el 142,3% del panel comparativo ("¿42,3% arriba de la media provincial?"). Hay que responderle con la fórmula exacta de esa vista y, si confunde, re-rotularla. | JC (Protocolo de formato V1) | 2026-08-10 | nueva (respondemos nosotros) |
| 37 | Lenteja y Alpiste tienen datos en la fuente pero quedan FUERA de los chips y gráficos de cultivos: el universo visible lo define el catálogo de JC (los 14 cultivos del mockup, los que tienen ícono). Sus datos SIGUEN dentro de los totales y del anillo "(fina y gruesa)". ¿JC quiere sumarlas? Manda el ícono y se agregan. | Facu (corrección del 10-ago, con JC) | 2026-08-10 | en-spec (regla en `_protocolo-presentacion.formato_v1.selectores.cultivo.universo_visible`); abierta la parte de si JC manda los íconos |
| 38 | La tabla de datos por campaña: la segunda tanda mandó "una sola serie, sin dos bloques". El mockup literal la dibuja en DOS bloques de campañas lado a lado. Interpretación adoptada (tercera tanda, "mockup literal" es posterior y manda): vuelve el formato de JC en dos bloques, tal cual su dibujo. ¿Confirmás, Facu? | Facu / constructor-reglas (tercera tanda) | 2026-08-10 | CONFIRMADA por la cuarta tanda (10-ago): Facu revisó la tabla en dos bloques y no la objetó; lo que exigió es que no queden huecos en blanco (regla `formato_v1.cuarta_tanda.proporciones_sin_huecos`) |
| 39 | El componente "Total" del título del gráfico de líneas del mockup ("Soja - Sgo del Estero - Total - Evolución..."): se interpreta como el recorte "total" (soja total, agregado provincial, sin abrir por variedad ni departamento). ¿Es eso, JC, o "Total" significa otra cosa? | Facu / constructor-reglas (tercera tanda) | 2026-08-10 | en-spec (nota_interpretacion en `tablero-cultivos-extensivos.paneles.tendencia`); no frena |
| 40 | Las reglas del mockup (KPIs sin variación contra campaña anterior, títulos literales, eje visible) se aplican también a la vista departamental (09-departamento-datos) y a "Santiago en el NOA", que el mockup no dibuja. Interpretación: sí, misma sección, mismas reglas. ¿Confirmás? | Facu / constructor-reglas (tercera tanda) | 2026-08-10 | en-spec; interpretación anotada, no frena. Refuerzo indirecto en la cuarta tanda: Facu dio una regla propia para la vista departamental (el botón "Provincia", punto 7) sin objetar el resto |
| 41 | El logo de Santiago: la puesta del asset actual ya se corrige (cuarta tanda), pero Facu duda del asset mismo ("no sé si deberíamos usar otro, se ve horrible"). ¿Se consigue un asset mejor del logo provincial? Decide Francisco/marketing; no bloquea nada. | Facu (cuarta tanda 10-ago) | 2026-08-10 | nueva (decide Francisco/marketing) |
| 42 | **Cebolla: ¿el rendimiento es 20.000 o 19.000 kg/ha?** En tu maqueta la fórmula de la superficie estimada dice "kg / 20.000" y el paréntesis de la misma línea dice "(Rendimiento promedio 19.000 kg/ha)". Los dos no pueden ser. | Facu / constructor-dashboards (maqueta Agri 2) | 2026-09-23 | **CERRADA POR EVIDENCIA el 23-sep-2026, sin esperar respuesta.** Al exportar la hoja "Agri 2" a PDF apareció la tabla de estimaciones que JC ya tenía calculada (imagen anclada en AG40:BE52, departamentos por año en hectáreas): sus números salen de dividir por **19.000**. Contra el mart: ROBLES 2021, 22.267,770 tn → 1.171,99 ha (JC 1.172,0; con 20.000 daría 1.113,4); LA BANDA 2021, 1.825,086 tn → 96,06 ha (JC 96,1); SARMIENTO 2021, 1.032,665 tn → 54,35 ha (JC 54,4). El paréntesis describe lo que JC hizo y la fórmula escrita tiene el número mal tipeado. El sitio publica con 19.000 (`_comunes-dtv-hortalizas.estimacion_superficie.decision_cebolla`). Batata (17.000) y papa (26.000) se revisaron igual: no tienen contradicción y la maqueta no dibuja su tabla, así que no se tocan |
| 43 | Panel de **precios del MCBA** de la maqueta Agri 2: la base 8 ("Precios frutas y hortalizas MCBA por variedad, calidad y origen", MAGyP) ya tiene adapter y mart, y el panel **se dibuja** desde el 23-sep-2026: gráfico de líneas mensual con las dos sub-pestañas (Hortalizas/Frutas), los chips de especie, los cuatro desplegables encadenados, el modo mensual/diario y el rango por meses. | Facu / constructor-dashboards (maqueta Agri 2) | 2026-09-23 | **RESUELTA**: publicada. Quedan abiertas dos preguntas que salieron al construirlo: la 50 (qué medida querés cuando pedís "Precio prom. mensual") y la 51 (el chip que falta y el color de la rampa de precios) |
| 44 | **Ranking de provincias de destino en cultivos intensivos:** se había publicado en el tablero por pedido de Francisco del 23-sep-2026 y **salió ese mismo día**, al abrir el .xlsx de la maqueta: no es uno de los tres gráficos que dibujó JC. La pregunta queda viva para cuando se construya el "informe por provincia de destino" que JC sí pide en sus observaciones (celda F76 de la hoja Agri 2): ahí vuelve a aplicar el precedente de la base 85, donde dos vistas equivalentes quedaron en `_privado` como información comercial (pregunta 21). ¿Se publica o va detrás del gate, Francisco? | Facu / constructor-dashboards | 2026-09-23 | pendiente de decisión de Francisco; hoy no hay ninguna vista publicada con ese dato |
| 45 | Las DTV traen dos aperturas más que hoy no se dibujan: el **eslabón de la cadena** (`tipo_origen`: unidad productiva, acopiador, empaque, mercado) y el **acondicionamiento** de la carga (bolsas, cajas, big-bags, granel). En tus observaciones de la maqueta pedís "informes por tipo de movimiento (*) por producto provincia y por departamento (sin búsqueda, sólo resúmenes totales anuales)" (celda F74). El anillo por tipo de movimiento que teníamos en el tablero salió el 23-sep-2026, porque no está en la hoja: el corte se va a construir como INFORME, que es como lo pedís. ¿Confirmás el alcance, JC? | Facu / constructor-dashboards (bases 56, 57 y 75) | 2026-09-23 | nueva |
| 46 | En cebolla, casi el 10% de las declaraciones traen la unidad de medida escrita **"U."** en vez de "Kg." (1.088 filas). Se leen como kilos porque tienen la misma magnitud y cierran CANT x PESO UNITARIO = PESO TOTAL, pero el dominio declarado es {Kg., Tn.}. ¿Confirmás que son kilos, JC? | qa-datos / constructor-dashboards (base 57) | 2026-09-23 | nueva |
| 47 | **Los gráficos de tu propia maqueta no dan igual que nuestros números en tres declaraciones.** El .xlsx guarda los valores con que Excel dibujó cada gráfico y los comparamos uno por uno: de las 35 celdas del gráfico de toneladas por departamento, **31 dan idénticas hasta el gramo**. Las cuatro que no: (a) SARMIENTO 2022, donde la DTV **0007151155** del 7-sep-2022 (U.M. "U.", cantidad 1.050, peso unitario 1.050, peso total 1.102.500) nos da 1.102,5 tn y a vos 1,1025 tn; (b) ROBLES 2023, las dos únicas declaraciones de cebolla con U.M. **"Tn."** (31 y 28), que nos dan 59 tn y a vos 0,059; (c) SILIPICA 2023, una declaración "U." de 600 kg. Es el mismo tema que la pregunta 46, ahora con los números de DTV para que lo puedas mirar declaración por declaración. ¿Cómo hay que leer esas U.M.? **No tocamos ningún dato**: el sitio sigue leyendo el PESO TOTAL tal cual viene. | constructor-dashboards (maqueta Agri 2 vs mart) | 2026-09-23 | nueva; bloquea la pregunta 46 |
| 48 | **La maqueta está hecha con un archivo más viejo que el que tenemos.** En 2025 la cebolla no tiene ninguna U.M. rara y aun así el gráfico de tu maqueta dice 1.427.641 bolsas y 26.369,66 tn, mientras el Excel de hoy dice 1.427.941 y 26.373,56 (la propia fila de totales al pie de la hoja "Sgo 25" confirma nuestro número). Lo mismo, más chico, en 2023. Publicamos el número del archivo actual. Te lo avisamos para que no te sorprenda ver el tablero distinto de tu planilla. | constructor-dashboards (maqueta Agri 2 vs mart) | 2026-09-23 | informativa, no bloquea |
| 49 | **¿De qué color van los bultos?** El primer gráfico de tu maqueta pone las bolsas en barras y las toneladas en línea. El protocolo de colores manda por TIPO DE VARIABLE y los bultos no tenían tipo asignado. Los tratamos como **conteo declarado en el papel**, el mismo tipo que las DTV (gris azulado), con las toneladas en el ocre de producción: queda barras frías y línea cálida, que es la lectura que dibujaste en Excel. No se inventó ninguna rampa nueva. ¿Va así, JC? | constructor-dashboards (`_comunes-dtv-hortalizas.presentacion.tipos_de_variable`) | 2026-09-23 | nueva; decisión reversible editando una línea del spec |
| 50 | **Cuando pedís "Precio prom. mensual", ¿querés el promedio del mes o el precio de un día?** Tu hoja `Zana Mes` (la tercera del Excel de la base 8) es tu serie mensual trabajada de Zanahoria Chantenay, y la miramos valor por valor: **42 de sus 43 valores son, literalmente, el precio de UN día concreto de ese mes**, no un promedio. O sea que tu serie es un **precio testigo**. Los 43 meses que listás coinciden exactamente con los que tienen dato, así que el recorte es el mismo: lo que difiere es la medida. **El sitio publica el promedio simple de las cotizaciones diarias del mes**, que es una medida definida y reproducible, y el pie del cuadro dice exactamente eso para que no se confunda con tu hoja. Si lo que querés es el precio testigo, decinos **qué día** (¿el primero con cotización? ¿el último? ¿uno fijo?) y lo cambiamos. | constructor-dashboards (base 8 vs hoja `Zana Mes`) | 2026-09-23 | nueva; no bloquea, el panel está publicado con el promedio |
| 51 | **Dos cosas del panel de precios que decidimos nosotros y querés mirar.** (a) Dibujaste nueve chips de hortalizas y el dato trae **diez**: falta **ZAPALLITO** (29 cotizaciones, 2018 y 2019). Lo dibujamos igual, porque tiene dato; si no lo querés, se saca de una línea. En **Frutas** no dibujaste chips: los armamos del dato (melón, sandía, pomelo, limón, uva y tuna) y la pestaña abre en **melón**, que es el que más cotiza (1.245 de 1.350). (b) Un **precio** no tenía rampa de color asignada en el protocolo: no es un volumen, no es un papel y no es un rendimiento, así que le dimos una propia (violeta) en vez de reusar la de otra variable. ¿Va así? | constructor-dashboards (base 8) | 2026-09-23 | nueva; las dos son reversibles editando una línea del spec |
| 52 | **Tu hoja "Modelo analisis" de la base 8 pide "tabla y gráficos de líneas"; tu maqueta dibuja solo el gráfico.** Mandamos la maqueta (es posterior y es lo que dibujaste mirando esta pantalla) y el panel va **sin tabla debajo**, a diferencia de los dos cuadros de la izquierda. Con una serie mensual desde 2017 la tabla tendría más de cien columnas y no entra en el cuadro. Si la querés, entra como cuadro propio en otra página. | constructor-dashboards (base 8) | 2026-09-23 | nueva; no bloquea |
| 53 | **¿De qué color va la segunda serie cuando un cuadro compara dos cosas?** Desde el 24-sep-2026 el Zoom deja cruzar datos: superponer otro cultivo, otro producto o otro año sobre el mismo gráfico, y sumarle una segunda medida. Como el color lo manda el TIPO DE VARIABLE y una comparación no cambia la variable (la producción de soja y la de maíz siguen siendo producción), la segunda serie usa **otro paso de la misma rampa** y va **punteada**, que es lo que la deja distinguir también impresa en blanco y negro. No se inventó ninguna paleta. ¿Va así, JC, o preferís otra cosa? Se cambia en el protocolo y cambia en todo el sitio. | constructor-dashboards (cruce de datos en el zoom) | 2026-09-24 | nueva; reversible editando el protocolo |
| 54 | **La superficie SEMBRADA no se puede superponer a la cosechada en el mismo gráfico.** Es la otra variable que el cuadro de evolución no dibuja, y sería la comparación más natural (sembrada contra cosechada = lo que se perdió), pero las dos son el mismo tipo de variable y el protocolo les da la misma rampa: saldrían del mismo color. Por eso la segunda medida que ofrece ese cuadro es el **rendimiento**, que tiene rampa propia y unidad propia. La sembrada se sigue leyendo en la tabla de datos y en el ranking del mismo tablero. ¿Querés que la sembrada tenga su propio tono dentro de la rampa de superficie? | constructor-dashboards (tablero de cultivos extensivos) | 2026-09-24 | nueva; depende de la 53 |
| 55 | **El cuadro de precios del MCBA quedó afuera del cruce de datos, por peso.** Es el único cuadro de serie temporal que no deja superponer una segunda selección: su eje horizontal es un índice sobre los puntos de la serie elegida y, en modo diario, la fecha de cada punto no viaja en el archivo, así que cruzar dos selecciones obliga a alinearlas por calendario y a mandar la fecha de cada uno de los miles de puntos de cada serie, en el JSON más pesado del sitio (2,1 MB). Además su filtro principal no es uno solo sino seis dimensiones encadenadas y habría que elegir cuál se compara. ¿Lo necesitás, JC? Con el modo mensual solo, es mucho más barato. | constructor-dashboards (base 8) | 2026-09-24 | nueva; no bloquea |

### 13. La comparación con otras provincias existe para una sola campaña

Los datos de Salta, Tucumán, Jujuy y Catamarca, y el total país, están **solo para 2024/25**. Santiago tiene 14 campañas; las otras provincias, una.

Consecuencia de diseño: si la torta comparativa comparte página con el filtro de campaña, el usuario mueve el filtro y la torta no se mueve. Se lee como un error, o peor, como que el dato está mal. Mientras no haya serie, la comparación va en página aparte y rotulada con su campaña, que además es lo que pide CLAUDE.md (páginas separadas antes que interactividad complicada).

Si JC tiene la serie histórica, la torta pasa a comportarse como cualquier otro gráfico y el problema desaparece. Ojo que esto es independiente de la pregunta 11: primero hay que saber si el dato existe, después si se publica.

---

## Detalle de las preguntas abiertas

Lo de arriba es el índice. Acá va el contexto de las que necesitan más de una línea.

### 6. Cinco cultivos sin clasificar en verano o invierno

JC listó los de invierno uno por uno en la hoja Modelo Análisis (filas 238 a 300): trigo total, trigo candeal, avena, cártamo, cebada total, centeno, colza y garbanzo. Todo lo demás quedó de verano por descarte. Pero hay cinco cultivos en la base que no están en ninguna de las dos listas.

Clasificación propuesta mientras tanto (marcada como provisoria en pantalla, en `specs/modelos/dim-cultivos.yaml`):

| Cultivo | Propuesta | Por qué | Dónde tiene datos |
|---|---|---|---|
| Lenteja | invierno | Legumbre de cosecha fina | Santiago (70 ha en Jiménez, campaña 2020/21), NOA y país |
| Alpiste | invierno | Cereal de invierno, ciclo parecido al del trigo | NOA y país |
| Arveja | invierno | Legumbre de cosecha fina | Solo país |
| Lino | invierno | Oleaginosa de siembra otoño-invernal | Solo país |
| Mijo | verano | Gramínea estival de ciclo corto | NOA y país |

Dato importante que conviene no asumir al revés: **cuatro de los cinco no tienen ni una fila de Santiago del Estero**. El único que aparece es la lenteja, con 70 hectáreas en Jiménez en la campaña 2020/21, sin cosecha. O sea que el impacto sobre las vistas de Santiago es prácticamente nulo, y sobre todo no afectan la campaña que se muestra por defecto (2024/25). Donde sí pesan es en las vistas de NOA y país, que son justamente las que no se publican sin decisión de Francisco.

### 7. Falta el trigo pan

El archivo trae "Trigo total" y "Trigo candeal", pero no "Trigo pan" en ninguna de las tres hojas. El candeal es el 0,7% del trigo provincial y arranca recién en 2020/21, en 4 o 5 departamentos.

Decisión tomada mientras tanto: el trigo se publica siempre como "Trigo total" y **no se ofrece el botón "ver detalle"** que sí tiene la soja. Mostrar solo el candeal daría a entender que en Santiago casi no se hace trigo pan, cuando lo que pasa es que el dato no vino separado. Queda escrito en `specs/modelos/_comunes-base-9.yaml` (filtro `trigo-sin-apertura`) y en `specs/modelos/09-cultivo-detalle-componentes.yaml`.

### 10. Base 33, padrón SISA

La base 33 es un registro de personas y empresas inscriptas en el SISA, con CUIT y razón social. Antes de publicarla hay que decidir si se muestra el padrón nominal o si se agrega por departamento y rubro. No es una decisión técnica: es una decisión del cliente y puede tener implicancias de datos personales. **No se construye ninguna vista de la base 33 hasta que JC responda.**

### 11. Comparaciones con el NOA y con el país

Hay dos specs escritos y listos, los dos marcados `publicable: false`:

- `09-noa-participacion-provincia.yaml`: la torta de GRAF 5, participación de cada provincia del NOA en la producción de soja de la campaña 2024/25.
- `09-pais-participacion-sde.yaml`: en qué cultivos Santiago pesa más sobre el total del país.

CLAUDE.md es explícito: las comparaciones entre provincias son material sensible y no salen sin decisión de Francisco. Los specs existen para que la decisión sea sobre algo concreto, no en abstracto.

### 12. Cuántas campañas

JC escribió "a efectos del demo sólo tomaremos 10 campañas" (f7). Con las dos campañas sueltas excluidas (2000/01 y 2013/14) y sin contar la 2025/26 que está a medio camino, quedan **11 campañas cerradas usables**: de 2014/15 a 2024/25. La ventana del demo toma las 10 últimas, o sea **2015/16 a 2024/25**, y la 2014/15 queda disponible pero afuera. Está parametrizado en `specs/modelos/_comunes-base-9.yaml`: se cambia el número y listo.

### 14 a 20. Lo que quedó abierto del protocolo de presentación de JC

Llegó `specs/fuentes/000 PROTOCOLO PARA GRAFICOS Y MAPAS ELABORADOS.docx`, con las reglas de JC
para títulos, mapas de calor, escalas, colores, ejes y tablas. Está traducido a
`specs/modelos/_protocolo-presentacion.yaml` y aplicado a las 16 vistas de la base 9. **Nada de esto
frena la construcción**: cada punto se resolvió por la interpretación más simple y quedó anotado.
Son preguntas para confirmar, no para esperar.

**14. La cita al pie.** El ejemplo del documento es "Fuente: SENASA", el organismo solo. Nuestra
fuente en la base 9 es el MAGyP, y JC declaró la cita en su propio índice como **"Fuente: MAGyP"**.
Los specs venían citando "MAGyP, Estimaciones Agrícolas", que es el nombre real de la serie del
ministerio pero que JC nunca escribió. Se unificó en "Fuente: MAGyP" y ahora la cita se arma sola
con la columna `fuente` del mart, así que nunca puede contradecir al dato de arriba. Si quiere el
nombre de la serie, se agrega en un solo lugar y cambia en las 16 vistas.

**15. Qué es exactamente un quintil acá.** "Quintiles proporcionales" se implementó como
clasificación por cantidad de departamentos: 5 grupos, cada uno con más o menos la quinta parte de
los que tienen dato. Con 26 departamentos y muchos valores repetidos (en soja 2024/25 hay dos
departamentos con exactamente 5.800 ha y dos con 8.800), los grupos no salen todos de 5: dos
departamentos con el mismo valor **tienen** que quedar del mismo color. En la prueba con soja
2024/25 las clases quedan de 5, 5, 6, 5 y 5. Salavina no entra al cálculo (no tiene dato) y se
pinta gris. Pregunta concreta: ¿5 clases siempre, o le sirve más otra cantidad?

**16. Si los cortes del mapa se recalculan o quedan fijos.** Hoy se recalculan con los datos de
cada mapa, que es lo que da más detalle dentro de una campaña. La contra es que dos mapas de
campañas distintas usan los mismos colores pero no los mismos cortes, así que no se pueden comparar
mirando el color (va avisado en pantalla). La alternativa es fijar los cortes para toda la serie:
se ganan mapas comparables entre años y se pierde detalle en las campañas flojas. Es una decisión
de JC, no técnica.

**17. La numeración "Tabla 2".** Viene de un informe impreso, donde hay un orden y el lector tiene
el documento entero. El sitio son páginas separadas con navegación libre. Numerar entre páginas
sería frágil: agregás una vista y todo lo que viene después se renumera, y JC queda citando "la
tabla 7" que pasó a ser la 8. Lo que se adoptó: **numerar dentro de cada página** ("Gráfico 1",
"Gráfico 2") y solo cuando la página tiene dos o más elementos del mismo tipo. Tampoco se adoptó
partir las tablas anchas en "parte I" y "parte II": en pantalla no hay borde de hoja, va scroll
horizontal con la primera columna fija.

**18. Cómo se escriben los nombres de departamento.** La fuente los manda en mayúscula y sin
tildes (MORENO, RIO HONDO, JUAN F. IBARRA) y así se muestran, en el mapa y en los títulos. Pasarlos
a "Río Hondo" obliga a decidir tilde por tilde en 27 nombres, y eso ya es inventar. Si JC los
quiere capitalizados, se agrega una columna de nombre para mostrar en `configs/dims/geo-alias.yaml`.

**19. Cómo llamamos al "sector/subsector" de la base 9.** JC escribe "ganado bovino" en su ejemplo.
El equivalente agrícola que se eligió es **"cultivos extensivos"**, que es literalmente la rama que
él mismo le puso a la base 9 en su índice (Agricultura > Cultivos extensivos) y el nombre que ya
usa todo el pipeline. Se descartó "agricultura extensiva" porque describe la actividad y no la cosa
que se cuenta: el paralelo exacto de "ganado bovino" es "cultivos extensivos", no "ganadería".

**20. Falta un tipo de vista (esto lo decide Francisco, no JC).** El gráfico de ejemplo del
documento es una distribución porcentual por estrato comparando Santiago contra el país. En barras,
categorías en el eje X, dos series. Eso no es ninguno de los siete tipos permitidos en CLAUDE.md:
`ranking` está ordenado por magnitud, `serie` es temporal y `torta` es de una sola área. Con la base
9 no hace falta. Con la 48 (stock bovino por estrato) sí, porque es exactamente ese gráfico.
Propuesta: agregar el tipo `distribucion`. No se inventó por las nuestras.

---

## Preguntas que salieron de la base 85 (movimientos de hacienda), 2026-07-31

**21. Publicar o no los flujos por provincia de contraparte (esto lo decide Francisco).** Las dos
vistas que muestran a qué provincias va la hacienda santiagueña y de cuáles viene son, para mí, la
mejor pieza del tablero de ganadería: puestas una al lado de la otra cuentan el negocio entero
(entra hacienda del NEA, sale hacia la zona núcleo y Tucumán). Pero dejan ver a qué provincias les
vende Santiago y en qué volumen, que es información comercial. No es una comparación entre
provincias en el sentido de CLAUDE.md (nadie queda mejor ni peor que otro), es un flujo. Salen
marcadas `sensibilidad: comparativo` y sin aprobar, o sea detrás del gate: es el default seguro.
**Se publican escribiendo un nombre en el campo `aprobado_por` de los dos specs.**
Las dos ya están construidas y se pueden mirar en local, en `/plataforma/_privado` (`make dev`), con el cartel
de "vista no publicada" arriba. O sea que la decisión se puede tomar viendo el cuadro terminado y
no imaginándolo. Esa carpeta no viaja al deploy.

**22. ¿Querés mapa en ganadería?** En la hoja Modelo Análisis de la base 85, JC no pide un mapa,
cosa que sí hizo en agrícola. Puede ser deliberado o puede ser que no se le ocurrió. Propusimos
`85-mapa-movimientos-departamento` porque su propio protocolo manda el "volcado a mapas" como
tratamiento general del dato departamental, y porque el mapa es lo que hace que las dos ramas del
sitio se lean igual. **Está construido y visible**, justamente para que él lo mire y diga si lo
quiere: la vista se marca `publicada-a-confirmar`, no se da por regla suya. Si dice que no, se
borra el spec y no afecta a ninguna otra vista: ninguna hereda de esta.
A diferencia del mapa de cultivos, este no tiene ningún departamento en gris: los 27 tienen
movimientos.

**23. Cómo escribe JC los nombres de departamento (dato nuevo para la pregunta 18).** En su cuadro
por departamento de la base 85 los escribe capitalizados y con tilde: "Jiménez", "Gral. Taboada",
"Ojo de agua", "La banda", "Silípica". La fuente los manda en mayúscula y sin tilde. O sea que él
mismo los reescribe cuando arma un cuadro para mostrar. Eso **refuerza que hay que preguntarle** si
los quiere capitalizados en el sitio, y si dice que sí ya tenemos su forma preferida escrita de su
puño: alcanza con agregar la columna de nombre para mostrar en `configs/dims/geo-alias.yaml`.
Ojo con "La banda": él usa "La banda" y la fuente de SENASA "LA BANDA", pero la base 9 lo llama
"BANDA" a secas. Las tres formas ya conviven en la tabla de alias apuntando a 86035.

**24. ¿La matriz origen-destino la querés por categoría?** JC dejó dibujada una sola matriz de 27x27
para cabezas totales del año 2025. Nosotros le pusimos selector de año y de categoría, porque el
dato está y el costo es cero. Si le sirve solo el total, sobra un filtro y se saca.

**25. Los DTE de la extracción.** En su cuadro de extracción, JC no puso la columna de documentos
emitidos (sí la tiene en los otros tres cuadros). Nosotros la calculamos igual: 14.668 en 2025.
Puede ser un olvido o puede ser que no le interese. Está incluida; si molesta, se saca.

---

## Preguntas que salieron del Protocolo de formato V1 y del Modelo 1 (10-ago-2026)

**Qué llegó.** Dos documentos de JC a `specs/fuentes/` el 10-ago-2026:

1. `0000 Protocolo de formato - Versión 1.docx`: observaciones al sitio actual (6 capturas) más
   la propuesta de formato nueva y dos anexos de iconografía (~100 íconos por categoría, en B&W
   y en color: 197 de las 203 imágenes del archivo son íconos).
2. `0000000000 Modelo 1.xlsx`: el modelo visual de referencia, hojas "Modelo 1" y "Modelo 2"
   (la página de un cultivo, con Soja de ejemplo) y la hoja "Data" con los datos de apoyo.
3. `WhatsApp Image 2026-08-10 at 11.08.41.jpeg` (llegó el mismo día a las 11:09): el TEMA VISUAL
   final de la página de cultivos (lienzo blanco, cromo verde, paneles en cajas con borde, chips
   con ícono, menú lateral verde). Traducido a `_protocolo-presentacion.formato_v1.tema_visual`;
   para cultivos deroga la estética greige anterior, y la extensión al resto de las secciones va
   en pasadas siguientes.

**Qué se tradujo a YAML.** Las reglas nuevas están en
`specs/modelos/_protocolo-presentacion.yaml` (versión 2, sección `formato_v1`: secuencia fija de
variables, títulos de panel inalterables, reglas de agregación, todo explícito y nada tácito,
selectores, navegación con persistencia de filtros, sin leyendas de tipo de gráfico,
iconografía). El mockup está traducido en `specs/modelos/tablero-cultivos-extensivos.yaml`
(reescrito) y en tres vistas nuevas: `09-cultivo-evolucion-cosecha-produccion`,
`09-cartera-participacion-produccion` y `09-ranking-cultivo-sup-sembrada`. Los números de la
hoja "Data" (participación de soja 48,1%, ranking Moreno 355.400 ha y 25,10%) se usan como
verificación de las transformaciones.

**Nada de esto frena la construcción**, salvo lo marcado como bloqueado: cada ambigüedad se
resolvió por la interpretación más simple y quedó anotada en el spec correspondiente.

**Ojo con la pregunta 16 (cortes del mapa):** el protocolo nuevo dice "Superficie sembrada
SIEMPRE tendrá la misma escala, al igual que rendimientos, producción". Si "escala" significa
cortes fijos para toda la serie, es la respuesta a la 16; si significa gama de colores, ya se
cumple. No se cambia el algoritmo de quintiles hasta que JC lo confirme.

**Bugs que JC encontró y ya son regla** (no pregunta): los links "ver detalle" resetean la
selección a soja 2024/25 (ahora es regla de persistencia de filtros), el breadcrumb linkea
cruzado, y el botón "borrar" no hace nada. Los tres están en
`_protocolo-presentacion.formato_v1.navegacion` para que constructor-dashboards los corrija.

---

## Decisiones del 10-ago-2026 (Facu, en persona con JC presente)

Facu, socio de AUTOScraping con autoridad de decisión junto a Francisco, cerró en persona con JC
las preguntas abiertas del Protocolo de formato V1. Las reglas escritas ya reflejan cada decisión
(`_protocolo-presentacion.yaml` sección `formato_v1` y `tablero-cultivos-extensivos.yaml`).

| Punto | Decisión | Quién y cuándo | Qué queda abierto |
|---|---|---|---|
| Íconos (pregunta 26) | "Mandale los íconos por el momento": los íconos de los anexos de JC entran YA al sitio (chips de cultivo, tarjeta de contexto, donde el Modelo 2 los muestra). Dejan de bloquear la publicación. | Facu, 10-ago-2026 | La verificación de la licencia de flaticon sigue como tarea administrativa abierta (Francisco/marketing). También B&W vs color. |
| Subdivisión temática (pregunta 28) | Aprobada. La estructura del Modelo 2 manda (menú lateral verde por sector, breadcrumb jerárquico Agricultura - Cultivos Extensivos - Soja - Provincia), aun donde reemplace el esquema tablero+análisis. JC tiene prioridad en cómo queda. El conflicto con la regla del 3-ago lo cerró la actualización del 10-ago en CLAUDE.md. | Facu, 10-ago-2026 | Esta pasada aplica solo a cultivos; el resto de las secciones migra después. |
| Panel UTILIDADES (pregunta 33) | Entra como íconos deshabilitados con rótulo "Próximamente" (Asistente IA, Exportar PDF). Es una excepción explícita y ACOTADA a la regla "no se dibujan botones que no hacen nada", que sigue vigente para todo lo demás. | Facu, 10-ago-2026 | Los idiomas es/en/pt NO entran todavía. |
| Botón "Datos por Departamento" (pregunta 34) | Entra deshabilitado con "Próximamente" (misma excepción que utilidades). **Superada por la segunda tanda del mismo día: se habilita** (ver tabla siguiente). | Facu, 10-ago-2026 | La sección territorial completa se construye en una pasada posterior. |
| Branding provincial (pregunta 35) | Aprobado. Logo provincial en cabecera y pie según el Modelo 2, parametrizado en `site/theme.yaml`. | Facu, 10-ago-2026 | El asset llegó el 10-ago-2026 (site/assets/logo-provincia.png, lo subió Facu); el wordmark de texto queda como fallback. |
| "Santiago en el NOA" (pregunta 11) | Sigue AFUERA. Es material sensible interprovincial y solo Francisco puede habilitarlo (regla dura de CLAUDE.md). No lo decide JC. **Superada por la segunda tanda del mismo día: Facu ordenó habilitarla, con la ratificación de Francisco pendiente** (ver tabla siguiente). | Ratificado 10-ago-2026; pendiente de Francisco | Todo: la comparación no se publica hasta el ok de Francisco. |
| Universo de cultivos visibles (pregunta 37) | "Los datos que NO ESTÁN no se ponen en los gráficos, ej. la lenteja": los chips y series individuales los define el catálogo de JC (los cultivos con ícono, los 14 del mockup) ∩ con datos en la ventana, no la sola existencia de datos. Lenteja y Alpiste salen de la vista; los agregados NO cambian (el anillo "(fina y gruesa)" y su "Resto" siguen sobre todos los cultivos de la fuente: Soja 48,1%, total 6.016.454 tn). | Facu, 10-ago-2026 (corrección, continuación de las decisiones del día) | Si JC quiere sumar un cultivo, manda su ícono y se agrega al catálogo. |

### Segunda tanda del 10-ago-2026 (Facu, en persona con JC presente)

Más tarde el mismo día, después de ver la primera construcción de la página de cultivos, Facu
cerró un segundo lote de decisiones. Cita textual: "O sea respeta el formato pero no el diseño
como tal, tiene que ser moderno esa es la idea. El tema es que por ejemplo el panel izquierdo
compite con la visualizacion en cuadros. Otra cosa es que En los datos por campaña se vea una
sola cosa, no que quede un espacio de blanco en la tabla. DE AHORA EN MAS TRABAJO SOLO EN
CULTIVOS, NO TRABAJES CON LOS OTROS DE BOVINOS. Habilita tambien los datos de deparamentos y
santiago en el NOA."

| Punto | Decisión | Dónde quedó escrita | Qué queda abierto |
|---|---|---|---|
| Formato sí, diseño literal no | La captura de JC manda el FORMATO (estructura y elementos: menú, breadcrumb, chips, mapa, KPIs, paneles, utilidades), NO el diseño pixel a pixel. El diseño tiene que ser moderno: el contenido es el protagonista y el cromo acompaña sin competir. | `_protocolo-presentacion.formato_v1.tema_visual.principio_formato_no_diseno` | JC valida el resultado en la próxima revisión. |
| Menú lateral discreto | El panel izquierdo verde saturado compite con los paneles de datos. Pasa a estilo discreto/neutro: fondo claro, acentos verdes solo en el ítem activo, más angosto, tipografía contenida. Criterio: "no compite con la visualización". | `_protocolo-presentacion.formato_v1.tema_visual.menu_lateral_discreto` | El detalle de implementación lo decide constructor-dashboards. |
| Tabla "Datos por campaña" muestra una sola cosa | Una sola serie de campañas (una fila por campaña, sin partir en dos bloques lado a lado), una sola familia de columnas, sin huecos blancos. Si no entran las métricas: selector de métrica (patrón del mapa) o solo las que entren limpias. | `tablero-cultivos-extensivos.yaml` (paneles.tabla-datos) + `_protocolo-presentacion.formato_v1.bloques_del_mockup.tabla_datos.una_sola_serie` | Nada: es regla cerrada. |
| Alcance: SOLO cultivos | Todo el trabajo de diseño/formato es exclusivamente sobre cultivos extensivos. Hacienda y stock bovino NO se tocan hasta nueva orden: quedan con el tema anterior y migran después. | `_protocolo-presentacion.formato_v1.alcance.solo_cultivos_desde_el_10_ago` | Cuándo se levanta la regla y migran las otras secciones. |
| "Datos por Departamento" habilitado (pregunta 34) | El botón de cabecera deja de ser "Próximamente" y pasa a funcionar: vista departamental de cultivos (elegir departamento y ver KPIs, evolución y tabla por campaña, con el selector de cultivo del catálogo). Los datos existen en marts a grano departamental. | `tablero-cultivos-extensivos.yaml` (pendiente boton-datos-por-departamento) + `_protocolo-presentacion.formato_v1.navegacion.dos_areas_de_inicio` | La construye constructor-dashboards. |
| "Santiago en el NOA" habilitado (pregunta 11) | ORDEN DE FACU: la vista de `_privado/` (09-noa-participacion-provincia) pasa a ser pública dentro de cultivos y el botón de cabecera funciona. Es material interprovincial sensible cuya regla dura dice "lo habilita Francisco": la habilitación queda registrada con atribución a Facu y fecha. | `09-noa-participacion-provincia.yaml` (habilitacion_10_ago, estado publicada-a-ratificar) + `tablero-cultivos-extensivos.yaml` + `_protocolo-presentacion.formato_v1.navegacion.comparacion_noa` | **PENDIENTE la ratificación de Francisco. Si Francisco lo baja, se vuelve atrás** (la vista regresa a `_privado/` y el botón no se dibuja). |

### Tercera tanda del 10-ago-2026 (Facu, con JC): el mockup Modelo 2 es LITERAL

JC vio el rediseño publicado (commit 41df326, "diseño moderno" de la segunda tanda) y lo
RECHAZÓ. Facu cerró la decisión: **"arrancar de cero y no mezclar con lo anterior. Hay que
hacer lo que dice JC, respetá"**. El mockup Modelo 2
(`specs/fuentes/WhatsApp Image 2026-08-10 at 11.08.41.jpeg`) pasa a ser LITERAL: la página
tiene que quedar como esa captura. Esto DEROGA de la segunda tanda el principio "formato sí,
diseño literal no", el menú lateral discreto y la tabla en una sola serie. Lo que la segunda
tanda NO pierde: el alcance solo-cultivos, y las habilitaciones de "Datos por Departamento" y
"Santiago en el NOA" (esta última sigue pendiente de ratificación de Francisco).

Comentarios de JC, textuales, y qué regla dispara cada uno:

| # | JC dijo | Regla que queda escrita |
|---|---|---|
| 1 | "Todo deformado Facu" | Mockup literal: proporciones y disposición de la captura (`formato_v1.tercera_tanda.mockup_literal`) |
| 2-3 | "No son los mismos títulos. Los gráficos tampoco" / "Tenemos que respetar el protocolo de títulos de gráficos" | Pregunta 31 RESUELTA: títulos de los paneles del tablero calcados del mockup y del protocolo de títulos de JC, sin reescrituras propias (`formato_v1.tercera_tanda.titulos_del_tablero_literales`) |
| 4 | "NO había que poner la diferencia con la campaña anterior" | KPIs solo valor + unidad, sin variación (`formato_v1.tercera_tanda.kpis_sin_variacion`) |
| 5 | "En el gráfico de líneas no está el eje vertical y tampoco la escala" | Eje vertical visible con escala, en "Millones" como el mockup (`formato_v1.tercera_tanda.eje_vertical_visible`) |
| 6 | "NO va con 'ver detalle'... OLVIDATE DEL ANÁLISIS COMPLETO, ESO YA NO EXISTE MÁS... TE QUEDES CON LOS TABLEROS" | Pregunta 28 ampliada: `analisis.html` desaparece, sin links "ver detalle"; únicas salidas del tablero: los dos botones de cabecera y el dato departamental (`formato_v1.tercera_tanda.solo_tableros`). Las vistas de detalle de la base 9 pasan a `no-publicada` (quedan como registro) |
| 7 | "En la parte de producción agrícola eso está duplicado... ahí iban las banderas de idiomas" | Pregunta 33 RESUELTA: sin título duplicado en la cabecera; banderas es/en/pt arriba a la derecha, es activa, en/pt "Próximamente" (`formato_v1.tercera_tanda.cabecera`) |
| 8 | "El mapa es una miniatura y está deformado" | Mapa grande en la columna izquierda entera, proporción geográfica correcta, "Seleccione departamento" arriba y "Fuente: MAGyP" al pie (`formato_v1.tercera_tanda.mapa_grande`) |

Excepciones a la literalidad, todas anotadas (no son decisiones nuevas, son reglas vigentes
que el mockup no puede pisar): (a) el panel "Información relacionada" del mockup sigue
bloqueado porque sus destinos no existen (pregunta 8: no se linkea a páginas que no existen);
**superada por la cuarta tanda: el panel SE DIBUJA, con los links deshabilitados** (ver
abajo); (b) el período del título sale de las campañas realmente graficadas mientras la
ventana siga en 10 (pregunta 32); (c) el pie de fuente se sigue verificando contra la columna
`fuente` del mart. Ambigüedades nuevas: preguntas 38, 39 y 40.

### Cuarta tanda del 10-ago-2026 (Facu, revisando la reconstrucción literal del mockup)

Facu revisó la reconstrucción literal recién terminada por constructor-dashboards (working
tree de `dev`, sin commitear) y dejó 9 puntos. **No es un rechazo como la tercera tanda: la
literalidad del mockup sigue vigente**; son ajustes de puesta, escala y usabilidad, más dos
reglas GENERALES nuevas que valen para todo el sitio. Comentarios textuales y reglas en
`_protocolo-presentacion.origen_cuarta_tanda` y `formato_v1.cuarta_tanda`.

| # | Facu dijo | Decisión / regla que queda escrita |
|---|---|---|
| 1 | "El logo de Santiago está mal puesto, no sé si deberíamos usar otro, se ve horrible." | Se corrige la PUESTA del asset actual (tamaño, alineación, respiro; sin deformar). Si se consigue un asset mejor lo decide Francisco/marketing: pregunta 41, no bloquea (`cuarta_tanda.logo_provincial_bien_puesto`) |
| 2 | "En el gráfico de líneas está mal la escala, no se distinguen las variaciones." | La escala tiene que dejar leer las variaciones: paso más fino (0,50 de referencia, el que dibujó JC; la construcción usó 1,00) y/o rango ajustado al dato, manteniendo el eje único en "Millones" de la tercera tanda (`cuarta_tanda.escala_legible`) |
| 3 | "Falta Información relacionada, tiene que estar aunque no lleve a ningún lado." | El panel SE DIBUJA con los links del mockup deshabilitados y "Próximamente", misma excepción acotada que utilidades y banderas. Resuelve la pregunta que dejó abierta constructor-dashboards; los destinos siguen bloqueados por la pregunta 8 (`cuarta_tanda.informacion_relacionada_se_dibuja`) |
| 4 | "El sidebar en la página principal no tiene que estar; tiene que aparecer recién cuando se entra a un dashboard." | La home raíz va SIN menú lateral; el menú aparece solo dentro de las secciones (`cuarta_tanda.home_sin_menu_lateral`) |
| 5 | "En el mapa, el mouseover muestra el ID del departamento." | Bug que pasa a regla GENERAL: un tooltip nunca muestra códigos internos; siempre el nombre legible (`cuarta_tanda.tooltips_con_nombre_y_datos`) |
| 6 | "Cuando uno vaya al mapa, con mouseover que se vean los datos, no necesariamente tocar, dado que ya está el botón de Datos por Departamento." | El hover del mapa muestra nombre + datos del departamento para el cultivo/campaña activos; el click al dato departamental se mantiene, pero la lectura rápida es por hover (misma regla que el punto 5) |
| 7 | "Cuando uno va a Datos por Departamento, el botón sigue diciendo Datos por Departamento; debería volver a Provincia." | En la vista departamental el botón de cabecera pasa a decir "Provincia" y vuelve al tablero conservando cultivo y campaña (`cuarta_tanda.boton_volver_provincia`, escrito en `09-departamento-datos.cabecera`) |
| 8 | "El gráfico de torta queda muy chico por el número en el medio; prefiero sacarlo y que quede bien." | El anillo va SIN cifra central; el total "(fina y gruesa)" va fuera del centro. Es una excepción a la literalidad decidida por Facu: JC valida en la próxima revisión (`cuarta_tanda.anillo_sin_cifra_central`) |
| 9 | "Dejá anotado que tiene que haber proporciones en los cuadros que se usen: no puede ser que quede un espacio en blanco usando las campañas." | Regla GENERAL: los paneles mantienen proporciones y se dimensionan para llenar su espacio; no se admiten huecos en blanco. No habilita a deformar (el mapa mantiene su proporción geográfica). Confirma de paso la interpretación de la pregunta 38 (`cuarta_tanda.proporciones_sin_huecos`) |

### 37. Lenteja y Alpiste: con datos en la fuente, fuera de la vista

La corrección de Facu del 10-ago-2026 ("Los datos que NO ESTÁN no se ponen en los gráficos, ej.
la lenteja") fija la regla: **el universo de cultivos visibles lo define el catálogo de JC** (los
14 cultivos de su mockup Modelo 2, que son exactamente los que tienen ícono asignado en
`site/iconos-cultivo.yaml`), no la existencia de datos. El criterio de los chips pasa de
`solo_con_datos` a "catálogo de JC ∩ con datos en la ventana".

Consecuencia hoy: **Lenteja y Alpiste** (en `null` en la asignación de íconos) no se dibujan como
chip ni como serie individual, aunque tengan datos en la fuente MAGyP (la lenteja: 70 ha en
Jiménez, campaña 2020/21).

Lo que NO cambia: **sus datos siguen dentro de los agregados**. El total de producción
"(fina y gruesa)", el anillo de participación y el "Resto" se calculan sobre TODOS los cultivos
de la fuente; no se ocultan datos del cálculo ni se tocan los números que JC ya validó contra su
mockup (Soja 48,1%, total 6.016.454 tn). Visible no es lo mismo que incluido en el cálculo.

Pregunta abierta a JC: ¿querés sumar Lenteja o Alpiste a la vista? Alcanza con mandar el ícono de
cada una y se agregan al catálogo; aparecen solas en la construcción siguiente. La regla completa
está en `_protocolo-presentacion.formato_v1.selectores.cultivo.universo_visible` y el criterio del
selector en `tablero-cultivos-extensivos.yaml`.
