# Maqueta del SID - Sistema de Información Departamental

Archivo de JC: `0000000000 Maqueta SID 1.xlsx` (recibido el 20-oct-2026). Seis hojas: cinco
dibujadas y una vacía ("Hoja1"). La maqueta está hecha con UN departamento (Aguirre) "porque es
para todos igual": "EN LA MAQUETA DEL DTO AGUIRRE ESTAN LAS BASES E INSTRUCCIONES - IGUALES PARA LOS
27 DEPARTAMENTOS".

Se leyó reconstruyendo cada hoja (imágenes y cuadros de texto en la posición de su ancla, en una
página HTML que se fotografió), como manda `tableros/CLAUDE.md`.

## Lo común a las cinco hojas

- **Cabecera negra** (color de tema 1 de Excel): el logo provincial, el logo del SID (blanco
  sobre negro), "Santiago en el NOA" y las tres banderas. En el sitio: la cromada `sid` de
  `site/theme.yaml`; "Santiago en el NOA" queda con "Próximamente" (no tiene maqueta) y el logo
  del SID vuelve a la portada.
- **Menú lateral = los 27 departamentos** (columna B, B7:B33), con el nombre como lo escribe JC
  ("Gral Taboada", "La Banda", "Río Hondo"). Están en `specs/modelos/_comunes-sid.yaml`; el build
  los busca en el GeoJSON y corta si falta alguno.
- **Fila 5**: la miga a la izquierda ("Agricultura - Todos los cultivos") y a la derecha la tira
  Agricultura | Ganadería | General | Agroclima. General y Agroclima no tienen maqueta:
  "Próximamente".
- "Departamento AGUIRRE" como título y "Generar PDF" al pie.

## Las hojas

| Hoja | Página | Spec |
|---|---|---|
| SID Ingreso | `/plataforma/sid` | `tablero-sid.yaml` |
| SID Muestra Dto-1 (todos los cultivos) | `/plataforma/sid/agricultura` | `tablero-sid-agricultura.yaml` |
| SID Muestra Dto-xCultivo (soja) | la misma, con un cultivo elegido | `tablero-sid-agricultura.yaml` |
| SID Muestra Dto-Dto 2 (todas las especies) | `/plataforma/sid/ganaderia` | `tablero-sid-ganaderia.yaml` |
| SID Muestra Dto-xGanad (bovinos, stocks) | `/plataforma/sid/ganaderia/<especie>[/<pagina>]` | las de Ganadería |

### SID Ingreso

"¿Qué es el SID?" (cuadro de texto 50, literal salvo tres erratas anotadas en el spec y los dos
logos que JC pega adentro del texto, escritos con su nombre), "¿Qué información contiene?" (las
tarjetas de Agricultura y Ganadería con sus fotos, y "De próxima incorporación") y el mapa
"Seleccione Departamento". Abajo, "RANKINGS POR DEPARTAMENTO", vacío en la maqueta con la nota de
la H73: "FALTA AGREGAR RANKING DE PRODUCCIÓN DE TODOS LOS CULTIVOS Y DE TODAS LAS CABEZAS (GENERAL,
GANADO MAYOR Y MENOR)". Se publicaron esos cuatro: producción de todos los cultivos (fina y gruesa)
de la campaña por defecto, y cabezas de todas las especies, de la hacienda mayor (bovinos,
bubalinos, equinos) y de la menor (porcinos, ovinos, caprinos) del último año común.

### SID Muestra Dto-1 y Dto-xCultivo

Una sola página: el selector de cultivo es el de Agricultura ("EXACTAMENTE IGUAL QUE EN AGRI") y
cada hoja es un estado del selector. Por defecto "Todos" ("POR DEFECTO SE MUESTRA LA OPCIÓN TODOS
LOS CULTIVOS").

- **Todos**: mapa de ubicación, mapa de calor de producción ("SE INTEGRA ESTE MAPA EN LA VARIABLE
  PRODUCCIÓN"), anillo de participación y evolución de la producción; a la derecha la cartera de
  verano e invierno en tn y en %, con su tabla ("SE AGREGAN LOS GRAFICOS Y CUADROS QUE FIGURAN EN
  MAS INFORMACION PARA EL CASO DE CULTIVOS").
- **Un cultivo**: mapa de ubicación, ranking provincial con la fila del departamento marcada (en la
  maqueta, AGUIRRE 9° con 38.300 ha y 2,7%, que es lo que da el sitio), tabla de campañas,
  evolución, anillo y el cuadro de producción y rendimiento de "Más información" ("ACA ESTA
  MODIFICADO EL CONTENIDO, PORQUE AGREGA UN GRAFICO DE MAS INFORMACION").
- Solo se pueden elegir los cultivos del departamento (D143: "ESTA PERFECTO ESTO QUE SÓLO SEA
  POSIBLE SELECCIONAR CULTIVOS DE ESE DTO").

### SID Muestra Dto-Dto 2

Mapa de ubicación, "Seleccione especie" con las especies y sus páginas, y los seis anillos de la
portada de Ganadería recortados al departamento (G65: "Hay que generar estos gráficos para el
departamento. Yo puse de ejemplo los de la provincia"). Solo se ofrecen las páginas que existen a
nivel departamental: el texto de JC en "SID Ingreso" lo dice ("sólo se podrán visualizar aquellos
que cumplen esta condición").

### SID Muestra Dto-xGanad

"EN ESENCIA ES LO MISMO QUE SE VE EN GANADERIA PERO TRASLADADA A ESTA ÁREA DEL SID". Las páginas de
Ganadería con capa departamental se publican también adentro del SID, con el MISMO JSON de datos y
el departamento obligatorio (`ganaderia_por_departamento` en `site/navegacion.yaml`). Las reglas
que JC escribe en esta hoja valen para el departamento en Ganadería Y en el SID:

- G86-G88: la tabla "Evolución del stock bovino total por departamento" queda en la fila del
  departamento y el título lo nombra en vez de decir "por departamento".
- G95: en el anillo de participación por departamento, el departamento analizado figura siempre,
  "AUNQUE SEA EN % MUY BAJOS".
- G108: el cuadro de caravanas va solo en la provincia.
- G93: "POR LO PRONTO, EN STOCK ESTE SERÁ EL FORMATO DEFINITIVO POR DEPARTAMENTO".

## Lo que queda abierto

- "General" y "Agroclima" del departamento: sin maqueta.
- Las especies sin datos por departamento (bubalinos, caprinos, apícola) y las páginas sin capa
  departamental no aparecen en el SID.
- La herramienta de registros por mail o WhatsApp que anuncia el texto de "¿Qué es el SID?".
