# QA de Francisco, 19-nov-2026 · los mapas contra los pedidos de JC

Revisión de Francisco sobre el sitio publicado, con los criterios de JC, cruzando la ficha
`2026-11-18-1220512131004640-mapas-del-inta.md`, `specs/preguntas/doctrina-jc.md` y el backlog
112 a 131, más dos fuentes que no estaban en Asana: los mensajes de JC a Francisco del 16 y
17-nov-2026 y el documento "REVISION GANADERIA AL 25 OCTUBRE.docx".

Resultado: **seis defectos, los seis corregidos y verificados en el navegador**; tres pendientes
que dependen de JC o del organismo; uno de Ganadería que espera una decisión.

## Los seis defectos

| # | Qué estaba mal | Contra qué pedido | Qué se hizo |
|---|---|---|---|
| D1 | `/plataforma/infraestructura` tenía cuatro indicadores de kilómetros y un segundo título arriba del mapa, y el mapa medía 640 px de alto | "SOLO PONEMOS COMO TITULO 'infraestructura' y que el mapa ocupe toda la página" (15-nov-2026). El "SOLO" es textual | `indicadores: []`, el título del panel vacío (el renglón no queda: `h2:empty`) y el alto del mapa de `100vh - 17rem` a `100vh - 12rem`: 716 px en una ventana de 908. Las mismas tres cosas en Suelos y en Cuencas, que calcan esa maqueta |
| D2 | Quedaban enlaces que sacaban del sitio: "Visor y descarga del INTA" en el Mapa Nacional de Cultivos, "Abrir en el sitio del organismo" al pie del visor embebido, y las cinco citas clickeables al SEPA en AgroClima | "Nunca pusimos links externos a nada" (18-nov-2026). Doctrina 1 | Los tres salieron y **la cita de la fuente se quedó escrita** en los tres casos. `galeria.js` dibuja la cita como texto cuando el spec no declara `href`. Verificado: cero enlaces con `target="_blank"` en las páginas de mapas y cero enlaces dentro del popup del visor |
| D3 | La página de Cuencas y cursos de agua mostraba el texto de la página de Suelos (describía la aptitud de tierras), y la de Suelos prometía "estos dos mapas" teniendo cuatro | Doctrina 4 y 5: no se publica texto que no describa lo que está en pantalla | La nota compartida `capas-inta` se partió en `capas-inta-suelos` (las cuatro capas, con sus caveats) y `capas-inta-agua` (las dos, con el 4% sin cuenca) |
| D4 | La miga del Mapa Nacional de Cultivos decía "Mapas - Provincia - ..." | "El de cultivos VA EN AGRICULTURA" (18-nov-2026) | `breadcrumb: "Agricultura - Cultivos Extensivos - Provincia - Mapa Nacional de Cultivos"` |
| D5 | Las cinco tarjetas del INDEC y del CONAE escribían los caracteres "9C9" al lado del título | Defecto propio | Era `content: " \29C9"` con la barra comida por una herramienta: en el archivo había quedado el caracter de control 0x02 pegado a "9C9". Y el signo tampoco estaba en la pila de tipografías del sitio, así que el marcador ahora **se dibuja**: una ventanita de CSS (un cuadro con su barra de título) que no depende de ninguna tipografía |
| D6 | Las páginas de mapas abrían con todas las capas apagadas, y al prender o apagar una el mapa volvía al encuadre inicial | El mapa ES la página: abrir "Suelos y uso del suelo" sin un solo suelo a la vista no es lo que se pidió | Suelos abre con "Aptitud de tierras" (137 KB) y Cuencas con sus dos capas (1,05 MB, ~200 KB por la red; Infraestructura ya abría con cinco, 616 KB). Y el encuadre sobrevive: `pintarMapaCapas` lee el zoom y el centro del geo dibujado y se los pasa al nuevo |

## Cómo se verificó (Edge headless, build de producción local)

Medido sobre los píxeles del lienzo, no mirando la pantalla, porque ni `echarts` ni `PIVOTAL`
están en `window`. El script es `probar_qa.py` (los seis defectos) más `probar_encuadre.py` (el
zoom). Dos cosas que conviene recordar para la próxima:

- **La rueda tiene que ser la del navegador.** Un `WheelEvent` sintético despachado sobre el
  canvas no mueve el mapa: zrender escucha sobre su propio contenedor y normaliza el evento del
  navegador. Con `Input.dispatchMouseEvent` (`type: "mouseWheel"`) sí. Medido en las tres
  páginas: la silueta pasa de 456 a 976 px de ancho al acercar, y **sigue en 976 después de
  prender y de apagar una capa**; antes volvía a 456.
- **Un servidor local viejo miente.** Si `next start` falla con `EADDRINUSE`, el que contesta es
  el proceso anterior y sirve los chunks del build viejo: las galerías de AgroClima aparecían
  sin dibujar y sin ninguna de sus 12 miniaturas, y era un 404 de un `.js` que ya no existía.
  Antes de dar por roto algo, verificar que el servidor que contesta sea el del último build.

## Lo que no se tocó, y por qué

- **Las cuatro tarjetas del INDEC y la del CONAE se quedan embebidas.** Son el formato que JC
  puso como aceptable ("al menos hagamos como están los mapas de población del INDEC"). Que
  abran el visor nacional y no el recortado a la provincia está en el backlog 133, con la
  propuesta de bajar esas cuatro capas y dibujarlas en nuestro visor, igual que las del INTA.
- **Los costados vacíos del mapa de Infraestructura** no son un defecto que se pueda arreglar:
  la provincia es más alta que ancha y no se deforma. Explicado en el backlog 135.
- **La tira de íconos de especies en Ganadería** (G3 del QA): JC la vuelve a pedir, pero la tira
  de secciones se apagó el 12-oct por pedido de la usuaria y lo que él compara son los chips con
  ícono de Agricultura, que necesitan un ícono por especie. Y él mismo puso el orden: "Prioriza
  mapa. Ganadería para más adelante". Backlog 136.
- **Los audios de JC del 12 al 19-nov** (unos treinta) siguen sin escuchar, y el QA tampoco los
  cubrió. Es la fuente de pedidos más grande que queda sin leer.
