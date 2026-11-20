# 21-nov-2026 · El congelamiento al prender las áreas deforestadas, y la división departamental encima de las capas

Pedido de la usuaria, textual: *"en los mapas de suelo y uso de suelo, se buguea cuando clickeo
la capa de áreas ganaderas, arregla la optimización de los mapas. también, marca sobre las capas,
los departamentos de Santiago del Estero."* Son dos cosas y las dos están hechas y medidas.

## 1. El congelamiento

**Qué pasaba.** Con "Áreas ganaderas deforestadas 2008-2017" prendida, cada paso de zoom y cada
tirón del arrastre congelaban la página **1,3 segundos**. No era la descarga (3,25 MB, una vez):
era el dibujo, en cada repintado.

**Por qué.** La capa es un rasgo con **18.085 partes y 145.913 vértices**. Medido con el
perfilador del navegador, el tiempo estaba en tres lugares:

| Dónde | Qué costaba |
|---|---|
| `renderItem` de la serie de áreas | Rearmaba el camino **entero** en cada cuadro: 145.913 llamadas a `api.coord` y 2,3 MB de texto |
| El lienzo | **451 ms sólo en `closePath`**: con un único dato hay que dibujar los 18.085 parches siempre, se vean o no |
| `api.style()` | Resolver el estilo del modelo de la serie, una vez por parte y por cuadro |

**Qué se hizo.**

1. **El camino se arma una sola vez**, en grados por mil, y en cada cuadro sólo cambian el
   desplazamiento y la escala del elemento. Se puede porque el `geo` de este mapa no lleva
   proyección cartográfica y pasar de (lon, lat) a píxeles es una transformación **afín**. La
   función lo **comprueba con un tercer punto**: si algún día el mapa llevara una proyección de
   verdad, la comprobación falla y el dibujo vuelve solo al camino exacto, que es correcto aunque
   sea lento. Nunca al revés.
2. **Un dato por parte** en vez de uno por rasgo, y cada parte se saltea si **mide menos de un
   píxel** o si **quedó fuera de la pantalla**. A la provincia entera, un parche de una hectárea
   es la décima parte de un píxel: dibujarlo cuesta lo mismo que uno grande y no se ve. Al
   acercar, todo lo que entra en la vista se dibuja: **no se pierde detalle, se deja de dibujar
   lo invisible**. Los huecos de un polígono siguen en el mismo trazo que su anillo exterior
   (viven adentro de su propia parte), así que la regla de no-cero sigue descontándolos.
3. **El estilo se memoriza por cuadro**, junto con la transformación.

**Cuánto mejoró** (build de producción local, Edge sin ventana, midiendo el intervalo entre
cuadros de animación):

| Gesto | Peor cuadro antes | Peor cuadro ahora |
|---|---|---|
| Prender la capa | 1.372 ms | **386 ms** |
| Cuatro pasos de rueda | 1.295 ms | **133 ms** |
| Arrastrar el mapa | 1.325 ms (30 cuadros de más de 100 ms) | **109 ms** (9 cuadros) |
| Botón **+** | 1.301 ms | **167 ms** |

La **mediana es 17 ms** en todos los casos, la misma que sin la capa: el mapa se mueve fluido y
lo que queda es un hipo corto al terminar el gesto, no una página congelada.

**Lo que NO se hizo, a propósito:** no se tiró dato. Se evaluó subir el mínimo de hectáreas o
simplificar más la geometría, y las dos cosas borran parches que al acercar sí se ven. El límite
de 1 ha y la tolerancia de 55 m siguen siendo los que ya estaban medidos y declarados.

## 2. La división departamental, encima de las capas

**Qué pasaba.** Con una capa de área prendida -y las tres de Suelos cubren la provincia entera-
los **límites quedaban tapados** y los **nombres casi ilegibles**: el mapa dejaba de decir en qué
departamento está cada cosa, que es lo que JC viene pidiendo desde el 15-nov.

**Por qué.** Los límites y los nombres los dibuja el componente `geo` de ECharts, que va
**debajo** de todas las series. No se arregla con un color: hay que volver a dibujarlos arriba.

**Qué se hizo.** Cuando hay alguna capa de **área** prendida se agregan dos series por encima:
los 27 anillos departamentales (`lines`) y los nombres (`scatter`), colgadas del **mismo `geo`**
-se mueven con el zoom sin sincronizar nada- y `silent`, así el cartel y el clic siguen siendo
los del departamento de abajo. Al `geo` se le apagan los nombres mientras tanto, para no
tenerlos dos veces. Con capas de línea o de punto (Infraestructura) no se agrega nada: ahí la
división ya se ve.

**Dónde va escrito cada nombre lo calcula el build**, no el navegador (`rotulos_departamentos`):
el centroide del anillo más grande de cada departamento, **verificado uno por uno**; si cayera
afuera -un departamento con forma de ele- se busca en una grilla el punto interior más alejado
del borde, y si no hubiera ninguno la corrida **corta**. El **nombre** sale de la dimensión, el
mismo que usan el cartel y los cuadros: del GeoJSON sale sólo el punto.

El nombre lleva un halo de **un** píxel. Con dos, ampliando la captura, la letra de ocho píxeles
quedaba hueca.

## Cómo se verificó

Edge sin ventana contra el build de producción local:

- `medir_capa_pesada.py` para los tiempos de la tabla, y el perfilador de CPU del navegador
  (`Profiler.start` / `Profiler.stop`) para saber **dónde** se iba el tiempo antes y después.
- `probar_division.py`: con una capa de área prendida se cuentan los píxeles **claros rodeados
  de dibujo** adentro de la silueta -adentro de una capa de área no hay nada claro salvo el
  límite y el halo de los nombres-. Da 1.165, el **42%** de los 2.763 que da el mapa sin capas,
  que es lo esperable para una línea de 0,8 px que ahora se mezcla con el color de la capa en vez
  de con el fondo. Si la división quedara debajo, daría casi cero. En Infraestructura (capas de
  línea) sigue dando 12.590, sin tocar nada.
- Sin regresiones: `probar_qa20.py` (16 controles del QA del 20-nov) y `probar_tooltip.py` (los
  dos carteles) siguen en **0 fallas**. El cartel de las áreas deforestadas sigue nombrando la
  capa aunque ahora cada parche sea un dato aparte.
- Capturas ampliadas 5x sobre la capa de zonificación -la de colores más saturados- para mirar
  los nombres y los límites como se ven de verdad.
