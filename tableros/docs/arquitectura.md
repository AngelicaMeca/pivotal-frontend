# Pivotal · Spec del pipeline de datos (2026-07-30)

> Diseño de referencia para Facu. Supuestos: los datos llegan como entregas de Excels de JC con las 8 familias de schema y los quirks del audit (`2026-07-30-audit-bases-1ra-entrega.md`), y el roadmap es F1 demo/iteración en Vercel → F2 SaaS institucional + agente IA → F3 multi-provincia + línea corporate.

## Principios de diseño (los 6 que no se negocian)

1. **Config sobre código.** 8 adapters por familia de schema + 1 YAML de config por base (qué hoja, qué fila de header, qué familia, qué conversiones). Base nueva de familia conocida = escribir un YAML, cero código.
2. **Raw inmutable y versionado.** Los Excels de JC se guardan tal cual llegan, por entrega, con hash y fecha. Nunca se editan a mano. Todo lo derivado se regenera con un comando.
3. **Contrato + validación, nunca arreglo silencioso.** Cada base declara su contrato (columnas, tipos, dominios de valores). Lo que no cumple no pasa a producción: cae en un reporte de anomalías que va a JC. JC pidió explícitamente que le pregunten; el pipeline institucionaliza eso.
4. **Provincia como parámetro, no como hardcode.** `provincia=sde` es partición en paths, configs y marts desde el día uno. F3 (provincia nueva) = nuevo set de configs, no refactor.
5. **Tres planos separados**: datos (normalización), semántica (reglas/modelos de JC), presentación (HTML). El agente de IA de F2 consume el plano semántico; nada de lo que se construye en F1 se tira.
6. **Aburrido y barato.** Python + DuckDB + parquet + sitio estático. Sin Airflow, sin Spark, sin warehouse cloud, sin realtime. Nada de eso se justifica a este volumen (~45M registros totales es territorio cómodo de DuckDB en una laptop).

## Arquitectura

```
ENTRADA                NORMALIZACION           SEMANTICA               PRESENTACION
Excels JC (entregas)   8 adapters + config     specs YAML (de las     generador de sitio
  └─ raw/entrega-N/ →  por base            →   hojas Modelo        →  estatico (templates
scrapers propios       staging/ parquet        Analisis de JC)        por tipo de modelo)
(F2+, misma landing)   tidy por base           marts/ hechos+dims  →  site/ → Vercel
                            │                       │                  (password en F1)
                            └── validacion ──→ reporte-anomalias-N.md → JC (WhatsApp)
```

## Estructura de repo

```
pivotal-data/
├── raw/
│   └── entrega-01/                  # Excels tal cual + manifest.json (hash, fecha, quien)
├── configs/
│   ├── bases/9-cultivos.yaml        # 1 por base: fuente, hoja(s), header_row, familia,
│   │                                #   unidades, columnas→canon, particiones
│   └── dims/geo-alias.yaml          # alias de nombres → codigo INDEC
├── adapters/                        # 8 parsers por familia (tidy, dtv, dte, wide-mes,
│   │                                #   cuadro-indec, registro, clima-diario, clima-normal)
├── staging/                         # parquet tidy por base, particionado provincia=/base=
├── marts/
│   ├── dims: dim_geo, dim_tiempo (campaña|mes|fecha), dim_producto, dim_establecimiento
│   └── facts: produccion_agricola, stock_ganadero, movimientos (DTV+DTE unificados
│       con eje origen-destino), faena, clima, registros
├── specs/
│   ├── modelos/9-cultivos.yaml      # extraido de "Modelo Analisis": tipo de vista
│   │                                #   (ranking|serie|torta|mapa|flujo-od|lista|tabla-variaciones),
│   │                                #   variables, filtros, herencia ("igual_que: base-85")
│   └── catalogo.md                  # autogenerado, para que JC valide sus propias reglas
├── site/                            # generador: 1 template por tipo de vista, data como JSON,
│   │                                #   charts ECharts; branding por cliente via theme.yaml
├── validations/                     # checks + reportes por entrega
└── Makefile / cli                   # `pivotal ingest entrega-02` | `pivotal build` | `pivotal deploy`
```

## Las validaciones mínimas (del audit, ya conocidas)

- Fila "Total/Subtotal" embebida entre filas de detalle (base 48) → separar a tabla de agregados y comparar contra suma propia.
- U.M. fuera de dominio {Kg., Tn.} y swap CANT↔PESO (DTV) → recalcular peso_total_tn canónico; flag si CANT×PESO ≠ PESO TOTAL ±1%.
- Conteo de filas idéntico entre hojas/periodos (caso cebolla 2.865×3) → warning.
- Cabezas fraccionarias en faena → regla explícita (conservar + flag).
- Schema drift vs entrega anterior (columna nueva, header movido, hoja renombrada) → reporte, no crash.
- Cobertura temporal: huecos de meses/campañas vs rango declarado en el índice de JC.
- Geo: nombre de departamento sin match en dim_geo → a la tabla de alias, nunca dropear en silencio.

Salida: `reporte-anomalias-{entrega}.md` en lenguaje de JC (sin jerga), listo para pegar en WhatsApp.

## Flujo semanal (definition of done por entrega)

1. Llega la entrega de JC → `pivotal ingest entrega-N` (copia a raw, manifest, corre adapters).
2. `pivotal build` → staging + marts + validaciones + sitio regenerado.
3. Deploy a Vercel (password). Link + reporte de anomalías al grupo de WhatsApp.
4. JC valida vistas contra su Modelo Análisis (el catálogo se lo muestra explícito) y responde anomalías.
5. Ajustes = editar configs/specs, no código. Commit de todo.

Objetivo de ciclo: de "llegó el Excel" a "link nuevo en el grupo" en menos de 1 hora, sin tocar código si no apareció una familia nueva.

## Evolución por fase del roadmap

- **F1 (ya)**: todo estático. DuckDB local, parquet, JSON, Vercel. Costo infra ~USD 0-20/mes. Los 5 dashboards de la demo asesina (cultivos, stock bovino, flujos DTE, algodón, clima) salen de acá.
- **F2 (con contrato)**: los marts no cambian. Se agrega: (a) API fina (FastAPI) + Postgres o DuckDB servido para las vistas con filtros dinámicos; (b) auth por niveles (el SaaS institucional lee los MISMOS marts); (c) agente IA = LLM con acceso al plano semántico (schema de marts + specs + corpus de informes coyunturales que JC ya está indexando). El sitio estático de F1 se convierte en la web pública brandada del cliente.
- **F2+ ingesta**: reemplazo gradual de "Excel de JC" por scrapers propios fuente por fuente (MAGyP, SENASA, INDEC...), que escriben en la MISMA landing con el mismo contrato. JC sale del camino crítico del delivery y queda en curaduría y reglas. Esto es core AUTOScraping y es la ventaja competitiva del mantenimiento.
- **F3 (multi-provincia)**: nueva provincia = nuevo set de configs + theme. La partición `provincia=` ya existe en todo el stack. Línea corporate = mismos marts, vistas y permisos distintos.

## Anti-objetivos (para no desviarse)

- No construir un BI genérico con drag&drop: las vistas salen de los specs de JC, rígidas y bien hechas.
- No replicar la interactividad total de Power BI: 2-3 filtros por vista, el resto son páginas.
- No parsear los cuadros INDEC de patentamientos primero (peor esfuerzo/valor; van al final).
- No meter orquestadores ni warehouse cloud hasta que un cliente lo pague.

## Reparto de roles

- **JC**: entrega Excels (con 3 convenciones nuevas: hoja "Data", header fila 1, sin hojas de cálculo), responde reportes de anomalías, valida el catálogo de modelos.
- **Facu**: dueño de adapters, configs, marts, specs y sitio. Asistido con Claude Code.
- **AUTOScraping (F2+)**: scrapers de fuentes para reemplazar la ingesta manual.
- **Fran**: prioridad de vistas según narrativa de venta, gate de calidad de lo que ve el cliente.
