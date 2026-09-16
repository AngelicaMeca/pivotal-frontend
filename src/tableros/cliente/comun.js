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

  var estado = { datos: null, pintar: null, graficos: [], bajadas: {}, historial: [] };

  /* -------- controles de filtro -------- */
  function controles() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-control]"));
  }

  function control(id) {
    return document.querySelector('[data-control][data-filtro="' + id + '"]');
  }

  function valor(id) {
    var nodo = control(id);
    return nodo ? nodo.dataset.valor : null;
  }

  function fijar(nodo, nuevo) {
    if (nodo.dataset.valor === nuevo) { return false; }
    nodo.dataset.valor = nuevo;
    if (nodo.dataset.control === "chips") {
      Array.prototype.forEach.call(nodo.querySelectorAll("button[data-valor]"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.valor === nuevo ? "true" : "false");
      });
    } else {
      var select = nodo.querySelector("select");
      if (select && select.value !== nuevo) { select.value = nuevo; }
    }
    return true;
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

  /* Vistas grandes: el JSON viene partido por el valor de un filtro (ej. el cultivo del mapa).
     Se baja el indice y despues, a demanda, la particion que corresponde. */
  function asegurarParticion() {
    var datos = estado.datos;
    if (!datos.particion) { return Promise.resolve(); }
    var ruta = datos.archivos[valor(datos.particion)];
    if (!ruta || estado.bajadas[ruta]) { return Promise.resolve(); }
    estado.bajadas[ruta] = true;
    return fetch(ruta).then(function (r) { return r.json(); }).then(function (parte) {
      Object.keys(parte.combos).forEach(function (k) { datos.combos[k] = parte.combos[k]; });
    });
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

  function refrescar() {
    sincronizarNavegacion();
    return asegurarParticion().then(function () {
      estado.pintar(estado.datos.combos[clave()], estado.datos);
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

  function escuchar() {
    controles().forEach(function (nodo) {
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
    });
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
          ["[data-grafico]", "[data-tabla]", "[data-leyenda]"].forEach(function (sel) {
            var nodo = caja.querySelector(sel);
            if (nodo) { vaciar(nodo); }
          });
          texto(caja, "[data-total]", "");
          texto(caja, "[data-nota]", "");
        });
        return;
      }
      combo.elementos.forEach(function (elemento, i) {
        var caja = cajas[i];
        if (!caja) { return; }
        texto(caja, "[data-titulo]", elemento.titulo);
        texto(caja, "[data-subtitulo]", elemento.subtitulo);
        texto(caja, "[data-nota]", elemento.nota);
      });
      dibujar(combo, cajas);
    };
  }

  var PIVOTAL = {
    vaciar: vaciar,

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
          new ResizeObserver(function () { instancia.resize(); }).observe(nodo);
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
        window.addEventListener("resize", function () {
          estado.graficos.forEach(function (g) { g.resize(); });
        });
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
