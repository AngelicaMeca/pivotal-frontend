# Estado del proyecto

> Dónde está Pivotal hoy y qué sigue. Este archivo se actualiza al cerrar cada tanda de
> trabajo, para que cualquiera (humano o agente) pueda retomar sin leer el historial de chat.

**Última actualización: 31 de julio de 2026.** Rama `dev`, sin pushear. `main` sigue en el
estado del 30-jul.

## Qué hay funcionando

- **2 bases ingeridas y publicadas**: la **9** (cultivos extensivos, MAGyP) y la **85**
  (movimientos de hacienda bovina, DTE de SENASA). Configs, adapters, staging, marts,
  validaciones y vistas completos para las dos.
- **31 vistas construidas** en 35 páginas HTML: 16 de cultivos y 15 de hacienda. De esas, 27
  están publicadas y **4 quedan en `_privado/`** esperando decisión de Francisco (las dos
  comparaciones de cultivos contra el NOA y el país, y los dos flujos de hacienda por
  provincia de contraparte). `_privado/` está gitignoreado: no viaja al deploy.
- **Los seis cuadros que JC tenía calculados a mano en la base 85 se reproducen exactos**:
  totales por año, los tres recortes, ranking de los 27 departamentos, extracción por
  provincia, movimientos por motivo y movimientos por mes. Si alguno deja de dar, alguien
  cambió un filtro sin querer.
- **Protocolo de JC ejecutable**: `specs/modelos/_protocolo-presentacion.yaml` traduce su docx
  de criterios a reglas mecánicas (títulos, quintiles, colores, escalas, fuente al pie).
  `pipeline/presentacion.py` las aplica y el build falla si alguna se incumple. Cada spec
  declara el título que TIENE que salir y el build lo verifica contra el que compone.
- **`make build` verde de punta a punta y determinista** (dos corridas, mismo hash del árbol
  de salida). Peso del sitio: 10 MB, de los cuales 8,5 MB son JSON de datos.
- **Verificado en el navegador** (Chrome, local): home, sección de cultivos, mapa, series,
  tortas, rankings, y las de hacienda (matriz origen-destino, balance, estacionalidad, mapa,
  rankings, la reservada). Sin errores de consola.

## Pendientes, en orden de prioridad

### 1. Índice nuevo de JC sin procesar (bloquea el check de cobertura)

En `raw/indice/Bases para Beta - 2.xlsx` está la versión del **27 de julio**, que llegó por
`dev` remoto y es más nueva que la que usamos para generar el manifiesto. Trae las **21 bases
marcadas para la 2da entrega** (casi todas de precios: FOB, MCBA, granos, aceites, carnes,
fertilizantes, petróleo, tarifas FETRA, más empleo y población), una hoja nueva de informes
coyunturales, y el catálogo pasa de 205 a 224 bases.

`configs/manifiesto-indice.yaml` y `docs/cobertura.md` se generaron desde la versión del
20-jul, así que **hoy el check de cobertura compara contra un manifiesto viejo**.

**Qué hacer**: invocar el agente `indexador-contexto`. Hace el diff entre las dos versiones y
regenera manifiesto y cobertura.

**Ojo con esto**: en el índice nuevo JC reseteó la hoja "Lista de bases y notas" para la 2da
entrega, así que las 37 filas de notas de la 1ra ya no están. No se perdieron, quedaron en el
commit `019ae0c`:

    git show 019ae0c:"raw/indice/Bases para Beta - 2.xlsx" > /tmp/indice-20jul.xlsx

Entre esas notas estaba la observación de que falta definir si el CUIT de la base 33 se puede
mostrar.

### 2. Dos decisiones frenando vistas ya construidas

Las dos vistas están **hechas y se pueden mirar** en local; lo único que falta es decidir.

- **Francisco**: publicar o no los flujos de hacienda por provincia de contraparte
  (`85-extraccion-por-provincia-destino`, `85-introduccion-por-provincia-origen`). No comparan
  a Santiago con nadie, pero dejan ver a qué provincias les vende hacienda y en qué volumen.
  Salieron por el default seguro. Se publican escribiendo un nombre en el campo `aprobado_por`
  de los dos specs y moviéndolas de `privadas` a la sección en `site/navegacion.yaml`.
  Backlog, pregunta 21.
- **JC**: si quiere mapa en ganadería. No lo pidió (sí lo pidió en agrícola). Lo propusimos y
  lo construimos justamente para que lo vea. Backlog, pregunta 22.

### 3. Corregir una corrección mal hecha en la auditoría

En el commit `874b38d` se declaró infundada la afirmación de que la 2da entrega tiene 21 bases
en el rango 199-218 (sección 4bis de `docs/audit-bases-1ra-entrega.md`). **La afirmación
original era correcta**: salía del índice del 27-jul, que no estaba en el repo al momento de
verificar. Hay que revertir esa corrección. Conviene hacerlo **después** del punto 1, para que
el texto salga del manifiesto ya actualizado.

### 4. Preguntas a JC (esperando respuestas)

Están en `specs/preguntas/backlog.md`, 25 en total. Las 14 a 20 salieron de aplicar su
protocolo de presentación; las 21 a 25, de la base 85. Ninguna frena una vista: cada una se
resolvió con la opción más simple y quedó anotada.

Vale la pena mandar juntas la 18 y la 23: en su cuadro de la base 85, JC escribe los
departamentos capitalizados y con tilde ("Jiménez", "Ojo de agua"), o sea que los reescribe a
mano cuando arma algo para mostrar. Eso confirma que hay que preguntarle si los quiere así en
el sitio, y ya tenemos su forma preferida escrita de su puño.

**La pregunta 13 (CUIT de la base 33) no se manda todavía**, por decisión de Francisco. Hasta
que se responda, **no se construye ninguna vista de la base 33**.

### 5. Un defecto cosmético conocido

En la torta de cultivos de invierno del departamento, las etiquetas de las porciones chicas
(Cebada, Garbanzo, Centeno) se pisan entre sí. Es de ECharts, se arregla con la configuración
de `labelLayout`. No afecta ningún número.

### 6. Higiene pendiente

- `configs/manifiesto-indice.yaml` tiene `entregas.entrega-01.publicadas: []` (lo escribe
  `indexador-contexto`).
- `pipeline/site_build.py` pasó los 3.100 renglones. Hoy se lee bien porque está partido en
  bloques por base y por vista, pero cuando entre la tercera base conviene sacar los
  constructores a un archivo por base, como ya se hizo con la capa de datos
  (`pipeline/hacienda.py`).

## Lo que viene después

- **25 bases de la entrega-01 siguen sin config.** Dos avisos para cuando se encaren: las
  bases 156/157/158 (ovinos) JC las anotó como "SE UNIFICARÁN LAS BASES", así que va **un solo
  config, no tres**; y la 134 (patentamientos, familia `cuadro-indec`, headers en 5 filas y
  hasta 222 columnas) conviene dejarla para el final.
- **La demo prioritaria pide 5 bases y van 2.** Faltan la 48 (stock bovino), la 53 (algodón) y
  la 111 (clima). La 48 es la que más se nota: es la que permite armar la ficha única por
  departamento que JC anticipó, cruzando agricultura con ganadería.
- **Dos validaciones nunca se ejercitaron con datos reales**: `producto_de_columnas` y
  `valores_fraccionarios`. Hay que mirarlas de cerca cuando entre la primera base DTV.
- **Peso del sitio**: 10 MB. La matriz origen-destino ya se parte en un archivo por año; si
  entra otra base pesada conviene revisar la estrategia general antes, no después.

## Para mergear a `main`

`main` es lo que ve JC y auto-deploya a Vercel. El merge pide: `make build` verde (lo está),
reporte de anomalías generado (lo está, `validations/reportes/entrega-01.md`), y **ok explícito
de Francisco o Facu**. Hoy falta el ok.

Ojo: **el proyecto de Vercel todavía no existe**. `vercel.json` está en el repo pero nadie
importó el repositorio en vercel.com, así que hoy mergear a `main` no publica nada. Para que JC
tenga un link hay que crear el proyecto primero, y ahí decidir el tema del acceso (la
protección por contraseña de Vercel es de plan Pro; el plan Hobby es solo para uso no
comercial).
