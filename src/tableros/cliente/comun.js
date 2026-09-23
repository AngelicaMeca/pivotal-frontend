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

  var estado = { datos: null, pintar: null, graficos: [], bajadas: {}, historial: [],
                 colores: {}, extras: [] };

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

  function pintarControl(nodo, nuevo) {
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

  /* Repinta cuando la pagina se quedo quieta. Hay dibujos que se calculan con el tamaño de su
     caja (el mapa pide el tamaño exacto que entra en el panel, para llenarlo sin deformarse):
     redimensionar el grafico no alcanza, hay que volver a pintarlo con la medida nueva. */
  var esperaRepintar = null;
  function repintarPronto() {
    if (!estado.datos || !estado.pintar) { return; }
    if (esperaRepintar) { clearTimeout(esperaRepintar); }
    esperaRepintar = setTimeout(refrescar, 200);
  }

  function refrescar() {
    sincronizarNavegacion();
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

  var ACCIONES = { "exportar-pdf": exportarPdf };

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
        window.addEventListener("resize", function () {
          estado.graficos.forEach(function (g) { g.resize(); });
          repintarPronto();
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
