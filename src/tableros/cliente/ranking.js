/* Pivotal - tipo `ranking`. Barras horizontales de mayor a menor + la tabla completa.
   El puesto, el porcentaje y el redondeo de pantalla vienen resueltos del build. */
export default function iniciar(PIVOTAL) {

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      var caja = cajas[i];
      PIVOTAL.tabla(caja.querySelector("[data-tabla]"), elemento.columnas, elemento.filas);

      var nodo = caja.querySelector("[data-grafico]");
      nodo.style.height = Math.max(260, 26 * elemento.barras.length + 70) + "px";
      var chart = PIVOTAL.grafico(nodo);
      chart.resize();
      chart.setOption({
        animation: false,
        grid: { left: 150, right: 90, top: 26, bottom: 44 },
        tooltip: {
          trigger: "item",
          confine: true,
          formatter: function (p) {
            var barra = elemento.barras[p.dataIndex];
            return "<b>" + barra.n + "</b><br>" + barra.t + (barra.extra ? "<br>" + barra.extra : "");
          }
        },
        xAxis: {
          type: "value",
          name: elemento.eje.nombre,
          nameLocation: "end",
          nameTextStyle: { color: "#5f6368" },
          min: elemento.eje.min,
          max: elemento.eje.max,
          interval: elemento.eje.paso,
          axisLabel: {
            fontSize: 11,
            formatter: function (v) { return PIVOTAL.etiquetaEje(elemento.eje, v); }
          },
          splitLine: { lineStyle: { color: "#e6e6e6" } }
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: elemento.barras.map(function (b) { return b.n; }),
          axisLabel: { fontSize: 11 },
          axisTick: { show: false }
        },
        series: [{
          type: "bar",
          data: elemento.barras.map(function (b) { return b.v; }),
          itemStyle: { color: elemento.color },
          barMaxWidth: 18,
          label: {
            show: true, position: "right", fontSize: 11, color: "#5f6368",
            formatter: function (p) { return elemento.barras[p.dataIndex].t; }
          }
        }]
      }, true);
    });
  });
}
