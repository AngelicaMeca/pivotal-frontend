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
  /* `dto` es el departamento elegido ("" = la provincia) y `dtoCombos` lo que se bajo de
     cada uno. Ver "capa departamental", mas abajo. */
  var estado = { datos: null, pintar: null, graficos: [], bajadas: {}, historial: [],
                 colores: {}, extras: [], claves: [], dto: "", dtoCombos: {}, fallo: false,
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

  /* ================= opciones sin datos: no se pueden elegir =================
     Regla de JC (hoja "Agri 1 Dto" de su maqueta, 29-sep-2026): "SOLO DEBERAN ESTAR ACTIVOS
     LOS LINKS PARA CASOS DONDE EXISTAN DATOS. Por ejemplo, si no hay datos para 'garbanzo' en
     departamento Alberdi, QUE NO PUEDA PONERSE ACTIVO."

     Antes se podia elegir igual y el cuadro quedaba vacio con un cartel. Ahora la opcion
     queda APAGADA, con el motivo a mano, y se recalcula cada vez que se mueve otro filtro:
     cambiar de departamento cambia que cultivos se pueden elegir.

     Lo que se pregunta es si EXISTE la combinacion, no si el dato es cero. El build manda la
     lista completa de combinaciones en `datos.claves`, justamente para no tener que bajar las
     particiones del JSON solo para saber cuales existen. */

  /* Los valores de `id` que forman combinacion con lo que hay puesto en los demas filtros. */
  function valoresConDatos(id) {
    var ids = estado.datos.filtros;
    var pos = ids.indexOf(id);
    if (pos < 0 || !estado.claves.length) { return null; }
    var actuales = ids.map(valor);
    var conDatos = {};
    estado.claves.forEach(function (partes) {
      for (var i = 0; i < ids.length; i++) {
        if (i !== pos && partes[i] !== actuales[i]) { return; }
      }
      conDatos[partes[pos]] = true;
    });
    /* Ninguno: los OTROS filtros estan en una combinacion que no existe (puede pasar al
       llegar con parametros en la URL). No se apaga nada, asi no queda una pagina sin ninguna
       opcion elegible; el paso siguiente del ciclo acomoda los otros filtros. */
    return Object.keys(conDatos).length ? conDatos : null;
  }

  function motivoSinDatos(etiqueta) {
    /* Con un departamento elegido el motivo es OTRO: no es que falte el dato para la campaña,
       es que no lo hay EN ESE DEPARTAMENTO. Es el caso que escribio JC en su maqueta. */
    var plantilla = (estado.dto && estado.datos.sin_opcion_departamento)
      || estado.datos.sin_opcion;
    return plantilla ? plantilla.replace("{opcion}", etiqueta) : "";
  }

  /* Apaga en UN control las opciones sin datos y devuelve el primer valor que si tiene.
     Devuelve null si el control no participa de las combinaciones. */
  function apagarSinDatos(nodo, conDatos) {
    var primero = null;
    var puestos = nodo.dataset.control === "chips"
      ? nodo.querySelectorAll("button[data-valor]")
      : nodo.querySelectorAll("option");
    Array.prototype.forEach.call(puestos, function (opcion) {
      var v = opcion.dataset && opcion.dataset.valor !== undefined
        ? opcion.dataset.valor : opcion.value;
      var hay = !!conDatos[v];
      if (hay && primero === null) { primero = v; }
      opcion.disabled = !hay;
      if (hay) {
        opcion.removeAttribute("aria-disabled");
        opcion.removeAttribute("title");
      } else {
        opcion.setAttribute("aria-disabled", "true");
        var motivo = motivoSinDatos(opcion.textContent.trim());
        if (motivo) { opcion.title = motivo; }
      }
    });
    return primero;
  }

  /* Recorre todos los filtros. Si el valor puesto quedo sin datos, se mueve al de defecto si
     lo tiene y si no al primero que si tenga: nunca se queda parado en una combinacion vacia.
     Mover un filtro cambia lo que hay disponible en los otros, asi que se repite hasta que no
     se mueva nada (con dos o tres filtros converge en una o dos vueltas).

     EXCEPCION: el filtro SUJETO de la pagina (`datos.filtro_sujeto`) no se mueve nunca. La
     ficha departamental ES el departamento que se pidio, y acomodarlo solo convertia el clic
     del mapa en una mentira: se clickeaba ALBERDI con un cultivo que ALBERDI no tiene y se
     leian los numeros de GUASAYAN bajo el titulo de GUASAYAN, con la URL diciendo ALBERDI.
     Ahora se acomoda el cultivo, que es lo que JC pide en su maqueta ("si no hay datos para
     garbanzo en departamento Alberdi, QUE NO PUEDA PONERSE ACTIVO"). Si el sujeto no tiene
     datos para NINGUNA combinacion -hoy SALAVINA, que no esta en la base 9 de MAGyP- se queda
     donde esta y el cuadro muestra su cartel de "no hay datos": es la verdad. Sus opciones se
     siguen apagando igual, asi que el motivo esta a mano. */
  function sincronizarDisponibles() {
    if (!estado.datos || !estado.claves.length) { return false; }
    var sujeto = estado.datos.filtro_sujeto || null;
    var movio = false;
    for (var vuelta = 0; vuelta < 3; vuelta++) {
      var hubo = false;
      estado.datos.filtros.forEach(function (id) {
        var conDatos = valoresConDatos(id);
        if (!conDatos) { return; }
        var primero = null;
        controlesDe(id).forEach(function (nodo) {
          var candidato = apagarSinDatos(nodo, conDatos);
          if (primero === null) { primero = candidato; }
        });
        if (id === sujeto) { return; }
        if (!conDatos[valor(id)] && primero !== null) {
          var nodo = control(id);
          if (nodo && fijar(nodo, primero)) { hubo = true; }
        }
      });
      movio = movio || hubo;
      if (!hubo) { break; }
    }
    return movio;
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
  /* El mensaje de un cuadro cuando la bajada de sus datos fallo. No es lo mismo que "no hay
     datos para esta combinacion": ahi el dato no existe, aca no llego. Decirlo distinto
     importa porque la salida tambien es distinta (reintentar, no cambiar de filtro). */
  var FALLO_AL_BAJAR = "No se pudieron cargar los datos. Probá de nuevo en unos segundos.";

  /* Una bajada que se pide una sola vez, sin cachear los fracasos.

     Por que el `catch` que borra la entrada: en `bajadas` se guarda la PROMESA, para que dos
     repintados seguidos esperen la misma bajada en vez de seguir de largo con los combos a
     medio llegar. Pero si se guarda una promesa RECHAZADA, queda cacheado el fracaso: todos
     los repintados siguientes vuelven a esperar ese mismo error y la pagina no se recupera
     nunca, ni reintentando. Era el bug de los chips de Cultivos intensivos (Francisco,
     1-oct-2026): ese tablero esta partido POR PRODUCTO, asi que cada clic en Cebolla/Batata/
     Papa baja un archivo; si uno fallaba -un deploy a mitad de camino, la red, o el pipeline
     reescribiendo los datos mientras el server estaba levantado- ese producto quedaba muerto
     hasta recargar, y mientras tanto los chips decian uno y los cuadros mostraban otro. */
  function bajar(ruta, usar) {
    if (!estado.bajadas[ruta]) {
      estado.bajadas[ruta] = fetch(ruta)
        .then(function (r) {
          /* fetch NO rechaza con un 404: resuelve con ok=false y un cuerpo que no es JSON.
             Sin esto, el error salia despues como un parseo roto y costaba leerlo. */
          if (!r.ok) { throw new Error("HTTP " + r.status + " al bajar " + ruta); }
          return r.json();
        })
        .then(usar)
        .catch(function (error) {
          delete estado.bajadas[ruta];   // que el proximo intento sea un intento de verdad
          throw error;
        });
    }
    return estado.bajadas[ruta];
  }

  function bajarParticion(valorParticion) {
    var datos = estado.datos;
    var ruta = datos.archivos[valorParticion];
    if (!ruta) { return Promise.resolve(); }
    return bajar(ruta, function (parte) {
      Object.keys(parte.combos).forEach(function (k) { datos.combos[k] = parte.combos[k]; });
    });
  }

  /* ================= capa departamental =================
     Francisco, 30-sep-2026: "cuando clickee el departamento, quiero que en la misma vista
     vayan cambiando los datos". Es la hoja "Agri 1 Dto" de la maqueta de JC: el MISMO tablero
     con los datos del departamento elegido.

     Lo que llega del build (`datos.capa_departamental`) es solo lo que CAMBIA -KPIs, contexto,
     tendencia, anillo y tabla-, un archivo por departamento, sin el mapa ni el ranking, que
     son justamente los dos cuadros que no cambian (el mapa es el selector y el ranking es
     provincial por regla de JC). Aca se baja el archivo del departamento clickeado y se
     SUPERPONE sobre el combo provincial que la pagina ya tiene. */

  function hayCapa() { return !!(estado.datos && estado.datos.capa_departamental); }

  /* La clave de la capa se arma con SUS filtros (cultivo|campania), que son menos que los del
     tablero: ninguno de esos cuadros depende de la variable del mapa. */
  function claveDepartamental() {
    return estado.datos.capa_departamental.filtros.map(valor).join("|");
  }

  function bajarDepartamento(geo) {
    var ruta = estado.datos.capa_departamental.archivos[geo];
    if (!ruta) { return Promise.resolve(); }
    return bajar(ruta, function (parte) { estado.dtoCombos[geo] = parte.combos; });
  }

  function asegurarDepartamento() {
    if (!estado.dto || !hayCapa()) { return Promise.resolve(); }
    return bajarDepartamento(estado.dto);
  }

  /* El combo que se dibuja. Sin departamento es el provincial de siempre; con departamento es
     el provincial con los cuadros de la capa encima. Si esa combinacion no existe en el
     departamento devuelve undefined, que es lo que el dibujante ya sabe leer como "no hay
     datos" (nunca se muestran los numeros de otro recorte). */
  function comboVigente() {
    var base = estado.datos.combos[clave()];
    if (!estado.dto || !hayCapa() || !base) { return base; }
    var extra = (estado.dtoCombos[estado.dto] || {})[claveDepartamental()];
    if (!extra) { return undefined; }
    var paneles = {};
    Object.keys(base.paneles).forEach(function (k) { paneles[k] = base.paneles[k]; });
    Object.keys(extra.paneles).forEach(function (k) { paneles[k] = extra.paneles[k]; });
    return { contexto: extra.contexto, kpis: extra.kpis, paneles: paneles };
  }

  /* Las combinaciones que se pueden elegir. Con un departamento puesto son las del tablero
     RECORTADAS a las que ese departamento tiene: es la regla de JC ("si no hay datos para
     garbanzo en departamento Alberdi, QUE NO PUEDA PONERSE ACTIVO") aplicada al tablero.
     El build manda la lista por departamento justamente para no bajar nada para saberlo. */
  function recalcularClaves() {
    var datos = estado.datos;
    var todas = (datos.claves || []).map(function (k) { return k.split("|"); });
    if (!estado.dto || !hayCapa()) { estado.claves = todas; return; }
    var propias = {};
    (datos.capa_departamental.claves[estado.dto] || []).forEach(function (k) {
      propias[k] = true;
    });
    var ids = datos.filtros;
    var pos = datos.capa_departamental.filtros.map(function (f) { return ids.indexOf(f); });
    estado.claves = todas.filter(function (partes) {
      return propias[pos.map(function (i) { return partes[i]; }).join("|")];
    });
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
    if (hayCapa()) {
      /* El departamento elegido va en la URL como un filtro mas, asi el estado se comparte y
         el boton "atras" del navegador deshace la eleccion. `replaceState` y no `pushState`:
         pasar por cinco departamentos no tiene que dejar cinco pasos de historial. */
      if (estado.dto) { parametros.set("departamento", estado.dto); }
      else { parametros.delete("departamento"); }
    }
    var consulta = parametros.toString();
    if (hayCapa() && window.history && window.history.replaceState) {
      window.history.replaceState(null, "",
        window.location.pathname + (consulta ? "?" + consulta : ""));
    }
    pintarMigaDepartamental(parametros);
    Array.prototype.forEach.call(document.querySelectorAll("a[data-conserva]"), function (a) {
      var base = a.getAttribute("href").split("?")[0];
      a.setAttribute("href", consulta ? base + "?" + consulta : base);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-miga-dinamica]"), function (tramo) {
      var nodo = control(tramo.dataset.migaDinamica);
      if (nodo) { tramo.textContent = etiquetaDe(nodo); }
    });
  }

  /* La entrada "Información por departamento" de la tira de paginas: elige el departamento
     en el acto, igual que el clic en el mapa, en vez de recargar la pagina entera para mover
     un filtro. Sigue siendo un `<a>` con su href: el que quiera abrirlo en otra pestaña lo
     puede hacer, y por eso tampoco se atajan los clics con Ctrl, Cmd o el boton del medio. */
  function engancharTiraDeDepartamento() {
    Array.prototype.forEach.call(
      document.querySelectorAll("a[data-elegir-departamento]"), function (a) {
        a.addEventListener("click", function (evento) {
          if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) {
            return;
          }
          if (!hayCapa()) { return; }
          evento.preventDefault();
          elegirDepartamento(a.dataset.elegirDepartamento, true);
        });
      });
  }

  /* Los dos tramos que la hoja "Agri 1 Dto" agrega a la miga: "Provincia", que con un
     departamento elegido es el link de VUELTA, y "Dto ALBERDI". Con la provincia puesta el
     tramo del departamento no se dibuja (ni su separador) y "Provincia" no lleva a ningun
     lado, que es el estado de la hoja "Agri 1". */
  function pintarMigaDepartamental(parametros) {
    if (!hayCapa()) { return; }
    /* El estado viaja al CSS: hay paginas cuyo contenido cambia con el departamento y no solo
       sus numeros. En pasturas y forrajes el mapa existe solo con uno elegido, porque ahi la
       pagina es la hoja "Agri 3-b" de JC y sin el es la "Agri 3". Es una clase y no un
       `hidden` por panel para que la regla viva en la hoja de estilos, que es donde se decide
       como se ve cada estado. */
    var tablero = document.getElementById("tablero");
    if (tablero) { tablero.classList.toggle("con-departamento", !!estado.dto); }
    var paso = document.querySelector("[data-miga-paso=\"departamento\"]");
    if (paso) {
      paso.hidden = !estado.dto;
      /* El texto del tramo no sale de ningun control (el selector del departamento es el
         mapa), asi que no lo escribe el enganche generico de [data-miga-dinamica]: se escribe
         aca con la plantilla del build ("Dto {Departamento}"). */
      var rotulo = paso.querySelector("[data-miga-dinamica]");
      var plantilla = estado.datos.capa_departamental.miga;
      if (rotulo && plantilla) {
        rotulo.textContent = estado.dto
          ? plantilla.replace("{Departamento}", nombreDepartamento()) : "";
      }
    }
    var volver = document.querySelector("[data-miga-provincia]");
    if (!volver) { return; }
    var sin = new URLSearchParams(parametros.toString());
    sin.delete("departamento");
    volver.setAttribute("href",
      window.location.pathname + (sin.toString() ? "?" + sin.toString() : ""));
    /* Sin departamento no hay a donde volver: el tramo queda como el actual y no como un link
       que no hace nada (misma regla que el boton "volver" del tablero). */
    volver.classList.toggle("miga-inerte", !estado.dto);
    if (estado.dto) { volver.removeAttribute("aria-current"); }
    else { volver.setAttribute("aria-current", "page"); }
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
    /* Primero se acomoda que se puede elegir (y, si hace falta, se mueve el filtro que quedo
       en una combinacion sin datos): todo lo que sigue se calcula con la seleccion ya valida. */
    recalcularClaves();
    sincronizarDisponibles();
    sincronizarNavegacion();
    sincronizarComparacion();
    estado.fallo = false;
    return Promise.all([asegurarParticion(), asegurarDepartamento()]).then(function () {
      return { combo: comboVigente(), datos: estado.datos };
    }, function (error) {
      /* La bajada fallo. Lo que NO se puede hacer es cortar el repintado: los filtros ya se
         movieron, asi que los cuadros quedarian mostrando los numeros del producto ANTERIOR
         debajo del chip del nuevo. Un dato que no es el que se pidio es el peor error
         posible, asi que se repinta IGUAL, en blanco y con el motivo a la vista. El proximo
         clic vuelve a intentar la bajada (ver `bajar`). */
      if (window.console && window.console.warn) { window.console.warn(error); }
      estado.fallo = true;
      return { combo: undefined,
               datos: Object.assign({}, estado.datos, { sin_combinacion: FALLO_AL_BAJAR }) };
    }).then(function (listo) {
      estado.pintar(listo.combo, listo.datos);
      /* Los paneles que se dibujan por su cuenta (hoy el de precios del MCBA, que tiene
         filtros y datos propios) se enteran por aca de que la pagina se repinto. Importa en
         la exportacion a PDF: la hoja tiene otro ancho que la ventana y hay dibujos que se
         calculan con el tamaño de su caja. */
      estado.extras.forEach(function (fn) { fn(); });
    });
  }

  /* El departamento con que se LLEGO a la pagina. Viaja en la URL (y no solo en memoria)
     para que el estado se pueda compartir, marcar y volver con el boton del navegador, que es
     lo que se perdia cuando el clic del mapa navegaba a otra pagina. Un valor que la capa no
     conoce se ignora: se queda en la provincia. */
  function preseleccionarDepartamento() {
    if (!hayCapa()) { return; }
    var pedido = new URLSearchParams(window.location.search).get("departamento");
    if (pedido && estado.datos.capa_departamental.archivos[pedido]) { estado.dto = pedido; }
  }

  /* Cambia el departamento (o vuelve a la provincia con ""). Lo llama el clic del mapa y el
     tramo "Provincia" de la miga. */
  function elegirDepartamento(geo, recordable) {
    var nuevo = geo || "";
    if (nuevo === estado.dto) { return Promise.resolve(); }
    if (recordable) { recordar(foto()); }
    estado.dto = nuevo;
    return refrescar();
  }

  function nombreDepartamento() {
    if (!estado.dto || !hayCapa()) { return ""; }
    return estado.datos.capa_departamental.nombres[estado.dto] || "";
  }

  /* El tramo "Provincia" de la miga es un <a> con href de verdad (se puede copiar y abrir en
     otra pestaña), pero el clic comun no recarga: cambia el estado y repinta. */
  function escucharMigaProvincia() {
    var volver = document.querySelector("[data-miga-provincia]");
    if (!volver) { return; }
    volver.addEventListener("click", function (evento) {
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button) { return; }
      evento.preventDefault();
      recordar(foto());
      elegirDepartamento("");
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
    /* El departamento no es un control del DOM (el selector es el mapa), pero es parte de lo
       que se esta mirando: sin esto, "volver" deshacia el cultivo y dejaba el departamento. */
    if (hayCapa()) { valores.__dto = estado.dto; }
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
        /* Si el ultimo repintado quedo fallado, tocar el MISMO chip reintenta. Sin esto el
           control ya estaba en ese valor, `fijar` devolvia false y el clic no hacia nada:
           justo cuando el cartel dice "Probá de nuevo", probar de nuevo era lo unico que no
           funcionaba. */
        else if (estado.fallo) { refrescar(); }
      });
    } else {
      nodo.querySelector("select").addEventListener("change", function (evento) {
        var previa = foto();
        if (fijar(nodo, evento.target.value)) { recordar(previa); refrescar(); }
        else if (estado.fallo) { refrescar(); }
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
        if (anterior.__dto !== undefined && anterior.__dto !== estado.dto) {
          estado.dto = anterior.__dto;
          hubo = true;
        }
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
       abajo, en el animador de dialogos (animadorDeDialogo). */
  var zoom = { dialogo: null, caja: null, marco: null, controles: null, panel: null,
               hueco: null, tituloPropio: null, cerrando: false, anim: null,
               comparar: null, dondeComparar: null };

  /* -------- la animacion de apertura y cierre de un <dialog> (Francisco, 24-sep-2026) ------
     Aparecia de golpe. Ahora la caja CRECE desde donde estaba hasta la pantalla y al cerrar
     VUELVE A SU LUGAR, que es el gesto que hace entender de donde salio y a donde vuelve.

     Como: se mide el rectangulo de donde sale (el panel, en el zoom; el boton, en el popup) y
     se anima la caja del dialogo DESDE ese rectangulo HASTA la pantalla entera, con
     `transform` y nada mas. Dos motivos: es lo unico que el navegador mueve sin rehacer la
     pagina en cada cuadro, y -mas importante aca- el transform NO cambia el layout, asi que la
     caja mide lo mismo que a pantalla completa desde el primer cuadro y ningun grafico llega a
     medir una caja intermedia. Animar alto/ancho romperia justo eso.

     Esto es una FABRICA porque lo usan DOS dialogos: el zoom de un cuadro y el popup "Mas
     informacion" (Francisco, 2-oct-2026: "la misma animacion que el zoom"). El gesto es el
     mismo, asi que vive una sola vez. Cada dialogo trae su caja y el prefijo de sus dos clases
     de estado -`<prefijo>-animando` y `<prefijo>-visible`-, que es lo unico que cambia.

     La duracion y la curva estan en el CSS (--zoom-dur); ZOOM_MS es el mismo numero, que aca
     se necesita para la red de seguridad del transitionend. Si se cambia uno, se cambia el
     otro. */
  var ZOOM_MS = 220;

  function sinMovimiento() {
    return !!(window.matchMedia &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function animadorDeDialogo(dialogo, caja, prefijo) {
    var est = { base: null, fin: null };
    var ANIMANDO = prefijo + "-animando";
    var VISIBLE = prefijo + "-visible";

    /* El rectangulo que ocupa la caja cuando NO tiene transform puesto, que es el destino real
       de la animacion. Se mide y se guarda al abrir, y se vuelve a medir cada vez que la caja
       esta quieta (por si cambio el tamanio de la ventana con el dialogo abierto). Durante una
       animacion no se mide: ahi getBoundingClientRect devuelve el rectangulo YA transformado,
       que es justamente lo que no se busca. */
    function baseDeLaCaja() {
      if (!est.fin && getComputedStyle(caja).transform === "none") {
        est.base = caja.getBoundingClientRect();
      }
      return est.base;
    }

    /* El transform que encoge la caja hasta el rectangulo `r` de la pantalla. Con
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

    /* Vuelve a medir la caja LIMPIA. Se llama justo despues de showModal(): al cerrar quedo
       con el transform de vuelta escrito en linea y sin este borrado se mediria el rectangulo
       encogido de la apertura anterior. */
    function remedir() {
      caja.style.transition = "none";
      caja.style.transform = "none";
      est.base = caja.getBoundingClientRect();
    }

    /* Corta la animacion en curso: la caja queda donde iba a terminar (el valor final ya esta
       escrito en el estilo en linea). Con `cancelar` se saltea su remate -el repintado-,
       porque el movimiento que la interrumpe va a hacer el suyo al final. */
    function cortar(cancelar) {
      if (est.fin) { est.fin(cancelar); }
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
    function mover(desde, hasta, visible, alFin) {
      cortar(true);
      if (sinMovimiento()) {
        dialogo.classList.toggle(VISIBLE, visible);
        caja.style.transform = hasta;
        alFin();
        return;
      }
      dialogo.classList.add(ANIMANDO);
      caja.style.transition = "none";
      caja.style.transform = desde;
      dialogo.classList.toggle(VISIBLE, !visible);
      void caja.offsetWidth;
      dialogo.classList.toggle(VISIBLE, visible);
      caja.style.transition = "";
      caja.style.transform = hasta;

      var reloj = null;
      var porTiempo = false;
      var terminar = function (cancelado) {
        if (est.fin !== terminar) { return; }
        est.fin = null;
        clearTimeout(reloj);
        caja.removeEventListener("transitionend", alTerminar);
        dialogo.classList.remove(ANIMANDO);
        /* Si llegamos por la red de seguridad y no por el aviso del navegador, la caja puede
           haber quedado A MITAD DE CAMINO: una pestania en segundo plano no avanza las
           transiciones, y ahi el dialogo queda encogido sobre el boton del que salio, o sea
           practicamente invisible. Se la planta en su valor final. Se pierde el gesto, no el
           resultado: es la misma regla que ya costo cara con la animacion de opacidad del
           popup (una animacion no puede decidir si algo se ve o no). */
        if (porTiempo && !cancelado) {
          caja.style.transition = "none";
          caja.style.transform = hasta;
          void caja.offsetWidth;
          caja.style.transition = "";
        }
        if (!cancelado) { alFin(); }
      };
      var alTerminar = function (evento) {
        if (evento.target === caja && evento.propertyName === "transform") { terminar(false); }
      };
      caja.addEventListener("transitionend", alTerminar);
      /* Red de seguridad por tiempo: hay casos en que el aviso no llega (transicion
         interrumpida, pestania en segundo plano, un navegador que decide no animar). El
         repintado tiene que ocurrir igual, y la caja tiene que terminar donde iba. */
      reloj = setTimeout(function () { porTiempo = true; terminar(false); }, ZOOM_MS + 150);
      est.fin = terminar;
    }

    return { encajarEn: encajarEn, mover: mover, cortar: cortar, remedir: remedir };
  }

  function crearDialogo() {
    var dialogo = document.createElement("dialog");
    dialogo.className = "zoom";
    var caja = document.createElement("div");
    caja.className = "zoom-caja";
    zoom.anim = animadorDeDialogo(dialogo, caja, "zoom");
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
    zoom.anim.remedir();
    /* Los graficos se redimensionan ACA, antes de que la caja se empiece a mover, y no es una
       contradiccion con lo de arriba: el transform no toca el layout, asi que el panel ya mide
       lo que va a medir a pantalla completa y ECharts mide bien desde el primer cuadro. Lo que
       crece es entonces el dibujo definitivo y no el viejo estirado. El repintado completo
       -el que vuelve a calcular el mapa con el tamanio de su caja- va igual al final. */
    estado.graficos.forEach(function (g) { g.resize(); });
    zoom.anim.mover(zoom.anim.encajarEn(desde), "none", true, reacomodar);
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
    var hasta = zoom.anim.encajarEn(zoom.hueco.getBoundingClientRect());
    zoom.anim.mover(desde, hasta, false, function () {
      zoom.cerrando = false;
      zoom.dialogo.close();
      devolverPanel();
    });
  }

  /* Cierre en seco, sin animacion: lo usa "Generar PDF", que necesita el tablero entero y
     cada panel en su celda ANTES de medir y de sacar las fotos de los graficos. */
  function cerrarZoomYa() {
    if (!zoom.panel) { return; }
    zoom.anim.cortar(true);
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
  /* ================= aclaraciones de terminos (JC, 29-sep-2026) =================
     "sera necesario agregar ACLARACIONES de terminos que se podran visualizar con un
     mouseover o click, como uds elijan, y un mini popup con el texto aclaratorio."

     JC dice "como uds elijan" y la eleccion es: los tres. Mouseover para el que viene con el
     mouse, foco para el que viene con el teclado, y click para dejarlo FIJO (si solo abriera
     con el mouse, el que navega con teclado se queda afuera; si solo abriera con click, el
     que pasa por arriba no se entera de que hay algo que leer).

     Ni el texto ni la palabra se deciden aca: el build parte los textos y marca los terminos
     (<button class="termino" data-termino="dtv">) y las definiciones vienen en un <dl>
     escondido que dibujo la cascara. Este archivo abre, cierra y ubica el recuadro. */
  var glosa = { globo: null, fijo: null };

  function globoDeGlosa() {
    if (!glosa.globo) { glosa.globo = document.getElementById("glosa-globo"); }
    return glosa.globo;
  }

  function definicionDe(id) {
    var dt = document.querySelector('.glosa-datos [data-glosa-id="' + id + '"]');
    if (!dt) { return null; }
    var dd = dt.nextElementSibling;
    return { titulo: dt.textContent, texto: dd ? dd.textContent : "" };
  }

  function cerrarGlosa() {
    var globo = globoDeGlosa();
    if (!globo) { return; }
    globo.hidden = true;
    if (glosa.fijo) { glosa.fijo.setAttribute("aria-expanded", "false"); }
    glosa.fijo = null;
  }

  function abrirGlosa(boton) {
    var globo = globoDeGlosa();
    if (!globo) { return; }
    var definicion = definicionDe(boton.dataset.termino);
    if (!definicion) { return; }
    texto(globo, "[data-glosa-titulo]", definicion.titulo);
    texto(globo, "[data-glosa-texto]", definicion.texto);
    globo.hidden = false;
    /* Se ubica DESPUES de mostrarlo: con `hidden` puesto no tiene medidas. Position fixed,
       asi que se trabaja en coordenadas de ventana y no hay que sumar scroll. Si no entra
       abajo, salta arriba del termino; si se pasa de un costado, se corre para adentro. */
    var caja = boton.getBoundingClientRect();
    var globoCaja = globo.getBoundingClientRect();
    var margen = 8;
    var arriba = caja.bottom + margen;
    if (arriba + globoCaja.height > window.innerHeight - margen) {
      arriba = Math.max(margen, caja.top - globoCaja.height - margen);
    }
    var izquierda = Math.min(
      Math.max(margen, caja.left),
      Math.max(margen, window.innerWidth - globoCaja.width - margen));
    globo.style.top = arriba + "px";
    globo.style.left = izquierda + "px";
  }

  function engancharGlosario() {
    if (!globoDeGlosa()) { return; }
    /* Delegado en el documento: los terminos que el zoom se lleva adentro del dialogo son
       copias, y con un listener por boton esas copias no harian nada. */
    document.addEventListener("click", function (evento) {
      var boton = evento.target.closest ? evento.target.closest(".termino") : null;
      if (!boton) { cerrarGlosa(); return; }
      if (glosa.fijo === boton) { cerrarGlosa(); return; }
      cerrarGlosa();
      glosa.fijo = boton;
      boton.setAttribute("aria-expanded", "true");
      abrirGlosa(boton);
    });
    document.addEventListener("mouseover", function (evento) {
      var boton = evento.target.closest ? evento.target.closest(".termino") : null;
      if (boton && !glosa.fijo) { abrirGlosa(boton); }
    });
    document.addEventListener("mouseout", function (evento) {
      var boton = evento.target.closest ? evento.target.closest(".termino") : null;
      if (boton && !glosa.fijo) { cerrarGlosa(); }
    });
    document.addEventListener("focusin", function (evento) {
      var boton = evento.target.closest ? evento.target.closest(".termino") : null;
      if (boton) { abrirGlosa(boton); }
    });
    document.addEventListener("focusout", function (evento) {
      var boton = evento.target.closest ? evento.target.closest(".termino") : null;
      if (boton && glosa.fijo !== boton) { cerrarGlosa(); }
    });
    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape") { cerrarGlosa(); }
    });
    /* Al mover la pagina el recuadro quedaria flotando lejos de su palabra: se cierra. */
    window.addEventListener("scroll", cerrarGlosa, true);
    window.addEventListener("resize", cerrarGlosa);
  }

  /* Escribe un texto que puede traer terminos marcados. `partes` lo arma el build; sin
     partes se escribe el texto plano de siempre, que es el 99% de los casos. */
  function glosar(nodo, selector, valorTexto, partes) {
    var destino = nodo.querySelector(selector);
    if (!destino) { return; }
    if (!partes || !partes.length) {
      destino.textContent = valorTexto || "";
      return;
    }
    vaciar(destino);
    partes.forEach(function (parte) {
      if (!parte.termino) {
        destino.appendChild(document.createTextNode(parte.t));
        return;
      }
      var boton = document.createElement("button");
      boton.type = "button";
      boton.className = "termino";
      boton.dataset.termino = parte.termino;
      boton.textContent = parte.t;
      destino.appendChild(boton);
    });
  }

  function engancharUtilidades() {
    engancharGlosario();
    Array.prototype.forEach.call(document.querySelectorAll("[data-utilidad]"), function (boton) {
      var hacer = ACCIONES[boton.dataset.utilidad];
      if (hacer) { boton.addEventListener("click", function () { hacer(boton); }); }
    });
  }

  var PIVOTAL = {
    vaciar: vaciar,
    tamanioMapa: tamanioMapa,

    /* El payload de la pagina. Lo usa el popup "Mas informacion" para encontrar el indice de
       su propia capa (`capa_informacion`). */
    datos: function () { return estado.datos; },

    /* Limpia el DIBUJO de un grafico sin vaciar su nodo: adentro vive el canvas de ECharts y
       la instancia queda registrada contra ese nodo (ver `limpiarGrafico`). */
    limpiarGrafico: limpiarGrafico,

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
      if (estado.dto) { parametros.set("departamento", estado.dto); }
      return parametros.toString();
    },

    /* Escribe un texto que puede traer terminos del glosario marcados (`<campo>_partes` del
       build). Lo usan los titulos de cuadro del tablero, que cambian con la seleccion y por
       eso no los puede dibujar el servidor. */
    glosa: glosar,

    /* El departamento elegido y como cambiarlo. Lo usa el mapa del tablero: su clic ya no
       navega a otra pagina, cambia los datos de esta (ver "capa departamental"). */
    departamento: function () { return estado.dto; },

    /* El valor vigente de un filtro, por id. Lo usa el popup "Mas informacion" para saber que
       cultivo mostrar en su bloque 5.3. */
    valorDeFiltro: valor,

    /* Registra una accion de boton (`data-utilidad`) desde otro archivo. Existe para que el
       popup "Mas informacion" pueda vivir en tablero.js, que es donde estan los dibujantes de
       cada forma de cuadro, sin tener que traerlos a comun.js. El build valida los nombres
       contra site_build.ACCIONES_UTILIDAD, asi que no hay botones sin dueño. */
    registrarAccion: function (nombre, hacer) { ACCIONES[nombre] = hacer; },

    /* El motor de la animacion de un <dialog>: la caja crece desde el rectangulo que se le
       pase y vuelve ahi al cerrar. Lo usa el zoom de un cuadro y lo usa el popup "Mas
       informacion", que vive en tablero.js. Se exporta para que el gesto sea UNO SOLO: dos
       dialogos del mismo sitio no se pueden mover distinto (Francisco, 2-oct-2026). */
    animadorDeDialogo: animadorDeDialogo,
    nombreDepartamento: nombreDepartamento,
    elegirDepartamento: elegirDepartamento,

    /* Cada cuantas marcas del eje de valores se escribe una etiqueta.

       Por que hace falta ralear: en un cuadro bajo las etiquetas se pisan unas con otras y no
       se lee ninguna. Por que hay un piso: el protocolo exige un MINIMO de etiquetas a la
       vista (regla de JC: "en el eje vertical, la escala debe tener un minimo de 5 valores").
       El numero no esta escrito aca: viaja en el propio eje (`eje.minimo`), que lo arma el
       build desde specs/modelos/_protocolo-presentacion.yaml. Este archivo solo sabe cuanto
       alto hay, que es lo unico que el build no puede saber.

       `alto` es el alto util del cuadro en px y `porEtiqueta` los px que necesita una etiqueta
       para no tocar a la de al lado. */
    saltoDeEje: function (eje, alto, porEtiqueta) {
      var intervalos = Math.round((eje.max - eje.min) / eje.paso);
      if (!(intervalos > 0)) { return 1; }
      var minimo = eje.minimo || 5;
      var entran = Math.max(2, Math.floor((alto || 0) / (porEtiqueta || 22)));
      var salto = Math.max(1, Math.ceil((intervalos + 1) / entran));
      /* Con un salto de N se escriben floor(intervalos / N) + 1 etiquetas. Se afloja el salto
         hasta que queden `minimo`: antes de incumplir la regla de JC se dejan etiquetas
         apretadas, que al menos se pueden leer agrandando la ventana o con el zoom. */
      while (salto > 1 && Math.floor(intervalos / salto) + 1 < minimo) { salto -= 1; }
      return salto;
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
        /* Las combinaciones que existen, ya partidas: se consultan en cada repintado para
           apagar las opciones sin datos (ver sincronizarDisponibles). */
        estado.claves = (datos.claves || []).map(function (k) { return k.split("|"); });
        preseleccionar();
        preseleccionarDepartamento();
        escuchar();
        escucharMigaProvincia();
        engancharTiraDeDepartamento();
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
