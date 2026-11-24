/* Pivotal - EL GESTO DEL ZOOM, uno solo para todos los mapas ampliables del sitio.

   Nace del visor georreferenciado de AgroClima (`visor-georef.js`, 20-oct-2026), que es el que
   JC puso como referencia ("LOS MAPAS DE AGROCLIMA SE VEN PERFECTOS"), y vive aca porque desde
   el 24-nov-2026 lo usan DOS dibujos distintos: ese visor, que es un canvas propio, y el mapa
   de capas del tablero, que es un `geo` de ECharts (Suelos, Cuencas e Infraestructura). Pedido
   de la usuaria: "quiero que el zoom sea como el de los mapas de agroclima". Si los numeros
   estuvieran escritos en los dos lados serian dos fuentes de verdad para el mismo gesto, y el
   de ECharts ya venia distinto: su rueda da saltos de 1,4x por muesca, que al lado del visor se
   siente a tirones.

   Los cuatro numeros del gesto:
     - la RUEDA es continua: el factor sale del desplazamiento, no de un paso fijo, asi que una
       muesca de raton acerca 1,16x y el deslizamiento fino de un trackpad acompana;
     - el BOTON (+ / −) acerca y aleja 1,5x, que es un paso que se nota sin desorientar;
     - el DOBLE CLIC acerca al doble, en el punto donde se hizo;
     - para ALEJAR hay una holgura por debajo del encuadre inicial (60%): el gesto no se topa
       con una pared justo donde arranco, y el boton del encuadre vuelve al exacto.
   El tope para ACERCAR no esta aca: depende de lo que se este mirando (los pixeles reales de
   una imagen en el visor, 40x la cartografia en un mapa vectorial). */

export var PASO_DE_RUEDA = 0.0015;      // por pixel de desplazamiento
export var PASO_DE_BOTON = 1.5;
export var PASO_DE_DOBLE_CLIC = 2;
export var HOLGURA_PARA_ALEJAR = 0.6;   // veces el encuadre inicial

/* Cuanto hay que multiplicar el zoom por este movimiento de rueda. Exponencial para que el
   gesto sea simetrico: lo que acerca un tiron, lo aleja el mismo tiron al reves.

   `deltaMode` no se puede ignorar. Chrome y Edge miden en PIXELES (una muesca son ~100) pero
   Firefox mide en LINEAS (una muesca son 3) y en paginas; leyendo `deltaY` a secas, el mismo
   gesto que acerca 1,16x en Edge acercaba 1,004x en Firefox, o sea nada. Una linea se cuenta
   como 40 px -la muesca queda en 120, parecida a la de Chrome- y una pagina como el alto de la
   ventana. */
export function factorDeRueda(evento) {
  var px = evento.deltaY;
  if (evento.deltaMode === 1) { px = px * 40; }
  else if (evento.deltaMode === 2) { px = px * (window.innerHeight || 800); }
  return Math.exp(-px * PASO_DE_RUEDA);
}
