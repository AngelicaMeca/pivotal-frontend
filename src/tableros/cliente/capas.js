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
  (geo.features || []).forEach(function (feature) {
    var propiedades = feature.properties || {};
    var nombre = sustituir(capa.tooltip, propiedades);
    var geometria = feature.geometry || {};
    var grupo = grupos[estiloDe(capa, propiedades)];
    if (capa.geometria === "puntos") {
      grupo.push({ name: nombre, value: geometria.coordinates });
      return;
    }
    var partes = geometria.type === "MultiLineString" ? geometria.coordinates : [geometria.coordinates];
    partes.forEach(function (parte) { grupo.push({ name: nombre, coords: parte }); });
  });
  return grupos;
}

function bajar(capa, alTerminar) {
  var entrada = bajadas[capa.archivo];
  if (entrada) { return entrada; }
  entrada = { grupos: null };
  entrada.promesa = fetch(capa.archivo).then(function (r) {
    if (!r.ok) { throw new Error("No se pudo bajar " + capa.archivo + " (" + r.status + ")"); }
    return r.json();
  }).then(function (geo) {
    entrada.grupos = procesar(capa, geo);
    alTerminar();
  }).catch(function (error) {
    delete bajadas[capa.archivo];
    if (window.console && window.console.warn) { window.console.warn(error); }
  });
  bajadas[capa.archivo] = entrada;
  return entrada;
}

/* Las capas PRENDIDAS en el control de este cuadro, en el orden del control (que es el orden
   de dibujo: la primera queda abajo). */
function prendidas(nodo, catalogo) {
  var ids = [];
  Array.prototype.forEach.call(nodo.querySelectorAll("input[data-capa]"), function (input) {
    if (input.checked && catalogo.capas[input.dataset.capa]) { ids.push(input.dataset.capa); }
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
function muestra(capa, estilo) {
  var span = document.createElement("span");
  if (capa.geometria === "puntos") {
    span.className = "capas-punto";
    span.style.background = estilo.color;
    span.style.borderColor = estilo.borde || estilo.color;
  } else {
    span.className = "capas-trazo";
    span.style.borderTopColor = estilo.color;
    span.style.borderTopStyle = estilo.trazo === "punteado" ? "dashed" : "solid";
    span.style.borderTopWidth = Math.max(1, Math.round(estilo.ancho || 1)) + "px";
    if (estilo.opacidad !== undefined) { span.style.opacity = String(estilo.opacidad); }
  }
  return span;
}

/* Que significa cada trazo de una capa: "pavimentada", "consolidado o tierra"... Una capa con
   un solo estilo sin rotulo no lleva variantes. */
function variantes(capa) {
  var lista = document.createElement("span");
  capa.estilos.forEach(function (estilo) {
    if (!estilo.rotulo) { return; }
    var item = document.createElement("span");
    item.className = "capas-variante";
    item.appendChild(muestra(capa, estilo));
    item.appendChild(document.createTextNode(estilo.rotulo));
    lista.appendChild(item);
  });
  return lista;
}

function vaciar(nodo) { while (nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }

/* Las muestras del control (una sola vez: el control no cambia) y la marca de prendida de
   cada renglon, que es lo que usa el PDF para no imprimir las apagadas. */
function pintarControl(nodo, catalogo) {
  Array.prototype.forEach.call(nodo.querySelectorAll("[data-muestra-capa]"), function (hueco) {
    var capa = catalogo.capas[hueco.dataset.muestraCapa];
    if (!capa || hueco.firstChild) { return; }
    hueco.appendChild(muestra(capa, capa.estilos[0]));
  });
  Array.prototype.forEach.call(nodo.querySelectorAll("[data-variantes-capa]"), function (hueco) {
    var capa = catalogo.capas[hueco.dataset.variantesCapa];
    if (!capa || hueco.firstChild) { return; }
    hueco.appendChild(variantes(capa));
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
   fuentes y el rotulo vienen del build; aca solo se listan sin repetir. */
function pintarPie(nodo, catalogo, ids) {
  var pie = nodo.querySelector("[data-pie-capas]");
  if (!pie) { return; }
  var fuentes = [];
  ids.forEach(function (id) {
    var fuente = catalogo.capas[id].fuente;
    if (fuentes.indexOf(fuente) === -1) { fuentes.push(fuente); }
  });
  pie.textContent = fuentes.length ? catalogo.rotulo_fuentes + " " + fuentes.join(" · ") : "";
}

/* ------------------------------ dibujo en ECharts ------------------------------ */
/* El componente `geo` que da las coordenadas a las capas. Misma proyeccion que la serie `map`
   del cuadro (se le pasan los MISMOS aspectScale, layoutCenter y layoutSize), transparente y
   mudo: no se ve, no tiene tooltip y no recibe clics. */
function geo(proyeccion) {
  return {
    map: "provincia",
    nameProperty: "geo_id",
    aspectScale: proyeccion.aspectScale,
    layoutCenter: proyeccion.layoutCenter,
    layoutSize: proyeccion.layoutSize,
    roam: false,
    silent: true,
    selectedMode: false,
    tooltip: { show: false },
    label: { show: false },
    itemStyle: { areaColor: "rgba(0,0,0,0)", borderColor: "rgba(0,0,0,0)", borderWidth: 0 },
    emphasis: { disabled: true }
  };
}

function tooltipDeCapa() {
  return {
    formatter: function (p) {
      var nombre = (p.data && p.data.name) || p.name || "";
      return nombre ? escapar(nombre) : "";
    }
  };
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
        salida.push({
          type: "scatter", coordinateSystem: "geo", geoIndex: 0, z: z + 2,
          silent: !opciones.interactivas,
          symbol: "circle", symbolSize: estilo.tamanio || 5,
          itemStyle: { color: estilo.color, borderColor: estilo.borde || estilo.color, borderWidth: 1 },
          emphasis: { scale: 1.6 },
          tooltip: opciones.interactivas ? tooltipDeCapa() : { show: false },
          data: datos
        });
        return;
      }
      var tipo = estilo.trazo === "punteado" ? [4, 3] : "solid";
      var comun = {
        type: "lines", coordinateSystem: "geo", geoIndex: 0, polyline: true,
        large: !!capa.grande, largeThreshold: 2000, data: datos
      };
      if (capa.halo && opciones.halo) {
        salida.push(Object.assign({}, comun, {
          z: z, silent: true, tooltip: { show: false },
          lineStyle: { color: opciones.halo, width: (estilo.ancho || 1) + 2 * capa.halo,
                       opacity: 0.85, cap: "round", join: "round" }
        }));
      }
      salida.push(Object.assign({}, comun, {
        z: z + 1, silent: !opciones.interactivas,
        tooltip: opciones.interactivas ? tooltipDeCapa() : { show: false },
        lineStyle: { color: estilo.color, width: estilo.ancho || 1, type: tipo,
                     opacity: estilo.opacidad === undefined ? 1 : estilo.opacidad,
                     cap: "round", join: "round" },
        emphasis: { focus: "none", lineStyle: { width: (estilo.ancho || 1) + 1.5 } }
      }));
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
export function capasDelMapa(nodo, catalogo, redibujar, proyeccion, opciones) {
  if (!catalogo || !catalogo.capas || !nodo.querySelector("input[data-capa]")) { return null; }
  nodo.capasRedibujar = redibujar;
  if (!nodo.dataset.capasEnganchadas) {
    nodo.dataset.capasEnganchadas = "1";
    nodo.addEventListener("change", function (evento) {
      if (evento.target && evento.target.matches && evento.target.matches("input[data-capa]")) {
        nodo.capasRedibujar();
      }
    });
  }
  pintarControl(nodo, catalogo);
  var ids = prendidas(nodo, catalogo);
  pintarLeyenda(nodo, catalogo, ids);
  pintarPie(nodo, catalogo, ids);
  var listasYa = listas(nodo, catalogo, function () { nodo.capasRedibujar(); });
  if (!listasYa.length) { return null; }
  return { geo: geo(proyeccion), series: series(catalogo, listasYa, opciones) };
}
