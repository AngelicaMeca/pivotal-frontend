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
export default function iniciar(PIVOTAL) {

  /* `mapas` y `i` son lo que permite pasar de uno al siguiente sin cerrar: el popup deja de
     mostrar "un" mapa y pasa a ser una ventana sobre la lista. `desde` es el rectangulo de la
     miniatura que lo abrio, y se actualiza al moverse para que al cerrar la caja vuelva a la
     miniatura que se esta viendo y no a la del principio. */
  var popup = { dialogo: null, caja: null, imagen: null, titulo: null,
                anim: null, desde: null, cerrando: false,
                mapas: [], i: 0, anterior: null, siguiente: null };

  function crearDialogo() {
    var dialogo = document.createElement("dialog");
    dialogo.className = "info";          /* mismo cromo que el popup de "Mas informacion" */
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
    cab.appendChild(popup.titulo);
    cab.appendChild(cerrar);
    var cuerpo = document.createElement("div");
    cuerpo.className = "info-cuerpo galeria-grande";
    popup.imagen = document.createElement("img");
    popup.imagen.alt = "";
    popup.anterior = flecha("anterior", "\u2039", "Mapa anterior", -1);
    popup.siguiente = flecha("siguiente", "\u203a", "Mapa siguiente", 1);
    cuerpo.appendChild(popup.anterior);
    cuerpo.appendChild(popup.imagen);
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
    var mapa = popup.mapas[indice];
    /* `titulo` lo manda el build cuando el rotulo de la grilla no alcanza para saber que se
       esta viendo (las galerias de AgroClima le suman el año, y la ORA el cultivo y la fecha). */
    popup.titulo.textContent = mapa.titulo || mapa.rotulo;
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

  /* Una miniatura con su rotulo, que abre el popup en ESE mapa. `perezosa` deja que las de
     abajo del pliegue se bajen cuando hacen falta (son decenas). */
  function figuraDe(mapa, perezosa) {
    var figura = document.createElement("figure");
    figura.className = "galeria-mapa";
    var boton = document.createElement("button");
    boton.type = "button";
    boton.setAttribute("aria-label", "Ampliar " + (mapa.titulo || mapa.rotulo));
    var img = document.createElement("img");
    img.src = mapa.mini;
    img.alt = mapa.titulo || mapa.rotulo;
    /* La caja de la miniatura se reserva ANTES de que la imagen baje (ver el CSS de
       `.galeria-mapa img`). Si el build manda el tamaño de la miniatura -los mapas de clima
       son verticales, no apaisados como los forrajeros- esa proporcion le gana a la del CSS. */
    if (mapa.ancho && mapa.alto) {
      img.width = mapa.ancho;
      img.height = mapa.alto;
      img.style.aspectRatio = mapa.ancho + " / " + mapa.alto;
    }
    if (perezosa) { img.loading = "lazy"; }
    img.decoding = "async";
    boton.appendChild(img);
    var pie = document.createElement("figcaption");
    pie.textContent = mapa.rotulo;
    boton.addEventListener("click", function () { abrirPopup(figura, mapa); });
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
    var hayDestacado = elemento.destacado !== undefined && elemento.destacado !== null;
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
    });
  });
}
