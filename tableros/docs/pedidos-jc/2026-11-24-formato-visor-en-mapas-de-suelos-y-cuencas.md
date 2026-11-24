# 24-nov-2026 · Suelos y Cuencas con el mismo formato que los mapas de AgroClima

Pedido de la usuaria, textual: *"en la sección de mapas, no me gusta cómo están los mapas de
suelos y cuencas. tienen que tener el mismo formato que los mapas de agroclima, los que tienen
visor propio de código."*

Ese formato es el del **visor georreferenciado** con el que se publican los mapas del SEPA y el
Mapa Nacional de Cultivos (`visor-georef.js`): título del organismo arriba, barra de controles
sobre el mapa, el mapa en una caja con marco y la leyenda al costado en una tarjeta
"Referencias" con su pie de fuente.

## Qué se hizo

No se copió el formato: se usan **las mismas clases** (`.visor-barra`, `.visor-lienzo`,
`.visor-escala`). Lo único propio de estas dos páginas es la grilla que las acomoda. Lo declara
el spec con `visor: true` en `paneles.orden`, al lado de `zoom`, porque es una decisión de
disposición y no del dato.

| Pieza | Antes | Ahora |
|---|---|---|
| Título | Ninguno (lo había sacado el D1 del QA del 19-nov por repetir la bajada) | "INTA - Suelos y uso del suelo - Sgo del Estero" y "INTA - Cuencas y cursos de agua - Sgo del Estero", con el patrón de las páginas de AgroClima |
| Controles | Pildorita **+ − Provincia** flotando sobre la esquina del mapa | Barra arriba del mapa con **Opacidad** y **− ⟲ +**, la misma del visor |
| Caja del mapa | Sin marco | La caja del visor: marco, radio y fondo. El tamaño no cambia: sigue midiendo lo que mide el dibujo (QA del 20-nov, D1b) |
| Leyenda | Lista de casillas en un recuadro liviano | La tarjeta **"Referencias"**, con las mismas casillas adentro y el pie de fuentes en versalitas ("CAPAS: INTA - APTITUD DE TIERRAS") |

**El título vuelve a propósito.** El D1 del 19-nov lo había sacado porque repetía la bajada;
en este formato es el **único** título de la página -arriba no hay otro, igual que en NDVI o en
el Mapa Nacional de Cultivos-, así que no repite nada.

**Dos controles del visor no se trajeron, y no es un olvido:** el selector de período (acá lo
que se elige son las capas, y eso es la tarjeta de la derecha) e "Imagen original" (no hay
imagen de origen: lo que se dibuja ES el dato, bajado del INTA).

**La opacidad es un factor, no un valor absoluto.** Al 100% cada capa se dibuja con la opacidad
que ya tenía -0,78 un área, 1 una línea-, así que el mapa en reposo es exactamente el de
siempre; bajando el control se ve lo que hay debajo del área, que es para lo que existe el
mismo control en el visor. Si fuera un valor absoluto, moverlo al 100% dejaría las áreas opacas
y taparía la cartografía. La **muestra de la leyenda se repinta con el mismo factor**: si el
mapa se aclarara y la leyenda no, volvería el defecto m1 del QA del 20-nov (la leyenda
desmintiendo al mapa).

## Lo que no se tocó, y por qué

**Infraestructura y riesgo** usa el mismo panel y **queda como está**: su maqueta la dio JC y es
explícita (15-nov-2026, "SOLO PONEMOS COMO TITULO 'infraestructura' y que el mapa ocupe toda la
página pudiendo hacer zoom al máximo"). Pasarla a este formato le pondría un título que él no
pidió y le sacaría alto al mapa, que es lo único que pidió. Si se decide unificarla, es un
renglón en el spec.

## Cómo se verificó

Edge sin ventana contra el build de producción local, `probar_visor.py`, en las dos páginas:
que el panel vaya con el formato, que el título empiece por el organismo, que la barra esté
**arriba** del mapa y no flotando encima, que traiga la opacidad y los tres botones, que el
mapa vaya en la caja con marco y que la leyenda sea la tarjeta "Referencias" con su pie. Y que
los controles **hagan algo**: el **+** pasa de 243.698 a 322.100 píxeles pintados y el encuadre
vuelve exactamente a 243.698; la opacidad al 45% lleva la muestra de la leyenda de
`rgba(1,99,0,0.78)` a `rgba(1,99,0,0.353)`, que es 0,78 × 0,45. **0 fallas en las dos páginas.**

Sin regresiones: `probar_qa20.py` (16 controles), `probar_division.py` y `probar_tooltip.py`
siguen en 0 fallas, y `medir_capa_pesada.py` da los mismos tiempos del 21-nov (peor cuadro de
127 a 195 ms, mediana 17 ms).
