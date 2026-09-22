/* Pivotal - tipo `torta`. Distribucion porcentual de una campaña.
   Lineas guia hacia afuera: las porciones chicas no se pueden rotular adentro (pedido de JC). */
export default function iniciar(PIVOTAL) {

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      var caja = cajas[i];
      caja.querySelector("[data-total]").textContent = elemento.total || "";
      var nodo = caja.querySelector("[data-grafico]");
      var chart = PIVOTAL.grafico(nodo);

      if (elemento.vacio) {
        chart.clear();
        chart.setOption({
          animation: false,
          title: {
            text: elemento.leyenda_vacia, left: "center", top: "middle",
            textStyle: { fontSize: 13, fontWeight: "normal", color: PIVOTAL.color("--texto-apoyo") }
          }
        }, true);
        return;
      }

      chart.setOption({
        animation: false,
        tooltip: {
          trigger: "item",
          confine: true,
          formatter: function (p) {
            var porcion = elemento.porciones[p.dataIndex];
            return "<b>" + porcion.n + "</b><br>" + porcion.t + "<br>" + porcion.pct;
          }
        },
        legend: { bottom: 0, type: "scroll", textStyle: { fontSize: 11 } },
        series: [{
          type: "pie",
          /* `grafico: anillo` en el spec = doughnut (como lo dibuja JC en su mockup);
             sin declarar, torta llena. */
          radius: elemento.grafico === "anillo" ? ["42%", "68%"] : ["0%", "62%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          minShowLabelAngle: 0,
          label: {
            show: true, alignTo: "labelLine", fontSize: 11,
            formatter: function (p) { return p.name + "\n" + elemento.porciones[p.dataIndex].pct; }
          },
          labelLine: { show: true, length: 12, length2: 10 },
          data: elemento.porciones.map(function (porcion) {
            return { name: porcion.n, value: porcion.v, itemStyle: { color: porcion.color } };
          })
        }]
      }, true);
    });
  });
}
