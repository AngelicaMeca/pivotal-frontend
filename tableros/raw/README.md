# raw/ · Datos crudos INMUTABLES (viven en SharePoint)

Desde septiembre de 2026 los Excels NO están en el repo: viven en el OneDrive de AUTOScraping,
carpeta `Pivotal Repositorio/Bases de datos/`. Ahí los suben JC o Facu, y cada publicación de
Vercel los baja, corre el pipeline y arma los tableros; una tarea de GitHub vuelve a publicar
cuando cambian
(ver `docs/actualizacion-automatica.md`).

El pipeline los sigue leyendo con la forma de siempre:

- `entrega-NN/`: los Excels de JC tal cual llegan. NUNCA se editan ni se reemplazan: una
  corrección es una entrega nueva. Qué carpeta de SharePoint es cada entrega lo dice
  `configs/origen-sharepoint.yaml`.
- `indice/`: las versiones del Excel "Bases para Beta - N.xlsx" (el índice/contexto de JC). Las
  procesa el agente `indexador-contexto`.

## Dónde busca el pipeline esa carpeta

`pipeline/rutas.py`, en este orden:

1. la variable de entorno `PIVOTAL_RAW` (la usa la tarea automática);
2. `tableros/raw.local.txt`, con la ruta en la primera línea (para correr en una computadora; no
   se sube a git);
3. esta carpeta, `tableros/raw/`, que en el repo queda vacía a propósito: lo que se copie acá no
   se sube.

## Trazabilidad

Como los Excels ya no quedan en git, lo que llegó en cada entrega queda registrado en
`configs/entregas/entrega-NN.yaml` (nombre, tamaño, fecha y sha256 de cada archivo), y la huella
de los Excels que usa el sitio publicado en `/plataforma/estado-origen.json`. La historia de git conserva los Excels
de la entrega 01, que se subieron antes de este cambio.
