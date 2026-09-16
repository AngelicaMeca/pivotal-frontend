# validations/ · Calidad de datos

- `reportes/entrega-NN.md`: el reporte de anomalías de cada entrega, escrito en lenguaje llano para JC (lo genera el agente `qa-datos`). Es EL entregable de calidad: sus preguntas se pegan en el grupo de WhatsApp.
- `rangos.yaml`: rangos razonables por variable (rindes por cultivo, pesos, cabezas, clima) para el check de valores imposibles. Se amplía con criterio cuando JC confirma que un valor raro es real.
- `reglas.yaml`: parámetros de los checks por base (qué columna es el período, qué medidas se suman, qué columna es calculada, qué padrón geográfico aplica). Vive acá y no en `configs/bases/` para que `ingestor-bases` y `qa-datos` no se pisen el mismo archivo: aquél escribe la receta de LECTURA, éste la de CONTROL.
- `historial.md`: memoria de calidad: anomalía → respuesta de JC → regla resultante en configs.
- `hallazgos/entrega-NN.yaml`: salida cruda de `pipeline/validations.py`, con los números y los ejemplos de cada hallazgo. Es la evidencia detrás del reporte. GENERADO, no editar a mano.

Los checks están en `pipeline/validations.py` (etapa `check` del pipeline) y son genéricos: cada uno declara qué columnas necesita y se saltea solo si la base no las tiene. Ninguno está atado a una base en particular.

Correr solo las validaciones:

```
make check                                          # todas las entregas
.venv/bin/python -m pipeline.cli check --entrega entrega-01
.venv/bin/python -m pipeline.cli check --estricto   # sale con error si hay bloqueantes
```

Por defecto `check` no rompe `make build` aunque haya anomalías: una anomalía sin respuesta de JC no frena el sitio, salvo que distorsione un número visible, y eso se resuelve sacando del sitio el recorte afectado (queda anotado en el reporte).

Regla de oro: acá no se corrige nada. Se detecta, se explica, se pregunta. La corrección se implementa como regla explícita en `configs/` cuando JC responde.
