/* Pivotal - tipo `serie`. Barras, barras apiladas, apiladas al 100%, barras + linea y lineas.
   Las marcas del eje vertical (minimo 5, regla de JC) las calcula el build, no el navegador. */
export default function iniciar(PIVOTAL) {

  function ejeY(eje, posicion) {
    return {
      type: "value",
      position: posicion,
      name: eje.nombre,
      nameLocation: "end",
      nameGap: 12,
      nameTextStyle: { align: posicion === "right" ? "right" : "left", color: "#5f6368" },
      min: eje.min,
      max: eje.max,
      interval: eje.paso,
      axisLabel: { formatter: function (v) { return PIVOTAL.etiquetaEje(eje, v); } },
      splitLine: { lineStyle: { color: "#e6e6e6" } }
    };
  }

  function resumen(nodo, filas) {
    nodo.innerHTML = "";
    if (!filas || !filas.length) { nodo.style.display = "none"; return; }
    nodo.style.display = "";
    filas.forEach(function (fila) {
      var caja = document.createElement("div");
      var etiqueta = document.createElement("span");
      etiqueta.className = "etiqueta";
      etiqueta.textContent = fila.etiqueta;
      var valor = document.createElement("span");
      valor.className = "valor";
      valor.textContent = fila.valor;
      caja.appendChild(etiqueta);
      caja.appendChild(valor);
      nodo.appendChild(caja);
    });
  }

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      var caja = cajas[i];
      /* Elemento tabla (clase "tabla" en el build): la tabla por campaña de la vista
         departamental. Mismo dibujante que el tipo `lista`. */
      if (elemento.columnas) {
        PIVOTAL.tabla(caja.querySelector("[data-tabla]"), elemento.columnas, elemento.filas);
        return;
      }
      resumen(caja.querySelector("[data-resumen]"), elemento.resumen);
      var chart = PIVOTAL.grafico(caja.querySelector("[data-grafico]"));
      var ejes = [ejeY(elemento.eje, "left")];
      if (elemento.eje2) { ejes.push(ejeY(elemento.eje2, "right")); }

      var series = elemento.series.map(function (s) {
        return {
          name: s.nombre,
          type: s.tipo,
          yAxisIndex: s.eje || 0,
          stack: s.apilado ? "total" : null,
          data: s.v,
          itemStyle: { color: s.color },
          lineStyle: { color: s.color, width: 2, type: s.punteada ? "dashed" : "solid" },
          symbol: s.tipo === "line" ? "circle" : "none",
          symbolSize: 5,
          barMaxWidth: 46,
          connectNulls: false
        };
      });

      chart.setOption({
        animation: false,
        grid: { left: 70, right: elemento.eje2 ? 70 : 24, top: 34, bottom: 60 },
        legend: elemento.series.length > 1
          ? { bottom: 0, type: "scroll", textStyle: { fontSize: 11 } } : { show: false },
        tooltip: {
          trigger: "axis",
          confine: true,
          formatter: function (params) {
            var lineas = ["<b>" + params[0].axisValue + "</b>"];
            params.forEach(function (p) {
              var s = elemento.series[p.seriesIndex];
              if (s.v[p.dataIndex] === null) { return; }
              var extra = s.extra && s.extra[p.dataIndex] ? " (" + s.extra[p.dataIndex] + ")" : "";
              lineas.push(p.marker + s.nombre + ": <b>" + s.t[p.dataIndex] + "</b>" + extra);
            });
            return lineas.join("<br>");
          }
        },
        xAxis: {
          type: "category",
          data: elemento.x,
          axisLabel: { interval: 0, rotate: elemento.x.length > 12 ? 45 : 0, fontSize: 11 },
          axisTick: { alignWithLabel: true }
        },
        yAxis: ejes,
        series: series
      }, true);
    });
  });
}
