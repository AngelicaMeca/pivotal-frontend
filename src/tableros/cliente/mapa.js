/* Pivotal - tipo `mapa`. Coropleta por departamento + ranking vinculado.
   Los colores, los cortes de la escala y todos los textos vienen calculados del build. */

import * as echarts from "echarts";

export default function iniciar(PIVOTAL) {

  var geoListo = null;

  function cargarGeo(ruta) {
    if (!geoListo) {
      geoListo = fetch(ruta).then(function (r) { return r.json(); }).then(function (geo) {
        echarts.registerMap("provincia", geo);
        return true;
      });
    }
    return geoListo;
  }

  function dibujarLeyenda(nodo, leyenda) {
    nodo.innerHTML = "";
    var titulo = document.createElement("p");
    titulo.className = "leyenda-encabezado";
    titulo.textContent = leyenda.encabezado;
    nodo.appendChild(titulo);
    var lista = document.createElement("ul");
    leyenda.clases.forEach(function (clase) {
      var li = document.createElement("li");
      var muestra = document.createElement("span");
      muestra.className = "muestra";
      muestra.style.background = clase.color;
      li.appendChild(muestra);
      var texto = document.createElement("span");
      texto.textContent = clase.texto;
      li.appendChild(texto);
      var conteo = document.createElement("span");
      conteo.className = "conteo";
      conteo.textContent = clase.conteo;
      li.appendChild(conteo);
      lista.appendChild(li);
    });
    nodo.appendChild(lista);
  }

  /* Lo unico interactivo que se agrega sobre lo que declara el spec, y esta pedido: el mapa y
     el ranking se resaltan entre si. El clic abre la ficha del departamento (JC f16). */
  function vincular(chart, tbody, ficha) {
    var filas = Array.prototype.slice.call(tbody.querySelectorAll("tr[data-geo]"));
    function resaltarFila(geo) {
      filas.forEach(function (fila) {
        fila.classList.toggle("resaltada", fila.dataset.geo === geo);
      });
    }
    function abrir(geo) { if (ficha && geo) { window.location.href = ficha + geo; } }

    chart.off("mouseover");
    chart.off("mouseout");
    chart.off("click");
    chart.on("mouseover", function (p) { resaltarFila(p.name); });
    chart.on("mouseout", function () { resaltarFila(null); });
    chart.on("click", function (p) { abrir(p.name); });
    filas.forEach(function (fila) {
      fila.style.cursor = "pointer";
      fila.addEventListener("mouseenter", function () {
        fila.classList.add("resaltada");
        chart.dispatchAction({ type: "highlight", seriesIndex: 0, name: fila.dataset.geo });
      });
      fila.addEventListener("mouseleave", function () {
        fila.classList.remove("resaltada");
        chart.dispatchAction({ type: "downplay", seriesIndex: 0, name: fila.dataset.geo });
      });
      fila.addEventListener("click", function () { abrir(fila.dataset.geo); });
    });
  }

  PIVOTAL.init(function (combo, cajas) {
    var mapa = combo.elementos[0];
    var tabla = combo.elementos[1];
    var cajaMapa = cajas[0];
    var cajaTabla = cajas[1];

    var porId = {};
    mapa.deptos.forEach(function (d) { porId[d.id] = d; });

    dibujarLeyenda(cajaMapa.querySelector("[data-leyenda]"), mapa.leyenda);
    cajaMapa.querySelector("[data-total]").textContent = mapa.total;

    var tbody = PIVOTAL.tabla(cajaTabla.querySelector("[data-tabla]"), tabla.columnas, tabla.filas);

    cargarGeo(mapa.geojson).then(function () {
      var chart = PIVOTAL.grafico(cajaMapa.querySelector("[data-grafico]"));
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: "item",
          confine: true,
          formatter: function (p) {
            var d = porId[p.name];
            if (!d) { return ""; }
            var filas = d.tooltip.map(function (par) {
              return par[0] + ": <b>" + par[1] + "</b>";
            }).join("<br>");
            return "<b>" + d.nombre + "</b><br>" + filas;
          }
        },
        series: [{
          type: "map",
          map: "provincia",
          nameProperty: "geo_id",
          /* Misma proporcion geografica que el mapa del tablero: la manda el build (coseno de
             la latitud media). Sin esto quedaba el default de ECharts, que ensancha. */
          aspectScale: mapa.aspecto || 0.75,
          /* Lo mas grande que entre en la caja, sin deformar (ver tablero.js); el 96% deja
             aire para los nombres de los departamentos del borde. */
          layoutCenter: ["50%", "50%"],
          layoutSize: PIVOTAL.tamanioMapa(cajaMapa.querySelector("[data-grafico]"), mapa.relacion),
          roam: false,
          selectedMode: false,
          label: {
            show: true, fontSize: 9, color: PIVOTAL.color("--texto"),
            formatter: function (p) { return porId[p.name] ? porId[p.name].nombre : ""; }
          },
          labelLayout: { hideOverlap: true },
          itemStyle: { borderColor: PIVOTAL.color("--fondo-cuadro"), borderWidth: 0.8 },
          data: mapa.deptos.map(function (d) {
            return {
              name: d.id,
              value: d.v,
              itemStyle: { areaColor: d.color, borderColor: d.borde || PIVOTAL.color("--fondo-cuadro") },
              emphasis: { itemStyle: { areaColor: d.color, borderColor: PIVOTAL.color("--texto"),
                                       borderWidth: 1.6 } }
            };
          })
        }]
      }, true);
      chart.getZr().setCursorStyle("pointer");
      vincular(chart, tbody, mapa.ficha);
    });
  });
}
