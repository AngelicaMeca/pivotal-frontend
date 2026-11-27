/* Pivotal - las CAPAS DEL IGN sobre un mapa (rutas, caminos rurales, ferrocarril y estaciones).

   Pedido de JC del 14-oct-2026 (backlog 104). Las usan dos dibujantes de tablero.js:
     - `pintarMapa` (los mapas de calor de agricultura y ganaderia): opt-in por spec y APAGADAS
       al abrir. Con todo apagado este archivo no agrega nada al dibujo: ni un componente ni una
       serie, asi que el mapa es exactamente el de siempre.
     - `pintarMapaCapas` (la portada de General > Infraestructura y riesgo): las capas son el
       dato y algunas arrancan prendidas.

   Que viene de afuera y que se hace aca:
     - el CATALOGO (archivo, etiqueta, plantilla del tooltip, fuente y estilo de cada capa) lo
       arma el build y viaja en el JSON de datos del tablero (`capas`). Los colores son del
       protocolo de JC (`colores.capas_de_contexto`), no de este archivo;
     - el CONTROL (un checkbox por capa) lo dibuja el servidor en Tablero.tsx;
     - aca se baja cada archivo la primera vez que alguien prende su capa (nunca antes: la red
       terciaria pesa 2 MB), se lo convierte a las series `lines` / `scatter` de ECharts y se
       pintan las muestras, la leyenda y la cita al pie.

   Como se superpone sin tocar el mapa: un componente `geo` con el MISMO mapa registrado y la
   MISMA proyeccion (aspectScale, layoutCenter, layoutSize) que la serie `map`, transparente y
   `silent`, y las lineas y puntos encima en sus coordenadas. Sobre un mapa de calor las capas
   son `silent`: no tienen tooltip y el clic pasa de largo hasta el departamento de abajo, que
   sigue eligiendose igual. */

/* La holgura para alejar es la del gesto compartido (`gesto-zoom.js`): el zoom de este mapa
   es el de los mapas de AgroClima. */
import { HOLGURA_PARA_ALEJAR } from "./gesto-zoom";

/* Un archivo se baja UNA vez por pagina: {archivo: {promesa, grupos}}. Un fallo NO se guarda
   (misma regla que comun.bajar): el proximo clic en la capa vuelve a intentar. */
var bajadas = {};

function sustituir(plantilla, propiedades) {
  return String(plantilla || "").replace(/\{(\w+)\}/g, function (_, clave) {
    var valor = propiedades[clave];
    return valor === null || valor === undefined ? "" : String(valor);
  });
}

function escapar(texto) {
  return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* La opacidad con la que se pinta una capa de AREA, si su estilo no declara otra. Existe para
   que la MUESTRA de la leyenda y el RELLENO del mapa usen el mismo numero: ese es todo el
   motivo de que sea una constante y no un literal suelto. */
var OPACIDAD_AREA = 0.78;

/* Un color del protocolo (#rgb o #rrggbb) con su alfa. Si no es hexadecimal, se devuelve tal
   cual: el color opaco es un error menos grave que ninguno. */
function conAlfa(color, alfa) {
  var hex = String(color || "").trim();
  if (hex.charAt(0) !== "#" || (hex.length !== 4 && hex.length !== 7)) { return hex; }
  var pasos = hex.length === 4
    ? [hex.charAt(1) + hex.charAt(1), hex.charAt(2) + hex.charAt(2), hex.charAt(3) + hex.charAt(3)]
    : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  var n = pasos.map(function (p) { return parseInt(p, 16); });
  if (n.some(isNaN)) { return hex; }
  return "rgba(" + n[0] + "," + n[1] + "," + n[2] + "," + alfa + ")";
}

/* El primer estilo cuyo `cuando` coincide con las propiedades del tramo. El ultimo estilo de
   cada capa es siempre el general (`cuando` vacio): el build lo exige. */
function estiloDe(capa, propiedades) {
  for (var i = 0; i < capa.estilos.length; i++) {
    var cuando = capa.estilos[i].cuando || {};
    var coincide = Object.keys(cuando).every(function (clave) {
      return cuando[clave].indexOf(propiedades[clave]) !== -1;
    });
    if (coincide) { return i; }
  }
  return capa.estilos.length - 1;
}

/* GeoJSON -> un grupo de datos por estilo. Cada parte de una MultiLineString es una polilinea
   de ECharts; cada punto, un dato de scatter. El nombre es el texto del tooltip. */
function procesar(capa, geo) {
  var grupos = capa.estilos.map(function () { return []; });
  /* Las areas se juntan POR CLASE (mismo estilo y mismo cartel) a traves de todos los rasgos y
     recien al final se arman los datos: ver abajo. */
  var clases = capa.estilos.map(function () { return { orden: [], partes: {} }; });
  (geo.features || []).forEach(function (feature) {
    var propiedades = feature.properties || {};
    var nombre = sustituir(capa.tooltip, propiedades);
    var geometria = feature.geometry || {};
    var indice = estiloDe(capa, propiedades);
    var grupo = grupos[indice];
    if (capa.geometria === "puntos") {
      grupo.push({ name: nombre, value: geometria.coordinates });
      return;
    }
    /* Las AREAS y las LINEAS se juntan igual: por clase y por cartel, a traves de todos los
       rasgos. Una parte de area es una lista de anillos; una de linea, una lista de puntos. */
    var esArea = capa.geometria === "poligonos";
    var piezas = (esArea
      ? (geometria.type === "MultiPolygon" ? geometria.coordinates : [geometria.coordinates])
      : (geometria.type === "MultiLineString" ? geometria.coordinates : [geometria.coordinates]))
      .filter(function (parte) {
        return esArea ? (parte && parte.length && parte[0].length > 2) : (parte && parte.length > 1);
      });
    if (!piezas.length) { return; }
    var clase = clases[indice];
    if (!clase.partes[nombre]) { clase.partes[nombre] = []; clase.orden.push(nombre); }
    piezas.forEach(function (parte) { clase.partes[nombre].push(parte); });
  });
  if (capa.geometria !== "puntos") {
    /* LOS DATOS DE UNA CAPA DE AREA SON POCOS, NO UNO POR PARTE NI UNO POR RASGO (24-nov-2026).
       ECharts paga por cada dato en cada cuadro, se dibuje o no: con las cuatro capas de Suelos
       prendidas eran miles de datos y el arrastre y el zoom se trababan (tareas de 50-350 ms
       medidas en la pagina real). Las partes de una misma clase -mismo estilo, mismo cartel- se
       agrupan en celdas con niveles de detalle (ver `agruparEnCeldas`), a traves de todos los
       rasgos. Los HUECOS siguen en el mismo trazo que su anillo exterior, porque viven adentro
       de su propia parte, nunca en otra. Un grupo chico (hasta MAXIMO_DE_PARTES_SUELTAS) se
       deja parte por parte: no vale la pena agrupar. `d` es su camino en grados y `caja` su
       rectangulo, con el que se decide si vale la pena dibujarlo. */
    var forma = capa.geometria === "poligonos" ? FORMA_DE_AREA : FORMA_DE_LINEA;
    /* El cuadradito de presencia es para las AREAS (ver `agruparEnCeldas`). Una linea mas
       chica que un pixel es un arroyito suelto entre rios que cruzan provincias enteras: no
       es la capa, y marcarlo con un punto diria algo que el dato no dice. */
    var presencia = capa.geometria === "poligonos" && !!capa.dibujar_todo;
    clases.forEach(function (clase, indice) {
      clase.orden.forEach(function (nombre) {
        var piezas = clase.partes[nombre];
        if (piezas.length > MAXIMO_DE_PARTES_SUELTAS) {
          agruparEnCeldas(piezas, forma, presencia).forEach(function (celda) {
            grupos[indice].push({ name: nombre, value: forma.caja(celda.partes[0]).slice(0, 2),
                                  partes: celda.partes, niveles: celda.niveles, caja: celda.caja });
          });
          return;
        }
        piezas.forEach(function (parte) {
          grupos[indice].push({ name: nombre, value: forma.caja(parte).slice(0, 2),
                                partes: [parte], d: forma.camino(parte), caja: forma.caja(parte) });
        });
      });
    });
  }
  return grupos;
}

function bajar(capa, alTerminar) {
  var entrada = bajadas[capa.archivo];
  if (entrada) {
    /* Si todavia se esta bajando (la precarga la pidio antes, o es el segundo pedido), quien
       llama tiene que enterarse igual cuando llegue: sin esto la capa tildada mientras se
       precargaba no se dibujaba nunca. */
    if (!entrada.grupos && entrada.avisos && alTerminar) { entrada.avisos.push(alTerminar); }
    return entrada;
  }
  entrada = { grupos: null, avisos: alTerminar ? [alTerminar] : [] };
  entrada.promesa = fetch(capa.archivo).then(function (r) {
    if (!r.ok) { throw new Error("No se pudo bajar " + capa.archivo + " (" + r.status + ")"); }
    return r.json();
  }).then(function (geo) {
    entrada.grupos = procesar(capa, geo);
    var avisos = entrada.avisos;
    entrada.avisos = [];
    avisos.forEach(function (aviso) { aviso(); });
  }).catch(function (error) {
    delete bajadas[capa.archivo];
    if (window.console && window.console.warn) { window.console.warn(error); }
  });
  bajadas[capa.archivo] = entrada;
  return entrada;
}

/* LA PRECARGA (24-nov-2026: "se pone lento cuando tildo la capa"). Tildar una capa pesada
   bajaba 3 MB y los procesaba (~130 ms con la pagina bloqueada) JUSTO en el clic. Ahora las capas
   del catalogo se bajan y se procesan de a una, en los ratos libres del navegador, apenas el
   mapa esta dibujado: cuando el visitante tilda, ya estan y el clic solo dibuja. Si tilda antes
   de que termine, `bajar` lo avisa cuando llegue. No se pierde nada: una capa que nunca se
   tilda cuesta lo mismo que antes en memoria y el ancho de banda de una descarga que el sitio
   ya sirve desde su propio dominio. */
var cola = [];
var precargando = false;

function precargar(catalogo) {
  Object.keys(catalogo.capas).forEach(function (id) {
    var capa = catalogo.capas[id];
    if (!bajadas[capa.archivo] && cola.indexOf(capa) === -1) { cola.push(capa); }
  });
  siguienteDeLaCola();
}

function siguienteDeLaCola() {
  if (precargando || !cola.length) { return; }
  precargando = true;
  var esperar = window.requestIdleCallback
    ? function (f) { window.requestIdleCallback(f, { timeout: 4000 }); }
    : function (f) { window.setTimeout(f, 1200); };
  esperar(function () {
    var capa = cola.shift();
    var entrada = bajadas[capa.archivo] || bajar(capa, null);
    Promise.resolve(entrada.promesa).then(function () {
      precargando = false;
      siguienteDeLaCola();
    });
  });
}

/* ------------------------------ "MOSTRAR TODO EL PAIS" ------------------------------
   El catalogo, visto con el boton prendido: la capa que tiene version SIN RECORTAR pasa a
   apuntar a ese archivo y a su propia leyenda, y la que no la tiene queda igual.

   Es asi, y no con un `if` en cada lugar donde se usa una capa, porque la capa la miran seis
   funciones de este archivo (el control, las muestras, la leyenda, el pie, la bajada y las
   series) y todas reciben el catalogo: cambiandolo UNA vez en la puerta, las seis dibujan la
   version que corresponde sin saber que existe un boton.

   Las dos versiones se bajan y se guardan por separado (`bajadas` va por archivo), asi que
   apagar y prender el boton no vuelve a pedir nada a la red.

   Que capa tiene version nacional no se decide aca: lo dice el catalogo, que lo saca de los
   configs, y hay capas que el INTA publica SOLO para la provincia (Aptitud de tierras y la
   Zonificacion del uso del suelo). Esas se siguen dibujando sobre la provincia y nada
   alrededor: es lo que hay publicado, no un recorte nuestro. */
function vistaDelCatalogo(catalogo, pais) {
  if (!pais || !catalogo || !catalogo.capas) { return catalogo; }
  var capas = {};
  Object.keys(catalogo.capas).forEach(function (id) {
    var capa = catalogo.capas[id];
    capas[id] = capa.archivo_pais
      ? Object.assign({}, capa, { archivo: capa.archivo_pais,
                                  estilos: capa.estilos_pais || capa.estilos,
                                  /* Las capas de PARCHES SUELTOS se dibujan enteras: ver
                                     `MINIMO_VISIBLE` y `agruparEnCeldas`. Las demas se
                                     dibujan como siempre, porque no desaparecen. */
                                  dibujar_todo: capa.geometria === "poligonos"
                                                && !!capa.parches_sueltos })
      : capa;
  });
  return Object.assign({}, catalogo, { capas: capas });
}

/* Las capas PRENDIDAS en el control de este cuadro, en el orden del control (que es el orden
   de dibujo: la primera queda abajo). Una capa FIJA (`data-capa-fija`, los mapas del INTA: un
   mapa por capa y sin casilla) esta siempre prendida. */
var RENGLONES_DE_CAPA = "input[data-capa], [data-capa-fija]";

function prendidas(nodo, catalogo) {
  var ids = [];
  Array.prototype.forEach.call(nodo.querySelectorAll(RENGLONES_DE_CAPA), function (renglon) {
    var id = renglon.dataset.capa || renglon.dataset.capaFija;
    var prendida = renglon.dataset.capaFija ? true : renglon.checked;
    if (prendida && catalogo.capas[id]) { ids.push(id); }
  });
  return ids;
}

/* De las prendidas, las que ya estan bajadas. Las que faltan se piden aca y, cuando llegan, se
   vuelve a dibujar el cuadro con `redibujar`. */
function listas(nodo, catalogo, redibujar) {
  return prendidas(nodo, catalogo).filter(function (id) {
    return !!bajar(catalogo.capas[id], function () { redibujar(); }).grupos;
  });
}

/* ------------------------------ muestras, leyenda y pie ------------------------------ */
/* LA OPACIDAD DEL CONTROL DEL VISOR es un FACTOR, no un valor absoluto (24-nov-2026). Al
   100% cada capa se dibuja con la opacidad que ya tenia declarada -0,78 un area, 1 una linea-,
   o sea que el mapa en reposo es exactamente el de siempre; bajando el control se ve lo que
   hay debajo, que es para lo que existe el mismo control en el visor de AgroClima. Si fuera un
   valor absoluto, moverlo al 100% dejaria las areas opacas y taparia la cartografia. */
function opacidadDe(estilo, propia, opciones) {
  var declarada = estilo.opacidad === undefined ? propia : estilo.opacidad;
  var factor = opciones && opciones.opacidad === undefined ? 1 : opciones.opacidad;
  return declarada * factor;
}

function muestra(capa, estilo, opciones) {
  var span = document.createElement("span");
  if (capa.geometria === "poligonos") {
    /* Una capa de area se muestra con su RELLENO: es lo que dice el mapa.
       Y SE PINTA COMO LO PINTA EL MAPA (QA de Francisco del 20-nov-2026): el relleno va al 78%
       sobre el color de los departamentos, no opaco. Sin esto los dos tonos no eran el mismo y
       la leyenda desmentia al mapa: la cuenca "Dulce" se dibuja #d8cc68 -su #d4c94e al 78%
       sobre el #e8d6c6 de los departamentos- y su muestra salia #d4c94e, o sea un amarillo
       limpio al lado de un oliva. Asi aparecieron Choya, Loreto y Ojo de Agua "en un tono que
       no esta en la leyenda", y son de la cuenca Dulce, que si esta.
       La composicion la hace el navegador, no este archivo: el color del fondo lo pone el CSS
       (`.capas-area { background-color: var(--fondo-apoyo) }`, el mismo token con el que
       tablero.js pinta los departamentos) y aca va SOLO la capa de arriba, como imagen. Con
       `opacity` sobre el elemento no alcanzaria: eso lo dejaria ver la crema del panel, que no
       es el fondo que tiene debajo en el mapa. */
    span.className = "capas-area";
    var alfa = opacidadDe(estilo, OPACIDAD_AREA, opciones);
    var pintado = conAlfa(estilo.color, alfa);
    span.style.backgroundImage = "linear-gradient(" + pintado + "," + pintado + ")";
    span.style.borderColor = conAlfa(estilo.borde || estilo.color, alfa);
  } else if (capa.geometria === "puntos") {
    span.className = "capas-punto";
    span.style.background = estilo.color;
    span.style.borderColor = estilo.borde || estilo.color;
  } else {
    span.className = "capas-trazo";
    span.style.borderTopColor = estilo.color;
    span.style.borderTopStyle = estilo.trazo === "punteado" ? "dashed" : "solid";
    span.style.borderTopWidth = Math.max(1, Math.round(estilo.ancho || 1)) + "px";
    var alfaTrazo = opacidadDe(estilo, 1, opciones);
    if (alfaTrazo !== 1) { span.style.opacity = String(alfaTrazo); }
  }
  return span;
}

/* Que significa cada trazo de una capa: "pavimentada", "consolidado o tierra"... Una capa con
   un solo estilo sin rotulo no lleva variantes. */
function variantes(capa, opciones) {
  var lista = document.createElement("span");
  /* Las clases de una capa de AREA se listan en COLUMNA: son diez o doce y sus nombres son
     frases enteras del INTA ("G3 - Ganadera: Apta para pasturas, receptividad 10-30 ha-UG"),
     que en una fila envuelven y dejan de leerse como una leyenda. */
  if (capa.geometria === "poligonos") { lista.className = "capas-variantes-area"; }
  capa.estilos.forEach(function (estilo) {
    if (!estilo.rotulo) { return; }
    var item = document.createElement("span");
    item.className = "capas-variante";
    item.appendChild(muestra(capa, estilo, opciones));
    item.appendChild(document.createTextNode(estilo.rotulo));
    lista.appendChild(item);
  });
  return lista;
}

function vaciar(nodo) { while (nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }

/* Las muestras del control (una sola vez: el control no cambia) y la marca de prendida de
   cada renglon, que es lo que usa el PDF para no imprimir las apagadas. */
function pintarControl(nodo, catalogo, opciones) {
  /* La muestra se vuelve a pintar cuando cambia la opacidad del visor: la leyenda tiene que
     decir lo que dice el mapa (QA de Francisco del 20-nov-2026, m1), y si la muestra se
     pintara una sola vez, al bajar la opacidad el mapa se aclararia y la leyenda no. */
  /* La clave con la que se decide si una muestra ya esta pintada. Lleva la opacidad Y el modo
     ("todo el pais"), porque las dos cambian lo que la leyenda tiene que decir: la opacidad, el
     tono de cada muestra; el modo, la LISTA de clases (las cuencas pasan de 6 a 16). Con la
     clave sola de la opacidad, prender el boton dejaba el mapa con dieciseis colores y la
     leyenda con seis renglones, que es exactamente lo que la leyenda no puede hacer. */
  var alfa = String((opciones && opciones.opacidad) === undefined ? 1 : opciones.opacidad)
             + ((opciones && opciones.pais) ? "|pais" : "");
  Array.prototype.forEach.call(nodo.querySelectorAll("[data-muestra-capa]"), function (hueco) {
    var capa = catalogo.capas[hueco.dataset.muestraCapa];
    if (!capa || (hueco.firstChild && hueco.dataset.alfa === alfa)) { return; }
    vaciar(hueco);
    hueco.dataset.alfa = alfa;
    hueco.appendChild(muestra(capa, capa.estilos[0], opciones));
  });
  Array.prototype.forEach.call(nodo.querySelectorAll("[data-variantes-capa]"), function (hueco) {
    var id = hueco.dataset.variantesCapa;
    var capa = catalogo.capas[id];
    if (!capa) { return; }
    if (!hueco.firstChild || hueco.dataset.alfa !== alfa) {
      vaciar(hueco);
      hueco.dataset.alfa = alfa;
      hueco.appendChild(variantes(capa, opciones));
    }
    /* Las clases de una capa que lo pide se listan SOLO si la capa esta prendida. Lo piden las
       capas tematicas del INTA, que traen seis, diez o doce clases de nombre largo: con las dos
       apagadas la leyenda medía 661 px debajo de un mapa de 640, y lo primero que se leía era
       la lista de clases de un mapa que no estaba dibujado. Quien lo pide lo declara en
       configs/dims/capas-*.yaml, no se deduce de la geometria: las capas del IGN traen dos
       variantes de una linea y las muestran siempre, que es como JC aprobo Infraestructura. */
    if (capa.clases_al_prender) {
      var casilla = nodo.querySelector('input[data-capa="' + id + '"]');
      var fija = nodo.querySelector('[data-capa-fija="' + id + '"]');
      hueco.hidden = !(fija || (casilla && casilla.checked));
    }
  });
  Array.prototype.forEach.call(nodo.querySelectorAll("input[data-capa]"), function (input) {
    var renglon = input.closest("[data-capa-item]");
    if (renglon) { renglon.classList.toggle("prendida", input.checked); }
  });
}

/* La leyenda bajo un mapa de calor: solo las capas prendidas. Vacia, el CSS no la dibuja. */
function pintarLeyenda(nodo, catalogo, ids) {
  var leyenda = nodo.querySelector("[data-leyenda-capas]");
  if (!leyenda) { return; }
  vaciar(leyenda);
  ids.forEach(function (id) {
    var capa = catalogo.capas[id];
    var item = document.createElement("li");
    var nombre = document.createElement("span");
    nombre.className = "capas-leyenda-nombre";
    nombre.textContent = capa.etiqueta;
    if (capa.estilos.filter(function (e) { return e.rotulo; }).length) {
      item.appendChild(nombre);
      item.appendChild(variantes(capa));
    } else {
      item.appendChild(muestra(capa, capa.estilos[0]));
      item.appendChild(nombre);
    }
    leyenda.appendChild(item);
  });
}

/* La cita de las capas prendidas, al pie del cuadro: "Capas: IGN - ... · IGN - ...". Las
   fuentes y el rotulo vienen del build; aca solo se listan sin repetir.
   Un mapa que declara su PIE en el spec (los del INTA, JC 27-nov-2026: la fuente, de donde y
   cuando se descargo la capa y la cita copiada del lugar de origen) lo trae YA ESCRITO en
   `opciones.pieCapas`, una version para la provincia y otra para "Mostrar todo el país", que
   es otra descarga. Ese texto reemplaza a la lista de fuentes. */
function pintarPie(nodo, catalogo, ids, opciones) {
  var pie = nodo.querySelector("[data-pie-capas]");
  if (!pie) { return; }
  var propio = opciones && opciones.pieCapas;
  if (propio) {
    pie.textContent = (opciones.pais && propio.pais) ? propio.pais : propio.provincia;
    return;
  }
  var fuentes = [];
  ids.forEach(function (id) {
    var fuente = catalogo.capas[id].fuente;
    if (fuentes.indexOf(fuente) === -1) { fuentes.push(fuente); }
  });
  pie.textContent = fuentes.length ? catalogo.rotulo_fuentes + " " + fuentes.join(" · ") : "";
}

/* ------------------------- que capas se pueden ver juntas -------------------------
   `compatibilidad_de_capas` del spec (JC, 27-nov-2026: "no se deben poder marcar todas las
   variables juntas, solo las relacionadas"; doctrina-jc.md, seccion 11). Las combinaciones y
   los avisos los valida y los escribe el build; aca solo se resuelve el clic.

   Al PRENDER una capa que no entra con las que estan a la vista, la capa se prende igual y se
   apagan las que sobran: de las combinaciones que la contienen se elige la que conserva MAS
   capas de las ya prendidas (empate: la primera declarada) y se apaga lo que no esta en ella.
   Las capas de `referencia` (las ciudades y pueblos) no cuentan y nunca se apagan. Apagar una
   capa nunca rompe la regla, asi que eso no pasa por aca. */
export function resolverCompatibilidad(regla, prendidasAhora, nueva) {
  var esReferencia = function (id) { return regla.referencia.indexOf(id) !== -1; };
  if (esReferencia(nueva)) { return { apagar: [], combinacion: null }; }
  var otras = prendidasAhora.filter(function (id) { return id !== nueva && !esReferencia(id); });
  var todas = otras.concat([nueva]);
  var entra = regla.combinaciones.some(function (c) {
    return todas.every(function (id) { return c.capas.indexOf(id) !== -1; });
  });
  if (entra) { return { apagar: [], combinacion: null }; }
  var elegida = null;
  var conservadas = -1;
  regla.combinaciones.forEach(function (c) {
    if (c.capas.indexOf(nueva) === -1) { return; }
    var n = otras.filter(function (id) { return c.capas.indexOf(id) !== -1; }).length;
    if (n > conservadas) { elegida = c; conservadas = n; }
  });
  if (!elegida) { return { apagar: [], combinacion: null }; }
  return { apagar: otras.filter(function (id) { return elegida.capas.indexOf(id) === -1; }),
           combinacion: elegida };
}

/* Cuanto queda a la vista el aviso de lo que se apago. Es un renglon de texto que se va solo,
   sin animacion: alcanza con que se lea. */
var SEGUNDOS_DEL_AVISO = 8;

function aplicarCompatibilidad(nodo, regla, nueva) {
  var ahora = [];
  Array.prototype.forEach.call(nodo.querySelectorAll("input[data-capa]"), function (input) {
    if (input.checked) { ahora.push(input.dataset.capa); }
  });
  var resultado = resolverCompatibilidad(regla, ahora, nueva);
  if (!resultado.apagar.length) { return; }
  resultado.apagar.forEach(function (id) {
    var casilla = nodo.querySelector('input[data-capa="' + id + '"]');
    if (casilla) { casilla.checked = false; }
  });
  var nombres = resultado.apagar.map(function (id) { return regla.etiquetas[id] || id; });
  var separadores = regla.separadores;
  var apagadas = nombres.length <= 1 ? nombres.join("")
    : nombres.slice(0, -1).join(separadores.entre) + separadores.ultimo
      + nombres[nombres.length - 1];
  var texto = ((regla.avisos[nueva] || {})[resultado.combinacion.id] || "")
    .replace("{apagadas}", apagadas);
  mostrarAviso(nodo, texto);
}

/* El renglon va ARRIBA de la lista de capas, que es donde se acaba de hacer el clic. Lo crea
   este archivo la primera vez: es un mensaje del control, no parte del cuadro. */
function mostrarAviso(nodo, texto) {
  var control = nodo.querySelector("[data-capas]");
  if (!control || !texto) { return; }
  var aviso = control.querySelector("[data-aviso-capas]");
  if (!aviso) {
    aviso = document.createElement("p");
    aviso.className = "capas-aviso";
    aviso.setAttribute("data-aviso-capas", "");
    aviso.setAttribute("role", "status");
    var lista = control.querySelector(".capas-lista");
    control.insertBefore(aviso, lista || control.firstChild);
  }
  aviso.textContent = texto;
  aviso.hidden = false;
  if (aviso.temporizador) { window.clearTimeout(aviso.temporizador); }
  aviso.temporizador = window.setTimeout(function () { aviso.hidden = true; },
                                         SEGUNDOS_DEL_AVISO * 1000);
}

/* ------------------------------ dibujo en ECharts ------------------------------ */
/* El componente `geo` que da las coordenadas a las capas. Misma proyeccion que la serie `map`
   del cuadro (se le pasan los MISMOS aspectScale, layoutCenter y layoutSize), transparente y
   mudo: no se ve, no tiene tooltip y no recibe clics. */
/* El componente `geo` sobre el que se dibujan las capas. Es transparente y, normalmente,
   `silent`: esta solo para darles coordenadas.

   Con `opciones.roam` (la pagina de Infraestructura, JC 15-nov-2026: "que el mapa ocupe toda la
   pagina pudiendo hacer zoom al maximo") deja de ser silent, porque es EL que recibe la rueda y
   el arrastre, y pasa a ser el UNICO sistema de coordenadas del cuadro: la serie `map` de los
   departamentos se le cuelga con `geoIndex: 0`, asi el mapa y las capas se mueven juntos. Sin
   eso cada uno tendria su propio zoom y al primer movimiento las rutas quedarian corridas
   respecto de los departamentos. `emphasis` sigue deshabilitado: el geo no se pinta ni se
   resalta, solo capta el gesto. */
/* Cuando la division se dibuja ENCIMA, el geo deja de escribir los nombres: si no, los de
   abajo quedarian como un fantasma corrido debajo de los de arriba (se vio: con el pais a la
   vista y ninguna capa prendida, cada provincia aparecia con su nombre escrito dos veces). */
function sinRotulosRepetidos(opciones, encima) {
  if (encima.length <= 1 || !opciones.departamentos) { return opciones; }
  return Object.assign({}, opciones, {
    departamentos: Object.assign({}, opciones.departamentos, { label: { show: false } })
  });
}

/* EL MAPA DE FONDO SOLO, para cuando no hay NINGUNA capa prendida: el geo -que con zoom es el
   que dibuja el mapa y el que recibe la rueda- y, con el pais a la vista, la division y los
   nombres, que ahi no los pone nadie mas. */
export function mapaDeFondo(proyeccion, opciones) {
  var encima = opciones.pais ? divisionDepartamental(opciones) : [];
  return { geo: geoDeMapa(proyeccion, sinRotulosRepetidos(opciones, encima)), series: encima };
}

/* El tope de acercamiento de un mapa que se recorre si su spec no declara `zoom_maximo`. */
var ZOOM_MAXIMO = 40;

export function geoDeMapa(proyeccion, opciones) {
  var conZoom = !!(opciones && opciones.roam);
  var geo = {
    /* El mapa base: los departamentos de la provincia o, con "Mostrar todo el pais" prendido,
       las provincias del pais (`cargarGeoPais` en tablero.js registra los dos). Las capas van
       en grados sobre este geo, asi que cambiar de mapa base no las mueve. */
    map: (opciones && opciones.mapa) || "provincia",
    nameProperty: "geo_id",
    aspectScale: proyeccion.aspectScale,
    layoutCenter: proyeccion.layoutCenter,
    layoutSize: proyeccion.layoutSize,
    roam: conZoom,
    /* Hasta 40x: a ese acercamiento se lee un camino rural suelto, que es "el maximo" que pide
       JC (los mapas de AgroClima topan antes porque ahi se agrandan los pixeles de una imagen;
       una cartografia vectorial no se despeina). Para ALEJAR, la misma holgura que el visor:
       un poco por debajo del encuadre inicial, asi el gesto no se topa con una pared justo
       donde arranco, y el boton del encuadre vuelve al exacto. */
    /* El tope lo puede subir el spec (`zoom_maximo`: Infraestructura va a 120x, JC
       27-nov-2026 "permitir mas zoom"); sin declararlo es el de siempre. */
    scaleLimit: conZoom ? { min: HOLGURA_PARA_ALEJAR,
                            max: (opciones && opciones.zoomMaximo) || ZOOM_MAXIMO } : undefined,
    silent: !conZoom,
    selectedMode: false,
    tooltip: { show: false },
    label: { show: false },
    itemStyle: { areaColor: "rgba(0,0,0,0)", borderColor: "rgba(0,0,0,0)", borderWidth: 0 },
    emphasis: { disabled: true }
  };
  /* EL GEO DIBUJA LOS DEPARTAMENTOS cuando el mapa tiene zoom.

     Normalmente los departamentos son una serie `map` aparte y este geo es solo un sistema de
     coordenadas transparente. Con zoom no puede ser asi: para que el mapa y las capas se
     muevan juntos hay UN solo sistema de coordenadas, y ECharts, cuando una serie `map` se
     cuelga de un geo con `geoIndex`, IGNORA el `itemStyle` y el `label` de la serie y dibuja
     las regiones con los del geo. O sea que, si el geo se queda transparente, los
     departamentos desaparecen: eso fue exactamente lo que pasó al construirlo, y es lo
     contrario de lo que pide JC ("QUE SE VEA LA DIVISION DEPARTAMENTAL"). Asi que con zoom el
     relleno, el borde y los nombres se los lleva el geo. */
  if (conZoom && opciones.departamentos) {
    var d = opciones.departamentos;
    /* El cartel del departamento. El geo NO hereda el formatter del tooltip global,
       asi que viene con el cromo: sin esto el geo muestra `show: true` y despues no
       dibuja nada, que es lo que pasaba con la consulta departamental de RF25. */
    geo.tooltip = d.tooltip || { show: true };
    geo.label = d.label;
    geo.labelLayout = d.labelLayout;
    geo.itemStyle = d.itemStyle;
    geo.emphasis = d.emphasis;
  }
  return geo;
}

function geo(proyeccion, opciones) {
  return geoDeMapa(proyeccion, opciones);
}

function tooltipDeCapa() {
  return {
    formatter: function (p) {
      var nombre = (p.data && p.data.name) || p.name || "";
      return nombre ? escapar(nombre) : "";
    }
  };
}

/* El camino de un rasgo de area: un sub-camino cerrado por anillo, TODOS en el mismo trazo.
   Es lo que hace que un hueco quede hueco: el navegador pinta con la regla de no-cero, igual
   que un `<path>` de SVG, asi que el anillo interior de una unidad que rodea a otra se
   descuenta del relleno en vez de taparla. Dibujando un poligono por anillo (que es lo
   primero que uno escribe) el hueco sale lleno y le pisa el color al vecino de adentro: en
   Aptitud de Tierras hay un rasgo con 13 huecos y en la Zonificacion uno con 6. */
function caminoAlVuelo(partes, api, esArea) {
  var d = "";
  for (var p = 0; p < partes.length; p++) {
    var tramos = esArea ? partes[p] : [partes[p]];
    for (var a = 0; a < tramos.length; a++) {
      var puntos = tramos[a];
      for (var k = 0; k < puntos.length; k++) {
        var xy = api.coord(puntos[k]);
        d += (k === 0 ? "M" : "L") + xy[0].toFixed(2) + " " + xy[1].toFixed(2);
      }
      if (esArea) { d += "Z"; }
    }
  }
  return d;
}

/* EL MISMO CAMINO, PERO EN GRADOS Y UNA SOLA VEZ, y la transformacion que lo lleva a la
   pantalla. Es lo que hace que una capa de area pesada se pueda recorrer.

   El problema que resuelve (medido el 21-nov-2026 en "Suelos y uso del suelo"): las areas
   ganaderas deforestadas son UN rasgo con 18.085 partes y 145.913 vertices, y `caminoAlVuelo`
   rearmaba el camino entero -145.913 llamadas a `api.coord` y 2,3 MB de texto- EN CADA
   REPINTADO, o sea en cada paso de zoom y en cada cuadro del arrastre. Resultado: la pagina se
   congelaba 1,3 segundos por gesto y el mapa era inusable.

   Por que se puede: el `geo` de este mapa no lleva proyeccion cartografica, asi que pasar de
   (lon, lat) a pixeles es una transformacion AFIN (x = a*lon + b, y = c*lat + d). Entonces el
   camino se arma una sola vez en grados y lo unico que cambia en cada cuadro son el
   desplazamiento y la escala del elemento, que es trabajo de la tarjeta de video.

   El factor mil es para no perder precision: los archivos traen 5 decimales (~1 m) y el camino
   se escribe con 2 decimales sobre grados por mil, o sea los mismos 5. */
var MIL = 1000;

/* Un parche mas chico que esto, en pixeles, no se dibuja: no se ve y cuesta igual que uno
   grande. Es menos de un pixel a proposito, para no borrar nada que llegue a verse.

   CON "MOSTRAR TODO EL PAIS" NO SE APLICA (capa.dibujar_todo), y es por el dato, no por el
   gusto: las areas deforestadas son parches de 1 a 100 hectareas, o sea entre 0,02 y 0,2
   pixeles con el pais en 640 px, asi que TODOS caen debajo del minimo y la capa desaparecia
   (medido el 25-nov-2026: 54 pixeles verdes con el corte, 1.671 sin el). Dibujados, el
   desmonte se lee como lo que es: un salpicado sobre el Chaco. Lo que cuesta esta medido y
   anotado en configs/dims/capas-inta.yaml (`todo_el_pais.dibujo`). */
var MINIMO_VISIBLE = 0.8;

/* El rectangulo de una parte, en grados: [lon_min, lat_min, lon_max, lat_max]. */
function cajaDeParte(anillo) {
  var x0 = anillo[0][0], y0 = anillo[0][1], x1 = x0, y1 = y0;
  for (var i = 1; i < anillo.length; i++) {
    var x = anillo[i][0], y = anillo[i][1];
    if (x < x0) { x0 = x; } else if (x > x1) { x1 = x; }
    if (y < y0) { y0 = y; } else if (y > y1) { y1 = y; }
  }
  return [x0, y0, x1, y1];
}

function caminoEnGrados(partes) {
  /* Con `+=` esto son 145.913 concatenaciones de un texto que llega a 2,3 MB; con un arreglo
     y un `join` al final, una sola. */
  var trozos = [];
  for (var p = 0; p < partes.length; p++) {
    for (var a = 0; a < partes[p].length; a++) {
      var anillo = partes[p][a];
      for (var k = 0; k < anillo.length; k++) {
        /* Redondeo a 2 decimales con `Math.round`, que es mucho mas barato que `toFixed`
           (145.913 vertices x 2 al bajar la capa) y escribe el mismo numero. */
        trozos.push((k === 0 ? "M" : "L") + Math.round(anillo[k][0] * MIL * 100) / 100
                    + " " + Math.round(anillo[k][1] * MIL * 100) / 100);
      }
      trozos.push("Z");
    }
  }
  return trozos.join("");
}

/* LO MISMO PARA UNA LINEA: un sub-camino por tramo y SIN cerrar (sin "Z"), que es toda la
   diferencia entre un rio y un poligono con forma de rio. */
function caminoDeLineasEnGrados(partes) {
  var trozos = [];
  for (var p = 0; p < partes.length; p++) {
    var linea = partes[p];
    for (var k = 0; k < linea.length; k++) {
      trozos.push((k === 0 ? "M" : "L") + Math.round(linea[k][0] * MIL * 100) / 100
                  + " " + Math.round(linea[k][1] * MIL * 100) / 100);
    }
  }
  return trozos.join("");
}

/* El tramo sin los vertices que estan a menos de `tolerancia` del ultimo que se dejo. Las dos
   puntas no se tocan nunca: son las que lo empalman con el tramo siguiente. */
function caminoSimplificadoDeLinea(linea, tolerancia) {
  var dejados = [linea[0]];
  var ultimo = linea[0];
  for (var k = 1; k < linea.length - 1; k++) {
    var punto = linea[k];
    if (Math.abs(punto[0] - ultimo[0]) >= tolerancia || Math.abs(punto[1] - ultimo[1]) >= tolerancia) {
      dejados.push(punto);
      ultimo = punto;
    }
  }
  dejados.push(linea[linea.length - 1]);
  return caminoDeLineasEnGrados([dejados]);
}

/* Las dos formas que sabe agrupar `agruparEnCeldas`. Una PARTE de area es una lista de anillos
   (el primero es el contorno y los demas son huecos); una parte de linea es una lista de
   puntos. Lo unico que cambia es como se mide y como se escribe. */
var FORMA_DE_AREA = {
  caja: function (parte) { return cajaDeParte(parte[0]); },
  camino: function (parte) { return caminoEnGrados([parte]); },
  simplificado: caminoSimplificado
};
var FORMA_DE_LINEA = {
  caja: cajaDeParte,
  camino: function (parte) { return caminoDeLineasEnGrados([parte]); },
  simplificado: caminoSimplificadoDeLinea
};

/* LAS PARTES DE UN RASGO PESADO, AGRUPADAS EN CELDAS CON NIVELES DE DETALLE (24-nov-2026).

   Medido con un banco de pruebas en Edge sin ventana y el GeoJSON real: aun salteando los
   parches invisibles, las 18.085 partes de las areas deforestadas costaban 500-900 ms por paso
   de zoom con la provincia entera a la vista y 1,3 s al prender la capa, porque ECharts paga por
   cada DATO en cada cuadro (llama a `renderItem`, resuelve el estilo, compara el elemento), se
   dibuje o no.

   Ahora el rasgo se parte en una grilla de hasta CELDAS_POR_LADO x CELDAS_POR_LADO celdas, o
   sea unos pocos cientos de datos. Cada celda trae su camino en varios NIVELES: el nivel `desde`
   incluye solo las partes cuyo lado mayor mide al menos `desde` grados. En cada cuadro se
   elige el nivel mas detallado que alcanza para todo lo que se llega a ver (ver `nivelDe`), asi
   que no se pierde nada visible y con la provincia entera se dibujan unos miles de vertices en
   vez de 145.913. Los niveles son cumulativos y se arman una sola vez, al bajar la capa. */
var MAXIMO_DE_PARTES_SUELTAS = 16;
var CELDAS_POR_LADO = 20;       // el tope de la grilla de celdas
var PARTES_POR_CELDA = 40;      // el objetivo: cuantas partes conviene juntar en cada celda
var UMBRAL_MINIMO = 0.002;      // grados (~200 m): el primer corte entre niveles
var TOLERANCIA = 0.4;           // de cada corte: el error maximo, en grados
var NIVELES = 9;                // cada corte es el doble del anterior: 0,002 ... 0,512 grados
var LADO_DE_PRESENCIA = 0.3;    // del corte: el cuadradito mide un tercio de pixel (ver `agruparEnCeldas`)

/* El camino de una parte sin los vertices que estan a menos de `tolerancia` grados (en los dos
   ejes) del ultimo que se dejo. Un anillo que se queda sin area se saca: si es el exterior, se saca
   la parte entera (mide menos que la tolerancia, o sea menos de un pixel donde se usa). */
function caminoSimplificado(parte, tolerancia) {
  var anillos = [];
  for (var a = 0; a < parte.length; a++) {
    var anillo = parte[a];
    var dejados = [anillo[0]];
    var ultimo = anillo[0];
    for (var k = 1; k < anillo.length - 1; k++) {
      var p = anillo[k];
      if (Math.abs(p[0] - ultimo[0]) >= tolerancia || Math.abs(p[1] - ultimo[1]) >= tolerancia) {
        dejados.push(p);
        ultimo = p;
      }
    }
    dejados.push(anillo[anillo.length - 1]);
    if (dejados.length < 4) {
      if (a === 0) { return ""; }
      continue;
    }
    anillos.push(dejados);
  }
  return anillos.length ? caminoEnGrados([anillos]) : "";
}

/* El cuadradito con el que se dibuja una parte que, a esta escala, es mas chica que un pixel:
   `lado` esta en grados y es el corte del nivel, o sea 0,8 px (ver `agruparEnCeldas`). */
function cuadroEnGrados(x, y, lado) {
  var a = Math.round(x * MIL * 100) / 100;
  var b = Math.round(y * MIL * 100) / 100;
  var c = Math.round((x + lado) * MIL * 100) / 100;
  var d = Math.round((y + lado) * MIL * 100) / 100;
  return "M" + a + " " + b + "L" + c + " " + b + "L" + c + " " + d + "L" + a + " " + d + "Z";
}

function agruparEnCeldas(piezas, forma, conPresencia) {
  /* El tamanio de la grilla sale de CUANTAS partes hay, no es fijo: una grilla de 20 x 20
     sobre una clase de 300 partes deja 300 celdas de una parte cada una, o sea 300 elementos
     para ECharts donde alcanzaban diez. La cobertura del suelo nacional son 42 clases y asi
     pasaba de unos cientos de elementos a varios miles. */
  var porLado = Math.max(1, Math.min(CELDAS_POR_LADO,
                                     Math.round(Math.sqrt(piezas.length / PARTES_POR_CELDA))));
  var cajas = piezas.map(forma.caja);
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  cajas.forEach(function (c) {
    if (c[0] < x0) { x0 = c[0]; }
    if (c[1] < y0) { y0 = c[1]; }
    if (c[2] > x1) { x1 = c[2]; }
    if (c[3] > y1) { y1 = c[3]; }
  });
  var ancho = (x1 - x0) || 1;
  var alto = (y1 - y0) || 1;
  var celdas = {};
  piezas.forEach(function (parte, i) {
    /* La celda es la del centro de la parte: cada parte vive en UNA sola celda. */
    var c = cajas[i];
    var cx = Math.min(porLado - 1, Math.floor(((c[0] + c[2]) / 2 - x0) / ancho * porLado));
    var cy = Math.min(porLado - 1, Math.floor(((c[1] + c[3]) / 2 - y0) / alto * porLado));
    var clave = cx + "," + cy;
    if (!celdas[clave]) {
      celdas[clave] = { partes: [], tamanios: [], cajas: [], trozos: [], caja: null };
    }
    var celda = celdas[clave];
    celda.partes.push(parte);
    celda.tamanios.push(Math.max(c[2] - c[0], c[3] - c[1]));
    celda.cajas.push(c);
    celda.trozos.push(forma.camino(parte));
    celda.caja = celda.caja
      ? [Math.min(celda.caja[0], c[0]), Math.min(celda.caja[1], c[1]),
         Math.max(celda.caja[2], c[2]), Math.max(celda.caja[3], c[3])]
      : c.slice();
  });
  return Object.keys(celdas).sort().map(function (clave) {
    var celda = celdas[clave];
    var niveles = [{ desde: 0, d: celda.trozos.join("") }];
    var cuantas = celda.partes.length;
    var marcasAnteriores = conPresencia ? Infinity : 0;
    for (var k = 0; k < NIVELES; k++) {
      var desde = UMBRAL_MINIMO * Math.pow(2, k);
      var trozos = [];
      var n = 0;
      /* Ademas de sacar las partes que ya no se ven, en los niveles alejados se sacan los
         vertices que quedan a menos de `desde x TOLERANCIA` del anterior. Con la escala a la que
         se elige este nivel eso es entre 0,16 y 0,32 px, o sea que no cambia lo que se ve y baja
         mucho lo que hay que recorrer en cada cuadro. */
      var tolerancia = desde * TOLERANCIA;
      /* LA PARTE QUE YA NO SE VE: se saca, o se marca. Sacarla es lo correcto cuando es una
         entre muchas que si se ven (el mapa de la provincia). Pero si TODAS las partes de la
         capa son mas chicas que un pixel -las areas deforestadas con el pais a la vista son
         33.222 parches de 1 a 100 ha, o sea 0,02 a 0,2 px- sacarlas borra la capa entera. Por
         eso la version nacional pide `conPresencia`: las partes que no se ven se juntan en una
         grilla del tamanio del corte (0,8 px) y cada casillero ocupado se dibuja como UN
         cuadradito. Es el mismo salpicado que se veria dibujando los 33.222 parches -medido
         el 25-nov-2026 con el pais entero en la caja: 1.670 pixeles verdes en pantalla contra
         los 1.671 del dibujo completo- y solo a la escala donde cada parche es mas chico que
         el cuadradito: apenas se acerca, el nivel siguiente dibuja las partes de verdad. */
      var presencia = conPresencia ? {} : null;
      for (var i = 0; i < celda.partes.length; i++) {
        var camino = celda.tamanios[i] >= desde
          ? forma.simplificado(celda.partes[i], tolerancia) : "";
        if (camino) {
          trozos.push(camino);
          n++;
        } else if (presencia) {
          var caja = celda.cajas[i];
          presencia[Math.floor((caja[0] + caja[2]) / 2 / desde) + ","
                    + Math.floor((caja[1] + caja[3]) / 2 / desde)] = true;
        }
      }
      var marcas = presencia ? Object.keys(presencia) : [];
      marcas.forEach(function (casillero) {
        var ij = casillero.split(",");
        var lado = desde * LADO_DE_PRESENCIA;
        trozos.push(cuadroEnGrados(Number(ij[0]) * desde + lado / 2,
                                   Number(ij[1]) * desde + lado / 2, lado));
      });
      /* UN NIVEL SE GUARDA SOLO SI AHORRA DE VERDAD (al menos un 30% del camino anterior).
         Cambiar de nivel no es gratis: el navegador vuelve a leer el camino entero, y si el
         nivel nuevo pesa casi lo mismo que el viejo se paga esa lectura en cada paso de zoom
         sin dibujar menos. Pasaba con la cobertura del suelo nacional, que YA viene
         simplificada a 2,2 km -la medida de un pixel a escala de pais- asi que no hay nada
         que sacarle: medido el 25-nov-2026, 100 ms por cuadro con niveles contra 84 sin
         ellos. Saltear un nivel es siempre seguro: se usa el anterior, que tiene MAS
         detalle. */
      var d = trozos.join("");
      if ((n < cuantas || marcas.length < marcasAnteriores)
          && d.length < niveles[niveles.length - 1].d.length * 0.7) {
        niveles.push({ desde: desde, d: d });
        cuantas = n;
        marcasAnteriores = marcas.length;
      }
      if (!n && marcas.length <= 1) { break; }
    }
    return { partes: celda.partes, niveles: niveles, caja: celda.caja };
  });
}

/* El nivel de detalle que corresponde al cuadro: el mas liviano que igual incluye TODA parte que
   se llega a ver (y, en las capas nacionales, el cuadradito de presencia de las que no). Una parte se ve si alguno de sus lados mide al menos MINIMO_VISIBLE pixeles; con
   la escala mas grande de los dos ejes, eso es `MINIMO_VISIBLE / escala` grados. Cualquier nivel
   cuyo corte sea menor o igual incluye todo eso (puede incluir de mas, nunca de menos). */
function nivelDe(niveles, t) {
  var escala = Math.max(Math.abs(t.scaleX), Math.abs(t.scaleY)) * MIL;
  var minimo = MINIMO_VISIBLE / escala;
  var elegido = niveles[0];
  for (var i = 1; i < niveles.length; i++) {
    if (niveles[i].desde <= minimo) { elegido = niveles[i]; } else { break; }
  }
  return elegido.d;
}

/* LO QUE DEVUELVE `renderItem` CUANDO ESA PARTE NO SE DIBUJA. Es un camino vacio y no `null`,
   que seria lo natural: con `null` ECharts no le guarda ningun elemento al dato, y cuando mas
   tarde la serie tiene MENOS datos -pasa al prender el boton del pais o al cambiar de capa-
   su rutina de borrado lo busca igual y revienta ("Cannot read properties of null (reading
   'remove')" en `applyLeaveTransition`, que lee `el.parent` sin comprobarlo). La excepcion
   cortaba el dibujo de las series que venian despues. Un camino vacio e invisible no dibuja
   nada, no se puede tocar y le da a ECharts el elemento que espera.

   OJO: ECharts no vuelve a cero lo que `renderItem` no nombra, sino que lo MEZCLA sobre el
   elemento que ya existia, asi que todo el que pueda esconder algo tiene que decir tambien
   cuando deja de estar escondido (`invisible: false`). Sin eso, una parte que se saltea una
   vez no vuelve nunca: se la ve desaparecer al alejarse y no reaparece al acercarse. */
function nadaQueDibujar() {
  return { type: "path", invisible: true, silent: true, shape: { d: "" } };
}

/* La proyeccion del geo leida como transformacion afin, o `null` si dejo de serlo.
   Se mide con dos puntos y SE COMPRUEBA con un tercero, lejos de los dos: si algun dia este
   mapa lleva una proyeccion cartografica de verdad, la comprobacion falla y el dibujo vuelve
   solo al camino exacto, que es correcto aunque sea lento. Nunca al reves. */
function transformacionDelGeo(api) {
  var o = api.coord([-65, -27]);
  var u = api.coord([-64, -26]);
  var ax = u[0] - o[0];
  var ay = u[1] - o[1];
  if (!ax || !ay) { return null; }
  var control = api.coord([-62.5, -29]);
  if (Math.abs(control[0] - (o[0] + ax * 2.5)) > 0.5
      || Math.abs(control[1] - (o[1] - ay * 2)) > 0.5) { return null; }
  return { x: o[0] + ax * 65, y: o[1] + ay * 27, scaleX: ax / MIL, scaleY: ay / MIL };
}

/* LA DIVISION DEPARTAMENTAL, DIBUJADA ENCIMA DE LAS CAPAS (pedido de la usuaria del
   21-nov-2026: "marca sobre las capas los departamentos").

   Una capa de area cubre la provincia entera, asi que tapaba los limites y dejaba los nombres
   casi ilegibles: el mapa dejaba de decir en que departamento esta cada cosa, que es lo que JC
   pide desde el 15-nov ("QUE SE VEA LA DIVISION DEPARTAMENTAL"). Los limites y los nombres los
   dibuja el componente `geo`, que va DEBAJO de las series, asi que no alcanza con cambiarle un
   color: hay que volver a dibujarlos arriba.

   Se hace solo cuando hay alguna capa de AREA prendida. Con capas de linea o de punto
   -Infraestructura- no hace falta y seria dibujar dos veces lo mismo.

   Las dos series se cuelgan del MISMO geo (`geoIndex: 0`), asi que se mueven con el zoom y el
   arrastre sin que haya que sincronizar nada, y son `silent`: el cartel y el clic siguen
   siendo los del departamento que esta abajo. */
var Z_DIVISION = 30;

/* El camino de todos los limites, armado UNA vez por GeoJSON (son 27 departamentos y decenas de
   miles de vertices): quien dibuja solo lo mueve con la transformacion del geo. */
var caminosDeLimites = typeof WeakMap === "function" ? new WeakMap() : null;

function caminoDeLimites(limites, anillos) {
  var hecho = caminosDeLimites && caminosDeLimites.get(limites);
  if (hecho) { return hecho; }
  hecho = caminoEnGrados([anillos.map(function (a) { return a.coords; })]);
  if (caminosDeLimites) { caminosDeLimites.set(limites, hecho); }
  return hecho;
}

/* Los limites NO llevan niveles de detalle, y esta probado que no hacen falta: se les armo la
   misma escalera que a las capas -sacando vertices y anillos chicos- y el cuadro midio
   exactamente lo mismo (25-nov-2026: cursos de agua 50 ms, cobertura 67, deforestadas 33, con
   niveles y sin ellos). Lo que cuesta de un contorno no son los vertices sino pintar la linea,
   que mide lo que mide el perimetro. Por eso el contorno de las provincias se dibuja con UN
   solo trazo y no con dos: el filete claro de abajo, que si llevan los departamentos, costaba
   un cuadro entero de mas por paso de zoom (cursos de agua 50 -> 67 ms, deforestadas 33 -> 50)
   y encima invertia la jerarquia, porque dejaba la division de adentro mas marcada que el
   limite de provincia. */

export function divisionDepartamental(opciones) {
  var salida = [];
  /* CON EL PAIS A LA VISTA SE DIBUJAN DOS NIVELES, y el de arriba es el de PROVINCIA (pedido
     de la usuaria del 25-nov-2026: "quiero que en los 3 mapas se delimiten bien las provincias
     y los departamentos de Santiago"). El limite de provincia lo pinta el mapa base, o sea el
     geo, que va DEBAJO de las series: con la cobertura del suelo prendida -que es un tapiz que
     cubre el pais entero- desaparecia. Asi que arriba va el perimetro de las 24 provincias,
     grueso, y adentro la division de Santiago, mas fina: la jerarquia de cualquier atlas. */
  if (opciones.pais) {
    var provincias = serieDeLimites(opciones.limitesPais, opciones,
                                   { filete: 0, linea: 1.5, opacidad: 1 });
    if (provincias) { salida.push(provincias); }
  }
  var deptos = serieDeLimites(opciones.limites, opciones,
                              opciones.pais ? { filete: 1.8, linea: 0.8 }
                                            : { filete: 2.6, linea: 1.1 });
  if (!deptos) { return salida; }
  salida.push(deptos);
  if (opciones.rotulos && opciones.rotulos.length) {
    var nombres = opciones.pais ? nombresDeDepartamentoPais(opciones)
                                : nombresDeDepartamento(opciones);
    if (nombres) { salida.push(nombres); }
  }
  if (opciones.pais) {
    /* Los nombres de las provincias van ULTIMOS, o sea arriba de todo: a la escala en que se
       escriben son la referencia que ordena el mapa. */
    var provinciales = nombresDeProvincia(opciones);
    if (provinciales) { salida.push(provinciales); }
  }
  return salida;
}

/* El perimetro de un GeoJSON: una linea OSCURA sobre un filete claro (24-nov-2026: "que se vean
   mejor los limites"). Una sola linea clara de 0,8 px, que es lo que habia, desaparece sobre el
   relleno de una capa; una sola oscura se pierde sobre las capas oscuras. Las dos juntas se leen
   sobre cualquier color, que es lo que hace un mapa impreso.

   Se dibuja con una serie `custom` de DOS datos (el filete y la linea) que comparten UN solo
   camino armado una vez, en grados, y se mueve con la transformacion del geo, igual que las
   capas de area. Antes eran dos series `lines`: ECharts reconvertia las decenas de miles de
   coordenadas en CADA cuadro del arrastre y del zoom, y con cualquier capa de area prendida el
   mapa se trababa (medido en la pagina real: tareas de 50-90 ms por cuadro, y eso con la capa
   mas liviana). */
function serieDeLimites(geojson, opciones, grosor) {
  if (!geojson || !geojson.features) { return null; }
  var anillos = [];
  geojson.features.forEach(function (f) {
    var g = f.geometry || {};
    var piezas = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    piezas.forEach(function (parte) {
      (parte || []).forEach(function (anillo) { anillos.push({ coords: anillo }); });
    });
  });
  if (!anillos.length) { return null; }
  var trazo = opciones.trazoDepartamento || opciones.tintaDepartamento || opciones.tinta;
  var caminoBase = caminoDeLimites(geojson, anillos);
  var capasDeTrazo = [
    { value: [-65, -27], color: opciones.borde, ancho: grosor.filete, opacidad: 0.85 },
    { value: [-65, -27], color: trazo, ancho: grosor.linea,
      opacidad: grosor.opacidad || 0.8 }
  ].filter(function (c) { return c.ancho > 0; });
  var memo = null;
  return {
    type: "custom", coordinateSystem: "geo", geoIndex: 0, silent: true, z: Z_DIVISION,
    tooltip: { show: false },
    renderItem: function (params, api) {
      var dato = capasDeTrazo[params.dataIndex];
      var referencia = api.coord([-65, -27]);
      if (!memo || memo.o[0] !== referencia[0] || memo.o[1] !== referencia[1]) {
        memo = { o: referencia, t: transformacionDelGeo(api) };
      }
      var t = memo.t;
      var estilo = { fill: "none", stroke: dato.color, lineWidth: dato.ancho,
                     lineCap: "round", lineJoin: "round", opacity: dato.opacidad };
      if (!t) {
        /* Si el geo dejara de ser afin, el camino exacto: correcto aunque lento. */
        return { type: "path", style: estilo,
                 shape: { d: caminoAlVuelo([anillos.map(function (a) { return a.coords; })],
                                           api, true) } };
      }
      estilo.strokeNoScale = true;
      return { type: "path", x: t.x, y: t.y, scaleX: t.scaleX, scaleY: t.scaleY,
               style: estilo, shape: { d: caminoBase } };
    },
    data: capasDeTrazo
  };
}

/* Los nombres de los departamentos con la PROVINCIA a la vista, con el punto que calculo el
   build. A 8 px con halo de 2 las letras quedaban huecas (medido el 21-nov-2026); a 8 px con
   halo de 1 casi no se leian. A 11 px en negrita el halo de 2 px ya no se come la letra y el
   nombre se lee sobre cualquier capa. Los que no entran los saca ECharts (`hideOverlap`). */
function nombresDeDepartamento(opciones) {
  return {
    type: "scatter", coordinateSystem: "geo", geoIndex: 0, z: Z_DIVISION + 2,
    silent: true, symbolSize: 0, tooltip: { show: false },
    label: { show: true, fontSize: 11, fontWeight: 600,
             color: opciones.tintaDepartamento || opciones.tinta,
             textBorderColor: opciones.halo, textBorderWidth: 2.5,
             formatter: function (p) { return (p.data && p.data.name) || ""; } },
    labelLayout: { hideOverlap: true },
    data: opciones.rotulos.map(function (r) { return { name: r.nombre, value: r.punto }; })
  };
}

/* LA CAJA DE CADA REGION, en grados: el ancho -para saber si su nombre entra adentro- y el
   centro de su anillo mas grande, que es donde ECharts escribe el nombre cuando el GeoJSON no
   trae un punto propio (los departamentos si lo traen: lo calcula el build, `rotulos_deptos`). */
var cajasDeGeojson = typeof WeakMap === "function" ? new WeakMap() : null;

function cajasDeRegion(geojson) {
  var hecho = cajasDeGeojson && cajasDeGeojson.get(geojson);
  if (hecho) { return hecho; }
  hecho = {};
  ((geojson && geojson.features) || []).forEach(function (f) {
    var id = (f.properties || {}).geo_id;
    if (!id) { return; }
    var g = f.geometry || {};
    var piezas = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    var caja = [Infinity, Infinity, -Infinity, -Infinity];
    var mayor = null;
    var masVertices = 0;
    piezas.forEach(function (parte) {
      var anillo = parte && parte[0];
      if (!anillo) { return; }
      if (anillo.length > masVertices) { masVertices = anillo.length; mayor = anillo; }
      anillo.forEach(function (p) {
        if (p[0] < caja[0]) { caja[0] = p[0]; }
        if (p[1] < caja[1]) { caja[1] = p[1]; }
        if (p[0] > caja[2]) { caja[2] = p[0]; }
        if (p[1] > caja[3]) { caja[3] = p[1]; }
      });
    });
    if (!mayor) { return; }
    var suya = [Infinity, Infinity, -Infinity, -Infinity];
    mayor.forEach(function (p) {
      if (p[0] < suya[0]) { suya[0] = p[0]; }
      if (p[1] < suya[1]) { suya[1] = p[1]; }
      if (p[0] > suya[2]) { suya[2] = p[0]; }
      if (p[1] > suya[3]) { suya[3] = p[1]; }
    });
    hecho[id] = { ancho: caja[2] - caja[0],
                  punto: [(suya[0] + suya[2]) / 2, (suya[1] + suya[3]) / 2] };
  });
  if (cajasDeGeojson) { cajasDeGeojson.set(geojson, hecho); }
  return hecho;
}

/* LOS NOMBRES, CON EL PAIS A LA VISTA, SE DIBUJAN ENCIMA DE LAS CAPAS Y CADA UNO SABE CUANDO
   LE TOCA (pedido de la usuaria del 25-nov-2026: "mostrando bien los nombres de las provincias
   y los de departamentos de Santiago").

   Encima, porque los nombres del mapa base los escribe el componente `geo`, que va DEBAJO de
   las series: con la cobertura del suelo prendida -un tapiz que cubre el pais- quedaban
   tapados y de "Santiago del Estero" se leia "...stero" donde el tapiz tenia un agujero.

   Y cada uno sabe cuando le toca porque a cada escala corresponde un nivel:

   - El DEPARTAMENTO se escribe cuando mide, en pantalla, lo que mide su nombre. Con el pais
     entero en la caja Santiago mide unos 100 px y sus 27 departamentos unos 7 cada uno, y
     "AGUIRRE" necesita 40: escribirlos igual no es mostrarlos, es tapar el mapa. Al acercarse
     van apareciendo solos, primero los grandes del este.
   - La PROVINCIA se escribe hasta que su nombre deja de ser una referencia: cuando ya no entra
     entera en la caja uno no esta mirando el pais sino un pedazo de provincia, y el nombre
     cruzado en el medio solo estorba a los nombres de adentro.

   Nada de esto se puede hacer con el `hideOverlap` de ECharts, que decide una vez por dibujado:
   el zoom y el arrastre NO redibujan, solo transforman. Por eso los nombres van en una serie
   `custom`, que es la unica que vuelve a decidir en cada cuadro -lo mismo que hacen las capas
   para saltear lo que no se ve-. */
var FUENTE_DEL_DEPARTAMENTO = 10;
var FUENTE_DE_LA_PROVINCIA = 11;
var ANCHO_DE_LETRA = 0.62;

function serieDeNombres(datos, fuente, opciones, comoDecide) {
  var tinta = opciones.tintaDepartamento || opciones.tinta;
  var memo = null;
  /* El texto vacio se arma CADA vez: ECharts se queda con el objeto que devuelve `renderItem`
     -lo usa para la transicion del elemento- y compartir uno solo entre los 27 nombres y entre
     un cuadro y el siguiente hacia que, una vez escondido, el nombre no volviera a aparecer
     nunca (probado: con el pais prendido y el mapa acercado sobre Santiago no salia ninguno). */
  var escondido = function () {
    return { type: "text", invisible: true, silent: true, style: { text: "" } };
  };
  return {
    type: "custom", coordinateSystem: "geo", geoIndex: 0, silent: true, z: Z_DIVISION + 2,
    tooltip: { show: false },
    renderItem: function (params, api) {
      var dato = datos[params.dataIndex];
      var referencia = api.coord([-65, -27]);
      if (!memo || memo.o[0] !== referencia[0] || memo.o[1] !== referencia[1]) {
        memo = { o: referencia, px: Math.abs(api.coord([-64, -27])[0] - referencia[0]) };
      }
      if (!dato.grados || !memo.px) { return escondido(); }
      var mide = dato.grados * memo.px;
      if (comoDecide === "entra"
          && mide < dato.name.length * fuente * ANCHO_DE_LETRA) { return escondido(); }
      if (comoDecide === "marco" && mide > api.getWidth()) { return escondido(); }
      var punto = api.coord(dato.value);
      return {
        type: "text", x: punto[0], y: punto[1], silent: true, invisible: false,
        style: { text: dato.name, font: "600 " + fuente + "px sans-serif",
                 fill: tinta, stroke: opciones.halo, lineWidth: 2.5, strokeFirst: true,
                 textAlign: "center", textVerticalAlign: "middle" }
      };
    },
    data: datos
  };
}

function nombresDeDepartamentoPais(opciones) {
  var cajas = cajasDeRegion(opciones.limites);
  var datos = [];
  opciones.rotulos.forEach(function (r) {
    var c = cajas[r.id];
    if (c) { datos.push({ name: r.nombre, value: r.punto, grados: c.ancho }); }
  });
  return datos.length ? serieDeNombres(datos, FUENTE_DEL_DEPARTAMENTO, opciones, "entra") : null;
}

function nombresDeProvincia(opciones) {
  var cajas = cajasDeRegion(opciones.limitesPais);
  var datos = [];
  (opciones.rotulosProvincias || []).forEach(function (p) {
    var c = cajas[p.id];
    if (c) { datos.push({ name: p.nombre, value: c.punto, grados: c.ancho }); }
  });
  return datos.length ? serieDeNombres(datos, FUENTE_DE_LA_PROVINCIA, opciones, "marco") : null;
}

/* Las series de las capas prendidas y ya bajadas. `interactivas`: con tooltip (portada);
   sin el, `silent` (mapa de calor: el clic y el tooltip siguen siendo del departamento).
   `halo`: el color del fondo del cuadro, que despega las lineas del relleno oscuro. */
function series(catalogo, ids, opciones) {
  var salida = [];
  var z = 3;
  ids.forEach(function (id) {
    var capa = catalogo.capas[id];
    var entrada = bajadas[capa.archivo];
    if (!entrada || !entrada.grupos) { return; }
    capa.estilos.forEach(function (estilo, i) {
      var datos = entrada.grupos[i];
      if (!datos.length) { return; }
      if (capa.geometria === "puntos") {
        var punto = {
          type: "scatter", coordinateSystem: "geo", geoIndex: 0, z: z + 2,
          silent: !opciones.interactivas,
          symbol: "circle", symbolSize: estilo.tamanio || 5,
          itemStyle: { color: estilo.color, borderColor: estilo.borde || estilo.color,
                       borderWidth: 1, opacity: opacidadDe(estilo, 1, opciones) },
          emphasis: { scale: 1.6 },
          tooltip: opciones.interactivas ? tooltipDeCapa() : { show: false },
          data: datos
        };
        /* Capas que escriben el nombre al lado del punto (las ciudades y pueblos, JC
           15-nov-2026: "QUE SE VEA... LAS PRINCIPALES CIUDADES/PUEBLOS"). Son 165 y a la
           provincia entera no entran todos: `hideOverlap` esconde los que se encimarian y, a
           medida que se hace zoom, van apareciendo. Es la misma regla que ya usan los nombres
           de los departamentos. El halo claro es para que el nombre se lea sobre una ruta. */
        /* Con el PAIS a la vista los nombres no se escriben: son 165 nombres de 9 px sobre
           una provincia que a esa escala mide 100 px, o sea una mancha que ademas tapa los
           nombres de los departamentos y de las provincias. El punto sigue estando y el nombre
           sigue saliendo al pasar el mouse. */
        if (capa.rotulos && !opciones.pais) {
          punto.label = {
            show: true, position: "right", distance: 3, fontSize: 9,
            /* Los dos colores los trae el que llama (este modulo no ve `PIVOTAL`): son
               cromo de interfaz y salen del theme, como los nombres de los departamentos. */
            color: opciones.tinta, textBorderColor: opciones.halo, textBorderWidth: 2,
            formatter: function (p) { return (p.data && p.data.name) || ""; }
          };
          punto.labelLayout = { hideOverlap: true };
        }
        salida.push(punto);
        return;
      }
      /* AREAS Y LINEAS SE DIBUJAN IGUAL: una serie `custom` con el camino ya armado en
         grados y, en cada cuadro, solo la transformacion que lo lleva a la pantalla.

         ECharts no tiene serie de areas sobre un `geo` (la serie `map` dibuja el mapa
         registrado, no un GeoJSON cualquiera). Y la serie `lines`, que si existe, resultaba
         carisima con el pais a la vista: un ELEMENTO por tramo (los cursos de agua del NOA
         son miles), los puntos proyectados de nuevo en cada cuadro y la lista entera de
         coordenadas copiada por ECharts en cada `setOption`. Medido el 25-nov-2026 con los
         cursos de agua nacionales: 208 ms por cuadro, de los cuales 128 de dibujo nativo,
         15 de `clone` y 32 de recoleccion de basura. Con el camino prearmado son los mismos
         tramos en un punado de elementos y lo unico que cambia por cuadro es el `transform`. */
      var esArea = capa.geometria === "poligonos";
      var anchoDeLinea = estilo.ancho || 1;
      /* El estilo viaja como `itemStyle` -aunque sea una linea- porque es lo que resuelve
         `api.style()` dentro de `renderItem`, con los estados (resaltado) que arma ECharts. */
      var relleno = esArea
        ? { color: estilo.color, opacity: opacidadDe(estilo, OPACIDAD_AREA, opciones),
            borderColor: estilo.borde || estilo.color,
            borderWidth: estilo.ancho === undefined ? 0.4 : estilo.ancho }
        : { color: "none", opacity: opacidadDe(estilo, 1, opciones),
            borderColor: estilo.color, borderWidth: anchoDeLinea };
      /* Lo que el itemStyle no sabe decir: el punteado y las puntas redondeadas de una linea.
         `strokeNoScale` es obligatorio en los dos: sin el, el trazo se multiplica por la
         escala -que es del orden de 0,08- y desaparece. */
      var pincel = esArea
        ? { strokeNoScale: true }
        : { strokeNoScale: true, fill: "none", lineCap: "round", lineJoin: "round",
            lineDash: estilo.trazo === "punteado" ? [4, 3] : null };
      var serieDeCamino = function (cfg) {
        return {
          type: "custom", coordinateSystem: "geo", geoIndex: 0, z: cfg.z,
          silent: cfg.silent || !opciones.interactivas,
          tooltip: (opciones.interactivas && !cfg.silent) ? tooltipDeCapa() : { show: false },
          itemStyle: cfg.itemStyle,
          emphasis: esArea
            ? { focus: "none", itemStyle: { opacity: 1 } }
            : { focus: "none", itemStyle: { borderWidth: cfg.itemStyle.borderWidth + 1.5 } },
          /* 18.085 parches no se pueden dibujar enteros en cada cuadro: medido el
             21-nov-2026, el navegador tardaba 451 ms SOLO en cerrar los trazos y la pagina se
             congelaba 1,3 s en cada paso de zoom y en cada tiron del arrastre. Asi que cada
             parte se dibuja unicamente si se la puede ver: si mide menos de un pixel se
             saltea (a la provincia entera, un parche de una hectarea es la decima parte de un
             pixel) y si quedo fuera de la pantalla tambien. Al acercar, los que entran en la
             vista se dibujan todos: no se pierde detalle, se deja de dibujar lo invisible. */
          progressive: 0,
          renderItem: (function (datosDeLaCapa, capaDeEsteDibujo) {
            /* La transformacion es la misma para todas las partes de un mismo cuadro, y
               `renderItem` se llama una vez por parte: se calcula una sola vez y se la
               revalida con UNA consulta (si el mapa se movio, el punto de referencia cae en
               otro lado y se recalcula). */
            var memo = null;
            return function (params, api) {
              var dato = datosDeLaCapa[params.dataIndex];
              if (!dato || !dato.partes) { return nadaQueDibujar(); }
              var referencia = api.coord([-65, -27]);
              if (!memo || memo.o[0] !== referencia[0] || memo.o[1] !== referencia[1]) {
                /* El estilo se guarda junto con la transformacion: `api.style()` lo resuelve
                   consultando el modelo de la serie, y hacerlo una vez por parte -18.085
                   veces por cuadro- costaba mas que dibujar. Es el mismo para toda la capa. */
                memo = { o: referencia, t: transformacionDelGeo(api),
                         estilo: Object.assign({}, api.style(), pincel) };
              }
              var t = memo.t;
              if (!t || !(dato.d || dato.niveles)) {
                return { type: "path", invisible: false,
                         style: Object.assign({}, api.style(), pincel),
                         shape: { d: caminoAlVuelo(dato.partes, api, esArea) } };
              }
              if (dato.caja) {
                var x0 = t.x + t.scaleX * dato.caja[0] * MIL;
                var x1 = t.x + t.scaleX * dato.caja[2] * MIL;
                var y1 = t.y + t.scaleY * dato.caja[1] * MIL;
                var y0 = t.y + t.scaleY * dato.caja[3] * MIL;
                /* Lo que esta FUERA DE LA PANTALLA no se dibuja nunca, tambien con el pais a
                   la vista: ahi el ahorro no borra nada, es lo que no se esta mirando. Lo que
                   mide menos de un pixel se saltea solo en el mapa de la provincia: a escala
                   de pais eso borraba la capa entera (ver `MINIMO_VISIBLE`). */
                if (!capaDeEsteDibujo.dibujar_todo
                    && x1 - x0 < MINIMO_VISIBLE && y1 - y0 < MINIMO_VISIBLE) {
                  return nadaQueDibujar();
                }
                if (x1 < 0 || y1 < 0 || x0 > api.getWidth() || y0 > api.getHeight()) {
                  return nadaQueDibujar();
                }
              }
              return { type: "path", x: t.x, y: t.y, scaleX: t.scaleX, scaleY: t.scaleY,
                       invisible: false, style: memo.estilo,
                       shape: { d: dato.niveles ? nivelDe(dato.niveles, t) : dato.d } };
            };
          }(datos, capa)),
          /* A ECharts se le pasan datos LIVIANOS: nombre y un punto. `renderItem` lee las
             coordenadas y los caminos de `datos` (por cierre), no de aca. Importa porque
             ECharts hace una copia profunda de toda la opcion en cada `setOption` y en cada
             `getOption`, y con las partes adentro eso eran 145.913 vertices copiados en cada
             clic y en cada gesto de zoom (medido el 24-nov-2026 en la pagina real: 30-60 ms
             de `clone` por gesto, dentro de tareas de mas de 100 ms). */
          data: datos.map(function (d) { return { name: d.name, value: d.value }; })
        };
      };
      /* El halo de las lineas de Infraestructura: el mismo camino, mas grueso y por debajo. */
      if (!esArea && capa.halo && opciones.halo) {
        salida.push(serieDeCamino({
          z: z, silent: true,
          itemStyle: { color: "none", opacity: opacidadDe({}, 0.85, opciones),
                       borderColor: opciones.halo, borderWidth: anchoDeLinea + 2 * capa.halo }
        }));
      }
      salida.push(serieDeCamino({ z: z + 1, itemStyle: relleno }));
      return;
    });
    z += 2;
  });
  return salida;
}

/* Lo que llama cada dibujante de mapa. Engancha el control la primera vez (los checkbox viven
   en el panel y viajan con el al zoom), pinta muestras, leyenda y pie, y devuelve lo que hay
   que sumarle a la opcion de ECharts: {geo, series} o null si no hay ninguna capa lista.
   `redibujar` es el dibujante del cuadro con su panel: se guarda en el nodo para que el
   checkbox llame siempre al ultimo. */
/* Las capas prendidas de este cuadro, para quien las necesite afuera: la consulta
   departamental de RF25 muestra los valores de las capas ACTIVAS, y cuales estan activas lo
   decide el visitante con el control, no el build. */
export function capasPrendidas(nodo, catalogo) {
  if (!catalogo || !catalogo.capas) { return []; }
  return prendidas(nodo, catalogo);
}

export function capasDelMapa(nodo, catalogoCompleto, redibujar, proyeccion, opciones) {
  var catalogo = vistaDelCatalogo(catalogoCompleto, opciones && opciones.pais);
  if (!catalogo || !catalogo.capas || !nodo.querySelector(RENGLONES_DE_CAPA)) { return null; }
  nodo.capasRedibujar = redibujar;
  /* La regla de que capas se ven juntas viaja en el payload del cuadro y se guarda en el nodo
     para que el escuchador -que se engancha una sola vez- lea siempre la ultima. */
  nodo.capasCompatibilidad = (opciones && opciones.compatibilidad) || null;
  if (!nodo.dataset.capasEnganchadas) {
    nodo.dataset.capasEnganchadas = "1";
    nodo.addEventListener("change", function (evento) {
      if (evento.target && evento.target.matches && evento.target.matches("input[data-capa]")) {
        if (evento.target.checked && nodo.capasCompatibilidad) {
          aplicarCompatibilidad(nodo, nodo.capasCompatibilidad, evento.target.dataset.capa);
        }
        nodo.capasRedibujar();
      }
    });
  }
  pintarControl(nodo, catalogo, opciones);
  var ids = prendidas(nodo, catalogo);
  pintarLeyenda(nodo, catalogo, ids);
  pintarPie(nodo, catalogo, ids, opciones);
  var listasYa = listas(nodo, catalogo, function () { nodo.capasRedibujar(); });
  precargar(catalogo);
  if (!listasYa.length) { return null; }
  /* Con una capa de AREA prendida, los limites y los nombres de los departamentos se vuelven a
     dibujar ENCIMA (ver `divisionDepartamental`), y se le apagan al geo para no tenerlos dos
     veces: los de abajo quedarian como un fantasma corrido debajo de los de arriba. */
  var conArea = listasYa.some(function (id) {
    return catalogo.capas[id].geometria === "poligonos";
  });
  /* Con el pais a la vista el geo dibuja las PROVINCIAS, asi que los departamentos de
     Santiago no los dibuja nadie: la division va siempre, haya o no una capa de area. */
  var encima = (conArea || opciones.pais) ? divisionDepartamental(opciones) : [];
  return { geo: geo(proyeccion, sinRotulosRepetidos(opciones, encima)),
           series: series(catalogo, listasYa, opciones).concat(encima) };
}
