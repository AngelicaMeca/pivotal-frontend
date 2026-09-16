/* Pivotal - tipo `flujo-od`. Matriz origen x destino con intensidad de color.
   Los colores, los cortes de la escala y todos los numeros ya vienen resueltos del build:
   aca solo se arma el DOM. */
export default function iniciar(PIVOTAL) {

  function vaciar(nodo) { while (nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }

  function dibujarLeyenda(nodo, leyenda) {
    vaciar(nodo);
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

  function celdaTexto(tag, texto, clases) {
    var td = document.createElement(tag);
    td.textContent = texto;
    if (clases) { td.className = clases; }
    return td;
  }

  function dibujarMatriz(nodo, el) {
    vaciar(nodo);

    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    tr.appendChild(celdaTexto("th", el.esquina, "primera-col esquina"));
    el.columnas.forEach(function (nombre) {
      tr.appendChild(celdaTexto("th", nombre, "num vertical"));
    });
    tr.appendChild(celdaTexto("th", "Total", "num"));
    thead.appendChild(tr);
    nodo.appendChild(thead);

    var tbody = document.createElement("tbody");
    el.filas.forEach(function (fila) {
      var tr = document.createElement("tr");
      tr.appendChild(celdaTexto("td", fila.n, "primera-col"));
      fila.celdas.forEach(function (celda) {
        if (celda === null) {
          tr.appendChild(celdaTexto("td", el.vacia, "num sd"));
          return;
        }
        var td = celdaTexto("td", celda.t, "num" + (celda.claro ? " sobre-oscuro" : "")
                                            + (celda.diag ? " diagonal" : ""));
        td.style.background = celda.c;
        td.title = celda.d;
        tr.appendChild(td);
      });
      tr.appendChild(celdaTexto("td", fila.total, "num total-fila"));
      tbody.appendChild(tr);
    });
    nodo.appendChild(tbody);

    var tfoot = document.createElement("tfoot");
    var trTot = document.createElement("tr");
    trTot.className = "fila-total";
    trTot.appendChild(celdaTexto("td", el.totales.n, "primera-col"));
    el.totales.celdas.forEach(function (texto) {
      trTot.appendChild(celdaTexto("td", texto, "num"));
    });
    trTot.appendChild(celdaTexto("td", el.totales.total, "num"));
    tfoot.appendChild(trTot);
    nodo.appendChild(tfoot);
  }

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      var caja = cajas[i];
      dibujarMatriz(caja.querySelector("[data-tabla]"), elemento);
      dibujarLeyenda(caja.querySelector("[data-leyenda]"), elemento.leyenda);
    });
  });
}
