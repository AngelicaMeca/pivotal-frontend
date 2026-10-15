# Lectura de la maqueta de AgroClima

Maqueta de JC "0000000000 Maqueta Clima 1.xlsx" (14-oct-2026), nueve hojas. Se leyó exportando
cada hoja a PDF (los textos de los cuadros viven en FORMAS, no en celdas: ver la regla de
`CLAUDE.md` sobre cuadros de texto) más un volcado de celdas para las instrucciones en rojo. El
Excel original no se toca. Construido el 14-oct-2026 por constructor-dashboards.

La rama se llama **AgroClima** (así la escribe JC en el menú y en la miga de las nueve hojas).
En el sitio es la rama `clima` de `site/navegacion.yaml`, con una sola sección (`agroclima`,
URL `/plataforma/clima/agroclima`).

## Hoja por hoja

| Hoja | Página del sitio | Spec | Estado |
|---|---|---|---|
| Clima Ingreso | portada `/plataforma/clima/agroclima` | `tablero-agroclima.yaml` | construida, sin "Destacados" (backlog 107) |
| ClimEAI | `/clima/agroclima/estaciones-inta` | `tablero-agroclima-estaciones.yaml` + `_comunes-agroclima.yaml` | construida (base 111) |
| ClimAGM | AgroMet, informes con link al PDF | — | NO construida: base "2008 IC-CD" no entregada (backlog 107). Tarjeta "Próximamente" |
| ClimORA-1 | `/clima/agroclima/3001-mapas-ora-humedad-suelo` | `3001-mapas-ora-humedad-suelo.yaml` | construida |
| ClimEVT | `/clima/agroclima/3002-mapas-evapotranspiracion` | `3002-mapas-evapotranspiracion.yaml` | construida |
| ClimVAD | `/clima/agroclima/3003-mapas-variacion-agua` | `3003-mapas-variacion-agua.yaml` | construida |
| ClimPAS | `/clima/agroclima/3004-mapas-porcentaje-agua` | `3004-mapas-porcentaje-agua.yaml` | construida |
| ClimNDVI | `/clima/agroclima/3005-mapas-ndvi` | `3005-mapas-ndvi.yaml` | construida |
| ClimVCI | `/clima/agroclima/3006-mapas-vci` | `3006-mapas-vci.yaml` | construida |

Los números 3001..3006 son los códigos de base que JC escribe al pie de cada hoja ("3002 MP").

### Clima Ingreso (portada)

- Miga N5: "AgroClima - Provincia - acceso a datos, informes y mapas" (literal en el spec).
- Dos bloques de tarjetas con miniatura: **Datos e informes** (INTA Red de Estaciones
  Agrometeorológicas Santiago del Estero · Información diaria; INTA AgroMet · Informe
  agrometeorológico semanal) y **Mapas** (Reservas Hídricas ORA, Evapotranspiración, Humedad
  disponible, Humedad en el suelo, Índice de Vegetación NDVI, Índice de Condición de la
  Vegetación VCI).
- A la derecha, "Destacados": W62 "SE EXTRAE DE LA PRIMERA PÁGINA DEL ULTIMO EJEMPLAR DE
  AgroMet". Sin ejemplar no se construye; las tarjetas ocupan todo el ancho.
- "Generar PDF" abajo a la derecha.
- Desvíos: miniaturas calculadas (la de cada galería es su mapa más reciente; la de las
  estaciones es la silueta de la provincia con las ocho estaciones, generada por el build);
  bajadas "cada 21 días" (Humedad disponible) y "por quincena" (VCI) corregidas porque
  contradicen las hojas de esos productos; "NVDI" → NDVI. Todo en backlog 108.

### ClimEAI (estaciones del INTA, base 111)

- Miga L5 "AgroClima - Provincia - Estaciones agrometeorológicas INTA - BANDERA"; la estación
  es un tramo dinámico. AN5 "Período cubierto: Desde ... Hasta ..." va en la tarjeta de arriba.
- Izquierda: mapa "Seleccione Estación Agrometeorológica" con las ocho estaciones (coordenadas
  de la hoja "Estaciones") y, debajo, el cuadro de definiciones. Derecha: la tabla diaria (Año,
  Mes, Día + 11 variables). Debajo, a todo el ancho, el gráfico de "Temperatura Abrigo 150cm".
- Rojo al pie: W94 "ESTACION BANDERA COMO EJEMPLO - SOLO LAS VARIABLES DETALLADAS EN ESTE
  EJEMPLO" (abre en Bandera, 11 columnas), W95 "PARA EL BETA, SOLO EL ULTIMO AÑO DE DATOS"
  (365 días hasta el último dato de la base: 30/05/2025 a 29/05/2026), W96 "ESTA SIMULADA LA
  BARRA DE DESPLAZAMIENTO" (la tabla scrollea adentro), E99 "CONVERTI PUNTOS EN COMAS Y DEJÉ 1
  DÍGITO SOLAMENTE" (un decimal, coma).
- Hoja "Estaciones" del Excel de la base: "NO TODAS LAS ESTACIONES TIENEN LAS MISMAS
  VARIABLES (DEBEN ESPECIFICARSE)" → una variable que la estación no mide (no está en su hoja o
  viene vacía en toda la serie) no tiene columna y la nota la nombra (La María: humedad media,
  lluvia cronológica y máxima en 30 minutos). "TODAS SE REPRESENTARÁN CON GRAFICO DE LÍNEAS
  (luego veremos cuales se pueden combinar)" → por ahora solo la que dibuja (backlog 108).
- Control de calidad (reporte entrega-03): los tramos que no se publican están en
  `_comunes-agroclima.yaml` (`estaciones.recortes`, con motivo y referencia al punto del
  reporte): Los Juríes temperaturas, rocío y horas de frío desde el 01/12/2025; Malbrán humedad
  media, 8-14-20 y rocío todo el año; Vaca Huañuna humedades desde el 01/02/2026; Quimilí suelo
  todo el año; Bandera suelo desde el 16/04/2026; Monte Quemado humedad media todo el año. Se
  muestran "S/D" con nota; nada se borra del staging ni del mart. Sachayoj
  (`fuera_del_ultimo_anio`) figura en el mapa y en la lista con "sin datos desde el
  04/07/2025" y sus cuadros lo explican.
- Unidades: solo las de JC (mm, horas, %). Temperaturas, rocío y lluvia cronológica van con
  asterisco "Unidad a confirmar" (backlog 108). No se escribe "°C".
- Definiciones: textos de JC de `configs/dims/variables-clima.yaml` (completos; en la maqueta
  algunos están cortados por el tamaño de la forma), con los títulos literales de la maqueta.

### Galerías de mapas (ORA y SEPA-INTA)

Mismo tipo de vista `galeria` que los mapas forrajeros (miniatura + original en popup), con:
el mapa más reciente grande arriba a la izquierda, debajo la definición del producto que trae
cada hoja (literal) y el link https://sepa.inta.gob.ar/productos/, y la grilla de seis por fila
en orden descendente. Las imágenes viven en `site/assets/clima/<serie>/` con procedencia y
sha256 en `configs/dims/mapas-clima.yaml`.

Rótulos: JC escribe en las seis hojas "CORRECTAS LAS FECHAS Y LAS MINIATURAS". Se calculan del
nombre del archivo (`site_build.periodo_de_mapa_clima`):

| Serie | Nombre | Rótulo | Ventana (JC) |
|---|---|---|---|
| Evapotranspiración | et_AAAAMM_D | "21 al 30 septiembre" (década 3 = 21 al último día) | 18 (6 meses × 3) |
| Variación de agua | db_AAAAMM_D | "1 vs. 10", "10 vs. 20", "20 vs. 30/31 septiembre" | 18 |
| Porcentaje de agua | pj_AAAAMM_D | "al 10 / al 20 / al 30 septiembre" | 18 |
| NDVI | iv_AAAADDD | 16 días desde el día juliano: "29 agosto al 13 septiembre" | 12 (6 meses × 2) |
| VCI | vi_AAAADDD | 8 días desde el día juliano: "6 al 13 septiembre" | 24 (6 meses × 4; hoy 23) |
| ORA | [500_]CULT_AAAAMMDD | fila "4 octubre 2026", columna "Girasol Temprano G1" | 6 fechas, quincenales |

ORA (X86-X96): una fila por fecha y una columna por cultivo en orden fijo (G1, G2, M1, P, TC,
TL); donde falta un cultivo queda el hueco; un código desconocido corta el build; fechas a
menos de 14 días cortan el build (la base es semanal y JC publica quincenalmente).

Rótulos de la maqueta que estaban mal y se corrigieron solos: "10 al 20 mayo" (es 11 al 20),
"11 vs. 20 julio", NDVI "1 al 13 septiembre" (es 29 agosto al 13 septiembre), "1 al 12 agosto"
(28 julio al 12 agosto), VCI "22 al 27 julio" (20 al 27 julio), etc.
