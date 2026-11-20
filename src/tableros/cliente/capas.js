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
  (geo.features || []).forEach(function (feature) {
    var propiedades = feature.properties || {};
    var nombre = sustituir(capa.tooltip, propiedades);
    var geometria = feature.geometry || {};
    var grupo = grupos[estiloDe(capa, propiedades)];
    if (capa.geometria === "puntos") {
      grupo.push({ name: nombre, value: geometria.coordinates });
      return;
    }
    if (capa.geometria === "poligonos") {
      /* UN DATO POR PARTE del rasgo, no uno por rasgo (cambiado el 21-nov-2026, ver
         `renderItem`): asi cada parche se puede saltear cuando es mas chico que un pixel o
         cuando quedo fuera de la vista, que es lo que hace que una capa de 18.085 parches se
         pueda recorrer. Los HUECOS siguen en el mismo trazo que su anillo exterior, que es lo
         que importa: los huecos de un poligono viven adentro de su propia parte, nunca en otra.
         `d` es su camino ya armado en grados (`caminoEnGrados`) y `caja` su rectangulo, con el
         que se decide si vale la pena dibujarlo. */
      var piezas = geometria.type === "MultiPolygon" ? geometria.coordinates : [geometria.coordinates];
      piezas.forEach(function (parte) {
        if (!parte || !parte.length || !parte[0].length) { return; }
        grupo.push({ name: nombre, value: parte[0][0], partes: [parte],
                     d: caminoEnGrados([parte]), caja: cajaDeParte(parte[0]) });
      });
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
    var alfa = estilo.opacidad === undefined ? OPACIDAD_AREA : estilo.opacidad;
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
    if (estilo.opacidad !== undefined) { span.style.opacity = String(estilo.opacidad); }
  }
  return span;
}

/* Que significa cada trazo de una capa: "pavimentada", "consolidado o tierra"... Una capa con
   un solo estilo sin rotulo no lleva variantes. */
function variantes(capa) {
  var lista = document.createElement("span");
  /* Las clases de una capa de AREA se listan en COLUMNA: son diez o doce y sus nombres son
     frases enteras del INTA ("G3 - Ganadera: Apta para pasturas, receptividad 10-30 ha-UG"),
     que en una fila envuelven y dejan de leerse como una leyenda. */
  if (capa.geometria === "poligonos") { lista.className = "capas-variantes-area"; }
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
    var id = hueco.dataset.variantesCapa;
    var capa = catalogo.capas[id];
    if (!capa) { return; }
    if (!hueco.firstChild) { hueco.appendChild(variantes(capa)); }
    /* Las clases de una capa que lo pide se listan SOLO si la capa esta prendida. Lo piden las
       capas tematicas del INTA, que traen seis, diez o doce clases de nombre largo: con las dos
       apagadas la leyenda medía 661 px debajo de un mapa de 640, y lo primero que se leía era
       la lista de clases de un mapa que no estaba dibujado. Quien lo pide lo declara en
       configs/dims/capas-*.yaml, no se deduce de la geometria: las capas del IGN traen dos
       variantes de una linea y las muestran siempre, que es como JC aprobo Infraestructura. */
    if (capa.clases_al_prender) {
      var casilla = nodo.querySelector('input[data-capa="' + id + '"]');
      hueco.hidden = !(casilla && casilla.checked);
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
/* El componente `geo` sobre el que se dibujan las capas. Es transparente y, normalmente,
   `silent`: esta solo para darles coordenadas.

   Con `opciones.roam` (la pagina de Infraestructura, JC 15-nov-2026: "que el mapa ocupe toda la
   pagina pudiendo hacer zoom al maximo") deja de ser silent, porque es EL que recibe la rueda y
   el arrastre, y pasa a ser el UNICO sistema de coordenadas del cuadro: la serie `map` de los
   departamentos se le cuelga con `geoIndex: 0`, asi el mapa y las capas se mueven juntos. Sin
   eso cada uno tendria su propio zoom y al primer movimiento las rutas quedarian corridas
   respecto de los departamentos. `emphasis` sigue deshabilitado: el geo no se pinta ni se
   resalta, solo capta el gesto. */
export function geoDeMapa(proyeccion, opciones) {
  var conZoom = !!(opciones && opciones.roam);
  var geo = {
    map: "provincia",
    nameProperty: "geo_id",
    aspectScale: proyeccion.aspectScale,
    layoutCenter: proyeccion.layoutCenter,
    layoutSize: proyeccion.layoutSize,
    roam: conZoom,
    // Hasta 40x: a ese acercamiento se lee un camino rural suelto, que es "el maximo" que pide
    // JC. El minimo es 1 para que no se pueda alejar mas alla de la provincia entera.
    scaleLimit: conZoom ? { min: 1, max: 40 } : undefined,
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
function caminoDePoligono(partes, api) {
  var d = "";
  for (var p = 0; p < partes.length; p++) {
    for (var a = 0; a < partes[p].length; a++) {
      var anillo = partes[p][a];
      for (var k = 0; k < anillo.length; k++) {
        var xy = api.coord(anillo[k]);
        d += (k === 0 ? "M" : "L") + xy[0].toFixed(2) + " " + xy[1].toFixed(2);
      }
      d += "Z";
    }
  }
  return d;
}

/* EL MISMO CAMINO, PERO EN GRADOS Y UNA SOLA VEZ, y la transformacion que lo lleva a la
   pantalla. Es lo que hace que una capa de area pesada se pueda recorrer.

   El problema que resuelve (medido el 21-nov-2026 en "Suelos y uso del suelo"): las areas
   ganaderas deforestadas son UN rasgo con 18.085 partes y 145.913 vertices, y `caminoDePoligono`
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
   grande. Es menos de un pixel a proposito, para no borrar nada que llegue a verse. */
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
        trozos.push((k === 0 ? "M" : "L") + (anillo[k][0] * MIL).toFixed(2)
                    + " " + (anillo[k][1] * MIL).toFixed(2));
      }
      trozos.push("Z");
    }
  }
  return trozos.join("");
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

function divisionDepartamental(opciones) {
  var limites = opciones.limites;
  if (!limites || !limites.features) { return []; }
  var anillos = [];
  limites.features.forEach(function (f) {
    var g = f.geometry || {};
    var piezas = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    piezas.forEach(function (parte) {
      (parte || []).forEach(function (anillo) { anillos.push({ coords: anillo }); });
    });
  });
  if (!anillos.length) { return []; }
  var salida = [{
    type: "lines", coordinateSystem: "geo", geoIndex: 0, polyline: true, silent: true,
    z: Z_DIVISION, large: true, largeThreshold: 10, tooltip: { show: false },
    lineStyle: { color: opciones.borde, width: 0.8, opacity: 1 },
    data: anillos
  }];
  if (opciones.rotulos && opciones.rotulos.length) {
    /* Los nombres, con el punto que calculo el build. Llevan un halo finito: sin el, un
       nombre sobre un area oscura no se lee; con mas de un pixel se come la letra, que mide
       ocho (medido el 21-nov-2026 ampliando la captura: con halo de 2 px las letras quedaban
       huecas). */
    salida.push({
      type: "scatter", coordinateSystem: "geo", geoIndex: 0, z: Z_DIVISION + 1,
      silent: true, symbolSize: 0, tooltip: { show: false },
      label: { show: true, fontSize: 8, color: opciones.tintaDepartamento || opciones.tinta,
               textBorderColor: opciones.halo, textBorderWidth: 1,
               formatter: function (p) { return (p.data && p.data.name) || ""; } },
      labelLayout: { hideOverlap: true },
      data: opciones.rotulos.map(function (r) { return { name: r.nombre, value: r.punto }; })
    });
  }
  return salida;
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
          itemStyle: { color: estilo.color, borderColor: estilo.borde || estilo.color, borderWidth: 1 },
          emphasis: { scale: 1.6 },
          tooltip: opciones.interactivas ? tooltipDeCapa() : { show: false },
          data: datos
        };
        /* Capas que escriben el nombre al lado del punto (las ciudades y pueblos, JC
           15-nov-2026: "QUE SE VEA... LAS PRINCIPALES CIUDADES/PUEBLOS"). Son 165 y a la
           provincia entera no entran todos: `hideOverlap` esconde los que se encimarian y, a
           medida que se hace zoom, van apareciendo. Es la misma regla que ya usan los nombres
           de los departamentos. El halo claro es para que el nombre se lea sobre una ruta. */
        if (capa.rotulos) {
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
      if (capa.geometria === "poligonos") {
        /* ECharts no tiene serie de AREAS sobre un `geo` (la serie `map` dibuja el mapa
           registrado, no un GeoJSON cualquiera), asi que las areas se dibujan a mano con una
           serie `custom`: un elemento `path` por rasgo, con los vertices pasados por
           `api.coord`, que es la MISMA proyeccion con la que el geo dibuja los
           departamentos. Asi la capa y la cartografia se mueven juntas con el zoom. */
        salida.push({
          type: "custom", coordinateSystem: "geo", geoIndex: 0, z: z + 1,
          silent: !opciones.interactivas,
          tooltip: opciones.interactivas ? tooltipDeCapa() : { show: false },
          itemStyle: {
            color: estilo.color,
            opacity: estilo.opacidad === undefined ? OPACIDAD_AREA : estilo.opacidad,
            borderColor: estilo.borde || estilo.color,
            borderWidth: estilo.ancho === undefined ? 0.4 : estilo.ancho
          },
          emphasis: { focus: "none", itemStyle: { opacity: 1 } },
          /* 18.085 parches no se pueden dibujar enteros en cada cuadro: medido el
             21-nov-2026, el navegador tardaba 451 ms SOLO en cerrar los trazos y la pagina se
             congelaba 1,3 s en cada paso de zoom y en cada tiron del arrastre. Asi que cada
             parte se dibuja unicamente si se la puede ver: si mide menos de un pixel se
             saltea (a la provincia entera, un parche de una hectarea es la decima parte de un
             pixel) y si quedo fuera de la pantalla tambien. Al acercar, los que entran en la
             vista se dibujan todos: no se pierde detalle, se deja de dibujar lo invisible. */
          progressive: 0,
          renderItem: (function (datosDeLaCapa) {
            /* La transformacion es la misma para todas las partes de un mismo cuadro, y
               `renderItem` se llama una vez por parte: se calcula una sola vez y se la
               revalida con UNA consulta (si el mapa se movio, el punto de referencia cae en
               otro lado y se recalcula). */
            var memo = null;
            return function (params, api) {
              var dato = datosDeLaCapa[params.dataIndex];
              if (!dato || !dato.partes) { return null; }
              var referencia = api.coord([-65, -27]);
              if (!memo || memo.o[0] !== referencia[0] || memo.o[1] !== referencia[1]) {
                /* El estilo se guarda junto con la transformacion: `api.style()` lo resuelve
                   consultando el modelo de la serie, y hacerlo una vez por parte -18.085
                   veces por cuadro- costaba mas que dibujar. Es el mismo para toda la capa. */
                memo = { o: referencia, t: transformacionDelGeo(api), estilo: api.style() };
              }
              var t = memo.t;
              /* El camino ya esta armado (en grados): aca solo se lo ubica y se lo escala.
                 `strokeNoScale` es obligatorio: sin el, el borde se multiplica por la escala
                 -que es del orden de 0,08- y desaparece. */
              if (!t || !dato.d) {
                return { type: "path", style: api.style(),
                         shape: { d: caminoDePoligono(dato.partes, api) } };
              }
              var estilo = Object.assign({}, memo.estilo, { strokeNoScale: true });
              if (dato.caja) {
                var x0 = t.x + t.scaleX * dato.caja[0] * MIL;
                var x1 = t.x + t.scaleX * dato.caja[2] * MIL;
                var y1 = t.y + t.scaleY * dato.caja[1] * MIL;
                var y0 = t.y + t.scaleY * dato.caja[3] * MIL;
                if (x1 - x0 < MINIMO_VISIBLE && y1 - y0 < MINIMO_VISIBLE) { return null; }
                if (x1 < 0 || y1 < 0 || x0 > api.getWidth() || y0 > api.getHeight()) {
                  return null;
                }
              }
              return { type: "path", x: t.x, y: t.y, scaleX: t.scaleX, scaleY: t.scaleY,
                       style: estilo, shape: { d: dato.d } };
            };
          }(datos)),
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
/* Las capas prendidas de este cuadro, para quien las necesite afuera: la consulta
   departamental de RF25 muestra los valores de las capas ACTIVAS, y cuales estan activas lo
   decide el visitante con el control, no el build. */
export function capasPrendidas(nodo, catalogo) {
  if (!catalogo || !catalogo.capas) { return []; }
  return prendidas(nodo, catalogo);
}

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
  /* Con una capa de AREA prendida, los limites y los nombres de los departamentos se vuelven a
     dibujar ENCIMA (ver `divisionDepartamental`), y se le apagan al geo para no tenerlos dos
     veces: los de abajo quedarian como un fantasma corrido debajo de los de arriba. */
  var conArea = listasYa.some(function (id) {
    return catalogo.capas[id].geometria === "poligonos";
  });
  var encima = conArea ? divisionDepartamental(opciones) : [];
  var opcionesGeo = opciones;
  if (encima.length > 1 && opciones.departamentos) {
    opcionesGeo = Object.assign({}, opciones, {
      departamentos: Object.assign({}, opciones.departamentos, { label: { show: false } })
    });
  }
  return { geo: geo(proyeccion, opcionesGeo),
           series: series(catalogo, listasYa, opciones).concat(encima) };
}
