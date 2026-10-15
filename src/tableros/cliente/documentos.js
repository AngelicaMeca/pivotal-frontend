/* Pivotal - tipo `documentos`. Una lista de documentos con link, en grilla.

   Es la hoja "ClimAGM" de la maqueta de clima de JC: los informes de INTA AgroMet de los ultimos
   6 meses, cada uno "con LINK AL PDF", en una grilla de cuatro columnas del mas nuevo al mas
   viejo, y a la izquierda la tapa del ultimo ejemplar. Sirve para cualquier otro listado de
   informes: que lista, cuantas columnas y que tapa lo dice el spec.

   No dibuja graficos ni compone texto: rotulos, links y textos accesibles vienen del build.
   Cada link abre el documento en una pestaña nueva (el PDF lo sirve el propio sitio). */
export default function iniciar(PIVOTAL) {

  /* Un link a un documento. `rel="noopener"` porque abre en otra pestaña. */
  function enlace(documento, clase) {
    var a = document.createElement("a");
    a.className = clase;
    a.href = documento.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", documento.accesible);
    return a;
  }

  function item(documento) {
    var li = document.createElement("li");
    var a = enlace(documento, "documento");
    var rotulo = document.createElement("span");
    rotulo.className = "documento-rotulo";
    rotulo.textContent = documento.rotulo;
    a.appendChild(rotulo);
    if (documento.formato) {
      var formato = document.createElement("span");
      formato.className = "documento-formato";
      formato.setAttribute("aria-hidden", "true");
      formato.textContent = documento.formato;
      a.appendChild(formato);
    }
    li.appendChild(a);
    return li;
  }

  /* La tapa: la imagen con su rotulo debajo, y toda la figura es el link a ESE ejemplar. La
     caja de la imagen se reserva antes de que baje (ancho y alto del archivo). */
  function pintarPortada(caja, portada) {
    var lugar = caja.querySelector("[data-documentos-portada]");
    if (!lugar) { return; }
    PIVOTAL.vaciar(lugar);
    lugar.hidden = !portada;
    if (!portada) { return; }
    var a = enlace(portada, "documentos-tapa");
    var img = document.createElement("img");
    img.src = portada.imagen;
    img.alt = portada.alt;
    img.width = portada.ancho;
    img.height = portada.alto;
    img.style.aspectRatio = portada.ancho + " / " + portada.alto;
    img.decoding = "async";
    var pie = document.createElement("span");
    pie.className = "documentos-tapa-rotulo";
    pie.textContent = portada.rotulo;
    a.appendChild(img);
    a.appendChild(pie);
    lugar.appendChild(a);
  }

  PIVOTAL.init(function (combo, cajas) {
    combo.elementos.forEach(function (elemento, i) {
      var lista = cajas[i].querySelector("[data-documentos]");
      if (!lista) { return; }
      PIVOTAL.vaciar(lista);
      pintarPortada(cajas[i], elemento.portada);
      /* Cuantos por fila lo dice el spec (JC dibuja cuatro): viaja como variable CSS. */
      lista.style.setProperty("--por-fila", elemento.por_fila);
      elemento.documentos.forEach(function (documento) {
        lista.appendChild(item(documento));
      });
    });
  });
}
