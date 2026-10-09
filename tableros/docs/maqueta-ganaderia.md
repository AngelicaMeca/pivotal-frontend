# Lectura de la maqueta de Ganadería ("0000000000 Maqueta Ganad VF.xlsx")

> Recibida de JC el 9-oct-2026 por Francisco, junto con la entrega de bases
> "00000 Entrega Beta Ganaderia" en SharePoint. Francisco: *"las que tenemos actualmente no
> sirven"*, o sea que esta maqueta **reemplaza** a los dos tableros de ganadería que hay hoy
> (`tablero-stock-bovino` y `tablero-movimientos-hacienda`) y a las 15 vistas de la base 85.
>
> Este documento es la LECTURA de la maqueta, no la maqueta. El Excel original va a
> `specs/fuentes/` (lo copia un humano); las reglas vigentes son los YAML de `specs/modelos/`.
> Acá queda lo que se extrajo del archivo para poder escribirlos sin volver a abrirlo.

## Cómo se leyó

El archivo son 21 hojas, 165 imágenes y 21 dibujos. **Casi todo el texto vive en CUADROS DE
TEXTO, no en celdas** (la regla que ya nos había costado una corrida en pasturas y forrajes):
de las 38 celdas con contenido de la primera hoja, 35 son números sueltos, y los títulos de los
cuadros, los KPIs y las pestañas están todos en `<xdr:sp>`. Se extrajeron celdas, cuadros de
texto, imágenes **con su ancla** (fila/columna, que es lo que dice qué cuadro va en qué lugar),
hipervínculos y celdas combinadas.

## La estructura: 7 especies, 21 páginas

El esqueleto es el mismo en todas las hojas y tiene **dos tiras de navegación**, una arriba de
la otra:

- **Tira de ESPECIE** (fila 6): Bovinos · Bubalinos · Porcinos · Equinos · Ovinos · Caprinos.
  La apícola no está en la tira aunque tiene su hoja.
- **Tira de PÁGINA dentro de la especie** (fila 10), distinta para cada una.

A la izquierda de todas las páginas va el **mapa** (columnas 7 a 20) con "Seleccione
departamento", y arriba a la derecha la **banda de KPIs** (filas 11-12, cuatro o cinco
indicadores). Es la misma anatomía que agricultura.

| # | Hoja | Especie | Página | Base que la alimenta | Estado del dato |
|---|---|---|---|---|---|
| 1 | GanBov ST | Bovinos | Stocks | 48 | ingerida |
| 2 | GanBov IN | Bovinos | Indicadores | 48 (se calculan) | **simulado** (ver abajo) |
| 3 | GanBov DTE | Bovinos | Movimientos | 85 | ingerida |
| 4 | GanBov VAC | Bovinos | Vacunaciones | 228 | nueva |
| 5 | GanBov LACT | Bovinos | Producc. Leche | 184, 185, 186, 188, 194 | nuevas |
| 6 | GanBovESTR | Bovinos | Estratos y UP | sin base | **simulado**, falta archivo |
| 7 | GanBov RAZ | Bovinos | Razas | 89 (Siocarnes) | nueva |
| 8 | GanBov FLHT | Bovinos | Feed Lots, Hilton y Tambos | 151 (EAC), 154 (Hilton), 152 (tambos) | 151 en entrega-01; 152/154 nuevas |
| 9 | GanBuba ST | Bubalinos | única | 153, 183 | nuevas |
| 10 | GanPorcST | Porcinos | Stocks | 232, 91 | nuevas |
| 11 | GanPorcESTR | Porcinos | Estratos y UP | 91 | **simulado** |
| 12 | GanPorcDTE | Porcinos | Movimientos | 144 | en entrega-01, sin configurar |
| 13 | GanPorcRAZ | Porcinos | Razas | 90 (Siocarnes porcinos) | nueva |
| 14 | GanEqui | Equinos | Stocks, UP y Estratos | 229, 176 | nuevas |
| 15 | GanEquiDTE | Equinos | Movimientos | 230 | nueva (86,9 MB) |
| 16 | GanOviSt | Ovinos | Stocks, Establec. y UP | 156, 157 | nuevas |
| 17 | GanOviDTE | Ovinos | Movimientos | 145 | en entrega-01, sin configurar |
| 18 | GanOviEstr | Ovinos | Estratos | 158 | nueva |
| 19 | GanCaprST | Caprinos | Stocks, Establecim. y UP | 177, 178 | nuevas |
| 20 | GanCaprEstr | Caprinos | Estratos | 179 | nueva |
| 21 | GanApi | Apícola | única | 30 | en entrega-01, sin configurar |

### Las tiras de página, textuales

- **Bovinos** (8): `Stocks` · `Indicadores` · `Movimientos` · `Vacunaciones` ·
  `Producc Leche` · `Estratos y UP` · `Razas` · `Feed Lots, Hilton y Tambos`
- **Porcinos** (4-5): `Stocks` · `Estratos y UP` · `Movimientos` · `Razas` (+ `Faena` en dos hojas)
- **Equinos** (2): `Stocks, UP y Estratos` · `Movimientos`
- **Ovinos** (3): `Stocks, Establec. y UP` · `Movimientos` · `Estratos`
- **Caprinos** (2): `Stocks, Esablecimientos y UP` · `Estratos`
- **Bubalinos** y **Apícola**: página única, sin tira.

## Títulos literales de los cuadros

Son de JC y van tal cual, como en agricultura. Uno por cuadro, en orden de aparición.

**Bovinos · Stocks**
- Sgo. del Estero - Stocks bovinos por categoría, totales y cantidad de UP por departamento - año 2.025
- Sgo. del Estero - Evolución del stock bovino por categoría y totales - años 2.012 a 2.025
- Sgo. del Estero - Evolución del stock bovino total por departamento - años 2.015 a 2.025
- Sgo. del Estero - Bovinos, caravanas en existencia y promedio de solicitudes - año 2.025

**Bovinos · Indicadores**
- Relaciones entre categorías del stock - Año 2025 - Santiago del Estero

**Bovinos · Movimientos**
- Sgo. del Estero - Movimientos hacienda por tipo, categoría y DTE Totales provincia - años 2.022 a 2.026 (parcial)
- Sgo. del Estero - Balance de movimientos hacienda (extracción - introducción) por categoría y totales - años 2.022 a 2.025
- Sgo. del Estero - Movimientos hacienda por tipo, categoría y DTE por Departamento - año 2.025
- Sgo. del Estero - Movimientos hacienda de EXTRACCIÓN, categoría y DTE por Provincia de destino - año 2.025
- Sgo. del Estero - Movimientos hacienda de INTRODUCCIÓN, categoría y DTE por Provincia de origen - año 2.025

**Bovinos · Vacunaciones**
- Sgo. del Estero - Evolución de 1ra vacunación bovina por categoría y totales por departamento - año 2.025
- Sgo. del Estero - Evolución de 1ra vacunación bovina por categoría y totales - años 2.015 a 2.025
- Sgo. del Estero - Evolución de 1ra vacunación bovina por departamento y totales - años 2.015 a 2.025

**Bovinos · Producc. Leche**
- Sgo. del Estero - Evolución de indicadores económicos de la Cuenca Lechera Provincial
- Sgo. del Estero - Evolución de indicadores de calidad de la leche de la Cuenca Lechera Provincial y comparado nacional

**Bovinos · Razas**
- Sgo. del Estero - Bovinos - Evolución de las categorías y subcategorías vendidas para faena - Tns, precio promedio y VBP (*) - Año 2025
- Sgo. del Estero - Distribución de las tn enviadas a faena por raza y departamento de origen. % del total y peso promedio - Año 2025

**Bovinos · Feed Lots, Hilton y Tambos**
- Sgo. del Estero - Stocks bovinos en Engorde a Corral (EAC) por categoría, totales y UP por departamento - año 2.025
- Sgo. del Estero - Stocks bovinos Cuota Hilton por categoría, totales y UP por departamento - año 2.025
- Sgo. del Estero - Stocks bovinos en Tambos por categoría, totales y UP por departamento - año 2.025

**Bubalinos**
- Sgo. del Estero - Stocks bubalinos por categoría y totales - años 2.015 a 2.025
- Sgo. del Estero - Stock Bubalino por departamento, categoría, totales y estrato. UP y Establecim. - año 2.025
- Sgo. del Estero - Bubalinos - Evolución de las categorías vendidas para faena - Tns, precio promedio y VBP (*) - Año 2025

**Porcinos · Stocks**
- Sgo. del Estero - Stocks porcinos por categoría y totales por departamento - año 2.025
- Sgo. del Estero - Evolución del stock porcino por categoría y totales - años 2.017 a 2.025
- Sgo. del Estero - Evolución del stock porcino total por departamento - años 2.017 a 2.025

**Porcinos · Razas** (seis cuadros)
- Sgo. del Estero - Porcinos - Cabezas totales y % enviadas a faena por departamento - años 2.024 a 2.026
- Sgo. del Estero - Porcinos - Tn totales y % enviadas a faena por departamento - años 2.024 a 2.026
- Sgo. del Estero - Porcinos - Cabezas totales y % enviadas a faena por raza - años 2.024 a 2.026
- Sgo. del Estero - Porcinos - Tn totales y % enviadas a faena por raza - años 2.024 a 2.026
- Sgo. del Estero - Porcinos - peso promedio por cabeza por raza enviadas a faena por raza - años 2.024 a 2.026
- Sgo. del Estero - Porcinos - precios promedio mensual por kg en pie declarados por los productores por raza y categoría enviadas a faena - años 2.025 a 2.026

**Equinos**
- Sgo. del Estero - Evolución de stocks equinos por categoría y totales - años 2008 a 2.025
- Sgo. del Estero - Evolución del stock equino total por departamento - años 2.015 a 2.025
- Sgo. del Estero - Estratos del stock equino, totales, Establecimientos y UP - año 2.025
- Sgo. del Estero - Resumen de faena equino, totales - año 2.025
- Sgo. del Estero - Movimientos cabezas equinas por categoría y DTE Totales provincia - años 2.024 a 2.026 (parcial)
- Sgo. del Estero - Movimientos equinos por categoría y DTE por Departamento - año 2.025

**Ovinos**
- Sgo. del Estero - Stocks ovinos por categoría, totales y cantidad de Establecimientos y UP por departamento - año 2.025
- Sgo. del Estero - Stocks ovinos por categoría, estrato, cantidad de Establecimientos y UP por departamento - año 2.025

**Caprinos**
- Sgo. del Estero - Stock caprino por categoría, totales y cantidad de UP por departamento - año 2.025
- Sgo. del Estero - Evolución del stock caprino por categoría y totales - años 2.009 a 2.025
- Sgo. del Estero - Stock caprino por categoría, estrato, cantidad de Establecimientos y UP por departamento - año 2.025
- Sgo. del Estero - Participación del stock caprino y cantidad de UP por estrato - año 2.025

**Apícola**
- Sgo. del Estero - Producción apícola - Cantidad de apiarios y colmenas por departamento - año 2.025
- Sgo. del Estero - Producción apícola - Ranking en cantidad de colmenas por departamento - año 2.025

## Lo que JC escribe en sus observaciones

Textual, con la celda donde está:

- **GanBov ST E121**, **GanBov DTE E119**, **GanBov VAC E94**, **GanEqui E182**:
  "Seleccionando un departamento del mapa lleva a página de datos (como en agri)". Es el
  patrón `click_departamento: en-la-misma-vista` que ya existe.
- **GanBov IN E55**: "LOS VALORES NO SON REALES, FUERON TOMADOS DE UN TRABAJO DE 2014, POR
  ENDE NO COMPARAR - SOLO A EFECTOS DE LA MAQUETA".
- **GanBov IN E57**: "El cálculo es sencillo en base a lo que el mismo indicador dice
  (vaca/stock se divide el total de vacas por el stock total para ese departamento o
  provincia)". Los cuatro indicadores y su interpretación están en un cuadro de texto de
  1.800 caracteres en `GanBov IN` (col8 fila12): Vaca/Stock, Vaquillona/Vaca, Ternero/Vaca y
  (Novillito+Novillo)/Vaca, cada uno con sus cortes de lectura.
- **GanBov IN E59**: "SI SOBRARA TIEMPO, O PARA ETAPA DE IMPLEMENTACIÓN, ARMAMOS UN MAPA DE
  LOS SISTEMAS IMPERANTES ... INDICANDO POR DEPARTAMENTO". Fuera de alcance de la Beta.
- **GanBov IN E62**: "POR FAVOR, ANALIZAR COMO SERÍA EL MEJOR REGRESO DE LAS PÁGINAS INTERNAS
  A LA PRINCIPAL DE GANADERÍA BOVINA". **Es una pregunta abierta para nosotros.**
- **GanBov DTE E126**: "MATRIZ ORIGEN DESTINO: Sólo se incluirá el cuadro de movimientos
  INTERNOS (departamentos en filas y columnas como origen y destino)".
- **GanBov LACT E105**: "Seleccionando el mapa lleva a página de datos de existencias DE TAMBO
  (Feed Lot, Cuota Hilton y Tambo) agregar botón o medio de regreso".
- **GanBov LACT E147** y **GanBov ST F135**: "Faena: Generado imagen de Tablero control SENASA
  (Sgo del Estero)" / "Se baja directo el JPG de SENASA el tablero de control". O sea: la
  faena bovina **no es un cuadro de datos, es una imagen** que publica SENASA.
- **GanBovESTR E167** y **GanPorcESTR E167**: "EN ESTE CASO TODOS LOS VALORES NO SON REALES,
  CAMBIO DE FORMATO TOMADO DE OVINOS".
- **GanBov FLHT E86**: "Cuando cambia mapa por variable, cambia gráfico".
- **GanBov FLHT E97**: "VALORES REALES, NO SIMULADOS".
- **GanBuba ST E112**: "NO se selecciona departamento, sólo se visualiza la escala".
- **GanBuba ST E133**: "Gráficos ídem bovinos (estos están simulados)".
- **GanPorcRAZ E114**: "EN ESTE CASO, CAMBIAMOS EL PLANTEO DE MUESTRA DE DATOS POR LAS
  CARACTERÍSTICAS"; **E132**: "TODO EL CONTENIDO ES REAL, SALVO LOS GRÁFICOS DEL PUNTO
  ANTERIOR".
- **GanEquiDTE E88**: "MISMA ESTRUCTURA Y ORGANIZACIÓN QUE TODOS LOS DTE ANIMALES (BASE
  BOVINOS)".
- **GanOviDTE** (col12 fila11): "PROCESAR IDEM DTE BOVINOS, mismo formato y contenidos".
- **GanApi E66**: "SIN SELECCIÓN DE DEPARTAMENTO, SÓLO MOSTRANDO ESCALAS DE COLMENAS Y
  APIARIOS".
- **GanBov VAC E112**, **GanPorcDTE E75**, **GanApi E84**: "Tonos de mapas de calor por
  variable", igual que en agricultura.

## Inconsistencias de la propia maqueta (no son errores nuestros)

Se anotan para no "corregirlas" por las nuestras ni copiarlas sin pensar:

1. **La tira de páginas de bovinos cambia de nombre entre hojas**: la quinta pestaña dice
   `Faena` en ST, DTE, ESTR y FLHT, y `Producc Leche` en VAC, LACT y RAZ. Son ocho pestañas
   para ocho páginas y la quinta es LACT, así que `Faena` parece el arrastre de una versión
   anterior — sobre todo porque la faena bovina, según el propio JC, es una imagen de SENASA y
   no una página.
2. **GanApi trae la tira de BOVINOS entera** (Stocks, Indicadores, Movimientos, Vacunaciones,
   Faena, Estratos y UP, Razas, Feed Lots), que no corresponde a una página única de apícola.
3. **GanPorcESTR, GanBovESTR y GanOviEstr comparten el mismo título literal** ("Stocks ovinos
   por categoría, estrato...") y los mismos KPIs: los dos primeros son la copia de ovinos que
   JC declara en E167.
4. **GanOviDTE y GanPorcDTE muestran los títulos y KPIs de BOVINOS**: son el molde, no el
   contenido. Lo dice JC en la propia hoja ("PROCESAR IDEM DTE BOVINOS").
5. **"Esablecimientos"** (sin t) en la tira de caprinos.

## Las bases

La entrega nueva ("00000 Entrega Beta Ganaderia") trae 24 archivos; ocho bases más que hacen
falta ya estaban en `entrega-01` sin configurar.

**Entrega nueva**: 48, 89, 90, 91, 152, 153, 154, 156, 157, 158, 176, 177, 178, 179, 183, 184,
185, 186, 188, 194, 228, 229, 230, 232.

**Ya en entrega-01, sin configurar**: 30 (apiarios), 92 y 93 (faena porcina), 100 y 101 (faena
bovina), 144 (DTE porcinos), 145 (DTE ovinos), 151 (EAC).

**Ya ingeridas**: 48 (stock bovino) y 85 (DTE bovinos).

Ninguna página de la maqueta se queda sin base, salvo los estratos bovinos (hoja 6), que JC
declara simulados y para los que no hay archivo.
