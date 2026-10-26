/* Pivotal - visor georreferenciado de las galerias del SEPA (20-oct-2026).

   Pedido de la usuaria: "quiero que extraigas los archivos kml correspondientes a esos mapas ...
   y los incorpores en el dashboard con un buen visualizador". El KML del SEPA es un
   GroundOverlay: la imagen de todo el pais con la caja (norte, sur, este, oeste) donde va. Todas
   las imagenes de un producto tienen el mismo marco, asi que la caja ubica cualquier periodo de
   la galeria (configs/dims/sepa-kml.yaml).

   Se dibuja en un canvas propio, sin librerias ni mapas base de terceros (el sitio nunca le pide
   nada a otro servidor): la imagen en su caja, recortada a la provincia, y encima los limites y
   los nombres de los departamentos del GeoJSON del sitio. La proyeccion es la del KML: grados de
   longitud y latitud lineales, con la longitud achicada por el coseno de la latitud media para
   que la provincia no salga estirada (lo mismo que hace el mapa de los tableros).

   Controles: periodo (flechas, desplegable y la grilla de miniaturas de abajo), transparencia,
   "Mostrar todo el país" (la imagen entera, con la leyenda del SEPA), zoom con la rueda, el
   pellizco, doble clic y los botones, arrastre, y "Imagen original" que abre el popup de la
   galeria. Al pasar el mouse se nombra el departamento.

   La ESCALA (26-oct-2026; JC, revision del 16-oct-2026: "LOS MAPAS DE AGROCLIMA SE VEN
   PERFECTOS ... SOLO QUE NO CONTIENEN LAS ESCALAS ... ¿Y SI SE DIVIDE LA PANTALLA, SUPONGAMOS
   UN 20% DONDE ESTE LA ESCALA QUE NO VARIE Y EN EL OTRO 80% PONEMOS EL MAPA AMPLIABLE?"): las
   clases del SEPA van ESCRITAS en el spec (`visor.leyenda`: titulo, color y texto de cada
   renglon) y se dibujan en un panel FIJO al costado del lienzo. Antes se recortaba el recuadro
   de la propia imagen; la usuaria lo pidio dibujado ("hardcodea la escala de colores... no me
   gusta que los hayas puesto como imagen"), asi que ahora es DOM: se arma una sola vez, no
   depende de que la imagen cargue y no la tocan ni el zoom ni el cambio de periodo.

   LA ESPERA (27-oct-2026, pedido de la usuaria: "los mapas demoran mucho en cargar... hace que
   aparezca una pantalla de 'cargando' mientras se espera"). El mapa del SEPA pesa 1,6 MB y
   antes el lienzo quedaba en blanco hasta que terminaba de bajar y de prepararse: medido con
   la red a 4 Mbps, ocho segundos sin nada en pantalla. Ahora:
     1. la imagen se pide al crear el visor, en paralelo con los limites, y en prioridad alta,
        para que no haga cola detras de las miniaturas de la grilla (que pasaron a "low");
     2. mientras baja se dibuja la MINIATURA desenfocada, que pesa 56 KB;
     3. apenas llega la imagen se dibuja tal cual, y recien despues -en otro cuadro, con la
        pantalla de carga a la vista- se hace lo caro: sacarle las lineas y agrandarla;
     4. la pantalla de carga tapa el lienzo y dice en que etapa esta; se va cuando el mapa esta
        listo de verdad, no cuando termino la bajada;
     5. con el visor quieto se adelanta el periodo de al lado, uno solo, para que la flecha no
        vuelva a esperar. */

var ZOOM_MAXIMO = 14;     // veces el encuadre inicial
var ALTO_LIENZO = 640;    // px; en pantallas angostas lo baja el CSS
var BANDA = 4.5;          // px de la imagen a cada lado de un limite donde se busca su linea

export default function crearVisor(nodo, elemento, opciones) {
  /* DOS cajas (27-oct-2026). `caja` es la de la imagen del SEPA entera, que es la de su KML.
     `cajaRecorte` es la del RECORTE DE LA PROVINCIA que publica el build al lado de cada
     original: los mismos pixeles, sin reescalar, pero sin el resto del pais. Pesa entre cuatro
     y veintidos veces menos y es lo que el visor dibuja; la imagen entera se baja SOLO si se
     pide "Mostrar todo el pais", que es el unico momento en que se ve algo de afuera. */
  var caja = elemento.visor.caja;
  var cajaRecorte = elemento.visor.recorte || null;
  var mapas = elemento.mapas;
  var estado = {
    i: elemento.destacado || 0, opacidad: 1, todoElPais: false,
    s: 1, tx: 0, ty: 0, encuadre: null, deptos: [], k: 1,
    imagenes: {}, minis: {}, completas: {}, limpias: {}, preparando: null, vecino: null,
    punteros: {}, arrastre: null, pellizco: null, sobre: null
  };

  // ---------- armado ----------
  nodo.hidden = false;
  nodo.innerHTML = "";
  var barra = el("div", "visor-barra");
  var anterior = boton("‹", "Período anterior (más reciente)", function () { mover(-1); });
  var periodo = document.createElement("select");
  periodo.className = "visor-periodo";
  periodo.setAttribute("aria-label", "Período");
  mapas.forEach(function (m, i) {
    var o = document.createElement("option");
    o.value = String(i);
    o.textContent = m.titulo || m.rotulo;
    periodo.appendChild(o);
  });
  periodo.addEventListener("change", function () { ir(Number(periodo.value)); });
  var siguiente = boton("›", "Período siguiente (más antiguo)", function () { mover(1); });
  var grupoPeriodo = el("div", "visor-grupo");
  grupoPeriodo.appendChild(anterior);
  grupoPeriodo.appendChild(periodo);
  grupoPeriodo.appendChild(siguiente);

  var opacidad = document.createElement("input");
  opacidad.type = "range"; opacidad.min = "0"; opacidad.max = "100"; opacidad.value = "100";
  opacidad.addEventListener("input", function () {
    estado.opacidad = Number(opacidad.value) / 100;
    dibujar();
  });
  var rotuloOpacidad = el("label", "visor-control");
  rotuloOpacidad.appendChild(document.createTextNode("Opacidad "));
  rotuloOpacidad.appendChild(opacidad);

  var todo = document.createElement("input");
  todo.type = "checkbox";
  todo.addEventListener("change", function () {
    estado.todoElPais = todo.checked;
    // Lo de afuera de la provincia solo esta en la imagen entera, que no se bajo todavia.
    if (todo.checked) { pedirCompleta(estado.i); }
    dibujar();
  });
  var rotuloTodo = el("label", "visor-control");
  rotuloTodo.appendChild(todo);
  rotuloTodo.appendChild(document.createTextNode(" Mostrar todo el país"));

  var grupoZoom = el("div", "visor-grupo");
  grupoZoom.appendChild(boton("−", "Alejar", function () { zoomAlCentro(1 / 1.5); }));
  grupoZoom.appendChild(boton("⟲", "Volver al encuadre de la provincia", encuadrar));
  grupoZoom.appendChild(boton("+", "Acercar", function () { zoomAlCentro(1.5); }));

  var original = boton("Imagen original", "Ver la imagen del SEPA tal cual se publica",
                       function () { if (opciones.original) { opciones.original(estado.i, original); } });
  original.classList.add("visor-texto");

  [grupoPeriodo, rotuloOpacidad, rotuloTodo, grupoZoom, original].forEach(function (x) {
    barra.appendChild(x);
  });

  var cuerpo = el("div", "visor-cuerpo");
  var lienzo = el("div", "visor-lienzo");
  var canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  // El panel de la escala, solo si el spec declara sus clases (`leyenda`). Es el MISMO dibujo
  // para todas las fechas del producto, asi que se arma una vez y no se vuelve a tocar.
  var leyenda = elemento.visor.leyenda || null;
  var escala = leyenda ? armarEscala(leyenda) : null;
  var tip = el("div", "visor-tip");
  tip.hidden = true;
  /* La PANTALLA DE CARGA (27-oct-2026, pedido de la usuaria: "hace que aparezca una pantalla de
     'cargando' mientras se espera"). Tapa el lienzo entero y se queda hasta que el mapa esta
     PREPARADO, no hasta que la imagen termino de bajar: lo que viene despues de la bajada
     -sacarle las lineas y agrandarla- es un cuarto de segundo mas de trabajo. */
  var cargando = el("div", "visor-cargando");
  cargando.setAttribute("role", "status");
  cargando.hidden = true;
  var giro = el("span", "visor-giro");
  giro.setAttribute("aria-hidden", "true");
  var textoCargando = el("span", "visor-cargando-texto");
  cargando.appendChild(giro);
  cargando.appendChild(textoCargando);
  /* El AVISO chico, arriba del mapa: para lo que se esta bajando mientras el mapa YA se ve
     (hoy, la imagen del pais entero). No puede ser la pantalla de carga, que tapa el lienzo:
     taparia justo el mapa que ya esta bien. */
  var aviso = el("div", "visor-aviso");
  aviso.setAttribute("role", "status");
  aviso.hidden = true;
  lienzo.appendChild(canvas);
  lienzo.appendChild(tip);
  lienzo.appendChild(cargando);
  lienzo.appendChild(aviso);
  var nota = el("p", "visor-nota");
  // El visor muestra la imagen agrandada (ver agrandar()): la nota lo dice.
  nota.textContent = elemento.visor.nota + " En el visor la imagen se ubica con una caja"
    + " ajustada a los límites que trae dibujados y se agranda sin mover ningún punto;"
    + " “Imagen original” la muestra tal cual se publica."
    + (leyenda ? " Las referencias del costado son las que publica el SEPA para este producto,"
                 + " transcriptas: no cambian con el zoom ni con el período." : "");
  nodo.appendChild(barra);
  cuerpo.appendChild(lienzo);
  if (escala) { cuerpo.appendChild(escala); }
  nodo.appendChild(cuerpo);
  nodo.appendChild(nota);
  var g = canvas.getContext("2d");

  // ---------- geometria ----------
  /* Coordenadas del "mundo": x = longitud * k, y = -latitud. La pantalla es mundo * s + t. */
  function mundo(lon, lat) { return [lon * estado.k, -lat]; }
  function pantalla(lon, lat) {
    var m = mundo(lon, lat);
    return [m[0] * estado.s + estado.tx, m[1] * estado.s + estado.ty];
  }

  function cargarGeo() {
    return fetch(elemento.visor.geojson).then(function (r) { return r.json(); }).then(function (geo) {
      var lats = [];
      geo.features.forEach(function (f) {
        var poligonos = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
        var anillos = [];
        var area = 0, cx = 0, cy = 0;
        poligonos.forEach(function (p) {
          p.forEach(function (anillo, j) {
            anillos.push(anillo);
            anillo.forEach(function (c) { lats.push(c[1]); });
            // centroide del anillo exterior (formula del area con signo)
            if (j === 0) {
              for (var n = 0, m = anillo.length - 1; n < anillo.length; m = n++) {
                var a = anillo[m][0] * anillo[n][1] - anillo[n][0] * anillo[m][1];
                area += a;
                cx += (anillo[m][0] + anillo[n][0]) * a;
                cy += (anillo[m][1] + anillo[n][1]) * a;
              }
            }
          });
        });
        estado.deptos.push({
          nombre: f.properties.nombre, anillos: anillos,
          centro: area ? [cx / (3 * area), cy / (3 * area)] : anillos[0][0]
        });
      });
      var latMedia = (Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2;
      estado.k = Math.cos(latMedia * Math.PI / 180);
      var xs = [], ys = [];
      estado.deptos.forEach(function (d) {
        d.anillos.forEach(function (a) {
          a.forEach(function (c) { var m = mundo(c[0], c[1]); xs.push(m[0]); ys.push(m[1]); });
        });
      });
      estado.encuadre = [Math.min.apply(null, xs), Math.min.apply(null, ys),
                         Math.max.apply(null, xs), Math.max.apply(null, ys)];
    });
  }

  function medir() {
    var ancho = lienzo.clientWidth, alto = lienzo.clientHeight || ALTO_LIENZO;
    var r = window.devicePixelRatio || 1;
    canvas.width = Math.round(ancho * r);
    canvas.height = Math.round(alto * r);
    canvas.style.width = ancho + "px";
    canvas.style.height = alto + "px";
    return [ancho, alto];
  }

  var escalaEncuadre = 1;
  function encuadrar() {
    if (!estado.encuadre) { return; }
    var tam = medir();
    var e = estado.encuadre, aire = 24;
    var s = Math.min((tam[0] - 2 * aire) / (e[2] - e[0]), (tam[1] - 2 * aire) / (e[3] - e[1]));
    estado.s = escalaEncuadre = s;
    estado.tx = (tam[0] - (e[2] - e[0]) * s) / 2 - e[0] * s;
    estado.ty = (tam[1] - (e[3] - e[1]) * s) / 2 - e[1] * s;
    dibujar();
  }

  function caminoProvincia() {
    var camino = new Path2D();
    estado.deptos.forEach(function (d) {
      d.anillos.forEach(function (a) {
        a.forEach(function (c, n) {
          var p = pantalla(c[0], c[1]);
          if (n) { camino.lineTo(p[0], p[1]); } else { camino.moveTo(p[0], p[1]); }
        });
        camino.closePath();
      });
    });
    return camino;
  }

  // ---------- dibujo ----------
  function color(nombre, defecto) {
    var v = getComputedStyle(nodo).getPropertyValue(nombre).trim();
    return v || defecto;
  }

  function dibujar() {
    if (!estado.encuadre) { return; }
    var r = window.devicePixelRatio || 1;
    g.setTransform(r, 0, 0, r, 0, 0);
    var ancho = canvas.width / r, alto = canvas.height / r;
    g.clearRect(0, 0, ancho, alto);
    g.fillStyle = color("--fondo-cuadro", "#fbf4ec");
    g.fillRect(0, 0, ancho, alto);
    var provincia = caminoProvincia();
    /* El mapa se dibuja con LO MEJOR QUE HAY en este momento, y nunca se espera a nada
       (27-oct-2026). Son tres etapas y cada una reemplaza a la anterior sin que el lienzo
       quede en blanco: la miniatura borrosa (56 KB, llega en menos de medio segundo), la
       imagen del SEPA tal cual (1,6 MB) y la imagen limpia y agrandada, que es la buena. */
    var img = estado.imagenes[estado.i];
    var hayImagen = !!(img && img.complete && img.naturalWidth);
    var limpia = hayImagen ? estado.limpias[estado.i] : null;
    var previa = estado.minis[estado.i];
    var hayPrevia = !hayImagen && previa && previa.complete && previa.naturalWidth;
    if (hayImagen || hayPrevia) {
      // Cada imagen con SU caja: la que se dibuja adentro de la provincia puede ser el recorte
      // y la miniatura es siempre del pais entero.
      var cajaImg = cajaDelPeriodo(estado.i);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.globalAlpha = estado.opacidad;
      // Fuera de la provincia (solo con "Mostrar todo el pais", que es donde se ve la leyenda)
      // va la imagen ENTERA, que es la unica que tiene algo afuera.
      var completa = estado.completas[estado.i];
      if (estado.todoElPais && completa && completa.complete && completa.naturalWidth) {
        var ca = pantalla(caja.oeste, caja.norte), cb = pantalla(caja.este, caja.sur);
        g.save();
        var afuera = new Path2D();
        afuera.rect(0, 0, ancho, alto);
        afuera.addPath(provincia);
        g.clip(afuera, "evenodd");
        rotarComoElKml(ca, cb, caja);
        g.drawImage(completa, ca[0], ca[1], cb[0] - ca[0], cb[1] - ca[1]);
        g.restore();
      }
      // Adentro, la imagen agrandada sin pixelado (ver agrandar()).
      g.save();
      g.clip(provincia);
      if (limpia) {
        var a = pantalla(cajaImg.oeste, cajaImg.norte), b = pantalla(cajaImg.este, cajaImg.sur);
        rotarComoElKml(a, b, cajaImg);
        var r0 = limpia.recorte, W = img.naturalWidth, H = img.naturalHeight;
        g.drawImage(limpia.lienzo,
                    a[0] + (b[0] - a[0]) * r0.x / W, a[1] + (b[1] - a[1]) * r0.y / H,
                    (b[0] - a[0]) * r0.w / W, (b[1] - a[1]) * r0.h / H);
      } else if (hayImagen) {
        // Bajo pero todavia no se preparo: va tal cual, con las lineas que trae dibujadas.
        var ia = pantalla(cajaImg.oeste, cajaImg.norte), ib = pantalla(cajaImg.este, cajaImg.sur);
        rotarComoElKml(ia, ib, cajaImg);
        g.drawImage(img, ia[0], ia[1], ib[0] - ia[0], ib[1] - ia[1]);
      } else {
        // La miniatura, DESENFOCADA: se lee como "esto todavia no es el mapa" y no como un
        // mapa de mala calidad. Es del pais entero, asi que va con la caja entera.
        var ma = pantalla(caja.oeste, caja.norte), mb = pantalla(caja.este, caja.sur);
        rotarComoElKml(ma, mb, caja);
        g.filter = "blur(3px)";
        g.drawImage(previa, ma[0], ma[1], mb[0] - ma[0], mb[1] - ma[1]);
      }
      g.restore();
      g.globalAlpha = 1;
    }
    // Limites de los departamentos y de la provincia, FINOS (pedido de la usuaria del
    // 21-oct-2026: "el borde de la provincia y departamentos es demasiado grueso"). Los de la
    // imagen del SEPA ya no se ven: sinLineas() los saca antes de agrandar.
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = color("--texto", "#2b1c18");
    g.globalAlpha = 1;
    var grosor = 1;
    estado.deptos.forEach(function (d) {
      var c = new Path2D();
      d.anillos.forEach(function (an) {
        an.forEach(function (p, n) {
          var q = pantalla(p[0], p[1]);
          if (n) { c.lineTo(q[0], q[1]); } else { c.moveTo(q[0], q[1]); }
        });
        c.closePath();
      });
      g.lineWidth = d === estado.sobre ? 2.2 : grosor;
      g.stroke(c);
    });
    g.lineWidth = 1.6;
    g.stroke(provincia);
    // Nombres: solo cuando hay lugar (mas cerca que el encuadre inicial o en un lienzo grande)
    if (estado.s >= escalaEncuadre * 0.95 && ancho > 420) {
      g.font = "600 " + Math.min(14, 9 + (estado.s / escalaEncuadre)) + "px " + color("--sans", "sans-serif");
      g.textAlign = "center";
      g.textBaseline = "middle";
      /* Un nombre que se encimaria con otro ya escrito no se escribe: encimados no se lee
         ninguno. Al acercarse hay lugar y aparecen. */
      var ocupados = [];
      estado.deptos.forEach(function (d) {
        var p = pantalla(d.centro[0], d.centro[1]);
        if (p[0] < 0 || p[1] < 0 || p[0] > ancho || p[1] > alto) { return; }
        var texto = d.nombre.toUpperCase();
        var medio = g.measureText(texto).width / 2 + 3, alto2 = 9;
        var rect = [p[0] - medio, p[1] - alto2, p[0] + medio, p[1] + alto2];
        if (ocupados.some(function (o) {
          return rect[0] < o[2] && rect[2] > o[0] && rect[1] < o[3] && rect[3] > o[1];
        })) { return; }
        ocupados.push(rect);
        g.lineWidth = 3;
        g.strokeStyle = "rgba(255,255,255,.85)";
        g.strokeText(texto, p[0], p[1]);
        g.fillStyle = color("--texto", "#2b1c18");
        g.fillText(texto, p[0], p[1]);
      });
    }
    canvas.setAttribute("aria-label", (mapas[estado.i].titulo || mapas[estado.i].rotulo)
      + " - Santiago del Estero");
  }

  /* La escala, dibujada de las clases que declara el spec: el titulo del recuadro del SEPA y
     un renglon por clase (muestra de color + texto), con el encabezado de grupo cuando el SEPA
     agrupa ("Disminución" / "Aumento"). La muestra lleva borde porque la primera clase de la
     evapotranspiracion es BLANCA ("Sin datos") y sin borde no se veria. */
  function armarEscala(definicion) {
    var caja = el("aside", "visor-escala");
    caja.setAttribute("aria-label", "Escala de referencia del mapa");
    if (definicion.titulo) {
      var titulo = el("p", "visor-escala-titulo");
      titulo.textContent = definicion.titulo;
      caja.appendChild(titulo);
    }
    var lista = el("ul", "visor-escala-clases");
    var grupo = null;
    definicion.clases.forEach(function (clase) {
      if (clase.grupo && clase.grupo !== grupo) {
        var encabezado = el("li", "visor-escala-grupo");
        encabezado.textContent = clase.grupo;
        lista.appendChild(encabezado);
      }
      grupo = clase.grupo || null;
      var item = el("li", "visor-escala-clase");
      var muestra = el("span", "visor-escala-muestra");
      muestra.style.background = clase.color;
      var texto = el("span", "visor-escala-texto");
      texto.textContent = clase.texto;
      item.appendChild(muestra);
      item.appendChild(texto);
      lista.appendChild(item);
    });
    caja.appendChild(lista);
    var pie = el("p", "visor-escala-pie");
    pie.textContent = "Escala del SEPA para este producto";
    caja.appendChild(pie);
    return caja;
  }

  // La rotacion del KML (en grados, antihoraria) gira la imagen sobre el centro de SU caja, que
  // no es la misma para la imagen entera y para el recorte de la provincia.
  function rotarComoElKml(a, b, suCaja) {
    if (!suCaja.rotacion) { return; }
    var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    g.translate(cx, cy);
    g.rotate(-suCaja.rotacion * Math.PI / 180);
    g.translate(-cx, -cy);
  }

  /* ---------- la imagen agrandada (21-oct-2026) ----------
     Pedidos de la usuaria: "no quiero que se vean tan pixelados" y "tampoco quiero que le
     cambies de lugar los puntos que marcan sectores en el mapa original". La imagen del SEPA es
     la del pais entero: la provincia ocupa 230 a 400 px de ancho y al agrandarla se ven los
     pixeles. Se agranda el recorte de la provincia con un contorno suave (agrandarPixeles): cada
     pixel queda en SU lugar con SU color y lo unico que cambia es que el escalon entre dos
     colores se vuelve curva; un punto suelto sigue siendo el mismo punto. Antes se sacan las
     lineas de limites que trae la imagen (sinLineas), para que se vean solo las del sitio, finas.
     Despues el navegador lo dibuja con suavizado.
     La imagen original sigue disponible tal cual en "Imagen original" y en las miniaturas. */
  function agrandar(img, suCaja) {
    var W = img.naturalWidth, H = img.naturalHeight;
    var A = mundo(suCaja.oeste, suCaja.norte), B = mundo(suCaja.este, suCaja.sur);
    var C = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    var giro = (suCaja.rotacion || 0) * Math.PI / 180;
    var cos = Math.cos(giro), sin = Math.sin(giro);
    // Punto del mundo -> pixel de la imagen (deshaciendo la rotacion con que se dibuja).
    function aImagen(m) {
      var dx = m[0] - C[0], dy = m[1] - C[1];
      var x = cos * dx - sin * dy + C[0], y = sin * dx + cos * dy + C[1];
      return [(x - A[0]) / (B[0] - A[0]) * W, (y - A[1]) / (B[1] - A[1]) * H];
    }
    var e = estado.encuadre, xs = [], ys = [];
    [[e[0], e[1]], [e[2], e[1]], [e[0], e[3]], [e[2], e[3]]].forEach(function (m) {
      var p = aImagen(m); xs.push(p[0]); ys.push(p[1]);
    });
    var x0 = Math.max(0, Math.floor(Math.min.apply(null, xs)) - 8);
    var y0 = Math.max(0, Math.floor(Math.min.apply(null, ys)) - 8);
    var x1 = Math.min(W, Math.ceil(Math.max.apply(null, xs)) + 8);
    var y1 = Math.min(H, Math.ceil(Math.max.apply(null, ys)) + 8);
    var w = x1 - x0, h = y1 - y0;

    var fuente = document.createElement("canvas");
    fuente.width = w; fuente.height = h;
    var gf = fuente.getContext("2d", { willReadFrequently: true });
    gf.drawImage(img, -x0, -y0);
    var px = new Uint32Array(gf.getImageData(0, 0, w, h).data.buffer.slice(0));

    // Tres mascaras del tamaño del recorte con los limites del GeoJSON: la banda donde se busca
    // la linea del SEPA, una banda ancha (lo que queda afuera es "lejos de todo limite") y la
    // provincia rellena.
    function mascara(ancho) {
      var lienzoM = document.createElement("canvas");
      lienzoM.width = w; lienzoM.height = h;
      var gm = lienzoM.getContext("2d", { willReadFrequently: true });
      gm.beginPath();
      estado.deptos.forEach(function (d) {
        d.anillos.forEach(function (an) {
          an.forEach(function (c, n) {
            var p = aImagen(mundo(c[0], c[1]));
            if (n) { gm.lineTo(p[0] - x0, p[1] - y0); } else { gm.moveTo(p[0] - x0, p[1] - y0); }
          });
          gm.closePath();
        });
      });
      if (ancho) {
        gm.lineWidth = ancho;
        gm.lineJoin = "round";
        gm.stroke();
      } else {
        gm.fill();
      }
      return gm.getImageData(0, 0, w, h).data;
    }
    px = sinLineas(px, { banda: mascara(2 * BANDA), ancha: mascara(6 * BANDA),
                         provincia: mascara(0) }, w, h);
    var grande = agrandarPixeles(px, w, h);
    var lienzo = document.createElement("canvas");
    lienzo.width = grande.ancho; lienzo.height = grande.alto;
    var gl = lienzo.getContext("2d");
    var salida = gl.createImageData(grande.ancho, grande.alto);
    new Uint32Array(salida.data.buffer).set(grande.pixeles);
    gl.putImageData(salida, 0, 0);
    return { lienzo: lienzo, recorte: { x: x0, y: y0, w: w, h: h } };
  }

  // ---------- carga del periodo ----------
  /* La pantalla de carga. Con `texto` vacio se va; `falla` le saca el girador y deja el
     motivo escrito, porque ahi ya no hay nada que esperar. */
  function mostrarCargando(texto, falla) {
    textoCargando.textContent = texto || "";
    cargando.classList.toggle("visor-falla", !!falla);
    cargando.hidden = !texto;
  }

  function avisar(texto) {
    aviso.textContent = texto || "";
    aviso.hidden = !texto;
  }

  function capaLista(i) { return !!estado.limpias[i]; }

  /* De donde sale el dibujo de la provincia para el periodo i: el recorte si el build lo
     publico, y si no la imagen entera, que es como funcionaba antes. */
  function fuenteDelPeriodo(i) {
    return (cajaRecorte && mapas[i].recorte) ? mapas[i].recorte : mapas[i].grande;
  }

  function cajaDelPeriodo(i) {
    return (cajaRecorte && mapas[i].recorte) ? cajaRecorte : caja;
  }

  /* La imagen grande del periodo. `prioridad` es la del navegador: la que se esta mirando va
     en "high" para que no haga cola detras de las decenas de miniaturas de la grilla, que van
     en "low" (galeria.js). */
  function pedirImagen(i, prioridad) {
    var img = estado.imagenes[i];
    if (img) { return img; }
    img = new Image();
    img.decoding = "async";
    img.fetchPriority = prioridad || "auto";
    img.onload = function () {
      // Sin los limites todavia no hay nada que dibujar: lo retoma ir(), al que llama cargarGeo.
      if (estado.i !== i || !estado.encuadre) { return; }
      mostrarCargando("Preparando el mapa…");
      dibujar();
      prepararCapa(i);
    };
    img.onerror = function () {
      if (estado.i === i) { mostrarCargando("No se pudo cargar la imagen del SEPA.", true); }
    };
    img.src = fuenteDelPeriodo(i);
    estado.imagenes[i] = img;
    return img;
  }

  /* La imagen ENTERA del pais. Solo hace falta para "Mostrar todo el pais": es la pesada y por
     eso no se baja al abrir. Mientras llega, el mapa de la provincia sigue a la vista y el
     aviso de la barra dice que falta. */
  function pedirCompleta(i) {
    if (!cajaRecorte || !mapas[i].recorte) { return estado.imagenes[i]; }
    var completa = estado.completas[i];
    if (completa) { return completa; }
    completa = new Image();
    completa.decoding = "async";
    avisar("Cargando el país entero…");
    completa.onload = function () {
      if (estado.i === i && estado.todoElPais) { avisar(""); dibujar(); }
    };
    completa.onerror = function () {
      if (estado.i === i) { avisar("No se pudo cargar la imagen del país."); }
    };
    completa.src = mapas[i].grande;
    estado.completas[i] = completa;
    return completa;
  }

  /* La MINIATURA del periodo, que es la vista previa mientras baja la grande: 56 KB contra
     1,6 MB. Es el mismo archivo que dibuja la grilla de abajo, asi que el navegador la pide
     una sola vez. */
  function pedirMini(i) {
    var mini = estado.minis[i];
    if (mini || !mapas[i].mini) { return mini || null; }
    mini = new Image();
    mini.decoding = "async";
    mini.fetchPriority = "high";
    mini.onload = function () { if (estado.i === i && !capaLista(i)) { dibujar(); } };
    mini.src = mapas[i].mini;
    estado.minis[i] = mini;
    return mini;
  }

  /* La capa limpia y agrandada, que es lo CARO del visor: sacarle a la imagen las lineas de
     limites que trae dibujadas y agrandarla pixel por pixel son unos 250 ms de hilo principal.
     Por eso no se calcula dentro de dibujar(): el visor pinta primero lo que ya tiene y la
     deja para dos cuadros despues, que es lo que hace falta para que la pantalla de carga
     llegue a verse. Sin esa espera el navegador se congela con el lienzo todavia en blanco. */
  function prepararCapa(i) {
    if (capaLista(i) || estado.preparando === i || !estado.encuadre) { return; }
    var img = estado.imagenes[i];
    if (!img || !img.complete || !img.naturalWidth) { return; }
    estado.preparando = i;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        estado.preparando = null;
        if (!capaLista(i)) { estado.limpias[i] = agrandar(img, cajaDelPeriodo(i)); }
        if (estado.i === i) { mostrarCargando(""); dibujar(); precargarVecino(i); }
      });
    });
  }

  /* El periodo de al lado se adelanta para que la flecha no vuelva a esperar, pero SOLO cuando
     el que se esta mirando ya esta dibujado y pasaron dos segundos sin que nadie toque nada.
     La primera version lo pedia al entrar a un periodo, antes de que su propia imagen hubiera
     terminado de bajar: las dos se repartian el ancho de banda y el mapa que el usuario tenia
     delante pasó de tardar cinco segundos a tardar ocho. Un adelanto que le compite a lo que
     se esta mirando no es un adelanto. */
  function precargarVecino(i) {
    if (estado.vecino) { clearTimeout(estado.vecino); }
    estado.vecino = setTimeout(function () {
      if (estado.i !== i || !capaLista(i)) { return; }
      var j = i + 1 < mapas.length ? i + 1 : i - 1;
      if (j >= 0 && !estado.imagenes[j]) { pedirImagen(j, "low"); }
    }, 2000);
  }

  function ir(i) {
    if (i < 0 || i >= mapas.length) { return; }
    estado.i = i;
    periodo.value = String(i);
    anterior.disabled = i === 0;
    siguiente.disabled = i === mapas.length - 1;
    if (opciones.alElegir) { opciones.alElegir(i); }
    var img = pedirImagen(i, "high");
    avisar("");
    if (estado.todoElPais) { pedirCompleta(i); }
    var listo = img.complete && img.naturalWidth;
    if (!listo) { pedirMini(i); }
    mostrarCargando(capaLista(i) ? ""
                    : listo ? "Preparando el mapa…" : "Cargando el mapa del SEPA…");
    dibujar();
    if (listo) { prepararCapa(i); }
    if (capaLista(i)) { precargarVecino(i); }
  }

  function mover(paso) { ir(estado.i + paso); }

  // ---------- zoom y arrastre ----------
  function zoomEn(px, py, factor) {
    var nueva = Math.min(escalaEncuadre * ZOOM_MAXIMO, Math.max(escalaEncuadre * 0.6, estado.s * factor));
    var f = nueva / estado.s;
    estado.tx = px - (px - estado.tx) * f;
    estado.ty = py - (py - estado.ty) * f;
    estado.s = nueva;
    dibujar();
  }

  function zoomAlCentro(factor) {
    zoomEn(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
  }

  function local(evento) {
    var r = canvas.getBoundingClientRect();
    return [evento.clientX - r.left, evento.clientY - r.top];
  }

  canvas.addEventListener("wheel", function (evento) {
    evento.preventDefault();
    var p = local(evento);
    zoomEn(p[0], p[1], Math.exp(-evento.deltaY * 0.0015));
  }, { passive: false });
  canvas.addEventListener("dblclick", function (evento) {
    var p = local(evento);
    zoomEn(p[0], p[1], 2);
  });
  canvas.addEventListener("pointerdown", function (evento) {
    estado.punteros[evento.pointerId] = local(evento);
    canvas.setPointerCapture(evento.pointerId);
    var ids = Object.keys(estado.punteros);
    if (ids.length === 2) {
      var a = estado.punteros[ids[0]], b = estado.punteros[ids[1]];
      estado.pellizco = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
      estado.arrastre = null;
    } else {
      var p = local(evento);
      estado.arrastre = { x: p[0], y: p[1] };
      lienzo.classList.add("arrastrando");
    }
  });
  canvas.addEventListener("pointermove", function (evento) {
    var p = local(evento);
    if (estado.punteros[evento.pointerId]) {
      estado.punteros[evento.pointerId] = p;
      var ids = Object.keys(estado.punteros);
      if (estado.pellizco && ids.length === 2) {
        var a = estado.punteros[ids[0]], b = estado.punteros[ids[1]];
        var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (estado.pellizco.d > 0) {
          zoomEn((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / estado.pellizco.d);
        }
        estado.pellizco.d = d;
        return;
      }
      if (estado.arrastre) {
        estado.tx += p[0] - estado.arrastre.x;
        estado.ty += p[1] - estado.arrastre.y;
        estado.arrastre = { x: p[0], y: p[1] };
        tip.hidden = true;
        dibujar();
        return;
      }
    }
    sobreDepartamento(p);
  });
  function soltar(evento) {
    delete estado.punteros[evento.pointerId];
    if (Object.keys(estado.punteros).length < 2) { estado.pellizco = null; }
    estado.arrastre = null;
    lienzo.classList.remove("arrastrando");
  }
  canvas.addEventListener("pointerup", soltar);
  canvas.addEventListener("pointercancel", soltar);
  canvas.addEventListener("pointerleave", function () {
    tip.hidden = true;
    if (estado.sobre) { estado.sobre = null; dibujar(); }
  });

  // ---------- departamento bajo el puntero ----------
  function dentro(lon, lat, anillo) {
    var adentro = false;
    for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      var xi = anillo[i][0], yi = anillo[i][1], xj = anillo[j][0], yj = anillo[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        adentro = !adentro;
      }
    }
    return adentro;
  }

  function sobreDepartamento(p) {
    var lon = ((p[0] - estado.tx) / estado.s) / estado.k;
    var lat = -((p[1] - estado.ty) / estado.s);
    var hallado = null;
    estado.deptos.forEach(function (d) {
      if (hallado) { return; }
      var veces = 0;
      d.anillos.forEach(function (a) { if (dentro(lon, lat, a)) { veces++; } });
      if (veces % 2 === 1) { hallado = d; }
    });
    if (hallado !== estado.sobre) { estado.sobre = hallado; dibujar(); }
    if (!hallado) { tip.hidden = true; return; }
    tip.textContent = hallado.nombre;
    tip.style.left = (p[0] + 14) + "px";
    tip.style.top = (p[1] + 14) + "px";
    tip.hidden = false;
  }

  // ---------- auxiliares ----------
  function el(etiqueta, clase) {
    var x = document.createElement(etiqueta);
    x.className = clase;
    return x;
  }

  function boton(texto, rotulo, accion) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "visor-boton";
    b.textContent = texto;
    b.title = rotulo;
    b.setAttribute("aria-label", rotulo);
    b.addEventListener("click", accion);
    return b;
  }

  var pendiente = null;
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (pendiente) { clearTimeout(pendiente); }
      pendiente = setTimeout(function () {
        if (!estado.encuadre) { return; }
        var antes = escalaEncuadre;
        var centroX = (canvas.clientWidth / 2 - estado.tx) / estado.s;
        var centroY = (canvas.clientHeight / 2 - estado.ty) / estado.s;
        var relativo = estado.s / antes;
        encuadrar();
        estado.s = escalaEncuadre * relativo;
        estado.tx = canvas.clientWidth / 2 - centroX * estado.s;
        estado.ty = canvas.clientHeight / 2 - centroY * estado.s;
        dibujar();
      }, 120);
    }).observe(lienzo);
  }

  /* La imagen del periodo de arranque se pide YA, en paralelo con los limites, y no al final
     de la cadena (script -> datos -> limites -> imagen): es la pieza mas pesada de la pagina y
     antes salia a pedirla casi un segundo tarde. La miniatura va con ella para tener algo que
     mostrar enseguida. */
  mostrarCargando("Cargando el mapa del SEPA…");
  pedirImagen(estado.i, "high");
  pedirMini(estado.i);
  cargarGeo().then(function () {
    encuadrar();
    ir(estado.i);
  }, function () {
    mostrarCargando("No se pudieron cargar los límites de los departamentos.", true);
  });

  return {
    ir: function (i) {
      ir(i);
      nodo.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
}

/* El trabajo pixel por pixel de agrandar(), sin canvas (asi se puede probar fuera del
   navegador). px: Uint32Array RGBA del recorte. Devuelve el recorte agrandado F veces (F entre
   4 y 8, para que salga de unos 1.600 px de ancho).

   CONTORNO SUAVE (21-oct-2026, "puedes hacer que se vean menos pixelados?"): cada pixel nuevo
   mira los 4 pixeles de la imagen que lo rodean y toma el color (agrupado, por el ruido del JPG)
   que mas pesa con pesos bilineales; el color exacto es el del pixel de ese grupo mas cercano.
   El centro de cada pixel de la imagen pesa casi entero, asi que conserva SU color: ningun punto
   se mueve ni desaparece. Lo que cambia es el espacio ENTRE pixeles: el borde entre dos colores
   pasa a ser una curva en vez de un escalon, y no se mezclan colores (no aparecen tonos que no
   esten en la imagen). Reemplaza a Scale2x, que en los mapas con mucho moteado (ET, NDVI)
   inventaba formas de gusano. */
export function agrandarPixeles(px, w, h) {
  var F = Math.max(4, Math.min(8, Math.round(1600 / w)));
  var ow = w * F, oh = h * F, out = new Uint32Array(ow * oh);
  var claves = [0, 0, 0, 0], pesos = [0, 0, 0, 0], colores = [0, 0, 0, 0], mejor = [0, 0, 0, 0];
  for (var oy = 0; oy < oh; oy++) {
    var v = (oy + 0.5) / F - 0.5, y0 = Math.floor(v), fy = v - y0;
    for (var ox = 0; ox < ow; ox++) {
      var u = (ox + 0.5) / F - 0.5, x0 = Math.floor(u), fx = u - x0, n = 0;
      for (var q = 0; q < 4; q++) {
        var sx = Math.min(w - 1, Math.max(0, x0 + (q & 1)));
        var sy = Math.min(h - 1, Math.max(0, y0 + (q >> 1)));
        var peso = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
        var c = px[sy * w + sx], k = grupo(c), t = 0;
        while (t < n && claves[t] !== k) { t++; }
        if (t === n) { claves[t] = k; pesos[t] = 0; mejor[t] = -1; n++; }
        pesos[t] += peso;
        if (peso > mejor[t]) { mejor[t] = peso; colores[t] = c; }
      }
      var gana = 0;
      for (var z = 1; z < n; z++) { if (pesos[z] > pesos[gana]) { gana = z; } }
      out[oy * ow + ox] = (colores[gana] | 0xff000000) >>> 0;
    }
  }
  return { pixeles: out, ancho: ow, alto: oh };
}

/* Saca las lineas de limites que trae dibujadas la imagen del SEPA, sin manchar (21-oct-2026).
   px: Uint32Array RGBA del recorte; mascaras: {banda, ancha, provincia}, el RGBA de un canvas
   del tamaño del recorte cada una (alfa > 0 = adentro). Devuelve una copia.
   1. Solo se mira la BANDA de pocos px alrededor de cada limite del GeoJSON (la caja ajustada
      deja la linea del SEPA ahi), y en ella solo lo que es linea: gris o negro; un color de
      linea de ESA imagen (en evapotranspiracion la linea es semitransparente y sale verde
      oscuro): los que dentro de la provincia aparecen muchisimo mas pegados a los limites que
      lejos; o un color que lejos de los limites casi no existe (la mezcla que el JPG hace entre
      la linea negra y lo que cruza: amarillo + negro = oliva). Un punto de color de la escala
      pegado al limite NO es nada de eso y queda.
   2. Cada pixel de linea toma el color del pixel limpio MAS CERCANO (los dos lados de la linea
      avanzan a la vez hasta encontrarse en el medio). Un intento anterior rellenaba con el color
      mas repetido de los vecinos, pasada tras pasada, y arrastraba colores a lo largo de la
      linea: quedaban estrias y manchas. Asi no: cada lado llega solo hasta la mitad. */
export function sinLineas(px, mascaras, w, h) {
  var N = w * h, i, k;
  var banda = new Uint8Array(N);
  var cerca = new Uint32Array(4096), lejos = new Uint32Array(4096), nCerca = 0, nLejos = 0;
  for (i = 0; i < N; i++) {
    banda[i] = mascaras.banda[i * 4 + 3] ? 1 : 0;
    if (!mascaras.provincia[i * 4 + 3]) { continue; }
    k = grupo(px[i]);
    if (banda[i]) { cerca[k]++; nCerca++; } else if (!mascaras.ancha[i * 4 + 3]) { lejos[k]++; nLejos++; }
  }
  nLejos = Math.max(1, nLejos);
  var deLinea = new Uint8Array(4096);
  for (k = 0; k < 4096; k++) {
    if (cerca[k] >= 20 && cerca[k] / nCerca >= 8 * (lejos[k] + 1) / nLejos) { deLinea[k] = 1; }
  }
  var raro = Math.max(1, 0.0005 * nLejos);
  var limpio = px.slice(0), hecho = new Uint8Array(N), cola = new Int32Array(N), fin = 0;
  for (i = 0; i < N; i++) {
    var c = px[i], r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    k = grupo(c);
    var linea = banda[i] && (max <= 50 || (max - min <= 45 && max <= 180) || deLinea[k] === 1 ||
                             lejos[k] < raro);
    if (!linea) { hecho[i] = 1; }
  }
  // Los limpios que tocan una linea arrancan la cola; se avanza en anillos (4 vecinos).
  for (i = 0; i < N; i++) {
    if (!hecho[i]) { continue; }
    var x = i % w, y = (i - x) / w;
    if ((x > 0 && !hecho[i - 1]) || (x < w - 1 && !hecho[i + 1]) ||
        (y > 0 && !hecho[i - w]) || (y < h - 1 && !hecho[i + w])) { cola[fin++] = i; }
  }
  for (var ini = 0; ini < fin; ini++) {
    var j = cola[ini], jx = j % w, jy = (j - jx) / w;
    var vecinos = [jx > 0 ? j - 1 : -1, jx < w - 1 ? j + 1 : -1, jy > 0 ? j - w : -1,
                   jy < h - 1 ? j + w : -1];
    for (var v = 0; v < 4; v++) {
      var n = vecinos[v];
      if (n < 0 || hecho[n]) { continue; }
      hecho[n] = 1;
      limpio[n] = limpio[j];
      cola[fin++] = n;
    }
  }
  return limpio;
}

// Colores que el JPG separo por ruido cuentan como el mismo (16 niveles por canal).
function grupo(v) {
  return ((v & 255) >> 4) | ((((v >> 8) & 255) >> 4) << 4) | ((((v >> 16) & 255) >> 4) << 8);
}
