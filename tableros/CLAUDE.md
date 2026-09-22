# Pivotal · Pipeline de datos

> Plataforma de inteligencia de datos agro/económicos de Santiago del Estero (beta) para gobiernos provinciales. Socios: AUTOScraping (Francisco Battan, Facu Loto) + Juan Carlos Antuña (JC, experto de dominio). Esta carpeta es el pipeline completo: de los Excels de JC a los tableros que ve JC en Vercel.

> **Dónde está:** desde septiembre de 2026 los tableros viven dentro del repo del sitio institucional (`pivotal-landing-front`), en esta carpeta `tableros/`, y se publican con el sitio bajo `/plataforma` (decisión de Francisco: un solo repo y un solo deploy). El repo anterior, `franb89/pivotal`, conserva la historia hasta esa fecha. Las rutas de este documento son relativas a `tableros/` salvo que digan "raíz del sitio"; los comandos `make` se corren desde acá.

## Cómo se trabaja acá (LEER PRIMERO)

**Todo el desarrollo es vibecoding: los agentes escriben el código, los humanos operan y validan.** Francisco y Facu NO programan a mano. Si una tarea requiere código, la hace el agente correspondiente (ver `.claude/agents/`) o vos siguiendo este documento. Implicación directa sobre cómo escribís código:

- Código simple, explícito y aburrido. Python plano, sin frameworks, sin clases innecesarias, sin cleverness. Otro agente sin contexto tiene que poder leerlo y modificarlo.
- Determinismo total: mismo input → mismo output. Nada de timestamps en outputs de datos, nada de aleatoriedad, nada de estado fuera del repo.
- Config sobre código: si algo puede resolverse editando un YAML en `configs/` o `specs/`, NO se toca código.
- Cada cambio de código deja el pipeline corriendo de punta a punta: `make build` nunca queda roto en `dev`.
- Sin notebooks. Sin dependencias nuevas sin justificación escrita en el commit.

## Los 3 inputs que dispara un humano

1. **Nueva entrega de bases** (Excels de JC): subirlos a una carpeta nueva dentro de `Pivotal Repositorio/Bases de datos` en SharePoint y declararla en `configs/origen-sharepoint.yaml` → invocar agente `ingestor-bases` (las bases sin config no aparecen en los tableros hasta que ese agente las configure). Si solo se actualiza un Excel de una base ya configurada, la tarea automática lo publica sola.
2. **Nuevo archivo "Bases para Beta - N.xlsx"** (índice/contexto de JC): subirlo a la carpeta del índice en SharePoint (declarada en `indice:` de `configs/origen-sharepoint.yaml`) → invocar agente `indexador-contexto`.
3. **Nueva regla de negocio o pregunta que el dashboard debe responder** (texto de JC/Fran, foto de WhatsApp, docx de criterios, hoja "Modelo Análisis"): si es un archivo, copiarlo a `specs/fuentes/` (ver su README) → registrar en `specs/preguntas/backlog.md` → invocar agente `constructor-reglas`.

Cadena típica completa: `ingestor-bases` → `qa-datos` → `constructor-dashboards` → merge a `main` → Vercel.

## Arquitectura

```
raw/            Excels tal cual llegan (INMUTABLE, versionado por entrega) + indice/. Viven en
                SharePoint (OneDrive de AUTOScraping), no en el repo: una tarea de GitHub
                Actions los baja cada hora, corre el pipeline y publica
                (docs/actualizacion-automatica.md, raw/README.md, pipeline/rutas.py)
configs/        1 YAML por base (hoja, header, familia, unidades, columnas→canon)
                + dims compartidas (geo-alias)
adapters/       8 parsers por FAMILIA de schema (no por base)
staging/        parquet tidy por base (regenerable, gitignoreado)
marts/          hechos + dimensiones DuckDB/parquet (regenerable, gitignoreado)
specs/          modelos/ = reglas de negocio en YAML (qué vista, qué variables, herencia)
                preguntas/ = backlog de preguntas de negocio sin resolver
                fuentes/ = documentos originales de JC/Fran con reglas (docx, capturas).
                Solo escriben humanos, igual que raw/. La regla vigente es el YAML.
validations/    checks automáticos + reportes de anomalías por entrega (en lenguaje de JC)
site/           theme.yaml, navegacion.yaml, colores e iconos + templates/pivotal.css.j2 (el CSS)
../             raíz del sitio (Next.js). Lo de los tableros ahí:
                  src/app/(tableros)/  rutas /plataforma/... con su propio layout raíz
                  src/tableros/        componentes (paginas/), JS de gráficos (cliente/) y lo que
                                       genera `make site`: contenido/ (JSON por página) y estilos/
                  public/plataforma/   lo que genera `make site`: data/, geo/, iconos/, logo
corpus/         informes coyunturales (PDFs/links) para el futuro agente IA. Solo se archiva.
pipeline/       código Python del pipeline (cli, adapters, build del sitio)
docs/           arquitectura, audit de bases, flujo de trabajo
```

Stack fijo: **Python 3 + DuckDB + openpyxl + PyYAML + Jinja2 (solo para el CSS) para el pipeline; los tableros se dibujan con Next.js + TypeScript dentro del sitio institucional, con ECharts (paquete npm, versión fija en el `package.json` de la raíz)**. Lo decidió Francisco en septiembre de 2026: el pipeline sigue componiendo todo el contenido en Python y el sitio solo lo dibuja, con páginas generadas en el build (nada se calcula al pedir una página). Prohibido sin decisión explícita de Francisco: otros frameworks web, lógica de servidor para los tableros, bases de datos servidas, orquestadores, notebooks, servicios cloud nuevos.

## Las familias de schema (ver docs/audit-bases-1ra-entrega.md)

Eran 8 al auditar la 1ra entrega. La 9 (`stock`) apareció al ingerir la base 48.

1. `tidy` — largo limpio con ids INDEC (ej. base 9 cultivos). Formato objetivo.
2. `dtv` — transaccional SENASA 14-15 cols; hoja por año o única; header en r1/r2; col 2 variable.
3. `dte` — agregado SENASA origen-destino; bovinos WIDE por categoría, porcinos/ovinos LONG.
4. `wide-mes` — AÑO | ENERO..DICIEMBRE | TOTAL (faena). Unpivot.
5. `cuadro-indec` — headers en filas 1-5, hasta 222 columnas (patentamientos). El peor. Dejar para el final.
6. `registro` — listas planas CUIT/razón social (SISA, RNPA, semillas, estaciones).
7. `clima-diario` — hoja por estación INTA, diario desde 1988.
8. `clima-normal` — normales climatológicas wide por mes.
9. `stock` — existencias por categoría (base 48). Año | provincia | departamento | una columna POR CATEGORÍA + total. Lo que abre a lo ancho es la categoría, no el mes ni la medida: por eso no es `tidy` ni `wide-mes`.

## Reglas duras del pipeline

- **`raw/` es inmutable y de solo lectura para los agentes.** Ahí adentro solo escriben humanos, y solo copiando archivos nuevos. Jamás editar un Excel, ni agregar metadata, índices o archivos generados. Correcciones = nueva entrega o transformación en adapter con regla escrita en el config. Todo derivado del contenido de `raw/` va a `configs/`, `staging/` o `docs/`.
- **Nunca arreglar datos en silencio.** Toda anomalía va al reporte de la entrega (`validations/reportes/entrega-NN.md`), escrito en castellano llano para JC (sin jerga técnica). JC decide.
- **Validaciones mínimas por carga**: fila "Total" embebida entre detalle; U.M. fuera de {Kg., Tn.}; CANT×PESO_UNITARIO ≠ PESO_TOTAL ±1%; conteos de filas idénticos entre hojas/períodos (sospecha copy/paste); cabezas fraccionarias; schema drift vs entrega anterior; depto sin match en dim_geo (va a `configs/dims/geo-alias.yaml`, nunca se dropea); cobertura temporal vs lo declarado en el índice.
- **El índice de JC es el manifiesto.** El check de cobertura compara: bases marcadas para la entrega en el índice vs archivos recibidos vs bases publicadas en el sitio. Las 3 listas tienen que cerrar.
- **Provincia es parámetro** (`provincia=sde` en particiones, configs y sitio). Nada hardcodeado a SDE fuera de configs.
- **Los rankings/variaciones se computan en marts**, nunca se ingieren de hojas de cálculo de los Excels (hojas tipo "Calculos Ranking" NO se leen).
- **dim_geo canónica** con códigos INDEC + tabla de alias de nombres. dim_tiempo soporta 3 granos: campaña (2014/15), año-mes, fecha.

## Reglas de la capa de presentación

- Las vistas salen de `specs/modelos/*.yaml`. Tipos permitidos: `ranking`, `serie`, `torta`, `mapa`, `flujo-od`, `lista`, `tabla-variaciones`, `tablero`. Un spec puede heredar de otro (`igual_que: base-85`).
- **Cada base entra por su TABLERO.** `/plataforma/<seccion>` es el tablero (4 indicadores + 4 paneles compactos, todo en una pantalla) y `/plataforma/<seccion>/analisis` es la lista de todas las vistas de detalle (cada vista vive en `/plataforma/<seccion>/<slug>`; la home de los tableros es `/plataforma/tableros`). Toda sección publicada necesita su `specs/modelos/tablero-<seccion>.yaml` o el build falla. Lo pidió JC el 3-ago-2026: el sitio anterior "parecía un informe". Actualización 10-ago-2026 (Facu con JC presente): el Protocolo de formato V1 de JC (`specs/fuentes/`, mockup "Modelo 2") manda sobre la estructura de la sección; habilita la subdivisión temática (menú lateral por sector, breadcrumb jerárquico) aun donde reemplace el esquema tablero+análisis. El tablero sigue siendo la puerta de entrada de cada base; JC tiene prioridad en cómo tiene que quedar.
- Las 4 formas de panel del tablero (`anillo`, `mapa`, `tendencia`, `top`) son las mismas en todas las bases. Si hace falta una forma nueva se agrega en `src/tableros/paginas/Tablero.tsx` + `src/tableros/cliente/tablero.js` (raíz del sitio), una sola vez, y queda disponible para todas.
- **Las formas se comparten; QUÉ muestra cada panel lo decide la base.** Cada tablero se arma por lo que esa base tiene para contar, no copiando al anterior: si la base tiene 4 años, la tendencia anual no cuenta nada y el panel va mensual. Lo decidió Francisco el 5-ago-2026 ("el formato del tablero no es el mismo que todos... el famoso storytelling, luego vemos si a JC le gusta"). El desvío se escribe en el spec del tablero con su motivo, y JC valida después. Esto NO habilita a cambiar colores ni títulos: eso lo sigue mandando `_protocolo-presentacion.yaml`, que es regla de JC.
- 2-3 filtros máximo por vista. No replicar Power BI. Páginas separadas antes que interactividad compleja.
- Los filtros se dibujan solos según su `zona`: `periodo` va en la barra verde de la cabecera, `barra` va en la barra de chips, `panel` va adentro del panel que lo usa. Más de 18 opciones cae a desplegable en vez de chips.
- Estética sobria institucional; branding parametrizado en `site/theme.yaml` (F3: un theme por cliente). Desde el 22-sep-2026 los tableros usan el diseño del sitio institucional (decisión de Francisco): lienzo crema, cromo cocoa en cabecera, menú y banda, paneles de crema aclarada con borde fino y esquinas redondeadas, títulos en la serif de la marca y rótulos chicos en monoespaciada versalita. Los colores de los DATOS no cambian: los manda `_protocolo-presentacion.yaml`.
- **Exportar como PDF** (panel UTILIDADES del tablero, activo desde el 22-sep-2026): no hay librería de PDF. El botón le pone al `<html>` la clase `imprimiendo`, que en `site/templates/pivotal.css.j2` define el formato de la HOJA (A4 apaisado, sin controles ni bloques deshabilitados, tipografía al 87,5% para que el tablero entre entero), redibuja los gráficos en esa caja, les saca una foto a triple resolución —el canvas impreso saldría con la resolución de la pantalla— y recién ahí imprime. El PDF lo arma el navegador y las tablas siguen siendo texto. Un ítem de utilidades se activa declarando su `accion` en el spec del tablero, y el build solo acepta acciones que el cliente sepa atender (`site_build.ACCIONES_UTILIDAD`).
- Iconografía propia: los íconos son dibujos de trazo en `site/assets/iconos/trazo/*.svg`, con el lenguaje visual del sitio, y el build los pinta con los colores del theme. Nada de material de terceros sin licencia verificada.
- Español rioplatense en todo el sitio y los reportes. Fuente citada al pie de cada cuadro/gráfico (obligatorio, lo pidió JC).
- El sitio no debe ser indexable (noindex) mientras sea beta. Datos comparativos entre provincias: solo detrás del gate.

## Flujo git y deploy

- `dev` = rama de trabajo diaria (Facu + agentes). `main` = lo que ve JC.
- Merge `dev` → `main` SOLO con: `make build` verde + reporte de anomalías generado + ok de Francisco o Facu.
- Los tableros se arman en cada publicación de Vercel, directo desde los Excels de SharePoint (`scripts/tableros.mjs` en la raíz). La tarea `.github/workflows/tableros-datos.yml` compara cada hora SharePoint con la huella publicada (`/plataforma/estado-origen.json`) y, si cambió, pide una publicación nueva. Decisión de Francisco (septiembre de 2026): una actualización de Excels se publica sin ok humano, pero solo si el pipeline y el build terminan bien; si fallan, Vercel deja la versión anterior.
- `main` auto-deploya a Vercel el sitio entero (proyecto `pivotal-frontend`), tableros incluidos. El link se comparte en el grupo de WhatsApp "Pivotal".
- Lo que genera `make site` (`src/tableros/contenido/`, `src/tableros/estilos/` y `public/plataforma/`, en la raíz del sitio) NO se commitea: se regenera en cada publicación. Las comparaciones reservadas (`_privado`) nunca llegan al sitio publicado (las borra `scripts/tableros.mjs`). Detalle en `docs/actualizacion-automatica.md`.
- Antes de mergear, además de `make build`: `make web` (build y lint del sitio) sin errores. Un cambio en los tableros publica el sitio institucional entero: no se mergea nada que rompa el build.
- Mensajes de commit en español, formato: `entrega-02: ingesta + validaciones (3 anomalías a JC)` o `specs: nueva vista flujo-od bovinos por depto`.

## Agentes del repo (`.claude/agents/` en la raíz del sitio)

| Agente | Cuándo invocarlo |
|---|---|
| `ingestor-bases` | Llegó una entrega nueva de Excels. Perfila, escribe configs, corre adapters, deja staging listo. |
| `qa-datos` | Después de toda ingesta. Corre validaciones, escribe el reporte de anomalías para JC. |
| `constructor-reglas` | Nueva regla de negocio, pregunta de JC/Fran, u hoja "Modelo Análisis" nueva. Traduce a specs YAML. |
| `constructor-dashboards` | Specs nuevos o cambiados. Genera/actualiza las páginas HTML del sitio. |
| `indexador-contexto` | Llegó un "Bases para Beta - N.xlsx" nuevo. Diff vs anterior, actualiza manifiesto de cobertura. |

## Contexto de negocio mínimo (para decisiones de diseño)

- Cliente objetivo: gobiernos provinciales sin equipos de datos (SDE primero). El comprador valora: granularidad departamental, comparaciones, control político de qué se publica, y la historia "qué se produce, dónde, cómo se mueve, con qué clima".
- Demo prioritaria (5 bases): 9 cultivos, 48 stock bovino, 85 flujos DTE, 53 algodón, 111 clima.
- Sensibilidad: comparaciones interprovinciales (ej. faena SDE vs NOA) son material sensible. Nunca públicas sin decisión de Francisco.
- Naming: es "Pivotal", nunca "El Pivotal". Español rioplatense, sin em dashes, no inventar datos jamás.
