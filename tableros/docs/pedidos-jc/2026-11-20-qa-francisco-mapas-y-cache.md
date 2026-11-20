# QA de Francisco, 20-nov-2026 · la caché, lo que faltaba de D1 y los visores de la portada

Segunda revisión de Francisco sobre el sitio publicado (`pivotal-frontend-beta.vercel.app`),
encima de la del 19-nov (`2026-11-19-qa-francisco-mapas.md`). Son dos bloques: uno de sitio
-la caché y lo que había quedado a medias del D1 de ayer- y uno de los mapas, donde él ya
verificó que **las seis capas propias del INTA andan bien** (dibujan, leyenda, cartel, zoom y
arrastre) y los defectos que quedan son todos de los **visores embebidos de la portada**.

Resultado: **nueve defectos, los nueve atendidos**; uno de ellos (el encuadre de los visores del
INDEC) no se puede corregir desde acá y lo que se hizo fue medir por qué, avisarle al visitante y
dejar la propuesta en el backlog.

## El prioritario: la caché

| Qué pasaba | Por qué | Qué se hizo |
|---|---|---|
| Las páginas salían con `cache-control: public, max-age=31536000, immutable`. Quien ya había visitado una página seguía viendo la versión vieja hasta forzar la recarga (le pasó con Cuencas y con Suelos) | Las reglas de caché de `next.config.ts` matchean **el camino del pedido, no la carpeta de `public/`**. `"/plataforma/mapas/:archivo*"` se escribió pensando en `public/plataforma/mapas/` (las miniaturas), pero el mismo camino es la URL de la portada de Mapas y de sus dos páginas: la regla de un año para imágenes les caía a ellas | Toda regla de caché larga termina ahora en el helper `archivos(carpeta, extensiones)`, que **exige extensión de archivo**, y hay una regla explícita para páginas (`public, max-age=0, must-revalidate`) que matchea lo que NO tiene punto en su último tramo. Las dos son disjuntas, así que ninguna respuesta lleva dos `Cache-Control` |

Verificado contra el build de producción local: las cuatro páginas de mapas vuelven
`must-revalidate`, las imágenes siguen `immutable` por un año, los GeoJSON una semana y
`/plataforma/data` sigue sin regla (es lo que el pipeline reescribe con el mismo nombre).

**Lo que esto NO arregla: el navegador de JC.** Una copia ya guardada con `immutable` no se
puede desalojar desde el servidor; el navegador no vuelve a preguntar hasta que vence el año. Por
eso los enlaces que se le pasan a JC en la tarjeta llevan `?v=20nov` al final: con la dirección
distinta, su navegador pide la página nueva.

## Lo que faltaba del D1 (Infraestructura)

| # | Qué estaba mal | Qué se hizo |
|---|---|---|
| D1a | Quedaban **dos** recuadros de texto debajo del mapa, y uno arrancaba con "Los kilómetros se miden igual que los de la red vial", que remitía al bloque de kilómetros que se había quitado | Las dos notas se juntaron en una, "Qué muestra el mapa" (`_comunes-capas-ign.yaml`, nota `capas`), sin esa frase y con el contenido del tendido eléctrico adentro. El spec declara `notas_metodologicas: [capas]` |
| D1b | "El mapa ocupa cerca de un tercio del ancho" | El mapa **no estaba deformado ni era chico**: la caja medía 950 px de ancho y el dibujo 455, porque la provincia es más alta que ancha (su relación real es 0,635) y se encuadra por el alto. Lo que se corrigió es la **caja**: mide exactamente lo que mide el mapa (`width: min(alto × --relacion-mapa, 92vw)`), la leyenda quedó pegada al costado y el par va centrado. Medido: caja de 455×716 y dibujo de 454×715, o sea el 99,8% del ancho |

El número 0,635 lo calcula el build del propio GeoJSON (`relacion_mapa`) y viaja al CSS en
`--relacion-mapa`, que escribe `tablero.js` al pintar: el CSS no lo tiene escrito a mano.

## Los visores de la portada de Mapas

| # | Qué estaba mal | Qué se hizo |
|---|---|---|
| M1 | "Parajes por provincia (INDEC)" abría **"Población total, por sexo, según jurisdicción"**, no parajes | En el catálogo de 456 indicadores del portal del INDEC **no hay ninguno de parajes**, así que no hay otro id al que apuntar: el visor del organismo no puede mostrar lo que JC pidió. Se aplicó su propia regla y la capa se publica en **nuestro** visor: los 1.022 parajes del IGN (BAHRA) son una capa de Infraestructura, que es donde él los quiere ("CRUZAR CON RED TERCIARIA Y RUTAS"). La tarjeta pasó al panel de mapas propios y lleva adentro del sitio |
| M2 | "Cobertura bosque nativo Argentina 2020 (CONAE)" abría el GEOVisor general, con el país entero, sin la capa cargada y con aviso de cookies. Es textual lo que JC objetó el 18-nov ("LLEVA AL VISOR GENERAL") | Medidas las dos salidas y las dos están cerradas: el listado de mapas de su MapStore vuelve **vacío** (no hay mapa con id al que enlazar) y su GeoServer anuncia **70 capas, todas mosaicos SAOCOM** (la cobertura de bosque no está publicada). Se aplicó la tercera opción de JC ("SI NO SE PUEDE, ELIMINAMOS TODO"): la tarjeta salió de la portada y la fuente quedó `aprobada` sin publicar, con la medición escrita. Backlog 140 |
| M3 | "Viviendas particulares por departamento" abría "Población **en** viviendas particulares", que es población | El indicador que corresponde al título es el 34 ("Viviendas particulares, por departamento, partido o comuna"), leído del catálogo del propio INDEC. La URL de JC quedó guardada en `url_de_jc` |
| M4 | Los tres visores del INDEC abren con el país entero y con un aviso legal que hay que aceptar cada vez | **No se puede corregir con el enlace.** Su portal acepta un parámetro para arrancar filtrado en una provincia (`?filter=86`), pero su propio código lo aplica solo si la dimensión geográfica declara un nivel de desagregación "0", y en la configuración que publica hoy las cinco dimensiones lo traen vacío: el parámetro no hace nada. Leído en `portalgeoestadistico.indec.gob.ar/js/core.js`, función `build_geoportal`. Mientras tanto el subtítulo del panel lo avisa ("abre con el país entero: acerque el mapa a Santiago del Estero") y la única salida real -dibujar los tres indicadores nosotros, con el dato por departamento de su API pública- queda en el backlog 141, apoyada en la propuesta del 133 |

## Los menores de los mapas propios

| # | Qué estaba mal | Qué se hizo |
|---|---|---|
| m1 | En Cuencas, un **tono oliva** en el sudoeste (Choya, Loreto, Ojo de Agua) que no estaba en la leyenda | No era una clase sin declarar: es la cuenca **Dulce**. Su color del INTA es `#d4c94e`, pero en el mapa el área se pinta al **78%** sobre el relleno de los departamentos (`#e8d6c6`), así que lo que se ve es `#d8cc68` -el oliva- mientras la muestra de la leyenda se dibujaba **opaca**. Ahora la muestra se compone igual que el mapa: el navegador pinta el color con su opacidad sobre el mismo fondo (`capas.js` + `.capas-area`). Medido: la muestra declara `rgba(212, 201, 78, 0.78)` sobre `rgb(232, 214, 198)` y en el lienzo hay 59.842 píxeles de ese tono compuesto |
| m2 | El texto de Cuencas nombraba **"Salinas de Ambargasta"**, que no es ninguna de las seis cuencas de la leyenda | La nota nombra ahora las seis que existen en el recorte provincial: Dulce, Dulce Superior, Juramento - Salado, Juramento Medio Inferior, Rosario Horcones - Urueña y Sin Aporte Significativo - Sureste de Salta |
| m3 | Suelos y Cuencas no tenían **botones de zoom** como el mapa de cultivos | Los tres mapas propios tienen ahora la misma pildorita del visor georreferenciado, flotando sobre la esquina del mapa: **+**, **−** y **Provincia**. No le quitan alto al mapa (comparten celda de la grilla) y en el PDF no salen. Existen porque la rueda del mouse no es el único modo de acercar: con trackpad, o llegando con el teclado, sin botón no había zoom |
| m4 | En Áreas deforestadas el cartel mostraba **solo el departamento** | El dibujo del desmonte está encima del departamento y su plantilla de cartel estaba vacía, así que el mouseover caía al departamento. Ahora dice "Área ganadera deforestada entre 2008 y 2017". Las **hectáreas por mancha** no se pueden: el INTA entrega la capa unida en una sola pieza. Por departamento sí se calculan exactas y están ofrecidas en el backlog 139 |
| m5 | El cartel de **cursos de agua** sin confirmar | Andaba, pero decía una palabra sola en mayúsculas ("RIO"), que es como el INTA escribe la clase. Ahora dice "Curso de agua: RIO". La clase se sigue publicando literal |

## Cómo se verificó

Edge sin ventana contra el build de producción local (`npx next start`), midiendo sobre los
píxeles del lienzo y el DOM: `probar_qa20.py` (16 controles) y `probar_tooltip.py` (los dos
carteles), más `curl -I` para las cabeceras de caché. Tres cosas que conviene recordar:

- **El ancho del dibujo ya no sirve para medir el zoom.** Desde que la caja mide lo que mide el
  mapa, la silueta llena el lienzo al abrir y acercar no la puede hacer más ancha: la medición
  satura. Lo que crece es la **cantidad de píxeles pintados** (246.837 → 324.243 al apretar +, y
  de vuelta a 246.837 exactos con "Provincia").
- **ECharts usa dos lienzos y el primero está vacío.** Buscar un color en
  `querySelector('[data-grafico] canvas')` da cero siempre; hay que recorrer los dos.
- **Un parche chico no se encuentra pidiendo un bloque sólido.** Las áreas deforestadas son
  1.545 píxeles sueltos en todo el lienzo y un río es una línea de 1 px: el buscador de píxeles
  tiene que aceptar un pixel solo, sin vecinos del mismo tono.

## Lo que no se tocó, y por qué

- **El encuadre de los tres visores del INDEC** (M4): medido que no se puede desde el enlace. La
  salida es dibujarlos nosotros y eso es una decisión de JC/Francisco, no un arreglo.
- **Los textos explicativos de las tres páginas de mapas**: no los escribió JC. Quedan y la
  pregunta de si se van está en el backlog 137 (y antes en el 132b).
- **El símbolo de los parajes y los radios de distancia al pavimento**: el punto crema con borde
  oscuro es nuestro y los radios no están definidos. Backlog 138.
- **La copia que ya tiene guardada el navegador de JC**: no se puede desalojar desde el servidor.
  Los enlaces de la tarjeta de Asana llevan `?v=20nov` para saltearla.
