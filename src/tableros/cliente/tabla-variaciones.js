/* Pivotal - tipo `tabla-variaciones`. Tabla ancha con la primera columna fija.
   Mismo dibujante que `lista`; se mantiene un archivo por template para que agregar un tipo
   nuevo sea copiar uno de estos y cambiarle el cuerpo. */
export default function iniciar(PIVOTAL) {

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      PIVOTAL.tabla(cajas[i].querySelector("[data-tabla]"), elemento.columnas, elemento.filas);
    });
  });
}
