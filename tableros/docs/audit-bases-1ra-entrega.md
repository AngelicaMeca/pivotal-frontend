# Pivotal · Audit técnico de la 1ra entrega de bases SDE (2026-07-30)

> Perfilado de los 27 Excels de `/Volumes/KINGSTON/00000 1ra entrega bases/` (perfil crudo en scratchpad `perfil_bases.txt`). Contexto: índice "Bases para Beta - 2.xlsx" (v2 supersede al v1 del pendrive). Objetivo: informar el diseño del pipeline (normalización → reglas → HTML → Vercel) acordado con Facu el 29-jul.

## 1. Los 27 archivos colapsan en ~8 familias de schema

| Familia | Bases | Formato | Dificultad |
|---|---|---|---|
| Tidy largo (cultivo-campaña-depto) | 9 | 1 fila = 1 observación, headers limpios, con idProvincia/idDepartamento INDEC | Baja (es el formato objetivo) |
| DTV transaccional SENASA | 53, 56, 57, 75 | 14-15 cols iguales, pero hoja por año (53, 57) vs hoja única (56, 75); header en r1 o r2; col 2 cambia (mes/AÑO/NRO. DTV) | Media (drift entre archivos del MISMO dominio) |
| DTE agregado SENASA | 85, 144, 145 | MOTIVO/TIPO/AÑO/MES/OD; bovinos con categorías WIDE, porcinos-ovinos con CATEGORIA LONG | Media |
| Faena wide-por-mes | 92, 93, 100, 101 | AÑO/ENERO..DIC/TOTAL; 93 y 101 con establecimiento | Baja (unpivot) |
| Cuadros INDEC wide-por-serie | 132, 134, 135, 136, 137 | Header en filas 1-5, hasta 222 columnas, celdas combinadas estilo "Cuadro 2.x" | Alta (el peor formato) |
| Registros/listas planas | 33, 38, 196, 197, 198 | CUIT/razón social/actividad/localidad, limpios | Trivial |
| Clima diario INTA | 111 | Hoja por estación (8 estaciones), cols consistentes, 1988-2026 | Baja-media (volumen) |
| Clima normales + apiarios + stocks | 110, 30, 48, 151 | Mixto: 30 impecable (snake_case + ids), 48 con fila "Total" mezclada entre deptos y hoja extra de estratificación nacional | Baja-media |

Implicación: el motor de normalización necesita **~8 adapters + 1 config por base** (hoja a leer, fila de header, formato, conversiones), no 27 parsers a medida.

## 2. Hallazgos de calidad (concretos, vistos en los datos)

1. **Unidades mezcladas en DTV**: U.M. toma "Kg.", "Tn.", "Kg-Tn" y "U." (¡unidades, no peso!) en la misma columna. Y hay swap CANT↔PESO UNITARIO entre filas (ej. algodón: CANT=1/PESO=28.72 vs CANT=30/PESO=1). PESO TOTAL parece confiable; recalcular y validar contra CANT×PESO como check.
2. **Fila "Total" embebida entre los departamentos** (base 48, stocks bovinos): el clásico que el propio JC advirtió (duplicación tipo MAG). El motor debe detectar y separar filas de agregado.
3. **Cabezas fraccionarias en faena** (17.712,5 bovinos, base 100): quirk de la fuente; decidir regla (redondeo o flag).
4. **Headers en posición variable** (r1, r2 o r3 según archivo) y **nombres de hoja sin convención**: 'Data SDE', 'DATA SDE', 'Data', 'Batata', 'Sgo 25', '9 PB 3 - A'. El config por base resuelve; pedirle a JC convención para la 2da entrega.
5. **Sospecha en DTV Cebolla**: hojas Sgo 22, 23 y 24 tienen exactamente 2.865 filas las tres. Verificar que no haya copy/paste o truncado.
6. **Geografía por NOMBRE en DTV/DTE** ("JUAN F. IBARRA", "PARTIDO ORIGEN") vs **ids INDEC** en bases 9 y 30. Hace falta una dim_geo maestra (código INDEC + alias de nombres) desde el día uno.
7. **Tres granularidades temporales conviven**: campaña (2014/15), año-mes, fecha-hora. dim_tiempo debe soportar las tres.
8. **Hojas de cálculo de Excel adentro de los archivos de datos** ('Calculos Ranking' en base 9, con tablas lado a lado): NO ingerir; los rankings se recomputan en el motor de reglas.

## 3. El hallazgo más valioso: los "Modelo Analisis" de JC

Casi todos los archivos traen una hoja "Modelo An(á)lisis" donde JC especifica qué quiere ver: "ranking por departamento", "gráfico de barras para secuencia anual, líneas para mensual", "torta de los 5 principales", "volcado a mapas", "tabla con variaciones", "NO AMERITA ANÁLISIS, solo lista plana para la intranet", "mismo modelo que base 85/101". 

Eso ES la spec del motor de reglas de negocio, entregada junto con los datos. El pipeline debería: (a) extraer estas hojas a specs versionadas (YAML por base), (b) tratar "mismo modelo que X" como herencia de spec, (c) devolverle a JC un catálogo de modelos para que valide. JC ya está funcionando como product owner de reglas sin saberlo.

## 4. Cobertura y potencia para la demo SDE

- Cultivos: 2.533 filas, 2014/15-2024/25 por depto, + hoja comparativa NOA (Tucumán, etc.) + total país.
- DTE bovinos: ~46K filas (origen+destino) 2022-2026, con motivo, categoría y OD por depto: da para mapa de flujos (de dónde sale y a dónde va la hacienda santiagueña).
- DTV algodón: ~100K movimientos 2021-2025: SDE como origen algodonero, destinos Santa Fe/Córdoba/Corrientes.
- Clima INTA: diario desde 1988 (La María) y 7 estaciones más: cruza con campañas agrícolas.
- Registros (SISA, semillas, RNPA, estaciones de servicio, agroindustrias): el "quién es quién" productivo de la provincia, listo para la capa institucional.

**Demo asesina con 5 bases**: 9 (producción agrícola por depto) + 48 (stock bovino) + 85 (flujos ganaderos) + 53 (algodón) + 111 (clima). Cuenta la historia completa: qué se produce, dónde, cómo se mueve y con qué clima. El resto acompaña.

## 4bis. Cobertura vs índice (Bases para Beta - 2.xlsx como manifiesto)

Cruce hecho el 30-jul: el índice de JC marca **27 bases como "1ra entrega"** en la hoja Org temática, y los 27 archivos del pendrive son **exactamente esos 27**. Cero faltantes, cero extras. Conclusión de gobernanza: el Excel índice de JC funciona de facto como manifiesto de entregas y el pipeline debe usarlo como fuente de verdad para el check de cobertura automático (base esperada vs base recibida vs base publicada).

**Sobre la 2da entrega: no está definida en el índice.** Una versión anterior de este documento afirmaba que había 21 bases marcadas para la 2da entrega y citaba las bases 199 a 218. Eso no se sostiene contra ninguna de las dos versiones del índice que tenemos, así que queda corregido acá:

- En "Bases para Beta - 2" (vigente, 20-jul) la hoja Org temática tiene **27 marcas "1ra entrega" y ninguna "2da entrega"**. El catálogo de la hoja GENERAL llega hasta la base **198**.
- En "Bases para Beta - 1" (29-jun) hay 198 bases y **cero marcas de entrega** de cualquier tipo.
- **Las bases 199 a 218 no existen en ningún lado.** JC dejó las filas numeradas 199 a 205 vacías en GENERAL de la v2, o sea que tiene pensado sumar unas 7 bases más, pero todavía no escribió cuáles.

Las bases que sí existen y que aquel párrafo mencionaba (8 precios MCBA, 13/14/24/25 empleo y remuneraciones, 31 población, 40 ingresos de hacienda) están en el catálogo pero **sin entrega asignada**, igual que las otras 170. La lectura de fondo sigue en pie y no depende de los números equivocados: cuando aparezca el eje PRECIOS se habilitan los primeros cruces valor×volumen (producción × precio FOB, flujos × tarifas FETRA), y esas bases caen en familias ya diseñadas. Pero **el alcance de la 2da entrega hay que preguntárselo a JC**, no darlo por sabido. Los informes coyunturales (GEA, WASDE, PAS) son otro tipo de artefacto (PDF/links, corpus para el agente IA de F2) y no entran por los adapters tabulares.

Regla que deja este error: lo que se afirme sobre cobertura sale de `configs/manifiesto-indice.yaml` y `docs/cobertura.md`, que se regeneran desde el Excel de JC. Un dato de cobertura escrito a mano en un `.md` no tiene forma de avisar cuando queda viejo.

## 5. Recomendaciones al pipeline (bajada para Facu)

1. Estructura: `raw/` (Excels tal cual llegan, versionados) → `staging/` (parquet normalizado por base) → `marts/` (hechos + dimensiones) → `specs/` (YAML de reglas extraído de Modelo Analisis) → `site/` (HTML).
2. dim_geo con códigos INDEC + tabla de alias de nombres (resuelve DTV/DTE); dim_tiempo con campaña/mes/fecha.
3. Validaciones automáticas por carga: filas de totales embebidas, unidades fuera de dominio, CANT×PESO≠TOTAL, conteos idénticos entre hojas (caso cebolla), cabezas fraccionarias. Output: reporte de anomalías que va a JC (él pidió explícitamente que le pregunten).
4. Los 5 cuadros INDEC de patentamientos (222 columnas) déjenlos para el final; son los de menor valor narrativo y mayor costo de parsing.
5. Convenciones a pedirle a JC para la 2da entrega: nombre de hoja de datos fijo ("Data"), header siempre en fila 1, no incluir hojas de cálculos.
