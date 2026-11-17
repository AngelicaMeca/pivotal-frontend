# corpus/ · Base de informes de contexto

Los informes de coyuntura que le dan **contexto** al agente de IA de la SAAS: qué estaba
pasando en el sector cuando se midió un dato, y de qué organismo, cámara, institución o centro
de investigación sale ese relato. Implementa los RF7 a RF9 y RF28 a RF30 del ERS de Mapas y
Contexto IA.

**Esto no se publica.** RF29 y RF30 son explícitos: la base de contexto es insumo de la SAAS y
no se expone en la web pública, ni su contenido ni su estructura. `make site` corta la corrida
si un archivo del corpus apareció en lo publicado.

## Qué hay acá

| | |
|---|---|
| `indice-corpus.yaml` | El registro: un informe por entrada, con sus metadatos obligatorios, su lote y qué variable respalda. Es el "alta" de RF7. |
| `texto/<id>.txt` | El texto extraído de cada documento, con una marca por página. Es lo que se indexa y lo único que se versiona del contenido. |
| `indice/indice.json` | El índice de fragmentos. Se regenera y sale idéntico en cada corrida. |

Los documentos en sí (los PDF) **no viven en el repo**, igual que los del AgroMet: están en
SharePoint y acá viaja su metadata, su tamaño y su md5.

## Cómo se usa

```
python -m pipeline.corpus estado                 # qué hay, qué falta, qué hay que reindexar
python -m pipeline.corpus indexar                # RF8
python -m pipeline.corpus reindexar --id <id>    # RF8.1, sin releer los otros
python -m pipeline.corpus inventario --sector agricultura --anio 2024   # RF9
python -m pipeline.corpus huecos                 # RF9.1
python -m pipeline.corpus recuperar --sector agricultura --anio 2024 --consulta "..."  # RF28
python -m pipeline.corpus respaldo --variable superficie-mnc            # RF7.4
python -m pipeline.corpus cargar-lote --lote <id> --carpeta <ruta>      # RF7.2
```

## Extraer el texto de un PDF

El pipeline **no depende de ninguna librería de PDF** (la misma regla con la que se sacó el
logo del manual de marca), así que la extracción es un paso aparte que se corre a mano y lo que
se versiona es el `.txt`. Hoy se hace con `pdfplumber` en un entorno descartable, una página
por marca `==================== pagina N ====================`, que es lo que le permite a cada
fragmento decir de qué página salió.

Si el texto de un informe cambia, `estado` lo marca para reindexar: compara el sha256 guardado
en el índice contra el del `.txt`.

## Lo que falta decidir

La búsqueda de hoy es **léxica** (BM25 sobre el texto normalizado), no semántica. Similitud
semántica de verdad son embeddings, y eso es o una dependencia nueva o un servicio externo al
que se le mandan los informes de los organismos: las dos cosas necesitan la decisión de
Francisco. La interfaz de recuperación ya está terminada y no cambia cuando se decida: el motor
de puntaje es intercambiable. Está preguntado en el backlog.
