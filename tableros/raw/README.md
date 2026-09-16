# raw/ · Datos crudos INMUTABLES

- `entrega-NN/`: los Excels de JC tal cual llegan (pendrive/WhatsApp). NUNCA se editan. Cada carpeta lleva su `manifest.json` (lo genera el agente `ingestor-bases`).
- `indice/`: las versiones del Excel "Bases para Beta - N.xlsx" (el índice/contexto de JC). Las procesa el agente `indexador-contexto`.

Pendiente inicial: copiar acá los 27 Excels de la 1ra entrega desde el pendrive KINGSTON (`/Volumes/KINGSTON/00000 1ra entrega bases/`) como `entrega-01/`, y "Bases para Beta - 1.xlsx" y "- 2.xlsx" a `indice/`.
