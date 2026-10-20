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

export default function crearVisor(nodo, elemento, opciones) {
  var caja = elemento.visor.caja;
  var mapas = elemento.mapas;
  var estado = {
    i: elemento.destacado || 0, opacidad: 1, todoElPais: false,
    s: 1, tx: 0, ty: 0, encuadre: null, deptos: [], k: 1,
    imagenes: {}, punteros: {}, arrastre: null, pellizco: null, sobre: null
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
  nota.textContent = elemento.visor.nota;
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
      // Mas cerca que la resolucion de la imagen se ven los pixeles del SEPA tal cual, sin
      // suavizar: es el dato que hay, no se inventa detalle.
      g.imageSmoothingEnabled = (b[0] - a[0]) < img.naturalWidth * 1.5;
      g.save();
      // Recortada a la provincia, salvo que se pida el pais entero (ahi se ve la leyenda).
      if (!estado.todoElPais) { g.clip(provincia); }
      // La rotacion del KML (en grados, antihoraria) gira la imagen sobre el centro de su caja.
      if (caja.rotacion) {
        var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
        g.translate(cx, cy);
        g.rotate(-caja.rotacion * Math.PI / 180);
        g.translate(-cx, -cy);
      }
      g.globalAlpha = estado.opacidad;
      g.drawImage(img, a[0], a[1], b[0] - a[0], b[1] - a[1]);
      g.restore();
      g.globalAlpha = 1;
    }
    // Limites de los departamentos y de la provincia
    g.lineJoin = "round";
    g.strokeStyle = color("--texto", "#2b1c18");
    g.globalAlpha = 0.55;
    g.lineWidth = 0.8;
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
