/* Pivotal - plomeria comun del sitio: la comparten las vistas de detalle y el tablero.

   Que hace: baja el JSON, arma la clave de la combinacion de filtros a partir de los controles
   de la pagina, y le pasa la combinacion a quien la dibuja. NO formatea numeros ni compone
   textos: todo eso viene resuelto del build.

   Desde el rediseño del 2026-08-03 los filtros no son un <form> de <select>: son CONTROLES
   repartidos en tres lugares (la barra verde para el periodo, la barra de chips para el resto,
   y adentro de un panel para los toggles del tablero). Cada control es un nodo con
   data-control="chips"|"select", data-filtro y data-valor. Este archivo es el unico que sabe
   leerlos.

   Dos puntos de entrada:
     PIVOTAL.init(dibujar)            vistas de detalle: dibuja sobre las figure.cuadro de #cuadros
     PIVOTAL.arrancar(ruta, pintar)   generico: te pasa (combo, datos) y hacete cargo vos */

import * as echarts from "echarts";

export default function crearPivotal() {

  /* `comparar` es la comparacion vigente del zoom (ver "cruzar datos", mas abajo). Vive en el
     estado y no adentro del zoom porque quien la usa es el dibujante del cuadro, que corre en
     cada repintado; el zoom solo la prende y la apaga. */
  var estado = { datos: null, pintar: null, graficos: [], bajadas: {}, historial: [],
                 colores: {}, extras: [],
                 comparar: { panel: null, nodo: null, filtro: null, valor: "", medida: "" } };

  /* -------- controles de filtro -------- */
  function controles() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-control]"));
  }

  /* TODOS los controles de un filtro, no el primero. Un mismo filtro se puede dibujar mas de
     una vez: en la maqueta "Agri 2" los chips de producto viven adentro de dos paneles, con
     rotulos distintos ("DTV Cebolla" y "Cebolla") y un solo valor. Son UN filtro dibujado dos
     veces, no dos filtros, y por eso se mueven juntos: sin esto, tocar el segundo no hacia
     nada (la clave se arma con el primero) y los dos quedaban mostrando cosas distintas. */
  function controlesDe(id) {
    return Array.prototype.slice.call(
      document.querySelectorAll('[data-control][data-filtro="' + id + '"]'));
  }

  function control(id) {
    return controlesDe(id)[0] || null;
  }

  function valor(id) {
    var nodo = control(id);
    return nodo ? nodo.dataset.valor : null;
  }

  /* Deja el control DIBUJADO en el valor que dice su dataset. Va aparte de pintarControl
     porque las copias que viajan al zoom nacen ya con el valor puesto en el dataset (lo copia
     cloneNode) pero no siempre con el dibujo puesto: el <select> clonado conserva los
     atributos y no la seleccion viva, asi que mostraria la primera opcion. */
  function dibujarValor(nodo, valorNuevo) {
    if (nodo.dataset.control === "chips") {
      Array.prototype.forEach.call(nodo.querySelectorAll("button[data-valor]"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.valor === valorNuevo ? "true" : "false");
      });
    } else {
      var select = nodo.querySelector("select");
      if (select && select.value !== valorNuevo) { select.value = valorNuevo; }
    }
  }

  function pintarControl(nodo, nuevo) {
    if (nodo.dataset.valor === nuevo) { return false; }
    nodo.dataset.valor = nuevo;
    dibujarValor(nodo, nuevo);
    return true;
  }

  /* Fija el valor de un filtro en todos sus dibujos. Recibe un NODO y no un id para no tocar
     a los llamadores, que siempre tienen el control a mano. */
  function fijar(nodo, nuevo) {
    var hubo = false;
    controlesDe(nodo.dataset.filtro).forEach(function (otro) {
      if (pintarControl(otro, nuevo)) { hubo = true; }
    });
    return hubo;
  }

  function tiene(nodo, candidato) {
    if (nodo.dataset.control === "chips") {
      return Array.prototype.some.call(nodo.querySelectorAll("button[data-valor]"), function (b) {
        return b.dataset.valor === candidato;
      });
    }
    return Array.prototype.some.call(nodo.querySelectorAll("option"), function (o) {
      return o.value === candidato;
    });
  }

  /* La clave se arma en el ORDEN QUE DECLARA EL PAYLOAD, no en el orden del DOM: los controles
     estan repartidos en tres lugares y el orden visual no tiene por que coincidir. */
  function clave() {
    return estado.datos.filtros.map(valor).join("|");
  }

  function vaciar(nodo) { while (nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }

  /* Un contenedor de GRAFICO no se vacia nunca: adentro vive el canvas de ECharts, y la
     instancia queda registrada contra ese nodo. Si se le borran los hijos, la instancia
     sobrevive apuntando a un nodo sin canvas y los dibujos siguientes no se ven mas.
     Es lo que pasaba al pasar por un cultivo sin datos en el departamento elegido: desde ahi
     el cuadro quedaba en blanco para TODOS los cultivos hasta recargar la pagina.
     Lo que se limpia es el dibujo (`clear`), no el nodo. */
  function limpiarGrafico(nodo) {
    var instancia = echarts.getInstanceByDom(nodo);
    if (instancia) { instancia.clear(); } else { vaciar(nodo); }
  }

  /* Vistas grandes: el JSON viene partido por el valor de un filtro (ej. el cultivo del mapa).
     Se baja el indice y despues, a demanda, la particion que corresponde.
     En `bajadas` se guarda la PROMESA y no un booleano: dos repintados seguidos sobre la misma
     particion tienen que esperar la misma bajada, no seguir de largo con los combos a medio
     llegar. */
  function bajarParticion(valorParticion) {
    var datos = estado.datos;
    var ruta = datos.archivos[valorParticion];
    if (!ruta) { return Promise.resolve(); }
    if (!estado.bajadas[ruta]) {
      estado.bajadas[ruta] = fetch(ruta).then(function (r) { return r.json(); })
        .then(function (parte) {
          Object.keys(parte.combos).forEach(function (k) { datos.combos[k] = parte.combos[k]; });
        });
    }
    return estado.bajadas[ruta];
  }

  function asegurarParticion() {
    var datos = estado.datos;
    if (!datos.particion) { return Promise.resolve(); }
    var pedidos = [bajarParticion(valor(datos.particion))];
    /* La comparacion del zoom es OTRA clave de combinacion. Si el JSON esta partido por el
       mismo filtro que se compara, esa clave vive en otro archivo y hay que bajarlo: pasa en
       los dos tableros de agricultura, partidos por cultivo y por producto, que son
       justamente los filtros que se cruzan. */
    if (estado.comparar.valor && estado.comparar.filtro === datos.particion) {
      pedidos.push(bajarParticion(estado.comparar.valor));
    }
    return Promise.all(pedidos);
  }

  /* Etiqueta visible del valor actual de un control (el texto del chip o de la opcion). */
  function etiquetaDe(nodo) {
    var actual = nodo.dataset.valor;
    var candidatos = nodo.dataset.control === "chips"
      ? nodo.querySelectorAll("button[data-valor]")
      : nodo.querySelectorAll("option");
    var texto = actual;
    Array.prototype.forEach.call(candidatos, function (c) {
      var valorC = c.dataset ? c.dataset.valor : null;
      if (valorC === undefined || valorC === null) { valorC = c.value; }
      if (valorC === actual) { texto = c.textContent.trim(); }
    });
    return texto;
  }

  /* Regla de JC (formato_v1.navegacion): la navegacion interna CONSERVA la seleccion vigente.
     - los links marcados data-conserva viajan con los filtros actuales como query string
       (la pagina destino los lee en preseleccionar() e ignora los que no entiende);
     - los tramos dinamicos del breadcrumb ([data-miga-dinamica="cultivo"]) muestran la
       etiqueta del valor elegido. */
  function sincronizarNavegacion() {
    /* Se arranca de los parametros con que se LLEGO a la pagina y se pisan con los controles
       propios: los filtros que esta pagina no dibuja (ej. la campaña en la vista
       departamental, que no tiene selector de campaña) siguen viajando en vez de perderse.
       Es lo que hace que el boton "Provincia" vuelva al tablero con cultivo Y campaña
       (cuarta tanda, boton_volver_provincia); el destino ignora lo que no entiende. */
    var parametros = new URLSearchParams(window.location.search);
    controles().forEach(function (nodo) {
      if (nodo.dataset.valor) { parametros.set(nodo.dataset.filtro, nodo.dataset.valor); }
    });
    var consulta = parametros.toString();
    Array.prototype.forEach.call(document.querySelectorAll("a[data-conserva]"), function (a) {
      var base = a.getAttribute("href").split("?")[0];
      a.setAttribute("href", consulta ? base + "?" + consulta : base);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-miga-dinamica]"), function (tramo) {
      var nodo = control(tramo.dataset.migaDinamica);
      if (nodo) { tramo.textContent = etiquetaDe(nodo); }
    });
  }

  /* Repinta cuando la pagina se quedo quieta. Hay dibujos que se calculan con el tamaño de su
     caja (el mapa pide el tamaño exacto que entra en el panel, para llenarlo sin deformarse):
     redimensionar el grafico no alcanza, hay que volver a pintarlo con la medida nueva. */
  /* Cambio el tamaño de las cajas: los graficos se redimensionan YA (para que el canvas
     coincida con su caja) y la pagina se repinta cuando se queda quieta. Lo usan el resize de
     la ventana y el zoom, que es el otro momento en que una caja cambia de tamaño de golpe. */
  function reacomodar() {
    estado.graficos.forEach(function (g) { g.resize(); });
    repintarPronto();
  }

  var esperaRepintar = null;
  function repintarPronto() {
    if (!estado.datos || !estado.pintar) { return; }
    if (esperaRepintar) { clearTimeout(esperaRepintar); }
    esperaRepintar = setTimeout(refrescar, 200);
  }

  function refrescar() {
    sincronizarNavegacion();
    sincronizarComparacion();
    return asegurarParticion().then(function () {
      estado.pintar(estado.datos.combos[clave()], estado.datos);
      /* Los paneles que se dibujan por su cuenta (hoy el de precios del MCBA, que tiene
         filtros y datos propios) se enteran por aca de que la pagina se repinto. Importa en
         la exportacion a PDF: la hoja tiene otro ancho que la ventana y hay dibujos que se
         calculan con el tamaño de su caja. */
      estado.extras.forEach(function (fn) { fn(); });
    });
  }

  function preseleccionar() {
    var parametros = new URLSearchParams(window.location.search);
    controles().forEach(function (nodo) {
      var pedido = parametros.get(nodo.dataset.filtro);
      if (pedido === null || !tiene(nodo, pedido)) { return; }
      fijar(nodo, pedido);
    });
  }

  /* -------- volver al estado anterior --------
     El boton [data-borrar] deshace de a un paso: guarda una foto de los filtros antes de cada
     cambio y la repone. Arranca oculto y solo se muestra cuando hay a donde volver: un control
     que no hace nada no se dibuja (formato_v1.navegacion.volver, bug que encontro JC). */
  function foto() {
    var valores = {};
    controles().forEach(function (nodo) { valores[nodo.dataset.filtro] = nodo.dataset.valor; });
    return valores;
  }

  function botonVolver() { return document.querySelector("[data-borrar]"); }

  function mostrarVolver() {
    var boton = botonVolver();
    if (boton) { boton.hidden = estado.historial.length === 0; }
  }

  function recordar(previa) {
    estado.historial.push(previa);
    mostrarVolver();
  }

  /* Engancha UN control. Se llama una vez por control de la pagina al arrancar y una vez por
     cada copia que se lleva el zoom adentro del dialogo: una copia sin este enganche se
     dibujaria bien (fijar() la mantiene al dia) pero no haria nada al tocarla. */
  function escucharControl(nodo) {
    if (nodo.dataset.control === "chips") {
      nodo.addEventListener("click", function (evento) {
        var boton = evento.target.closest("button[data-valor]");
        if (!boton) { return; }
        var previa = foto();
        if (fijar(nodo, boton.dataset.valor)) { recordar(previa); refrescar(); }
      });
    } else {
      nodo.querySelector("select").addEventListener("change", function (evento) {
        var previa = foto();
        if (fijar(nodo, evento.target.value)) { recordar(previa); refrescar(); }
      });
    }
  }

  function escuchar() {
    controles().forEach(escucharControl);
    var borrar = botonVolver();
    if (borrar) {
      borrar.addEventListener("click", function () {
        var anterior = estado.historial.pop();
        mostrarVolver();
        if (!anterior) { return; }
        var hubo = false;
        controles().forEach(function (nodo) {
          var valorPrevio = anterior[nodo.dataset.filtro];
          if (valorPrevio !== undefined && fijar(nodo, valorPrevio)) { hubo = true; }
        });
        if (hubo) { refrescar(); }
      });
    }
    mostrarVolver();
  }

  /* ================= cruzar datos en un mismo cuadro (Francisco, 24-sep-2026) =================
     Dos formas de cruce, las que eligio Francisco:

       - DOS VALORES DEL MISMO FILTRO: el cuadro dibuja, encima del suyo, el mismo dato para
         otro cultivo / otro producto / otro anio. No hace falta precomputar NADA: la
         comparacion es una segunda clave de combinacion y los combos ya estan en el payload
         (o en otra particion del mismo, que `asegurarParticion` baja a pedido).
       - DOS MEDIDAS: una segunda variable de la misma base, que el build manda en
         `panel.medidas_extra` cuando el cuadro la ofrece.

     Vive ADENTRO DEL ZOOM y en ningun otro lado: el tablero es la maqueta literal de JC
     -cuatro cuadros, una pantalla- y meterle selectores de comparacion romperia justo lo que
     el pidio que se respetara. Al cerrar el zoom se apaga sola y el tablero vuelve a ser el
     de JC.

     Que cuadro la ofrece y con que filtro lo dice el SPEC, no este archivo: el build dibuja
     los dos desplegables adentro del panel (ocultos) y el zoom los muda a su barra. Aca solo
     se los engancha y se guarda lo elegido; quien dibuja las dos series es el dibujante del
     cuadro (src/tableros/cliente/tablero.js), que pregunta por PIVOTAL.comparacion(id). */

  /* La clave de la combinacion con UN filtro cambiado. Mismo orden que `clave()`: el que
     declara el payload. */
  function claveComparada(filtro, valorNuevo) {
    return estado.datos.filtros.map(function (id) {
      return id === filtro ? valorNuevo : valor(id);
    }).join("|");
  }

  function etiquetaElegida(select) {
    var opcion = select.options[select.selectedIndex];
    return opcion ? opcion.textContent.trim() : "";
  }

  /* La etiqueta LARGA de un valor, la que el build puso en el desplegable de comparacion.
     No se toma del control del filtro porque varios se dibujan abreviados -la tira de anios
     de la cabecera dice "25" y no "2025", que entra en el ancho del chip- y en una leyenda
     que dice "25 · Cabezas movidas" contra "2022 · Cabezas movidas" el ojo no sabe si son
     dos anios o dos cosas distintas. El desplegable tiene todos los valores con su nombre
     entero, el puesto incluido (viaja escondido, no borrado). */
  function etiquetaDeValor(select, buscado) {
    var texto = buscado;
    Array.prototype.forEach.call(select.options, function (opcion) {
      if (opcion.value === buscado) { texto = opcion.textContent.trim(); }
    });
    return texto;
  }

  function selectComparar(campo) {
    var nodo = estado.comparar.nodo;
    return nodo ? nodo.querySelector(campo) : null;
  }

  /* Se ofrece comparar contra cualquier valor MENOS el que ya esta puesto: un valor contra si
     mismo son dos lineas identicas. Y si el usuario mueve el filtro de abajo justo al valor
     que estaba comparando, la comparacion se apaga sola en vez de quedar dibujando dos veces
     lo mismo. Corre en cada repintado, porque los controles del filtro viven afuera del
     cuadro y se pueden tocar con el zoom abierto. */
  function sincronizarComparacion() {
    var select = selectComparar("[data-comparar-valor]");
    if (!select) { return; }
    var actual = valor(estado.comparar.filtro);
    Array.prototype.forEach.call(select.options, function (opcion) {
      opcion.hidden = opcion.value !== "" && opcion.value === actual;
    });
    if (select.value === actual) {
      select.value = "";
      estado.comparar.valor = "";
    }
  }

  /* Engancha los dos desplegables del cuadro que se acaba de ampliar. Arrancan SIEMPRE
     apagados: la comparacion es a pedido y no se hereda de la vez anterior. */
  function engancharComparacion(nodo, idPanel) {
    var comparar = estado.comparar;
    comparar.panel = idPanel;
    comparar.nodo = nodo;
    comparar.filtro = nodo.dataset.filtroBase;
    comparar.valor = "";
    comparar.medida = "";
    var porValor = nodo.querySelector("[data-comparar-valor]");
    var porMedida = nodo.querySelector("[data-comparar-medida]");
    porValor.value = "";
    if (porMedida) { porMedida.value = ""; }
    /* El nodo es el mismo entre aperturas (se muda y se devuelve, no se clona): los listeners
       se ponen una sola vez. */
    if (!nodo.dataset.enganchado) {
      nodo.dataset.enganchado = "1";
      porValor.addEventListener("change", function () {
        estado.comparar.valor = porValor.value;
        refrescar();
      });
      if (porMedida) {
        porMedida.addEventListener("change", function () {
          estado.comparar.medida = porMedida.value;
          refrescar();
        });
      }
    }
    sincronizarComparacion();
  }

  function soltarComparacion() {
    var habia = !!(estado.comparar.valor || estado.comparar.medida);
    estado.comparar = { panel: null, nodo: null, filtro: null, valor: "", medida: "" };
    return habia;
  }

  /* Tamaño con el que hay que pedirle el mapa a ECharts para que ocupe TODO el panel sin
     deformarse. `relacion` (ancho/alto real del mapa) la manda el build desde el GeoJSON.
     ECharts toma layoutSize como el lado mayor del dibujo: se le pasa el alto que entra. */
  function tamanioMapa(nodo, relacion) {
    var rel = relacion || 0.75;
    var alto = nodo.clientHeight || 0;
    var ancho = nodo.clientWidth || 0;
    if (!alto || !ancho) { return "100%"; }
    return Math.max(40, Math.min(alto, ancho / rel));
  }

  /* -------- dibujado de las vistas de detalle -------- */
  function figuras() {
    return Array.prototype.slice.call(
      document.getElementById("cuadros").querySelectorAll("figure.cuadro"));
  }

  function texto(nodo, selector, valorTexto) {
    var destino = nodo.querySelector(selector);
    if (destino) { destino.textContent = valorTexto || ""; }
  }

  function pintarVista(dibujar) {
    return function (combo, datos) {
      var cajas = figuras();
      if (!combo) {
        cajas.forEach(function (caja) {
          texto(caja, "[data-titulo]", datos.sin_combinacion);
          texto(caja, "[data-subtitulo]", "");
          /* El RESUMEN (los indicadores del cuadro) se limpia como todo lo demas: si no,
             quedaban a la vista los numeros del cultivo anterior justo al lado del cartel de
             "no hay datos", que es el peor error posible: un dato que no es el que se pidio. */
          ["[data-tabla]", "[data-leyenda]", "[data-resumen]"].forEach(function (sel) {
            var nodo = caja.querySelector(sel);
            if (nodo) { vaciar(nodo); }
          });
          /* El recuadro del grafico se limpia y se PLIEGA: sin datos no hay nada que dibujar,
             y un rectangulo vacio de 360px se lee como un cuadro roto. El cartel queda en el
             titulo, donde el lector ya esta mirando. */
          var grafico = caja.querySelector("[data-grafico]");
          if (grafico) { limpiarGrafico(grafico); grafico.hidden = true; }
          texto(caja, "[data-total]", "");
          texto(caja, "[data-nota]", "");
        });
        return;
      }
      combo.elementos.forEach(function (elemento, i) {
        var caja = cajas[i];
        if (!caja) { return; }
        // Vuelve el grafico que se habia plegado por falta de datos
        var grafico = caja.querySelector("[data-grafico]");
        if (grafico) { grafico.hidden = false; }
        texto(caja, "[data-titulo]", elemento.titulo);
        texto(caja, "[data-subtitulo]", elemento.subtitulo);
        texto(caja, "[data-nota]", elemento.nota);
      });
      dibujar(combo, cajas);
    };
  }

  /* -------- exportar como PDF (panel UTILIDADES) --------
     El PDF lo arma el NAVEGADOR: el boton imprime la pagina y el usuario elige "Guardar como
     PDF". Asi no entra ninguna libreria nueva, el PDF sale con la seleccion que el usuario
     tiene puesta y las tablas siguen siendo texto (se pueden copiar y buscar). Que entra y
     que no en la hoja impresa lo decide el bloque @media print del CSS, no este archivo.

     Lo unico que hay que resolver aca son los graficos: son canvas, y el canvas se imprime
     con la resolucion que tiene en pantalla, o sea mordido en papel. Antes de imprimir se le
     pide a ECharts el mismo dibujo a triple resolucion y se cuelga como <img> al lado del
     canvas; la hoja de impresion muestra la imagen y esconde el canvas. Al terminar se
     sacan las imagenes y la pagina queda como estaba. */
  var RESOLUCION_IMPRESION = 3;

  function imagenesDeGraficos() {
    var cargas = [];
    estado.graficos.forEach(function (instancia) {
      var nodo = instancia.getDom();
      if (!nodo || !nodo.clientWidth || !nodo.clientHeight) { return; }
      var img = document.createElement("img");
      img.className = "grafico-impreso";
      img.alt = "";
      nodo.classList.add("grafico-en-pantalla");
      nodo.parentNode.insertBefore(img, nodo.nextSibling);
      cargas.push(new Promise(function (listo) {
        /* Se espera la carga: si se imprime antes de que la imagen este decodificada, el
           navegador imprime el hueco en blanco. */
        img.onload = listo;
        img.onerror = listo;
        img.src = instancia.getDataURL({ pixelRatio: RESOLUCION_IMPRESION });
      }));
    });
    return Promise.all(cargas);
  }

  function sacarImagenes() {
    Array.prototype.forEach.call(document.querySelectorAll(".grafico-impreso"), function (img) {
      img.parentNode.removeChild(img);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".grafico-en-pantalla"), function (n) {
      n.classList.remove("grafico-en-pantalla");
    });
  }

  /* ECharts avisa con "finished" cuando termino de dibujar, animacion incluida. Se espera
     ese aviso y no un tiempo fijo: una foto sacada a mitad de la animacion sale a medias.
     Hay que suscribirse ANTES de mandar a redibujar. */
  function redibujarYEsperar() {
    var esperas = estado.graficos.map(function (instancia) {
      return new Promise(function (listo) {
        var fin = function () { instancia.off("finished", fin); listo(); };
        instancia.on("finished", fin);
        setTimeout(fin, 1500);   /* red de seguridad: si no avisa, se sigue igual */
      });
    });
    estado.graficos.forEach(function (instancia) { instancia.resize(); });
    /* Redimensionar no alcanza: el mapa se calcula con el tamaño de su caja (tamanioMapa),
       asi que en la caja de la hoja hay que volver a pintarlo. */
    refrescar();
    return Promise.all(esperas);
  }

  function exportarPdf(boton) {
    if (boton.dataset.ocupado) { return; }
    boton.dataset.ocupado = "1";
    /* Si hay un cuadro ampliado, se cierra ANTES de imprimir. El formato de la hoja lo define
       la clase `imprimiendo` sobre el tablero entero, y un dialogo modal no se imprime: con un
       panel afuera de su celda la hoja saldria con un hueco donde iba el cuadro. El PDF es
       siempre el tablero completo con la seleccion vigente. Se cierra en seco: lo que sigue
       mide y fotografia los graficos, y no puede esperar a que termine una animacion. */
    cerrarZoomYa();
    /* La pagina se pone con el formato de la HOJA (CSS, .imprimiendo) y recien ahi se sacan
       las fotos: asi salen con las proporciones de lo que se va a imprimir y no con las de la
       ventana. La clase queda puesta durante la impresion, asi que lo que se ve un instante
       en pantalla es exactamente lo que sale en el PDF. */
    document.documentElement.classList.add("imprimiendo");
    /* El tablero se reparte el alto de la hoja con las mismas reglas con que se reparte el de
       la ventana (`alto-fijo`). En pantalla esa clase la pone tablero.js solo si la ventana es
       ancha; la hoja mide siempre lo mismo, asi que si no esta, aca se pone. */
    var tablero = document.getElementById("tablero");
    var altoPuesto = tablero && !tablero.classList.contains("alto-fijo");
    if (altoPuesto) { tablero.classList.add("alto-fijo"); }
    redibujarYEsperar().then(imagenesDeGraficos).then(function () {
      var limpiar = function () {
        window.removeEventListener("afterprint", limpiar);
        document.documentElement.classList.remove("imprimiendo");
        if (altoPuesto) { tablero.classList.remove("alto-fijo"); }
        sacarImagenes();
        delete boton.dataset.ocupado;
        redibujarYEsperar();
      };
      window.addEventListener("afterprint", limpiar);
      window.print();
      /* Red de seguridad: no todos los navegadores avisan el fin de la impresion. */
      setTimeout(limpiar, 60000);
    });
  }

  /* -------- Zoom: el cuadro a PANTALLA COMPLETA (pedido de Francisco, 24-sep-2026) --------
     Esta en la maqueta de pasturas y forrajes de JC: al pie de cada cuadro, al lado de
     "Generar PDF", dice "Zoom". El punto del pedido no es solo agrandar el dibujo: es que los
     CONTROLES del cuadro (chips y desplegables) se vean grandes, que en el tablero son chicos
     a proposito porque todo tiene que entrar en una pantalla.

     Como esta hecho, y por que:

     - <dialog> nativo con showModal(): el navegador ya trae Escape, el foco atrapado adentro,
       el fondo inerte, el backdrop y la devolucion del foco al cerrar. Cero dependencias.
     - Se MUEVE el nodo real del panel adentro del dialogo y se devuelve al cerrar. Clonarlo
       dejaria dos nodos con el mismo data-grafico, dos instancias de ECharts sobre el mismo
       dibujo y dos fuentes de verdad.
     - El dialogo se inserta EN EL LUGAR del panel (adentro del hueco que lo reemplaza) y no al
       final del <body>: quien pinta el tablero busca sus cajas con
       `contenedor.querySelectorAll("[data-panel]")` y las vistas de detalle las buscan POR
       ORDEN (`figure.cuadro` de #cuadros). Colgando el dialogo del body, el panel ampliado se
       caia de esa lista y dejaba de repintarse; colgandolo en su lugar, para el DOM el panel
       sigue donde estaba y el usuario lo ve a pantalla completa igual, porque un dialogo
       modal se dibuja en la capa superior sin importar donde este colgado.
       De yapa: las reglas CSS del tablero (`.tablero.alto-fijo .panel ...`) le siguen
       llegando, porque los selectores miran el arbol y no la capa de dibujo.
     - El hueco queda con el ALTO MEDIDO del panel para que la grilla no se desarme detras.
     - Los controles que gobiernan el cuadro y viven AFUERA (la tira de anios de la cabecera,
       los chips de la barra) se copian a la barra del dialogo. Copiarlos es seguro desde que
       comun.js sincroniza todos los controles que comparten data-filtro: la copia se mantiene
       al dia sola y la clave de la combinacion se sigue armando con el primero. Lo unico que
       hay que darles a mano es el enganche del click (escucharControl) y el dibujo del valor
       vigente (dibujarValor), que cloneNode no copia en un <select>.
     - Abre y cierra ANIMADO: el cuadro crece desde donde estaba y vuelve a su lugar. Esta
       abajo, en moverCaja(). */
  var zoom = { dialogo: null, caja: null, marco: null, controles: null, panel: null,
               hueco: null, tituloPropio: null, fin: null, cerrando: false,
               base: null, comparar: null, dondeComparar: null };

  /* -------- la animacion de apertura y cierre (Francisco, 24-sep-2026) --------
     Aparecia de golpe. Ahora el cuadro CRECE desde donde estaba hasta la pantalla y al cerrar
     VUELVE A SU LUGAR, que es el gesto que hace entender de donde salio y a donde vuelve.

     Como: se mide el rectangulo del panel antes de mudarlo (el mismo con el que se le fija el
     alto al hueco) y se anima la caja del dialogo DESDE ese rectangulo HASTA la pantalla
     entera, con `transform` y nada mas. Dos motivos: es lo unico que el navegador mueve sin
     rehacer la pagina en cada cuadro, y -mas importante aca- el transform NO cambia el
     layout, asi que la caja mide lo mismo que a pantalla completa desde el primer cuadro y
     ningun grafico llega a medir una caja intermedia. Animar alto/ancho romperia justo eso.

     La duracion y la curva estan en el CSS (--zoom-dur); ZOOM_MS es el mismo numero, que aca
     se necesita para la red de seguridad del transitionend. Si se cambia uno, se cambia el
     otro. */
  var ZOOM_MS = 220;

  function sinMovimiento() {
    return !!(window.matchMedia &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* El rectangulo que ocupa la caja del dialogo cuando NO tiene transform puesto, que es el
     destino real de la animacion. Se mide y se guarda al abrir, y se vuelve a medir cada vez
     que la caja esta quieta (por si cambio el tamanio de la ventana con el zoom abierto).
     Durante una animacion no se mide: ahi getBoundingClientRect devuelve el rectangulo YA
     transformado, que es justamente lo que no se busca. */
  function baseDeLaCaja() {
    if (!zoom.fin && getComputedStyle(zoom.caja).transform === "none") {
      zoom.base = zoom.caja.getBoundingClientRect();
    }
    return zoom.base;
  }

  /* El transform que encoge la caja del dialogo hasta el rectangulo `r` de la pantalla. Con
     transform-origin en 0 0: primero se lleva la esquina superior izquierda a su lugar y
     despues se escala.
     Se calcula contra la CAJA y no contra la ventana. Desde que el dialogo lleva un marco de
     fondo (el `padding: 2vmin` que hace clickeable el afuera), la caja ya no mide lo mismo
     que la ventana ni arranca en su esquina: con las medidas de la ventana el cuadro
     terminaba corrido y escalado de menos, justo en el cuadro final de la animacion. */
  function encajarEn(r) {
    var c = baseDeLaCaja();
    return "translate(" + (r.left - c.left) + "px," + (r.top - c.top) + "px) scale(" +
           (Math.max(r.width, 1) / Math.max(c.width, 1)) + "," +
           (Math.max(r.height, 1) / Math.max(c.height, 1)) + ")";
  }

  /* Corta la animacion en curso: la caja queda donde iba a terminar (el valor final ya esta
     escrito en el estilo en linea). Con `cancelar` se saltea su remate -el repintado-, porque
     el movimiento que la interrumpe va a hacer el suyo al final. */
  function cortarAnimacion(cancelar) {
    if (zoom.fin) { zoom.fin(cancelar); }
  }

  /* Lleva la caja de `desde` a `hasta`. `visible` prende o apaga el fondo oscuro.
     `alFin` corre CUANDO LA GEOMETRIA SE ASENTO, nunca durante: ahi adentro va el repintado
     de los graficos, y un repintado a mitad de camino dejaria al mapa calculado con una caja
     que no es la final.

     El orden de las tres lineas del medio no es decorativo: se escribe el estado INICIAL sin
     transicion, se fuerza un reflow para que el navegador lo registre, y recien despues se
     pide el final. Sin ese reflow el navegador ve un solo cambio de estilo y no hay nada que
     animar. Y es la unica manera de que el ::backdrop -que nace junto con showModal()- tenga
     un estado anterior del que partir. */
  function moverCaja(desde, hasta, visible, alFin) {
    var caja = zoom.caja;
    cortarAnimacion(true);
    if (sinMovimiento()) {
      zoom.dialogo.classList.toggle("zoom-visible", visible);
      caja.style.transform = hasta;
      alFin();
      return;
    }
    zoom.dialogo.classList.add("zoom-animando");
    caja.style.transition = "none";
    caja.style.transform = desde;
    zoom.dialogo.classList.toggle("zoom-visible", !visible);
    void caja.offsetWidth;
    zoom.dialogo.classList.toggle("zoom-visible", visible);
    caja.style.transition = "";
    caja.style.transform = hasta;

    var reloj = null;
    var terminar = function (cancelado) {
      if (zoom.fin !== terminar) { return; }
      zoom.fin = null;
      clearTimeout(reloj);
      caja.removeEventListener("transitionend", alTerminar);
      zoom.dialogo.classList.remove("zoom-animando");
      if (!cancelado) { alFin(); }
    };
    var alTerminar = function (evento) {
      if (evento.target === caja && evento.propertyName === "transform") { terminar(false); }
    };
    caja.addEventListener("transitionend", alTerminar);
    /* Red de seguridad por tiempo: hay casos en que el aviso no llega (transicion
       interrumpida, pestania en segundo plano, un navegador que decide no animar). El
       repintado tiene que ocurrir igual. */
    reloj = setTimeout(function () { terminar(false); }, ZOOM_MS + 150);
    zoom.fin = terminar;
  }

  function crearDialogo() {
    var dialogo = document.createElement("dialog");
    dialogo.className = "zoom";
    var caja = document.createElement("div");
    caja.className = "zoom-caja";
    var barra = document.createElement("div");
    barra.className = "zoom-barra";
    var controles = document.createElement("div");
    controles.className = "zoom-controles";
    var cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.className = "zoom-cerrar";
    cerrar.setAttribute("aria-label", "Cerrar la vista ampliada");
    cerrar.textContent = "\u2715";
    cerrar.addEventListener("click", function () { cerrarZoom(); });
    barra.appendChild(controles);
    barra.appendChild(cerrar);
    var marco = document.createElement("div");
    marco.className = "zoom-marco";
    caja.appendChild(barra);
    caja.appendChild(marco);
    dialogo.appendChild(caja);
    /* Click afuera: el backdrop no es un nodo propio, asi que el click sobre el fondo llega
       con `target` el dialogo mismo (lo de adentro lo tapa .zoom-caja). */
    dialogo.addEventListener("click", function (evento) {
      if (evento.target === dialogo) { cerrarZoom(); }
    });
    /* Escape: el navegador cerraria el dialogo en el acto y se perderia el camino de vuelta.
       Se le pide que no lo cierre el (el evento `cancel` es cancelable) y se cierra por el
       mismo camino que la cruz, animacion incluida; el cierre real llega al final. El foco
       atrapado y la devolucion del foco los sigue manejando el navegador, porque el dialogo
       sigue abierto hasta close(). Un segundo Escape mientras vuelve NO se ataja: ahi el
       navegador cierra en seco, que es lo que el usuario esta pidiendo. */
    dialogo.addEventListener("cancel", function (evento) {
      if (zoom.cerrando) { return; }
      evento.preventDefault();
      cerrarZoom();
    });
    /* Red de seguridad: si el dialogo se cerrara por un camino que no es el nuestro, el panel
       vuelve igual. devolverPanel es idempotente. */
    dialogo.addEventListener("close", devolverPanel);
    zoom.dialogo = dialogo;
    zoom.caja = caja;
    zoom.marco = marco;
    zoom.controles = controles;
    return dialogo;
  }

  /* Los ids que viajan en una copia se renombran: dos nodos con el mismo id rompen el `for`
     de las etiquetas (el desplegable de la barra de filtros lleva label + id). */
  function renombrarIds(copia) {
    Array.prototype.forEach.call(copia.querySelectorAll("[id]"), function (nodo) {
      var viejo = nodo.id;
      var nuevo = "zoom-" + viejo;
      Array.prototype.forEach.call(copia.querySelectorAll('[for="' + viejo + '"]'), function (e) {
        e.setAttribute("for", nuevo);
      });
      nodo.id = nuevo;
    });
  }

  /* Nombre accesible del dialogo: el titulo del cuadro. Se prefiere apuntar al nodo del titulo
     (aria-labelledby) porque ese nodo viaja adentro del dialogo y se repinta con los filtros,
     asi que el nombre acompania a lo que se esta mirando. El mapa del tablero de cultivos no
     dibuja titulo (arriba lleva el rotulo "Seleccione departamento"): ahi va un nombre fijo. */
  function nombrarDialogo(panel) {
    var titulo = panel.querySelector("[data-titulo], .panel-cab h2");
    zoom.dialogo.removeAttribute("aria-label");
    zoom.dialogo.removeAttribute("aria-labelledby");
    zoom.tituloPropio = null;
    if (titulo && titulo.textContent.trim()) {
      if (!titulo.id) { titulo.id = "zoom-titulo"; zoom.tituloPropio = titulo; }
      zoom.dialogo.setAttribute("aria-labelledby", titulo.id);
    } else {
      zoom.dialogo.setAttribute("aria-label", "Cuadro ampliado");
    }
  }

  /* Adentro del dialogo tienen que estar TODOS los filtros que arman la combinacion, porque
     todos gobiernan lo que muestra el cuadro: los que se dibujan adentro del panel viajan con
     el, y de los demas se copia uno. UNO: un mismo filtro se dibuja mas de una vez en la
     pagina (los chips de producto de la maqueta "Agri 2" estan en dos paneles, y el que se
     amplia puede ser un tercero que no los tiene). Copiarlos todos serian dos filas de chips
     identicas en la misma barra; copiar el que sea, sabiendo que comun.js los mantiene a
     todos en sincronia, alcanza y sobra. */
  function copiarControlesDeAfuera(panel) {
    var dibujados = {};
    controles().forEach(function (nodo) {
      if (panel.contains(nodo)) { dibujados[nodo.dataset.filtro] = true; }
    });
    controles().forEach(function (nodo) {
      if (panel.contains(nodo) || dibujados[nodo.dataset.filtro]) { return; }
      dibujados[nodo.dataset.filtro] = true;
      var copia = nodo.cloneNode(true);
      renombrarIds(copia);
      dibujarValor(copia, copia.dataset.valor);
      zoom.controles.appendChild(copia);
      escucharControl(copia);
    });
  }

  function abrirZoom(boton) {
    var panel = boton.closest(".panel");
    if (!panel || zoom.panel) { return; }
    var dialogo = zoom.dialogo || crearDialogo();
    /* El rectangulo que ocupa el panel AHORA: de ahi arranca la animacion y de ahi sale el
       alto del hueco. Se mide antes de tocar nada, que es el unico momento en que el panel
       todavia esta en su celda. */
    var desde = panel.getBoundingClientRect();
    /* El hueco se queda con el alto que TENIA el panel: la fila del tablero se dimensiona por
       su contenido y sin esto la grilla se desarmaria detras del dialogo. El ancho lo sigue
       dando la celda (data-ancho es lo que la define en la grilla de 12). */
    var hueco = document.createElement("div");
    hueco.className = "zoom-hueco";
    hueco.style.height = Math.round(desde.height) + "px";
    hueco.style.flex = "0 0 auto";
    if (panel.dataset.ancho) { hueco.dataset.ancho = panel.dataset.ancho; }
    if (panel.dataset.alto) { hueco.dataset.alto = panel.dataset.alto; }
    panel.parentNode.insertBefore(hueco, panel);
    hueco.appendChild(dialogo);
    vaciar(zoom.controles);
    copiarControlesDeAfuera(panel);
    /* Los dos desplegables de comparacion del cuadro (si los declara su spec) se MUDAN a la
       barra, igual que el panel: son suyos y tienen que volver con el. En el tablero viven
       ocultos adentro del panel, que es donde el build los dibuja. */
    var comparar = panel.querySelector("[data-comparar]");
    if (comparar) {
      zoom.comparar = comparar;
      zoom.dondeComparar = comparar.nextSibling;
      comparar.hidden = false;
      zoom.controles.appendChild(comparar);
      engancharComparacion(comparar, panel.dataset.panel);
    }
    zoom.marco.appendChild(panel);
    zoom.panel = panel;
    zoom.hueco = hueco;
    nombrarDialogo(panel);
    dialogo.showModal();
    /* La geometria de destino de la animacion, medida con la caja LIMPIA: al cerrar quedo con
       el transform de vuelta escrito en linea y sin este borrado se mediria el rectangulo
       encogido de la apertura anterior. */
    zoom.caja.style.transition = "none";
    zoom.caja.style.transform = "none";
    zoom.base = zoom.caja.getBoundingClientRect();
    /* Los graficos se redimensionan ACA, antes de que la caja se empiece a mover, y no es una
       contradiccion con lo de arriba: el transform no toca el layout, asi que el panel ya mide
       lo que va a medir a pantalla completa y ECharts mide bien desde el primer cuadro. Lo que
       crece es entonces el dibujo definitivo y no el viejo estirado. El repintado completo
       -el que vuelve a calcular el mapa con el tamanio de su caja- va igual al final. */
    estado.graficos.forEach(function (g) { g.resize(); });
    moverCaja(encajarEn(desde), "none", true, reacomodar);
  }

  /* Las tres maneras de cerrar (la cruz, el click afuera y Escape) pasan por aca. La caja
     vuelve encogiendose hasta el HUECO -que es el lugar exacto al que el panel va a volver- y
     recien al terminar se cierra el dialogo y se devuelve el panel. Devolverlo antes dejaria
     ver el hueco por debajo del cuadro que todavia se esta moviendo.
     El cierre del dialogo dispara `close`, que llama a devolverPanel; se lo llama igual a
     mano por si ese aviso llegara en otra tarea. devolverPanel es idempotente: el que llegue
     segundo no hace nada. */
  function cerrarZoom() {
    if (!zoom.panel || zoom.cerrando) { return; }
    zoom.cerrando = true;
    /* Se arranca de donde esta la caja AHORA: si la apertura venia a medio camino, esto es su
       matriz de este instante y la vuelta sigue desde ahi sin saltos. Hay que leerlo antes de
       cortar la animacion, que deja la caja en su valor final. */
    var desde = getComputedStyle(zoom.caja).transform;
    moverCaja(desde, encajarEn(zoom.hueco.getBoundingClientRect()), false, function () {
      zoom.cerrando = false;
      zoom.dialogo.close();
      devolverPanel();
    });
  }

  /* Cierre en seco, sin animacion: lo usa "Generar PDF", que necesita el tablero entero y
     cada panel en su celda ANTES de medir y de sacar las fotos de los graficos. */
  function cerrarZoomYa() {
    if (!zoom.panel) { return; }
    cortarAnimacion(true);
    zoom.cerrando = false;
    zoom.dialogo.close();
    devolverPanel();
  }

  function devolverPanel() {
    if (!zoom.panel) { return; }
    var panel = zoom.panel;
    var hueco = zoom.hueco;
    zoom.panel = null;
    zoom.hueco = null;
    zoom.cerrando = false;
    zoom.dialogo.classList.remove("zoom-visible");
    zoom.dialogo.classList.remove("zoom-animando");
    hueco.parentNode.insertBefore(panel, hueco);   /* exactamente donde estaba */
    hueco.removeChild(zoom.dialogo);
    hueco.parentNode.removeChild(hueco);
    /* La comparacion se APAGA al cerrar: el tablero vuelve a ser el de JC. Los dos
       desplegables vuelven a su lugar adentro del panel -y ocultos- antes de vaciar la barra,
       que se lleva puesto todo lo que le quede adentro. */
    if (zoom.comparar) {
      zoom.comparar.hidden = true;
      panel.insertBefore(zoom.comparar, zoom.dondeComparar);
      zoom.comparar = null;
      zoom.dondeComparar = null;
    }
    var habiaComparacion = soltarComparacion();
    vaciar(zoom.controles);                        /* las copias no sobreviven al cierre */
    if (zoom.tituloPropio) { zoom.tituloPropio.removeAttribute("id"); zoom.tituloPropio = null; }
    /* Con la comparacion apagada el cuadro tiene que volver a su dibujo de una, sin esperar el
       repintado con retardo de `reacomodar`: si no, el tablero se queda un pestanieo con dos
       series y la leyenda de la comparacion. */
    if (habiaComparacion) { refrescar(); }
    reacomodar();
  }

  var ACCIONES = { "exportar-pdf": exportarPdf, "zoom": abrirZoom };

  /* Los botones de accion: los del panel UTILIDADES (cultivos extensivos) y los del pie de
     cada cuadro (maqueta "Agri 2": un "Generar PDF" por panel). Son el mismo boton dibujado
     en distintos lugares y se enganchan todos igual. El build solo deja pasar acciones que
     existan aca (site_build.ACCIONES_UTILIDAD), asi que no hay botones sin dueño. El atributo
     es `data-utilidad` y no `data-accion` porque ese ya es el hueco de texto de la ayuda del
     mapa ("Seleccione departamento"). */
  function engancharUtilidades() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-utilidad]"), function (boton) {
      var hacer = ACCIONES[boton.dataset.utilidad];
      if (hacer) { boton.addEventListener("click", function () { hacer(boton); }); }
    });
  }

  var PIVOTAL = {
    vaciar: vaciar,
    tamanioMapa: tamanioMapa,

    /* Registra un dibujo que NO sale de la combinacion de filtros de la pagina, para que se
       repinte junto con el resto (ver `refrescar`). */
    alRepintar: function (fn) { estado.extras.push(fn); },

    /* La comparacion vigente PARA ESE CUADRO, o null si no esta comparando (que es el caso
       normal: el tablero cerrado nunca compara). Lo que devuelve es todo lo que el dibujante
       necesita y nada mas:
         valor / otro    el segundo valor del filtro y su etiqueta ("Maíz")
         sujeto          la etiqueta del valor que ya estaba puesto ("Soja")
         panel           el MISMO cuadro de la otra combinacion, tal como lo armo el build
         medida / medidaEtiqueta   la segunda medida elegida, si hay
         serie / titulo / tituloMedida / nota   las plantillas de texto, que vienen del spec:
                         el navegador sustituye slots, no escribe frases. */
    comparacion: function (idPanel) {
      var comparar = estado.comparar;
      if (comparar.panel !== idPanel || (!comparar.valor && !comparar.medida)) { return null; }
      var otro = comparar.valor
        ? estado.datos.combos[claveComparada(comparar.filtro, comparar.valor)] : null;
      var porMedida = selectComparar("[data-comparar-medida]");
      var porValor = selectComparar("[data-comparar-valor]");
      return {
        valor: comparar.valor,
        otro: comparar.valor ? etiquetaElegida(porValor) : "",
        sujeto: etiquetaDeValor(porValor, valor(comparar.filtro)),
        panel: otro ? otro.paneles[idPanel] : null,
        medida: comparar.medida,
        medidaEtiqueta: comparar.medida && porMedida ? etiquetaElegida(porMedida) : "",
        serie: comparar.nodo.dataset.serie,
        titulo: comparar.nodo.dataset.titulo,
        tituloMedida: comparar.nodo.dataset.tituloMedida,
        nota: comparar.nodo.dataset.nota
      };
    },

    /* Color del tema, por su variable CSS. El cromo de los graficos (ejes, guias, bordes de
       las porciones) sale del mismo lugar que el del resto de la pagina: theme.yaml. Los
       colores de los DATOS siguen viniendo resueltos del build, no de aca. */
    color: function (variable) {
      if (!estado.colores[variable]) {
        estado.colores[variable] =
          getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
      }
      return estado.colores[variable];
    },

    /* La seleccion vigente como query string ("cultivo=Soja+total&campania=2024%2F25").
       La usan los saltos programaticos (el clic en un departamento del mapa) para conservar
       los filtros, igual que los links data-conserva. */
    parametros: function () {
      var parametros = new URLSearchParams();
      controles().forEach(function (nodo) {
        if (nodo.dataset.valor) { parametros.set(nodo.dataset.filtro, nodo.dataset.valor); }
      });
      return parametros.toString();
    },

    /* Etiqueta de una marca de eje. Los textos vienen del build, indexados por el valor de la
       marca; el fallback cubre el ruido de coma flotante que ECharts puede meter al iterar. */
    etiquetaEje: function (eje, valorEje) {
      var t = eje.etiquetas[String(valorEje)];
      if (t === undefined) { t = eje.etiquetas[String(Number(valorEje.toFixed(6)))]; }
      return t === undefined ? valorEje : t;
    },

    /* Registra un grafico de ECharts para que se redimensione con la ventana Y con su caja. */
    grafico: function (nodo) {
      var instancia = echarts.getInstanceByDom(nodo) || echarts.init(nodo, null, { renderer: "canvas" });
      if (estado.graficos.indexOf(instancia) === -1) {
        estado.graficos.push(instancia);
        /* El alto de varias cajas no lo fija el CSS sino el reparto de flexbox, que se resuelve
           DESPUES de que ECharts midio el contenedor. Sin esto el canvas se queda para siempre
           con el alto que habia al inicializar (el min-height) mientras la caja crece, y el
           dibujo deja de coincidir con su caja: en el anillo del tablero el grafico quedaba
           arriba y el total, que va en HTML centrado sobre la caja, aparecia abajo.
           Escuchar el resize de la VENTANA no alcanza: el alto tambien cambia al pintar. */
        if (window.ResizeObserver) {
          new ResizeObserver(function () { instancia.resize(); repintarPronto(); }).observe(nodo);
        }
      }
      return instancia;
    },

    tabla: function (nodo, columnas, filas) {
      vaciar(nodo);
      var thead = document.createElement("thead");
      var trCabeza = document.createElement("tr");
      columnas.forEach(function (columna, i) {
        var th = document.createElement("th");
        th.textContent = columna.etiqueta;
        if (columna.num) { th.className = "num"; }
        if (i === 0) { th.className = (th.className + " primera-col").trim(); }
        trCabeza.appendChild(th);
      });
      thead.appendChild(trCabeza);
      nodo.appendChild(thead);

      var tbody = document.createElement("tbody");
      filas.forEach(function (fila) {
        var tr = document.createElement("tr");
        if (fila.total) { tr.className = "fila-total"; }
        if (fila.id) { tr.dataset.geo = fila.id; }
        fila.celdas.forEach(function (celda, i) {
          var td = document.createElement("td");
          var clases = [];
          if (columnas[i] && columnas[i].num) { clases.push("num"); }
          if (i === 0) { clases.push("primera-col"); }
          if (typeof celda === "object" && celda !== null) {
            td.textContent = celda.t;
            if (celda.c) { clases.push(celda.c); }
          } else {
            td.textContent = celda;
          }
          if (clases.length) { td.className = clases.join(" "); }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      nodo.appendChild(tbody);
      return tbody;
    },

    /* Punto de entrada generico: baja `ruta`, engancha los controles y llama a
       pintar(combo, datos) en cada cambio. Lo usa el tablero. */
    arrancar: function (ruta, pintar) {
      estado.pintar = pintar;
      return fetch(ruta).then(function (r) { return r.json(); }).then(function (datos) {
        estado.datos = datos;
        preseleccionar();
        escuchar();
        engancharUtilidades();
        window.addEventListener("resize", reacomodar);
        return refrescar();
      });
    },

    /* Punto de entrada de las vistas de detalle. */
    init: function (dibujar) {
      var contenedor = document.getElementById("cuadros");
      return PIVOTAL.arrancar(contenedor.dataset.datos, pintarVista(dibujar));
    }
  };
  return PIVOTAL;
}
