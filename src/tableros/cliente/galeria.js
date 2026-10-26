/* Pivotal - tipo `galeria`. Miniaturas que se amplian en un popup.

   Es la pagina "Mapas" de la maqueta de pasturas y forrajes: JC pide "miniaturas de los mapas
   en orden descendente" y, sobre el clic, "AUMENTA TAMAÑO DE MAPA EN UN POP UP".

   No dibuja ningun grafico: el contenido son imagenes. Lo unico que hace este archivo es
   llenar la grilla con lo que escribio el build y enganchar el popup, que es el MISMO dialogo
   del zoom y de "Mas informacion" -marco de 2vmin, caja con el radio de los paneles y la caja
   creciendo desde la miniatura que se apreto- porque dos dialogos del mismo sitio no se pueden
   mover distinto.

   La miniatura y la imagen grande son DOS archivos: la grande pesa 1,2 MB y son 28, asi que
   bajarlas todas para dibujar una grilla serian 33 MB. La grande se baja recien al abrir el
   popup, que es el mismo criterio que la capa departamental y el panel de precios. */
import crearVisor from "./visor-georef";

export default function iniciar(PIVOTAL) {

  /* `mapas` y `i` son lo que permite pasar de uno al siguiente sin cerrar: el popup deja de
     mostrar "un" mapa y pasa a ser una ventana sobre la lista. `desde` es el rectangulo de la
     miniatura que lo abrio, y se actualiza al moverse para que al cerrar la caja vuelva a la
     miniatura que se esta viendo y no a la del principio. */
  var popup = { dialogo: null, caja: null, imagen: null, titulo: null,
                anim: null, desde: null, cerrando: false,
                mapas: [], i: 0, anterior: null, siguiente: null,
                visor: null, porcentaje: null, georef: null };

  /* ================= zoom del mapa ampliado (revision de JC del 16-oct-2026) =================
     "NO SE LES PUEDE HACER ZOOM (llega maximo al 25%)... A ESTO DEBERIAMOS LLEGAR": el mapa se
     amplia de verdad, hasta el 800% de su tamaño REAL (como los visores de imagenes que el
     propone, viewer.js y zoom-vanilla), sin librerias: rueda del mouse o pellizco centrados
     en el puntero, arrastre para moverse, doble clic, y los botones - / % / + de la barra.
     El porcentaje que se muestra es contra el tamaño real de la imagen, que es como lo mide
     JC ("LAS ABRI Y PUSE ZOOM AL 100%... probe llevar el zoom al 260%").
     La imagen se escala con un transform desde su esquina, adentro de una caja que recorta: el
     tamaño de la caja (y del popup) no cambia, cambia lo que se ve adentro. */
  var ZOOM_MAXIMO_REAL = 8;
  var ZOOM_DOBLE_CLIC_REAL = 2.6;
  var zoom = { s: 1, x: 0, y: 0, punteros: {}, arrastre: null, pellizco: null };

  /* Cuanto de la imagen REAL entra en un pixel de la caja con escala 1. */
  function realPorEscala() {
    var img = popup.imagen;
    return img && img.naturalWidth && img.clientWidth ? img.clientWidth / img.naturalWidth : 1;
  }

  function escalaMaxima() {
    return Math.max(1, ZOOM_MAXIMO_REAL / realPorEscala());
  }

  function aplicarZoom() {
    var img = popup.imagen;
    var w = img.clientWidth, h = img.clientHeight;
    /* La imagen siempre cubre su caja: no se la puede arrastrar hasta dejar un borde vacio. */
    zoom.x = Math.min(0, Math.max(w - zoom.s * w, zoom.x));
    zoom.y = Math.min(0, Math.max(h - zoom.s * h, zoom.y));
    img.style.transform = zoom.s === 1 ? "" :
      "translate(" + zoom.x + "px, " + zoom.y + "px) scale(" + zoom.s + ")";
    popup.visor.classList.toggle("ampliado", zoom.s > 1);
    popup.porcentaje.textContent = Math.round(zoom.s * realPorEscala() * 100) + "%";
  }

  /* Escala nueva manteniendo quieto el punto de la pantalla (px, py): lo que esta bajo el
     puntero sigue bajo el puntero. */
  function zoomEn(px, py, escala) {
    var nueva = Math.min(escalaMaxima(), Math.max(1, escala));
    var caja = popup.visor.getBoundingClientRect();
    var qx = (px - caja.left - zoom.x) / zoom.s;
    var qy = (py - caja.top - zoom.y) / zoom.s;
    zoom.s = nueva;
    zoom.x = nueva === 1 ? 0 : px - caja.left - nueva * qx;
    zoom.y = nueva === 1 ? 0 : py - caja.top - nueva * qy;
    aplicarZoom();
  }

  function zoomAlCentro(factor) {
    var caja = popup.visor.getBoundingClientRect();
    zoomEn(caja.left + caja.width / 2, caja.top + caja.height / 2, zoom.s * factor);
  }

  function reiniciarZoom() {
    zoom.s = 1; zoom.x = 0; zoom.y = 0; zoom.punteros = {};
    zoom.arrastre = null; zoom.pellizco = null;
    if (popup.visor) { aplicarZoom(); }
  }

  function botonDeZoom(texto, rotulo, accion) {
    var boton = document.createElement("button");
    boton.type = "button";
    boton.className = "galeria-zoom-boton";
    boton.textContent = texto;
    boton.setAttribute("aria-label", rotulo);
    boton.title = rotulo;
    boton.addEventListener("click", accion);
    return boton;
  }

  function engancharZoom(visor) {
    visor.addEventListener("wheel", function (evento) {
      evento.preventDefault();
      zoomEn(evento.clientX, evento.clientY, zoom.s * Math.exp(-evento.deltaY * 0.0015));
    }, { passive: false });
    /* Doble clic: al 260% real, que es a donde JC dice que hay que llegar; otro doble clic
       vuelve al mapa entero. */
    visor.addEventListener("dblclick", function (evento) {
      if (zoom.s > 1) { reiniciarZoom(); return; }
      zoomEn(evento.clientX, evento.clientY,
             Math.max(1.5, ZOOM_DOBLE_CLIC_REAL / realPorEscala()));
    });
    visor.addEventListener("pointerdown", function (evento) {
      zoom.punteros[evento.pointerId] = { x: evento.clientX, y: evento.clientY };
      visor.setPointerCapture(evento.pointerId);
      var ids = Object.keys(zoom.punteros);
      if (ids.length === 2) {
        var a = zoom.punteros[ids[0]], b = zoom.punteros[ids[1]];
        zoom.pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), s: zoom.s };
        zoom.arrastre = null;
      } else if (zoom.s > 1) {
        zoom.arrastre = { x: evento.clientX - zoom.x, y: evento.clientY - zoom.y };
      }
    });
    visor.addEventListener("pointermove", function (evento) {
      if (!zoom.punteros[evento.pointerId]) { return; }
      zoom.punteros[evento.pointerId] = { x: evento.clientX, y: evento.clientY };
      var ids = Object.keys(zoom.punteros);
      if (zoom.pellizco && ids.length === 2) {
        var a = zoom.punteros[ids[0]], b = zoom.punteros[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (zoom.pellizco.d > 0) {
          zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, zoom.pellizco.s * d / zoom.pellizco.d);
        }
        return;
      }
      if (zoom.arrastre) {
        zoom.x = evento.clientX - zoom.arrastre.x;
        zoom.y = evento.clientY - zoom.arrastre.y;
        aplicarZoom();
      }
    });
    function soltar(evento) {
      delete zoom.punteros[evento.pointerId];
      if (Object.keys(zoom.punteros).length < 2) { zoom.pellizco = null; }
      zoom.arrastre = null;
    }
    visor.addEventListener("pointerup", soltar);
    visor.addEventListener("pointercancel", soltar);
  }

  function crearDialogo() {
    var dialogo = document.createElement("dialog");
    /* Mismo cromo que el popup de "Mas informacion"; `info-galeria` hace que la caja mida lo
       que el mapa y no la ventana entera (16-oct-2026, pedido de la usuaria). */
    dialogo.className = "info info-galeria";
    var caja = document.createElement("div");
    caja.className = "info-caja";
    var cab = document.createElement("header");
    cab.className = "info-cab";
    popup.titulo = document.createElement("h2");
    var cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.className = "info-cerrar";
    cerrar.textContent = "✕";
    cerrar.setAttribute("aria-label", "Cerrar");
    cerrar.addEventListener("click", function () { cerrarPopup(); });
    var controles = document.createElement("div");
    controles.className = "galeria-zoom";
    controles.setAttribute("role", "group");
    controles.setAttribute("aria-label", "Zoom del mapa");
    popup.porcentaje = botonDeZoom("100%", "Volver al tamaño inicial", reiniciarZoom);
    popup.porcentaje.classList.add("galeria-zoom-pct");
    controles.appendChild(botonDeZoom("\u2212", "Alejar", function () { zoomAlCentro(1 / 1.5); }));
    controles.appendChild(popup.porcentaje);
    controles.appendChild(botonDeZoom("+", "Acercar", function () { zoomAlCentro(1.5); }));
    cab.appendChild(popup.titulo);
    cab.appendChild(controles);
    cab.appendChild(cerrar);
    var cuerpo = document.createElement("div");
    cuerpo.className = "info-cuerpo galeria-grande";
    popup.imagen = document.createElement("img");
    popup.imagen.alt = "";
    popup.anterior = flecha("anterior", "\u2039", "Mapa anterior", -1);
    popup.siguiente = flecha("siguiente", "\u203a", "Mapa siguiente", 1);
    popup.visor = document.createElement("div");
    popup.visor.className = "galeria-visor";
    popup.visor.appendChild(popup.imagen);
    engancharZoom(popup.visor);
    /* Al terminar de bajar la imagen se conoce su tamaño real: recien ahi el porcentaje dice
       la verdad. */
    popup.imagen.addEventListener("load", aplicarZoom);
    cuerpo.appendChild(popup.anterior);
    cuerpo.appendChild(popup.visor);
    cuerpo.appendChild(popup.siguiente);
    caja.appendChild(cab);
    caja.appendChild(cuerpo);
    dialogo.appendChild(caja);
    /* El clic AFUERA de la caja cierra: funciona porque el dialogo deja el marco de 2vmin a la
       vista. Sin ese marco la caja taparia el 100% y `target === dialogo` no se cumpliria. */
    dialogo.addEventListener("click", function (evento) {
      if (evento.target === dialogo) { cerrarPopup(); }
    });
    /* Escape: se le pide al navegador que no cierre el solo para no perder el camino de
       vuelta, y se cierra por donde cierra la cruz. */
    dialogo.addEventListener("cancel", function (evento) {
      if (popup.cerrando) { return; }
      evento.preventDefault();
      cerrarPopup();
    });
    /* Las flechas del teclado hacen lo mismo que las de la pantalla: es como se mira una
       galeria, y con el foco atrapado en el dialogo no pisan nada de la pagina. */
    dialogo.addEventListener("keydown", function (evento) {
      if (evento.key === "ArrowLeft") { evento.preventDefault(); mover(-1); }
      else if (evento.key === "ArrowRight") { evento.preventDefault(); mover(1); }
      else if (evento.key === "+" || evento.key === "=") { evento.preventDefault(); zoomAlCentro(1.5); }
      else if (evento.key === "-") { evento.preventDefault(); zoomAlCentro(1 / 1.5); }
      else if (evento.key === "0") { evento.preventDefault(); reiniciarZoom(); }
    });
    document.body.appendChild(dialogo);
    popup.dialogo = dialogo;
    popup.caja = caja;
    popup.anim = PIVOTAL.animadorDeDialogo(dialogo, caja, "info");
    return dialogo;
  }

  /* Una de las dos flechas del costado. `paso` es -1 o 1: el orden de la lista es el de la
     grilla, o sea de la quincena mas reciente a la mas antigua, asi que "siguiente" es el mapa
     que esta abajo en la grilla. */
  function flecha(clase, signo, rotulo, paso) {
    var boton = document.createElement("button");
    boton.type = "button";
    boton.className = "galeria-flecha galeria-" + clase;
    boton.textContent = signo;
    boton.setAttribute("aria-label", rotulo);
    boton.addEventListener("click", function () { mover(paso); });
    return boton;
  }

  /* No da la vuelta en las puntas: con 28 mapas en orden cronologico, saltar del mas viejo al
     mas nuevo se lee como un salto y no como avanzar. En la punta la flecha queda apagada. */
  function mover(paso) {
    var destino = popup.i + paso;
    if (destino < 0 || destino >= popup.mapas.length) { return; }
    mostrar(destino);
  }

  function mostrar(indice) {
    popup.i = indice;
    /* Cada mapa arranca entero: el zoom del anterior no se arrastra al siguiente. */
    reiniciarZoom();
    var mapa = popup.mapas[indice];
    /* `titulo` lo manda el build cuando el rotulo de la grilla no alcanza para saber que se
       esta viendo (las galerias de AgroClima le suman el año, y la ORA el cultivo y la fecha). */
    popup.titulo.textContent = mapa.titulo || mapa.rotulo;
    /* La proporcion del mapa ANTES de que baje: con ella el CSS le da a la imagen -y asi a la
       caja- su tamaño final desde el primer cuadro, y la animacion de apertura se calcula
       contra la caja que va a quedar. Los forrajeros no la traen: son todos de 2001x944. */
    popup.caja.style.setProperty("--proporcion-mapa",
      mapa.ancho && mapa.alto ? String(mapa.ancho / mapa.alto) : String(2001 / 944));
    popup.imagen.src = mapa.grande;
    popup.imagen.alt = mapa.rotulo;
    popup.anterior.disabled = indice === 0;
    popup.siguiente.disabled = indice === popup.mapas.length - 1;
    /* Al cerrar, la caja vuelve a la miniatura que se esta viendo y no a la que se apreto:
       si se movio tres mapas, volver al primero seria un salto a otra parte de la grilla. */
    var figura = popup.figuras[indice];
    if (figura) { popup.desde = figura.getBoundingClientRect(); }
  }

  function abrirPopup(figura, mapa) {
    var dialogo = popup.dialogo || crearDialogo();
    mostrar(popup.mapas.indexOf(mapa));
    /* La caja crece desde la miniatura que se APRETO: `mostrar` la apunta a la de la grilla, y
       el mapa grande del lateral (AgroClima) es otra figura del mismo mapa. */
    popup.desde = figura.getBoundingClientRect();
    dialogo.showModal();
    popup.anim.remedir();
    popup.anim.mover(popup.anim.encajarEn(popup.desde), "none", true, function () {});
  }

  function cerrarPopup() {
    if (!popup.dialogo || !popup.dialogo.open || popup.cerrando) { return; }
    popup.cerrando = true;
    var desde = getComputedStyle(popup.caja).transform;
    var hasta = popup.anim.encajarEn(popup.desde);
    popup.anim.mover(desde, hasta, false, function () {
      popup.cerrando = false;
      popup.dialogo.close();
    });
  }

  /* Mientras la miniatura no bajo, su `src` es un pixel transparente: la caja ya tiene su
     tamaño reservado por el CSS y asi no aparece el icono de imagen rota. */
  var PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var observadores = [];

  /* EL QUE SCROLLEA NO ES LA VENTANA. En los tableros la pagina entra en `div.contenido`
     (`overflow: auto`) adentro de un `body` que no scrollea, asi que un IntersectionObserver
     sin `root` mira la ventana y la miniatura queda tapada por ESE recorte intermedio. Y el
     `rootMargin` no ayuda: por norma agranda la caja de la RAIZ nada mas, los recortes del
     medio se aplican sin margen. Medido: con la raiz por omision, las 12 miniaturas del NDVI
     se quedaban en el pixel transparente para siempre -tambien las de la primera fila, que
     estan a la vista- porque arrancan 20 px abajo del borde de `.contenido`. La raiz es el
     ancestro que scrollea de verdad. */
  function raizDeScroll(nodo) {
    for (var n = nodo.parentElement; n && n !== document.body; n = n.parentElement) {
      var y = getComputedStyle(n).overflowY;
      if ((y === "auto" || y === "scroll") && n.scrollHeight > n.clientHeight) { return n; }
    }
    return null;  // la ventana
  }

  function observadorDe(raiz) {
    for (var i = 0; i < observadores.length; i++) {
      if (observadores[i].raiz === raiz) { return observadores[i].obs; }
    }
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        obs.unobserve(e.target);
        e.target.src = e.target.dataset.perezosa;
        delete e.target.dataset.perezosa;
      });
    }, { root: raiz, rootMargin: "300px 0px" });
    observadores.push({ raiz: raiz, obs: obs });
    return obs;
  }

  function perezosamente(img, src) {
    img.src = PIXEL;
    if (!window.IntersectionObserver) { img.src = src; return; }
    img.dataset.perezosa = src;
    /* La raiz se busca con la imagen YA COLGADA del documento: recien ahi tiene ancestros. */
    requestAnimationFrame(function () {
      if (!img.dataset.perezosa) { return; }
      observadorDe(raizDeScroll(img)).observe(img);
    });
  }

  /* Una miniatura con su rotulo, que abre el popup en ESE mapa. `perezosa` deja que las de
     abajo del pliegue se bajen cuando hacen falta (son decenas). */
  function figuraDe(mapa, perezosa) {
    var figura = document.createElement("figure");
    figura.className = "galeria-mapa";
    var boton = document.createElement("button");
    boton.type = "button";
    boton.setAttribute("aria-label", "Ampliar " + (mapa.titulo || mapa.rotulo));
    var img = document.createElement("img");
    img.alt = mapa.titulo || mapa.rotulo;
    /* La caja de la miniatura se reserva ANTES de que la imagen baje (ver el CSS de
       `.galeria-mapa img`). Si el build manda el tamaño de la miniatura -los mapas de clima
       son verticales, no apaisados como los forrajeros- esa proporcion le gana a la del CSS. */
    if (mapa.ancho && mapa.alto) {
      img.width = mapa.ancho;
      img.height = mapa.alto;
      img.style.aspectRatio = mapa.ancho + " / " + mapa.alto;
    }
    img.decoding = "async";
    /* Las de la grilla se bajan RECIEN AL ACERCARSE A LA PANTALLA, y en la prioridad mas baja
       (27-oct-2026). Son decenas de 56 KB y con `loading="lazy"` a secas el navegador igual
       las pedia casi todas de entrada -su umbral es de mas de mil pixeles y con red lenta es
       todavia mas generoso-, antes que el mapa grande del visor, que es lo unico que se esta
       mirando. Eso es un mega de cola delante de lo que importa. Con el observador el margen
       es de 300 px, que alcanza para que ninguna llegue tarde al ojo. */
    if (perezosa) {
      img.loading = "lazy";
      img.fetchPriority = "low";
      perezosamente(img, mapa.mini);
    } else {
      img.src = mapa.mini;
    }
    boton.appendChild(img);
    var pie = document.createElement("figcaption");
    pie.textContent = mapa.rotulo;
    /* Con visor georreferenciado la miniatura elige el periodo del visor; sin el, abre el
       popup como siempre (la galeria ORA, los mapas forrajeros). */
    boton.addEventListener("click", function () {
      if (popup.georef) { popup.georef.ir(popup.mapas.indexOf(mapa)); }
      else { abrirPopup(figura, mapa); }
    });
    figura.appendChild(boton);
    figura.appendChild(pie);
    return figura;
  }

  /* El lateral de las galerias de AgroClima, como lo dibuja JC: el mapa mas reciente en grande
     arriba y, debajo, el cuadro con la definicion del producto y el link a la fuente. Todos los
     textos vienen del spec (literales de JC). */
  function pintarLateral(caja, elemento) {
    var lateral = caja.querySelector("[data-galeria-lateral]");
    if (!lateral) { return; }
    PIVOTAL.vaciar(lateral);
    /* Con visor, el mapa mas reciente ya esta grande arriba: el lateral queda en la definicion. */
    var hayDestacado = !elemento.visor
      && elemento.destacado !== undefined && elemento.destacado !== null;
    lateral.hidden = !hayDestacado && !elemento.definicion;
    if (lateral.hidden) { return; }
    if (hayDestacado) {
      var mapa = elemento.mapas[elemento.destacado];
      var grande = figuraDe(mapa, false);
      grande.classList.add("galeria-destacado");
      grande.querySelector("figcaption").textContent = mapa.titulo || mapa.rotulo;
      lateral.appendChild(grande);
    }
    var definicion = elemento.definicion;
    if (definicion) {
      var cuadro = document.createElement("section");
      cuadro.className = "galeria-definicion";
      var titulo = document.createElement("h3");
      titulo.textContent = definicion.titulo;
      cuadro.appendChild(titulo);
      (definicion.parrafos || []).forEach(function (texto) {
        var p = document.createElement("p");
        p.textContent = texto;
        cuadro.appendChild(p);
      });
      if (definicion.enlace) {
        var p = document.createElement("p");
        var a = document.createElement("a");
        a.href = definicion.enlace.href;
        a.textContent = definicion.enlace.texto;
        a.rel = "noopener";
        a.target = "_blank";
        p.appendChild(a);
        cuadro.appendChild(p);
      }
      lateral.appendChild(cuadro);
    }
  }

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      var grilla = cajas[i].querySelector("[data-galeria]");
      if (!grilla) { return; }
      PIVOTAL.vaciar(grilla);
      pintarLateral(cajas[i], elemento);
      /* Cuantas por fila lo dice el spec (JC dibuja seis). Sin el dato queda la grilla que se
         acomoda sola, la de los mapas forrajeros. */
      if (elemento.por_fila) {
        grilla.style.setProperty("--por-fila", elemento.por_fila);
        grilla.classList.add("galeria-por-fila");
      }
      popup.mapas = elemento.mapas;
      popup.figuras = [];
      /* La ORA va por FILAS: una por fecha, con la fecha arriba, y una columna fija por
         cultivo. Donde falta la imagen de un cultivo queda el lugar en blanco (JC, X92): no se
         corre la fila. El resto es una lista corrida de la mas reciente a la mas vieja. */
      if (elemento.filas) {
        elemento.filas.forEach(function (fila) {
          var titulo = document.createElement("h3");
          titulo.className = "galeria-fila-titulo";
          titulo.textContent = fila.titulo;
          grilla.appendChild(titulo);
          fila.celdas.forEach(function (indice) {
            if (indice === null || indice === undefined) {
              var hueco = document.createElement("div");
              hueco.className = "galeria-hueco";
              hueco.setAttribute("aria-hidden", "true");
              grilla.appendChild(hueco);
              return;
            }
            var figura = figuraDe(elemento.mapas[indice], true);
            grilla.appendChild(figura);
            popup.figuras[indice] = figura;
          });
        });
        return;
      }
      elemento.mapas.forEach(function (mapa, indice) {
        var figura = figuraDe(mapa, true);
        grilla.appendChild(figura);
        popup.figuras[indice] = figura;
      });
      /* El visor georreferenciado (galerias del SEPA con KML). "Imagen original" abre el mismo
         popup de siempre, con la imagen del SEPA entera y su leyenda. */
      var hueco = cajas[i].querySelector("[data-visor-mapa]");
      if (elemento.visor && hueco) {
        popup.georef = crearVisor(hueco, elemento, {
          original: function (indice, boton) { abrirPopup(boton, elemento.mapas[indice]); },
          alElegir: function (indice) {
            popup.figuras.forEach(function (f, j) {
              if (f) { f.classList.toggle("galeria-elegida", j === indice); }
            });
          }
        });
      }
    });
  });
}
