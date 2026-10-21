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
   galeria. Al pasar el mouse se nombra el departamento. */

var ZOOM_MAXIMO = 14;     // veces el encuadre inicial
var ALTO_LIENZO = 640;    // px; en pantallas angostas lo baja el CSS
var BANDA = 4;            // px de la imagen del SEPA a cada lado de un limite (ver limpiar)

export default function crearVisor(nodo, elemento, opciones) {
  var caja = elemento.visor.caja;
  var mapas = elemento.mapas;
  var estado = {
    i: elemento.destacado || 0, opacidad: 1, todoElPais: false,
    s: 1, tx: 0, ty: 0, encuadre: null, deptos: [], k: 1,
    imagenes: {}, limpias: {}, punteros: {}, arrastre: null, pellizco: null, sobre: null
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

  var lienzo = el("div", "visor-lienzo");
  var canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  var tip = el("div", "visor-tip");
  tip.hidden = true;
  var cargando = el("div", "visor-cargando");
  lienzo.appendChild(canvas);
  lienzo.appendChild(tip);
  lienzo.appendChild(cargando);
  var nota = el("p", "visor-nota");
  // El visor muestra la imagen limpia (ver limpiar()): la nota lo dice.
  nota.textContent = elemento.visor.nota + " En el visor la imagen se ubica con una caja"
    + " ajustada a los límites que trae dibujados, esos límites se reemplazan por los del sitio y"
    + " se agranda sin mover ningún punto; “Imagen original” la muestra tal cual se publica.";
  nodo.appendChild(barra);
  nodo.appendChild(lienzo);
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
    var img = estado.imagenes[estado.i];
    if (img && img.complete && img.naturalWidth) {
      var a = pantalla(caja.oeste, caja.norte), b = pantalla(caja.este, caja.sur);
      var limpia = estado.limpias[estado.i] || (estado.limpias[estado.i] = limpiar(img));
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.globalAlpha = estado.opacidad;
      // Fuera de la provincia (solo con "Mostrar todo el pais", que es donde se ve la leyenda)
      // va la imagen del SEPA tal cual.
      if (estado.todoElPais) {
        g.save();
        var afuera = new Path2D();
        afuera.rect(0, 0, ancho, alto);
        afuera.addPath(provincia);
        g.clip(afuera, "evenodd");
        rotarComoElKml(a, b);
        g.drawImage(img, a[0], a[1], b[0] - a[0], b[1] - a[1]);
        g.restore();
      }
      // Adentro, la version limpia: sin las lineas de limites que trae la imagen y con los
      // bordes de cada color suavizados (ver limpiar()).
      g.save();
      g.clip(provincia);
      rotarComoElKml(a, b);
      var r0 = limpia.recorte, W = img.naturalWidth, H = img.naturalHeight;
      g.drawImage(limpia.lienzo,
                  a[0] + (b[0] - a[0]) * r0.x / W, a[1] + (b[1] - a[1]) * r0.y / H,
                  (b[0] - a[0]) * r0.w / W, (b[1] - a[1]) * r0.h / H);
      g.restore();
      g.globalAlpha = 1;
    }
    // Limites de los departamentos y de la provincia: son los UNICOS que se ven (los de la
    // imagen se borran), asi que no hay doble linea.
    g.lineJoin = "round";
    g.strokeStyle = color("--texto", "#2b1c18");
    g.globalAlpha = 0.7;
    g.lineWidth = 1;
    estado.deptos.forEach(function (d) {
      var c = new Path2D();
      d.anillos.forEach(function (an) {
        an.forEach(function (p, n) {
          var q = pantalla(p[0], p[1]);
          if (n) { c.lineTo(q[0], q[1]); } else { c.moveTo(q[0], q[1]); }
        });
        c.closePath();
      });
      if (d === estado.sobre) {
        g.save();
        g.globalAlpha = 1;
        g.lineWidth = 2.2;
        g.stroke(c);
        g.restore();
      } else {
        g.stroke(c);
      }
    });
    g.globalAlpha = 1;
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

  // La rotacion del KML (en grados, antihoraria) gira la imagen sobre el centro de su caja.
  function rotarComoElKml(a, b) {
    if (!caja.rotacion) { return; }
    var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    g.translate(cx, cy);
    g.rotate(-caja.rotacion * Math.PI / 180);
    g.translate(-cx, -cy);
  }

  /* ---------- la imagen limpia (21-oct-2026) ----------
     Pedido de la usuaria: "no quiero que se vean tan pixelados, y tienen como un doble margen
     por cada departamento". Las dos cosas salen de la imagen del SEPA: es la del pais entero, asi
     que la provincia ocupa unos 230 a 400 px de ancho y al agrandarla se ven los pixeles; y trae
     dibujados sus propios limites departamentales (negros o grises), que quedaban al lado de los
     del GeoJSON que dibuja el visor.

     Se arma una vez por imagen, solo con el recorte de la provincia (limpiarPixeles, abajo):
     1. Lineas fuera. Solo se toca la BANDA de pocos px alrededor de cada limite del GeoJSON, y
        ahi solo los pixeles que son linea: grises o negros, o de un color de linea de ESA imagen.
        Los colores de linea se miden en cada imagen: son los que dentro de la provincia aparecen
        muchisimo mas pegados a los limites que lejos de ellos (en evapotranspiracion la linea es
        semitransparente y sale verde oscuro, no gris). El hueco se rellena con los vecinos.
     2. Sin pixelado y sin mover nada (segunda revision de la usuaria: "no quiero que se vea
        pixelado pero tampoco quiero que le cambies de lugar los puntos"). Se agranda 4 veces con
        Scale2x aplicado dos veces: cada pixel de la imagen queda en SU lugar, con su color, y lo
        unico que cambia es que la escalera de un borde diagonal se redondea. Un punto suelto
        sigue siendo un punto en el mismo lugar. Despues el navegador lo dibuja con suavizado.
     La imagen original sigue disponible tal cual en "Imagen original" y en las miniaturas. */

  function limpiar(img) {
    var W = img.naturalWidth, H = img.naturalHeight;
    var A = mundo(caja.oeste, caja.norte), B = mundo(caja.este, caja.sur);
    var C = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    var giro = (caja.rotacion || 0) * Math.PI / 180;
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

    // Tres mascaras del tamaño del recorte, rasterizadas con los limites del GeoJSON: la banda
    // donde se borran lineas, una banda ancha (lo que queda afuera es "lejos de todo limite") y
    // la provincia rellena.
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
    var mascaras = { banda: mascara(2 * BANDA), ancha: mascara(6 * BANDA), provincia: mascara(0) };

    var limpio = limpiarPixeles(px, mascaras, w, h);
    var lienzo = document.createElement("canvas");
    lienzo.width = limpio.ancho; lienzo.height = limpio.alto;
    var gl = lienzo.getContext("2d");
    var salida = gl.createImageData(limpio.ancho, limpio.alto);
    new Uint32Array(salida.data.buffer).set(limpio.pixeles);
    gl.putImageData(salida, 0, 0);
    return { lienzo: lienzo, recorte: { x: x0, y: y0, w: w, h: h } };
  }

  // ---------- periodo ----------
  function ir(i) {
    if (i < 0 || i >= mapas.length) { return; }
    estado.i = i;
    periodo.value = String(i);
    anterior.disabled = i === 0;
    siguiente.disabled = i === mapas.length - 1;
    if (opciones.alElegir) { opciones.alElegir(i); }
    var img = estado.imagenes[i];
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.src = mapas[i].grande;
      estado.imagenes[i] = img;
    }
    if (img.complete && img.naturalWidth) {
      cargando.textContent = "";
      dibujar();
      return;
    }
    cargando.textContent = "Cargando imagen del SEPA…";
    dibujar();
    img.onload = function () {
      if (estado.i === i) { cargando.textContent = ""; dibujar(); }
    };
    img.onerror = function () {
      if (estado.i === i) { cargando.textContent = "No se pudo cargar la imagen."; }
    };
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

  cargarGeo().then(function () {
    encuadrar();
    ir(estado.i);
  }, function () {
    cargando.textContent = "No se pudieron cargar los límites de los departamentos.";
  });

  return {
    ir: function (i) {
      ir(i);
      nodo.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
}

/* El trabajo pixel por pixel de limpiar(), sin canvas (asi se puede probar fuera del navegador).
   px: Uint32Array RGBA del recorte. mascaras: {banda, ancha, provincia}, cada una el RGBA de un
   canvas del tamaño del recorte (alfa > 0 = adentro). Devuelve el recorte agrandado 4 veces. */
export function limpiarPixeles(px, mascaras, w, h) {
  px = px.slice(0);
  var N = w * h, i, x, y;
  var banda = new Uint8Array(N);
  var cerca = new Uint32Array(4096), lejos = new Uint32Array(4096), nCerca = 0, nLejos = 0;
  for (i = 0; i < N; i++) {
    banda[i] = mascaras.banda[i * 4 + 3] ? 1 : 0;
    if (!mascaras.provincia[i * 4 + 3]) { continue; }
    if (banda[i]) { cerca[grupo(px[i])]++; nCerca++; } else if (!mascaras.ancha[i * 4 + 3]) {
      lejos[grupo(px[i])]++; nLejos++;
    }
  }
  // Colores de linea de esta imagen: al menos 20 pixeles pegados a los limites y, en proporcion,
  // 8 veces mas frecuentes ahi que lejos de todo limite.
  var deLinea = new Uint8Array(4096);
  for (var k = 0; k < 4096; k++) {
    if (cerca[k] >= 20 && (cerca[k] / nCerca) >= 8 * ((lejos[k] + 1) / Math.max(1, nLejos))) {
      deLinea[k] = 1;
    }
  }
  function esLinea(c) {
    var r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max <= 50 || (max - min <= 45 && max <= 180) || deLinea[grupo(c)] === 1;
  }

  // 1. Lineas fuera: en la banda, lo que es linea (y un pixel alrededor, el halo del JPG). Lo que
  // parece linea fuera de la banda (`dudoso`) queda, pero no se usa para rellenar.
  var hueco = new Uint8Array(N), dudoso = new Uint8Array(N);
  for (i = 0; i < N; i++) {
    if (esLinea(px[i])) { dudoso[i] = 1; if (banda[i]) { hueco[i] = 1; } }
  }
  var crecido = hueco.slice(0);
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      if (!hueco[y * w + x]) { continue; }
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && banda[yy * w + xx]) { crecido[yy * w + xx] = 1; }
        }
      }
    }
  }
  hueco = crecido;
  // El hueco se rellena de afuera hacia adentro con el color mas repetido entre los vecinos.
  for (var pasada = 0; pasada < 24; pasada++) {
    var rellenos = [];
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!hueco[i]) { continue; }
        var elegido = -1, votos = 0, cuentas = {};
        for (var ey = -1; ey <= 1; ey++) {
          for (var ex = -1; ex <= 1; ex++) {
            var x2 = x + ex, y2 = y + ey;
            if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) { continue; }
            var j = y2 * w + x2;
            if (hueco[j] || (dudoso[j] && pasada < 12)) { continue; }
            var gr = grupo(px[j]);
            cuentas[gr] = (cuentas[gr] || 0) + 1;
            if (cuentas[gr] > votos) { votos = cuentas[gr]; elegido = px[j]; }
          }
        }
        if (elegido !== -1) { rellenos.push(i, elegido); }
      }
    }
    if (!rellenos.length && pasada >= 12) { break; }
    for (var m = 0; m < rellenos.length; m += 2) {
      px[rellenos[m]] = rellenos[m + 1];
      hueco[rellenos[m]] = 0;
      dudoso[rellenos[m]] = 0;
    }
  }

  // 2. Agrandar 4 veces sin mover nada: Scale2x dos veces.
  var una = escala2x(px, w, h);
  var dos = escala2x(una, 2 * w, 2 * h);
  for (i = 0; i < dos.length; i++) { dos[i] = (dos[i] | 0xff000000) >>> 0; }
  return { pixeles: dos, ancho: 4 * w, alto: 4 * h };
}

/* Scale2x (EPX): cada pixel P pasa a ser 2x2. Una esquina toma el color del vecino solo cuando
   los dos vecinos que tocan esa esquina son iguales entre si y distintos de los otros dos: es una
   escalera diagonal y la esquina la redondea. En cualquier otro caso las cuatro quedan P, asi que
   un punto suelto sigue entero en su lugar. "Igual" es el mismo grupo de color (ruido del JPG). */
function escala2x(px, w, h) {
  var out = new Uint32Array(4 * w * h), ow = 2 * w;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var P = px[y * w + x];
      var A = y > 0 ? px[(y - 1) * w + x] : P;       // arriba
      var B = x < w - 1 ? px[y * w + x + 1] : P;     // derecha
      var C = x > 0 ? px[y * w + x - 1] : P;         // izquierda
      var D = y < h - 1 ? px[(y + 1) * w + x] : P;   // abajo
      var a = grupo(A), b = grupo(B), c = grupo(C), d = grupo(D);
      var o = 2 * y * ow + 2 * x;
      out[o] = (c === a && c !== d && a !== b) ? A : P;
      out[o + 1] = (a === b && a !== c && b !== d) ? B : P;
      out[o + ow] = (d === c && d !== b && c !== a) ? C : P;
      out[o + ow + 1] = (b === d && b !== a && d !== c) ? D : P;
    }
  }
  return out;
}

// Colores que el JPG separo por ruido cuentan como el mismo (16 niveles por canal).
function grupo(v) {
  return ((v & 255) >> 4) | ((((v >> 8) & 255) >> 4) << 4) | ((((v >> 16) & 255) >> 4) << 8);
}
