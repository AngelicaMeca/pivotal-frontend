# specs/fuentes/ · Documentos originales donde JC y Fran escriben reglas

Acá van **los documentos tal cual llegan** cuando dicen cómo tiene que funcionar o cómo
tiene que verse el producto: un `.docx` de JC con las normas de títulos, una captura de
WhatsApp con un pedido, un PDF con criterios de presentación, un mail con una definición.

Es el equivalente de `raw/` pero para reglas en vez de datos. Misma lógica: **acá escriben
humanos, copiando archivos. Los agentes leen y no tocan nada.**

## Qué va acá y qué no

| Va acá | No va acá |
|---|---|
| Documento que dice **cómo se presenta** algo (títulos, formatos, redacción, estilo) | Excels con datos → `raw/entrega-NN/` |
| Documento que dice **qué tiene que responder** el dashboard | El índice "Bases para Beta - N.xlsx" → `raw/indice/` |
| Captura de WhatsApp con un pedido concreto de JC o Fran | Informes coyunturales (GEA, WASDE, PAS) → `corpus/` |
| Criterios de qué se puede publicar y qué no | La regla ya traducida a YAML → `specs/modelos/` |

La hoja "Modelo Análisis" que viene adentro de un Excel de datos es una excepción
razonable: se queda donde está, porque el archivo es de `raw/` y no se parte en dos.
Anotá en `specs/preguntas/backlog.md` que ahí hay reglas.

## Cómo se usa

1. Un humano copia el archivo acá, con un nombre que se entienda y con fecha si hay
   versiones (`titulos-graficos-jc-2026-07.docx`).
2. Se anota en `specs/preguntas/backlog.md` qué llegó y qué habría que resolver.
3. Se invoca `constructor-reglas`, que lo lee y lo traduce a YAML en `specs/modelos/`.

**El documento no es la regla: la regla es el YAML.** Esto queda como respaldo, para poder
volver a la fuente cuando alguien pregunte de dónde salió un criterio. Si el YAML y el
documento se contradicen, manda el YAML y hay que corregir uno de los dos a propósito,
nunca dejarlos en desacuerdo en silencio.

## Por qué no va en raw/

`raw/` es la materia prima de los **datos** y su regla es que se pueda regenerar todo el
pipeline desde ahí sin ambigüedad. Mezclar documentos de criterio con Excels de datos
rompe esa lectura y ensucia el inventario de entregas, que se genera automáticamente
leyendo esa carpeta.
