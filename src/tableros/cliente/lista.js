/* Pivotal - tipo `lista`. Tabla de detalle, sin grafico.
   La unidad va en el encabezado de cada columna: la tabla mezcla ha, tn, kg/ha y %. */
export default function iniciar(PIVOTAL) {

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      PIVOTAL.tabla(cajas[i].querySelector("[data-tabla]"), elemento.columnas, elemento.filas);
    });
  });
}
