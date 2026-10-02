/* Pivotal - el tablero: los indicadores (si los hay) y los paneles compactos, en una pantalla.

   Un dibujante por FORMA de panel (anillo, mapa, tendencia, top, tabla-datos, combo,
   apiladas). Las formas son las mismas en todas las bases: el spec del tablero dice que panel
   usa cual y con que datos, y aca solo se dibuja. Todos los textos y todos los colores vienen
   resueltos del build; este archivo no formatea un solo numero.

   Una forma se sale del molde y esta al final del archivo: `precios`, el cuadro de precios del
   MCBA de la maqueta "Agri 2". No se dibuja desde la combinacion del tablero porque sus
   filtros son suyos (grupo, especie, cuatro dimensiones de producto, modo y rango) y baja su
   propio JSON, partido por especie y por modo. */

import * as echarts from "echarts";

export default function iniciar(PIVOTAL) {

  var contenedor = document.getElementById("tablero");
  var geoListo = null;

  function texto(nodo, selector, valor) {
    var destino = nodo.querySelector(selector);
    if (destino) { destino.textContent = valor || ""; }
  }

  /* -------- alto: el tablero entra en UNA pantalla, salvo que el spec diga que fluye --------
     El tablero nacio para entrar sin scrollear: JC pidio un tablero y no un informe, asi que
     los cuatro paneles tenian que verse juntos. El alto no se puede escribir en el CSS porque
     lo que hay ARRIBA del tablero cambia de pagina en pagina (el titulo puede irse a dos
     lineas y los chips de filtro pueden envolver), asi que se mide una sola vez, ya pintados
     los indicadores, y se le fija al contenedor lo que sobra de la ventana; el CSS reparte ese
     alto entre las filas (.alto-fijo).

     El 30-sep-2026 JC dio marcha atras para AGRICULTURA: forzar la pantalla le dejaba 100-150
     px de dibujo a cada cuadro ("dos lineas chatas", el anillo "en miniatura") y pidio que la
     pagina siga hacia abajo. Eso NO es un `if` suelto: lo declara el spec del tablero
     (`paneles.alto: fluye`, site_build.ALTOS_DE_TABLERO) y llega hasta aca como la clase
     `alto-fluido`. Con esa clase puesta este bloque entero no hace nada y manda el CSS, que le
     da a cada cuadro el alto de la maqueta de JC.

     Por debajo de ALTO_MINIMO tampoco se fuerza nada y la pagina scrollea como cualquier otra:
     en una ventana muy baja un tablero aplastado se lee peor que uno que no entra. */
  var ALTO_MINIMO = 500;   /* px de tablero por debajo de los cuales conviene dejar scrollear */
  var AIRE_ABAJO = 16;     /* respiro entre el ultimo panel y el borde de la ventana */
  var ANGOSTO = window.matchMedia("(max-width: 1000px)");   /* el mismo corte que el CSS */

  function ajustarAlto() {
    /* Mientras se imprime manda la HOJA y no la ventana: comun.js ya dejo el tablero con el
       reparto de alto que corresponde y es la hoja la que le da la altura. Sin esta guarda,
       el repintado que hace falta antes de sacar las fotos le borraba ese reparto y en una
       ventana angosta los paneles se montaban sobre el pie. */
    if (document.documentElement.classList.contains("imprimiendo")) { return; }
    /* Tablero que fluye (lo dice su spec): el alto lo pone el contenido y la pagina scrollea.
       Va DESPUES de la guarda de impresion a proposito: en la hoja A4 el tablero se sigue
       repartiendo el alto con `alto-fijo`, que se la pone comun.js. */
    if (contenedor.classList.contains("alto-fluido")) { return; }
    contenedor.classList.remove("alto-fijo");
    contenedor.style.removeProperty("height");
    if (ANGOSTO.matches) { return; }   /* en angosto los paneles se apilan y el alto lo pone el contenido */
    var arriba = contenedor.getBoundingClientRect().top + window.pageYOffset;
    var disponible = window.innerHeight - arriba - AIRE_ABAJO;
    if (disponible < ALTO_MINIMO) { return; }
    contenedor.style.height = disponible + "px";
    contenedor.classList.add("alto-fijo");
  }

  /* Se engancha aca y no en comun.js a proposito: este listener queda registrado ANTES que el
     que redimensiona los graficos (comun.js lo agrega recien cuando resuelve el fetch), asi el
     alto ya esta corregido cuando ECharts vuelve a medir su contenedor. */
  window.addEventListener("resize", ajustarAlto);

  function cargarGeo(ruta) {
    if (!geoListo) {
      geoListo = fetch(ruta).then(function (r) { return r.json(); }).then(function (geo) {
        echarts.registerMap("provincia", geo);
        return true;
      });
    }
    return geoListo;
  }

  /* -------- tarjeta de contexto (que se esta viendo: icono + cultivo + campaña) -------- */
  function pintarContexto(contexto) {
    var nombre = document.querySelector("[data-contexto-nombre]");
    var detalle = document.querySelector("[data-contexto-detalle]");
    var icono = document.querySelector("[data-contexto-icono]");
    if (!nombre) { return; }
    nombre.textContent = (contexto && contexto.nombre) || "";
    if (detalle) { detalle.textContent = (contexto && contexto.detalle) || ""; }
    /* El icono del cultivo en color (site/iconos-cultivo.yaml). "Todos" no tiene icono y la
       tarjeta lo esconde en vez de mostrar una imagen rota. */
    if (icono) {
      if (contexto && contexto.icono) {
        icono.src = contexto.icono;
        icono.hidden = false;
      } else {
        icono.hidden = true;
        icono.removeAttribute("src");
      }
    }
  }

  /* -------- indicadores -------- */
  function pintarKpis(kpis) {
    var cajas = Array.prototype.slice.call(document.querySelectorAll("[data-kpi]"));
    cajas.forEach(function (caja, i) {
      var kpi = kpis[i];
      if (!kpi) { caja.style.visibility = "hidden"; return; }
      caja.style.visibility = "";
      texto(caja, "[data-etiqueta]", kpi.etiqueta);
      texto(caja, "[data-valor]", kpi.valor);
      texto(caja, "[data-unidad]", kpi.unidad);
      var destino = caja.querySelector("[data-variacion]");
      PIVOTAL.vaciar(destino);
      if (!kpi.var) { return; }
      var cambio = document.createElement("b");
      cambio.className = kpi.var.clase;
      cambio.textContent = kpi.var.texto;
      destino.appendChild(cambio);
      destino.appendChild(document.createTextNode(" " + kpi.var.contra));
    });
  }

  /* -------- anillo -------- */
  function pintarAnillo(nodo, panel) {
    /* El centro se dibuja solo si el JSON trae `centro` (hacienda, stock). En cultivos el
       anillo va SIN cifra central (cuarta tanda, anillo_sin_cifra_central: "queda muy chico
       por el numero en el medio") y el total llega en `total_linea`, al pie del cuadro. */
    var centro = nodo.querySelector(".anillo-centro");
    if (centro) { centro.hidden = !panel.centro; }
    texto(nodo, "[data-centro]", panel.centro);
    texto(nodo, "[data-centro-unidad]", panel.centro_unidad);
    texto(nodo, "[data-centro-nota]", panel.centro_nota);
    texto(nodo, "[data-total-anillo]", panel.total_linea);

    var leyenda = nodo.querySelector("[data-leyenda]");
    PIVOTAL.vaciar(leyenda);
    panel.porciones.forEach(function (porcion) {
      var li = document.createElement("li");
      var muestra = document.createElement("span");
      muestra.className = "muestra";
      muestra.style.background = porcion.color;
      var nombre = document.createElement("span");
      nombre.className = "nombre";
      nombre.textContent = porcion.n;
      nombre.title = porcion.n + " · " + porcion.t;
      var pct = document.createElement("span");
      pct.className = "pct";
      pct.textContent = porcion.pct;
      li.appendChild(muestra);
      li.appendChild(nombre);
      li.appendChild(pct);
      leyenda.appendChild(li);
    });

    /* Dos disposiciones del mismo panel:
       - tablero con selector grande (cultivos, captura del 10-ago): el donut GRANDE con
         nombre y porcentaje afuera de cada porcion, sin leyenda en lista (el CSS la esconde);
       - tablero sin selector (hacienda, stock): donut compacto y la leyenda en HTML abajo,
         que es donde entran los nombres sin apretar el grafico. */
    var etiquetasAfuera = contenedor.classList.contains("con-selector");
    var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
    chart.setOption({
      animation: false,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: function (p) {
          var porcion = panel.porciones[p.dataIndex];
          return "<b>" + porcion.n + "</b><br>" + porcion.t + "<br>" + porcion.pct;
        }
      },
      series: [{
        type: "pie",
        /* Anillo y no torta. Con total al centro (hacienda, stock), el agujero es donde va
           ese numero. Sin cifra central (cultivos, cuarta tanda) el donut usa el espacio del
           panel: mas radio, dejando el margen justo para las etiquetas de afuera. */
        radius: etiquetasAfuera
          ? (panel.centro ? ["46%", "72%"] : ["48%", "76%"])
          : ["58%", "88%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: etiquetasAfuera ? {
          show: true,
          formatter: function (p) {
            return panel.porciones[p.dataIndex].n + "\n" + panel.porciones[p.dataIndex].pct;
          },
          fontSize: 10,
          lineHeight: 12,
          color: PIVOTAL.color("--texto")
        } : { show: false },
        labelLine: etiquetasAfuera
          ? { show: true, length: 6, length2: 6,
             lineStyle: { color: PIVOTAL.color("--texto-apoyo") } }
          : { show: false },
        itemStyle: { borderColor: PIVOTAL.color("--fondo-cuadro"), borderWidth: 2 },
        data: panel.porciones.map(function (porcion) {
          return { name: porcion.n, value: porcion.v, itemStyle: { color: porcion.color } };
        })
      }]
    }, true);
  }

  /* -------- mapa -------- */
  function pintarMapa(nodo, panel) {
    texto(nodo, "[data-total]", panel.total);
    /* Con un departamento elegido el mapa deja de invitar a elegir y pasa a invitar a CAMBIAR,
       y gana el titulo "Departamento ALBERDI" arriba: los dos textos son los de la hoja
       "Agri 1 Dto" de la maqueta. Sin departamento queda exactamente como estaba. */
    var elegidoNombre = PIVOTAL.nombreDepartamento();
    texto(nodo, "[data-accion]",
          elegidoNombre && panel.accion_con_departamento
            ? panel.accion_con_departamento : panel.accion);
    /* La escala: una muestra por clase con su tramo debajo, de la mas oscura a la mas clara,
       y la unidad una sola vez al pie (maqueta de JC, hoja "Agri 1"). Los tramos vienen
       escritos del build (cinco rangos contiguos y redondeados); aca solo se dibujan. */
    var escala = nodo.querySelector("[data-escala]");
    PIVOTAL.vaciar(escala);
    panel.escala.tramos.forEach(function (tramo) {
      var item = document.createElement("span");
      item.className = "escala-tramo";
      var muestra = document.createElement("span");
      muestra.className = "escala-muestra";
      muestra.style.background = tramo.color;
      var rotulo = document.createElement("span");
      rotulo.className = "escala-rotulo";
      rotulo.textContent = tramo.texto;
      item.appendChild(muestra);
      item.appendChild(rotulo);
      escala.appendChild(item);
    });
    texto(nodo, "[data-escala-unidad]", panel.escala.unidad);

    /* "Tiene dato" es que el build le haya puesto un valor: los departamentos sin dato
       llegan con `v` nulo y se pintan con el gris `sin_dato` de la escala. */
    function conDato(d) { return !!d && d.v !== null && d.v !== undefined; }

    /* El color del NOMBRE sobre cada departamento: de los DOS colores del theme (el texto
       oscuro y la crema del panel) se queda con el que MAS CONTRASTA con el relleno de ese
       departamento. Un solo color de texto no sirve porque las rampas van del tono mas oscuro
       al casi blanco.

       Por que contraste de verdad y no un umbral de luminancia: con el umbral alcanzaba
       mientras las tres rampas eran verdes, pero al volver a la rampa OCRE de JC para
       produccion el paso mas oscuro (#bf8f00) quedaba del lado "oscuro" del umbral y se
       escribia en crema, que sobre ese dorado da 2,8:1. El texto oscuro sobre el mismo dorado
       da 5,6:1. La cuenta de abajo es la de WCAG (luminancia relativa con el canal
       linealizado) y elige sola, sea cual sea la rampa. */
    function luminanciaRelativa(n) {
      var canal = function (v) {
        v = v / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * canal((n >> 16) & 255)
           + 0.7152 * canal((n >> 8) & 255)
           + 0.0722 * canal(n & 255);
    }

    function contraste(a, b) {
      var claro = Math.max(a, b), oscuro = Math.min(a, b);
      return (claro + 0.05) / (oscuro + 0.05);
    }

    /* Acerca un color al fondo del panel. 0 = sin tocar, 1 = el fondo. Lo usa el
       atenuado de los departamentos NO elegidos. */
    function haciaElFondo(color, cuanto) {
      var n = hexANumero(color), f = hexANumero(PIVOTAL.color("--fondo-cuadro"));
      if (n === null || f === null) { return color; }
      var mezcla = function (desp) {
        var a = (n >> desp) & 255, b = (f >> desp) & 255;
        return Math.round(a + (b - a) * cuanto);
      };
      var hx = function (v) { return (v < 16 ? "0" : "") + v.toString(16); };
      return "#" + hx(mezcla(16)) + hx(mezcla(8)) + hx(mezcla(0));
    }

    function hexANumero(color) {
      var m = /^#?([0-9a-fA-F]{6})$/.exec(color || "");
      return m ? parseInt(m[1], 16) : null;
    }

    function tintaSobre(fondo) {
      var n = hexANumero(fondo);
      var texto = PIVOTAL.color("--texto");
      if (n === null) { return texto; }
      var crema = PIVOTAL.color("--fondo-cuadro");
      var lFondo = luminanciaRelativa(n);
      var lTexto = hexANumero(texto), lCrema = hexANumero(crema);
      if (lTexto === null || lCrema === null) { return texto; }
      return contraste(lFondo, luminanciaRelativa(lTexto))
           >= contraste(lFondo, luminanciaRelativa(lCrema)) ? texto : crema;
    }

    /* Cuanto aire se le deja a un rotulo contra el canto del canvas. */
    var AIRE_ROTULO = 2;

    /* Los nombres se dibujan si el spec los pide Y si la caja da para leerlos. Los dos pisos
       salen de probarlo: con menos ALTO (ganaderia, que entra en una pantalla) o con menos
       ANCHO (la celda del mapa en la hoja A4, que mide 280 px) los nombres se amontonan
       -"AVELLANEDA" pegado a "GENERAL TABOADA"- y el mapa se lee PEOR con nombres que sin
       ellos. El ancho pesa mas que el alto porque los nombres son largos y horizontales.
       Debajo del piso el nombre sigue estando en el tooltip y en el ranking de al lado, que
       es como estuvo siempre. */
    var MINIMO_PARA_ROTULAR = { ancho: 300, alto: 340 };

    function rotularDepartamentos(caja) {
      if (!panel.rotulos) { return false; }
      var r = caja.getBoundingClientRect();
      return r.width >= MINIMO_PARA_ROTULAR.ancho && r.height >= MINIMO_PARA_ROTULAR.alto;
    }

    var porId = {};
    panel.deptos.forEach(function (d) { porId[d.id] = d; });

    cargarGeo(panel.geojson).then(function () {
      var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
      /* "Seleccione departamento" (mockup de JC): el clic abre la ficha del departamento,
         conservando la seleccion vigente (persistencia_de_filtros). off() antes de on():
         el panel se repinta en cada cambio de filtro y los handlers no se apilan. */
      chart.off("click");
      chart.off("mouseover");
      if (panel.ficha || panel.selecciona) {
        /* La mano aparece SOLO donde el clic hace algo. Antes era un `setCursorStyle`
           unico al iniciar, que prometia un link tambien en los departamentos grises.
           Va por hover y no como `cursor` de cada dato: la serie `map` de ECharts ignora
           el cursor por item (probado: quedaban todos iguales). */
        chart.on("mouseover", function (p) {
          chart.getZr().setCursorStyle(conDato(porId[p.name]) ? "pointer" : "default");
        });
        chart.on("click", function (p) {
          if (!p.name) { return; }
          /* Un departamento SIN dato para la seleccion vigente no se puede elegir (regla de
             JC, hoja "Agri 1 Dto": "SOLO DEBERAN ESTAR ACTIVOS LOS LINKS PARA CASOS DONDE
             EXISTAN DATOS"). El gris del mapa ya dice que no hay dato; aca se respeta. */
          if (!conDato(porId[p.name])) { return; }
          if (panel.selecciona) {
            /* El clic NO navega: cambia los datos de ESTE tablero (Francisco, 30-sep-2026).
               Volver a clickear el que ya esta elegido vuelve a la provincia, que es la otra
               forma de deshacer ademas del tramo "Provincia" de la miga. */
            var actual = PIVOTAL.departamento();
            PIVOTAL.elegirDepartamento(p.name === actual ? "" : p.name, true);
            return;
          }
          var extra = PIVOTAL.parametros();
          window.location.href = panel.ficha + encodeURIComponent(p.name)
            + (extra ? "&" + extra : "");
        });
      }
      var rotulos = rotularDepartamentos(nodo.querySelector("[data-grafico]"));
      function rotuloDepartamento(p) {
        var d = porId[p.name];
        return d ? d.nombre : "";
      }
      chart.setOption({
        animation: false,
        tooltip: {
          trigger: "item",
          confine: true,
          /* Nombre del departamento + sus datos para la seleccion vigente, resueltos por el
             build (cuarta tanda, tooltips_con_nombre_y_datos: la lectura rapida es por hover
             y NUNCA se muestra un codigo interno). `filas` trae la secuencia fija de la base;
             sin `filas` (otros tableros) queda el valor de la medida elegida, como antes. */
          formatter: function (p) {
            var d = porId[p.name];
            if (!d) { return ""; }
            if (d.filas) {
              return "<b>" + d.nombre + "</b><br>" + d.filas.map(function (par) {
                return par[0] + ": <b>" + par[1] + "</b>";
              }).join("<br>");
            }
            return "<b>" + d.nombre + "</b><br>" + d.t + " " + panel.unidad;
          }
        },
        series: [{
          type: "map",
          map: "provincia",
          nameProperty: "geo_id",
          /* El NOMBRE del departamento sobre el mapa (pedido de Francisco, 1-oct-2026).
             El `formatter` no es opcional: `name` aca es el geo_id (ver `nameProperty`), asi
             que sin el ECharts dibujaria el CODIGO sobre el mapa, que es exactamente el bug
             que marco Facu en el mouseover. En el mapa nunca se dibuja un codigo interno.
             OJO: la maqueta de JC dibuja el mapa SIN nombres (hoja "Agri 1"); esto es un
             desvio pedido por Francisco y anotado en el backlog para que JC lo valide. */
          label: {
            show: rotulos,
            formatter: rotuloDepartamento,
            /* El nombre no tiene que competir con el dato: va chico y sin negrita. */
            fontSize: 8,
            fontWeight: "normal"
          },
          /* Dos cosas sobre los rotulos, resueltas en el mismo lugar porque ECharts solo
             acepta UN labelLayout:
               1. `hideOverlap`: los que no entran NO se dibujan encimados, se esconden. Sin
                  esto, en el racimo de departamentos chicos del centro-oeste (Silipica, San
                  Martin, Sarmiento, Robles) los nombres se montaban unos sobre otros y no se
                  leia ninguno. El que queda sin rotulo sigue teniendo su nombre en el tooltip
                  y en el ranking de al lado.
               2. el corrimiento de los del BORDE: el rotulo se dibuja centrado en el
                  departamento y se escapa de su contorno, asi que los del oeste (RIO HONDO,
                  GUASAYAN) salian cortados contra el canto del canvas. Se los empuja hacia
                  adentro lo justo para que entren. Es preferible a achicar el mapa, que es lo
                  primero que probamos: JC ya reclamo una vez que "el mapa es una miniatura". */
          labelLayout: function (info) {
            var caja = nodo.querySelector("[data-grafico]");
            var ancho = caja ? caja.clientWidth : 0;
            var r = info.labelRect;
            var dx = 0;
            if (!ancho || !r) { return { hideOverlap: true }; }
            if (r.x < AIRE_ROTULO) { dx = AIRE_ROTULO - r.x; }
            else if (r.x + r.width > ancho - AIRE_ROTULO) {
              dx = ancho - AIRE_ROTULO - (r.x + r.width);
            }
            return { dx: dx, hideOverlap: true };
          },
          /* Al pasar el mouse el rotulo se mantiene (antes se escondia para que ECharts no
             dibujara el geo_id; con el `formatter` puesto ya no hace falta esconderlo, y
             esconderlo ahora haria parpadear el nombre al pasar por encima). */
          emphasis: { label: { show: rotulos, formatter: rotuloDepartamento } },
          /* Proporcion geografica CORRECTA (JC: "El mapa es una miniatura y está deformado";
             tercera_tanda.mapa_grande): el build manda `aspecto` = coseno de la latitud media
             de la provincia, calculado del propio GeoJSON. Sin el dato queda el default de
             ECharts, que es lo que ya mostraban las otras secciones. */
          aspectScale: panel.aspecto || 0.75,
          /* El mapa se dibuja lo mas grande que entre en el panel, SIN deformarse (JC: "El
             mapa es una miniatura y está deformado"). Con left/right/top/bottom ECharts estira
             el dibujo hasta los bordes; con layoutCenter + layoutSize lo agranda conservando
             la proporcion geografica y centrado. */
          layoutCenter: ["50%", "50%"],
          layoutSize: PIVOTAL.tamanioMapa(nodo.querySelector("[data-grafico]"), panel.relacion),
          roam: false,
          selectedMode: false,
          itemStyle: { borderColor: PIVOTAL.color("--fondo-cuadro"), borderWidth: 0.7 },
          data: panel.deptos.map(function (d) {
            /* El departamento elegido va MARCADO, como lo dibuja JC en su hoja "Agri 1 Dto"
               (ahi ALBERDI esta pintado distinto del resto). No se le cambia el color de
               relleno -ese lo manda la escala y cambiarlo mentiria sobre su valor-: se lo
               rodea con un borde grueso del color del texto. */
            var elegido = d.id === PIVOTAL.departamento();
            /* Como se muestra el departamento ELEGIDO (Francisco, 1-oct-2026: el contorno
               grueso con halo "queda muy feo", hacerlo de otra forma):

               NO se remarca el elegido, se ATENUAN LOS DEMAS. El elegido se queda con su
               color real -el que le da la escala- y el resto del mapa se acerca al fondo del
               panel. La diferencia se ve de un golpe, no hay ningun adorno encima del dibujo
               y el relleno del elegido sigue diciendo la verdad sobre su valor, que es lo que
               no se podia tocar. Mientras hay un departamento elegido el mapa esta haciendo de
               SELECTOR ("Seleccione otro departamento si desea visualizar", JC), asi que que
               los demas pierdan fuerza es lo que corresponde.

               El elegido NO lleva contorno propio. Se probo y no se puede: en un mapa los
               bordes son COMPARTIDOS, cada poligono dibuja el suyo y el que se dibuja despues
               pinta encima. Un borde distinto en un solo departamento sobrevive nada mas que
               en los tramos donde le toco dibujarse ultimo, asi que sale un contorno partido
               -medio oscuro y medio crema- que se lee como un error de dibujo. Todos los
               bordes quedan iguales; lo que distingue al elegido es el color. */
            var hayElegido = !!PIVOTAL.departamento();
            var relleno = (hayElegido && !elegido) ? haciaElFondo(d.color, 0.62) : d.color;
            /* La tinta se calcula sobre el relleno EFECTIVO: si el departamento esta atenuado,
               el nombre tiene que contrastar con el tono atenuado, no con el original. */
            var tinta = tintaSobre(relleno);
            /* Con un departamento elegido, el UNICO que conserva su nombre es ese
               (Francisco, 2-oct-2026: "que solo se seleccione de color en el mapa, y los
               otros dejan de tener nombre"). Es lo que vuelve inconfundible la seleccion: el
               mapa queda con un solo nombre escrito. Hace falta ademas del color porque el
               color solo no alcanza en todos los casos: si el elegido cae en el quintil mas
               claro, su relleno real y el de los vecinos atenuados son casi el mismo tono y la
               seleccion se pierde (probado con LORETO). El rotulo sirve justamente porque se
               dibuja POR ENCIMA de todos los poligonos, asi que no depende del orden de
               dibujado, que es lo que hacia fracasar al contorno.
               Sin departamento elegido no cambia nada: se rotulan todos, como siempre. */
            return {
              name: d.id,
              value: d.v,
              label: (hayElegido && !elegido) ? { show: false } : { color: tinta },
              itemStyle: { areaColor: relleno },
              /* UN solo `emphasis` por item: el relieve del borde y la tinta del rotulo van
                 juntos. Dos claves `emphasis` en el mismo objeto se pisan en silencio. */
              /* Al pasar el mouse por uno sin rotulo NO se le enciende el nombre: el dato
                 ya esta en el tooltip y encender nombres sueltos al pasar por encima vuelve a
                 ensuciar el mapa, que es justo lo que se quiso sacar. */
              emphasis: {
                label: (hayElegido && !elegido) ? { show: false } : { color: tinta },
                itemStyle: { areaColor: relleno, borderColor: PIVOTAL.color("--texto"),
                             borderWidth: 1.4 }
              }
            };
          })
        }]
      }, true);
    });
  }

  /* ================= cruzar datos: las dos series del zoom (Francisco, 24-sep-2026) =========
     La comparacion se prende ADENTRO DEL ZOOM y solo en los cuadros de serie temporal, que son
     los unicos donde una segunda serie se lee sin mentir (en el mapa, el anillo y el ranking
     no: un mapa no admite dos cultivos encima). Que cuadro la ofrece lo dice el spec.

     Reglas de JC que condicionan lo de abajo, y donde se cumplen:
       1. las dos series NUNCA se combinan en un numero: se dibujan uno al lado de la otra y
          no se suma ni se promedia nada. Aca no hay una sola cuenta: los puntos y los textos
          llegan resueltos del build, de dos combinaciones distintas del mismo payload.
       2. cobertura despareja (la papa, que solo trae septiembre a diciembre): los puntos sin
          dato son null y no se dibujan (`connectNulls: false`), y ademas la nota del cuadro
          se queda con las notas de las DOS series, que es donde el build escribe el recorte.
       3. unidades: si las dos medidas comparten unidad va un solo eje; si no, el build manda
          la segunda escala (`medidas_extra[].eje2`) y se dibuja un eje a la derecha CON su
          unidad rotulada. Nunca dos escalas sobre el mismo eje.
       4. colores: los manda el protocolo. La serie comparada usa un paso de la MISMA rampa
          (lo resuelve el build en `color_comp`) y va punteada, asi se distingue tambien
          impresa en escala de grises. No hay ninguna paleta nueva.
       5. la leyenda dice que es cada serie sin ambiguedad ("Soja · Producción"), con la
          plantilla que viene del spec. */

  function medidaExtra(panel, id) {
    var lista = (panel && panel.medidas_extra) || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) { return lista[i]; }
    }
    return null;
  }

  /* De dos escalas, la que CONTIENE a la otra. Las dos las armo el build con la misma regla y
     las dos incluyen el cero (protocolo, `marcas_eje`), asi que la de mayor tope contiene a la
     otra y sus etiquetas ya vienen escritas. Aca no se formatea ningun numero: se ELIGE una de
     las dos que mando el build, igual que el cuadro de precios elige entre sus escalas
     candidatas. El ultimo caso no se da con medidas no negativas -que son todas las que hay
     publicadas- y queda como red de seguridad. */
  function ejeQueContiene(a, b) {
    if (!a) { return b || null; }
    if (!b) { return a; }
    if (b.min <= a.min && b.max >= a.max) { return b; }
    if (a.min <= b.min && a.max >= b.max) { return a; }
    return (b.max - b.min) > (a.max - a.min) ? b : a;
  }

  /* Las lineas de UN panel de tendencia: las suyas mas, si se pidio, la de la segunda medida.
     `sujeto` es la etiqueta del valor que representa ese panel ("Soja", "2024"); con
     comparacion prendida cada linea se rotula con el, que es lo unico que hace que la leyenda
     no sea ambigua. `comparada` marca las del segundo valor: color de comparacion y punteado. */
  function lineasDeTendencia(panel, comp, sujeto, comparada) {
    var propias = panel.series || [{
      /* Los cuadros de una sola medida (hacienda, stock) no rotulan su linea: sin comparacion
         no hay leyenda que llenar y el tooltip quedaria repitiendo el nombre de la medida. */
      nombre: comp ? (panel.medida_nombre || "") : "",
      color: panel.color, color_comp: panel.color_comp, eje: 0,
      puntos: panel.puntos, textos: panel.textos
    }];
    var lineas = propias.slice();
    var extra = comp && comp.medida ? medidaExtra(panel, comp.medida) : null;
    if (extra) {
      lineas.push({ nombre: extra.nombre, color: extra.color, color_comp: extra.color_comp,
                    eje: extra.eje2 ? 1 : 0, puntos: extra.puntos, textos: extra.textos });
    }
    return lineas.map(function (linea) {
      return {
        nombre: comp
          ? comp.serie.replace("{valor}", sujeto).replace("{medida}", linea.nombre)
          : linea.nombre,
        color: comparada ? (linea.color_comp || linea.color) : linea.color,
        comparada: comparada,
        eje: linea.eje || 0,
        puntos: linea.puntos,
        textos: linea.textos
      };
    });
  }

  /* El panel del segundo valor, o null. Puede no haber: el build arma un panel `vacio` cuando
     esa combinacion no tiene datos, y en ese caso no se dibuja ninguna segunda serie ni se
     toca el titulo (un titulo que promete una comparacion que no esta seria peor que nada). */
  function panelComparado(comp) {
    return comp && comp.panel && !comp.panel.vacio ? comp.panel : null;
  }

  /* Los textos del cuadro cuando hay comparacion. El titulo tiene que decir que hay dos cosas
     dibujadas (regla 5 de JC) y la nota se queda con las de las DOS series, que es donde el
     build escribe la cobertura de cada una (regla 2: la papa). Las plantillas vienen del
     spec; aca se sustituyen slots y no se escribe una sola palabra. */
  function textosComparados(nodo, panel, comp, otro) {
    if (!comp) { return; }
    var titulo = panel.titulo || "";
    if (otro) {
      titulo = comp.titulo.replace("{titulo}", titulo).replace("{otro}", comp.otro);
    }
    if (comp.medida) {
      titulo = comp.tituloMedida.replace("{titulo}", titulo)
                                .replace("{medida}", comp.medidaEtiqueta);
    }
    texto(nodo, "[data-titulo]", titulo);
    if (!otro) { return; }
    /* La nota del otro solo si DICE algo distinto: en un cuadro donde la nota explica el eje
       ("* Eje en millones...") las dos son la misma frase y repetirla se lee como un error.
       Donde importa -la cobertura de la papa- son distintas y entran las dos. */
    var otraNota = otro.nota && otro.nota !== panel.nota ? otro.nota : "";
    texto(nodo, "[data-nota]", comp.nota.replace("{nota}", panel.nota || "")
                                        .replace("{otra}", otraNota).trim());
    /* Con dos valores explicitos encima, la serie de referencia del cuadro (el periodo
       anterior, gris punteado) se apaga: era el sustituto de una comparacion que ahora esta
       pedida y rotulada. El subtitulo que la nombraba lo reemplaza el build. */
    if (panel.subtitulo_comparado !== undefined) {
      texto(nodo, "[data-subtitulo]", panel.subtitulo_comparado);
    }
  }

  /* -------- tendencia --------
     Una linea (panel.puntos, forma original) o varias (panel.series, cada una con su eje:
     el mockup de JC dibuja cosecha y produccion juntas y son unidades distintas, asi que la
     segunda serie va sobre un eje secundario que el build calcula con la misma cantidad de
     intervalos que el primero). */
  function pintarTendencia(nodo, panel) {
    var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
    var comp = PIVOTAL.comparacion(nodo.dataset.panel);
    var otro = panelComparado(comp);
    textosComparados(nodo, panel, comp, otro);
    var series = [];
    /* Serie de referencia opcional (el periodo anterior). Va primero y en gris punteado: es
       contexto para leer la principal, no un dato que compita con ella. `silent` la deja fuera
       del hover para que el tooltip siempre hable del periodo elegido.
       Con una comparacion explicita encima se apaga: dos punteados distintos sobre el mismo
       cuadro no se distinguen, y el segundo valor elegido ya hace su trabajo. */
    if (panel.referencia && !otro) {
      series.push({
        type: "line",
        data: panel.referencia.puntos,
        smooth: false,
        connectNulls: false,
        symbol: "none",
        silent: true,
        z: 1,
        lineStyle: { color: PIVOTAL.color("--borde"), width: 1.5, type: "dashed" },
        itemStyle: { color: PIVOTAL.color("--borde") }
      });
    }

    var lineas = lineasDeTendencia(panel, comp, comp ? comp.sujeto : "", false);
    if (otro) {
      lineas = lineas.concat(lineasDeTendencia(otro, comp, comp.otro, true));
    }
    var varias = lineas.length > 1;
    lineas.forEach(function (linea) {
      series.push({
        name: linea.nombre || undefined,
        type: "line",
        yAxisIndex: linea.eje || 0,
        data: linea.puntos,
        smooth: false,
        connectNulls: false,
        symbol: "circle",
        symbolSize: 4,
        z: 2,
        /* La serie comparada va PUNTEADA ademas de con su color: es lo que la deja distinguir
           en la hoja impresa, que JC lee en blanco y negro. */
        /* 3 y no 2: Francisco pidio lineas mas gruesas para que llamen la atencion. */
        lineStyle: { color: linea.color, width: 3,
                     type: linea.comparada ? "dashed" : "solid" },
        itemStyle: { color: linea.color },
        /* El area rellena solo con una serie: con dos, taparia a la otra. */
        areaStyle: varias ? undefined : { color: linea.color, opacity: 0.12 },
        /* El periodo elegido en la barra verde se marca sobre la serie: sin esto, la tendencia
           es el unico panel que no reacciona al selector y parece colgado. No aplica cuando el
           panel entero YA es el periodo elegido (la serie mensual de hacienda). */
        markPoint: (panel.actual === null || panel.actual === undefined
                    || linea.puntos[panel.actual] === null) ? undefined : {
          symbol: "circle",
          symbolSize: 9,
          label: { show: false },
          itemStyle: { color: linea.color, borderColor: PIVOTAL.color("--fondo-cuadro"), borderWidth: 2 },
          data: [{ coord: [panel.actual, linea.puntos[panel.actual]] }]
        }
      });
    });

    /* Eje vertical SIEMPRE rotulado: rotulo de escala ("Millones") y marcas con sus
       etiquetas, como lo dibuja JC en el mockup (tercera tanda: "no está el eje vertical y
       tampoco la escala"). Los textos de las marcas vienen resueltos del build (etiquetas por
       valor); aca no se formatea ningun numero. */
    /* Escala legible (cuarta tanda, escala_legible): el build manda el paso fino que dibujo
       JC (0,50 de referencia) y aca solo se cuida que las etiquetas no se pisen cuando el
       panel quedo bajo, escribiendo una marca de por medio (las lineas de grilla siguen en el
       paso fino, que es lo que deja leer las variaciones). El piso de etiquetas a la vista lo
       manda el protocolo y viaja en el eje (`eje.minimo`, regla de JC del minimo de 5 valores
       en el eje vertical): lo calcula PIVOTAL.saltoDeEje. `getHeight()` se relee en cada
       render, asi que al agrandar la ventana vuelven todas las etiquetas. */
    /* La escala del cuadro. Con la segunda medida prendida la manda el build (la calcula
       sobre las dos series juntas cuando comparten unidad, o manda una segunda escala para el
       eje derecho cuando no); con un segundo valor encima se elige, entre las dos escalas que
       mando el build, la que contiene a la otra. */
    var extra = comp && comp.medida ? medidaExtra(panel, comp.medida) : null;
    var extraOtro = otro && comp.medida ? medidaExtra(otro, comp.medida) : null;
    var eje = ejeQueContiene((extra && extra.eje) || panel.eje,
                             otro ? ((extraOtro && extraOtro.eje) || otro.eje) : null);
    var ejeDerecho = ejeQueContiene((extra && extra.eje2) || panel.eje2,
                                    otro ? ((extraOtro && extraOtro.eje2) || otro.eje2) : null);

    function etiquetaLegible(v) {
      /* El area de dibujo es el alto del canvas menos el cromo de arriba (leyenda + nombre
         del eje) y las campañas rotadas de abajo: ~70px que no son plot. */
      var salto = PIVOTAL.saltoDeEje(eje, chart.getHeight() - 70, 13);
      if (salto > 1) {
        var indice = Math.round((v - eje.min) / eje.paso);
        if (indice % salto !== 0) { return ""; }
      }
      return PIVOTAL.etiquetaEje(eje, v);
    }

    /* TODO cuadro con eje de valores lleva su escala rotulada: un eje sin etiquetas son CERO
       valores a la vista y la regla de JC pide un minimo de cinco. Hasta el 28-sep los
       cuadros compactos del tablero salian mudos salvo que el spec pidiera `eje_visible`;
       desde el 29-sep el build lo fuerza (site_build.forzar_eje_visible) y esto queda como
       red de seguridad para cualquier cuadro que traiga eje. */
    var conEscala = true;
    var ejes = [{
      type: "value",
      min: eje.min,
      max: eje.max,
      interval: eje.paso,
      name: conEscala ? eje.nombre : undefined,
      nameLocation: "end",
      nameGap: 8,
      nameTextStyle: { fontSize: 10, color: PIVOTAL.color("--texto-apoyo"), align: "left" },
      axisLabel: conEscala
        ? { show: true, fontSize: 10, color: PIVOTAL.color("--texto-apoyo"),
            formatter: etiquetaLegible }
        : { show: false },
      splitLine: { lineStyle: { color: PIVOTAL.color("--fondo-apoyo") } }
    }];
    /* Eje derecho: solo aparece con una segunda medida de OTRA unidad, y va con su unidad
       rotulada (regla 3 de JC: nunca dos escalas sobre el mismo eje). Es el mismo eje derecho
       del cuadro combinado, con el mismo dibujante. */
    if (ejeDerecho) { ejes.push(ejeDeValores(ejeDerecho, "right")); }

    chart.setOption({
      animation: false,
      /* Lugar para la leyenda arriba: con mas de dos series (una comparacion sobre un cuadro
         que ya traia dos medidas) envuelve a dos renglones y sin este aire se monta sobre la
         primera marca del eje. */
      grid: { left: 4, right: 8,
              top: (varias ? (lineas.length > 2 ? 40 : 26) : 12) + (conEscala ? 12 : 0),
              bottom: 4, containLabel: true },
      legend: varias
        ? { top: 0, left: 0, itemWidth: 14, itemHeight: 8,
            textStyle: { fontSize: 10, color: PIVOTAL.color("--texto-apoyo") } }
        : { show: false },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: function (params) {
          var i = params[0].dataIndex;
          var html = "<b>" + panel.etiquetas[i] + "</b>";
          lineas.forEach(function (linea) {
            html += "<br>" + (linea.nombre ? linea.nombre + ": " : "") + linea.textos[i];
          });
          if (panel.referencia && !otro) {
            html += "<br><span style=\"color:var(--texto-apoyo)\">" + panel.referencia.nombre + ": " +
                    panel.referencia.textos[i] + "</span>";
          }
          return html;
        }
      },
      xAxis: {
        type: "category",
        data: panel.x,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: PIVOTAL.color("--borde") } },
        /* `x_completo` (cultivos, mockup literal): se rotulan TODAS las campañas, rotadas a
           45 grados como en el dibujo de JC (protocolo, eje_horizontal: nunca se ocultan
           etiquetas). En los otros tableros queda el salteo compacto de siempre.
           Esta decision iba colgada de `eje_visible` hasta el 29-sep, cuando el eje de
           valores paso a estar SIEMPRE rotulado y dejo de servir para distinguir un tablero
           del otro: por eso ahora es una bandera propia. */
        axisLabel: panel.x_completo
          ? { fontSize: 9, color: PIVOTAL.color("--texto-apoyo"), interval: 0, rotate: 45 }
          : { fontSize: 10, color: PIVOTAL.color("--texto-apoyo"), interval: 1 }
      },
      yAxis: ejes,
      series: series
    }, true);
  }

  /* -------- tabla de datos (mockup Modelo 2, tercera tanda) --------
     Los numeros crudos bajo el grafico de evolucion, en DOS bloques de campañas lado a lado,
     como los dibuja JC en su Modelo 2 (deroga la "una sola serie" de la segunda tanda;
     backlog 38). Cada bloque trae sus columnas y sus filas resueltas del build. La fila del
     periodo elegido queda marcada. */
  /* Clase de una celda segun su columna. `num` alinea a la derecha; `elegida` marca la columna
     del periodo elegido en las tablas que tienen un año por columna (maqueta "Agri 2"): es el
     mismo destacado que en el eje de los graficos, para que el selector no quede mudo. */
  function claseDeColumna(columna) {
    if (!columna) { return ""; }
    var clases = [];
    if (columna.num) { clases.push("num"); }
    if (columna.destacada) { clases.push("elegida"); }
    return clases.join(" ");
  }

  function armarTablaCampanias(columnas, filas) {
    var tabla = document.createElement("table");
    var thead = document.createElement("thead");
    var trCabeza = document.createElement("tr");
    columnas.forEach(function (columna) {
      var th = document.createElement("th");
      th.textContent = columna.etiqueta;
      th.className = claseDeColumna(columna);
      trCabeza.appendChild(th);
    });
    thead.appendChild(trCabeza);
    tabla.appendChild(thead);
    var tbody = document.createElement("tbody");
    filas.forEach(function (fila) {
      var tr = document.createElement("tr");
      if (fila.actual) { tr.className = "actual"; }
      var celdas = fila.campania !== undefined
        ? [fila.campania].concat(fila.celdas) : fila.celdas;
      celdas.forEach(function (celda, i) {
        var td = document.createElement("td");
        td.textContent = celda;
        td.className = claseDeColumna(columnas[i]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    return tabla;
  }

  /* La tabla de datos de un panel. Tres formas, todas resueltas por el build:
       - `bloques`: dos bloques de campañas lado a lado (mockup Modelo 2, cultivos);
       - `tabla`:   un bloque con las categorias del grafico como columnas (maqueta "Agri 2");
       - `columnas` + `filas`: el caso plano de siempre.
     El nodo puede no existir: un panel sin `[data-tabla-datos]` simplemente no la dibuja. */
  function pintarTablaDatos(nodo, panel, propios) {
    var caja = nodo.querySelector("[data-tabla-datos]");
    if (!caja) { return; }
    PIVOTAL.vaciar(caja);
    var bloques = propios || panel.bloques
      || (panel.tabla ? [panel.tabla] : [{ columnas: panel.columnas, filas: panel.filas }]);
    bloques.forEach(function (bloque) {
      caja.appendChild(armarTablaCampanias(bloque.columnas, bloque.filas));
    });
  }

  /* -------- top N --------
     Dos formas, decide el JSON del build:
       - `columnas` + `filas`: TABLA calcada del mockup de JC (cultivos, tercera tanda:
         Puesto | Departamento | Superficie Semb. (ha) | % sobre Total prov.);
       - `barras`: lista de barras con puesto y participacion (hacienda, stock). */
  function pintarTop(nodo, panel) {
    var lista = nodo.querySelector("[data-barras]");
    PIVOTAL.vaciar(lista);
    if (panel.columnas) {
      /* El ranking sigue siendo PROVINCIAL (regla de JC: los datos del ranking no cambian con
         el departamento), pero marca la fila del departamento elegido, como lo dibuja el en su
         hoja "Agri 1 Dto". Las filas se copian en vez de tocarse: el panel viene del payload y
         se reusa en cada repintado. */
      var elegido = PIVOTAL.departamento();
      var filas = panel.filas.map(function (fila) {
        if (!elegido || fila.geo !== elegido) { return fila; }
        return { geo: fila.geo, celdas: fila.celdas, actual: true };
      });
      lista.appendChild(armarTablaCampanias(panel.columnas, filas));
      return;
    }
    panel.barras.forEach(function (barra) {
      var li = document.createElement("li");
      if (barra.puesto) {
        var puesto = document.createElement("span");
        puesto.className = "lb-puesto";
        puesto.textContent = barra.puesto;
        li.appendChild(puesto);
      }
      var nombre = document.createElement("span");
      nombre.className = "lb-nombre";
      nombre.textContent = barra.n;
      var fila = document.createElement("div");
      fila.className = "lb-fila";
      var riel = document.createElement("span");
      riel.className = "lb-riel";
      var relleno = document.createElement("span");
      relleno.className = "lb-barra";
      relleno.style.width = barra.pct + "%";
      riel.appendChild(relleno);
      var valor = document.createElement("span");
      valor.className = "lb-valor";
      valor.textContent = barra.t;
      fila.appendChild(riel);
      fila.appendChild(valor);
      if (panel.con_participacion && barra.participacion) {
        var participacion = document.createElement("span");
        participacion.className = "lb-part";
        participacion.textContent = barra.participacion;
        fila.appendChild(participacion);
      }
      li.appendChild(nombre);
      li.appendChild(fila);
      li.title = barra.n + " · " + barra.participacion + " del total";
      lista.appendChild(li);
    });
  }

  /* -------- eje horizontal de las formas por categoria (combo y apiladas) --------
     El periodo elegido en la tira de la cabecera se DESTACA (panel.destacado): los dos cuadros
     de la maqueta "Agri 2" muestran la ventana entera de años a proposito -su sujeto es la
     comparacion entre años- y sin esta marca el selector de periodo quedaria mudo sobre ellos.
     Se marca la etiqueta, no la barra: pintar una barra distinta seria cambiarle el color a un
     dato, y el color lo manda el protocolo. */
  function ejeDeCategorias(panel) {
    return {
      type: "category",
      data: panel.x,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: PIVOTAL.color("--borde") } },
      /* El destacado va por texto enriquecido y no por callbacks de estilo: en ECharts el
         unico estilo de `axisLabel` que acepta una funcion es el color, asi que una funcion
         en `fontWeight` se ignora en silencio y el año elegido quedaba igual que los demas. */
      axisLabel: {
        interval: 0,
        fontSize: 10,
        color: PIVOTAL.color("--texto-apoyo"),
        formatter: function (valor, i) {
          return i === panel.destacado ? "{elegido|" + valor + "}" : valor;
        },
        rich: {
          elegido: { fontSize: 10, fontWeight: "bold", color: PIVOTAL.color("--texto") }
        }
      }
    };
  }

  /* Eje vertical de valores, con las etiquetas ya resueltas por el build. `lado` decide de que
     costado se dibuja: el combo lleva dos, uno por unidad. */
  function ejeDeValores(eje, lado) {
    return {
      type: "value",
      position: lado,
      min: eje.min,
      max: eje.max,
      interval: eje.paso,
      name: eje.nombre,
      nameLocation: "end",
      nameGap: 8,
      nameTextStyle: {
        fontSize: 10, color: PIVOTAL.color("--texto-apoyo"),
        align: lado === "right" ? "right" : "left"
      },
      axisLabel: {
        show: true, fontSize: 10, color: PIVOTAL.color("--texto-apoyo"),
        formatter: function (v) { return PIVOTAL.etiquetaEje(eje, v); }
      },
      /* Una sola grilla de fondo, la del eje izquierdo: dos juegos de lineas sobre el mismo
         dibujo se cruzan entre si y no dejan leer ninguno de los dos. */
      splitLine: lado === "right"
        ? { show: false }
        : { lineStyle: { color: PIVOTAL.color("--fondo-apoyo") } }
    };
  }

  /* -------- combo: barras + linea, dos ejes --------
     El primer cuadro de la maqueta "Agri 2" (JC lo dibuja con barras `clustered` de bultos y
     una linea de toneladas sobre un eje secundario). Las dos series miden la misma carga en
     unidades distintas: por eso dos ejes y no uno. */
  /* El nombre de una serie del combo: el suyo, o el rotulado con su sujeto cuando hay dos
     productos encima ("Cebolla · Bolsas" contra "Papa · Bultos"). La plantilla viene del spec. */
  function nombreDeSerie(comp, sujeto, nombre) {
    return comp ? comp.serie.replace("{valor}", sujeto).replace("{medida}", nombre) : nombre;
  }

  /* Las dos series de un panel combinado (barras de conteo + linea de volumen), listas para
     ECharts. `comparada` las pinta con el color de comparacion de su misma rampa y, la linea,
     punteada. */
  function seriesDelCombo(panel, comp, sujeto, comparada) {
    var colorBarras = comparada ? (panel.barras.color_comp || panel.barras.color)
                                : panel.barras.color;
    var colorLinea = comparada ? (panel.linea.color_comp || panel.linea.color)
                               : panel.linea.color;
    return [
      {
        name: nombreDeSerie(comp, sujeto, panel.barras.nombre),
        type: "bar",
        yAxisIndex: 0,
        data: panel.barras.puntos,
        barMaxWidth: 34,
        itemStyle: { color: colorBarras }
      },
      {
        name: nombreDeSerie(comp, sujeto, panel.linea.nombre),
        type: "line",
        yAxisIndex: 1,
        data: panel.linea.puntos,
        smooth: false,
        connectNulls: false,
        symbol: "circle",
        symbolSize: 5,
        z: 3,
        /* Mismo grosor que las demas series del sitio (ver `pintarCombo`). */
        lineStyle: { color: colorLinea, width: 3, type: comparada ? "dashed" : "solid" },
        itemStyle: { color: colorLinea }
      }
    ];
  }

  function filaDeTooltip(panel, comp, sujeto, i) {
    return "<br>" + nombreDeSerie(comp, sujeto, panel.barras.nombre) + ": "
         + panel.barras.textos[i]
         + "<br>" + nombreDeSerie(comp, sujeto, panel.linea.nombre) + ": "
         + panel.linea.textos[i];
  }

  function pintarCombo(nodo, panel) {
    var comp = PIVOTAL.comparacion(nodo.dataset.panel);
    var otro = panelComparado(comp);
    textosComparados(nodo, panel, comp, otro);
    /* La tabla de datos que JC pega debajo del grafico (maqueta "Agri 2"): las dos series
       como filas y los mismos años como columnas. Comparando van las dos tablas, una debajo
       de la otra, cada una con sus filas rotuladas con su producto (`tabla_comp`): dos
       bloques con los mismos rotulos no se podrian distinguir. */
    pintarTablaDatos(nodo, panel, otro ? [panel.tabla_comp, otro.tabla_comp] : null);
    var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
    var series = seriesDelCombo(panel, comp, comp ? comp.sujeto : "", false);
    if (otro) { series = series.concat(seriesDelCombo(otro, comp, comp.otro, true)); }
    chart.setOption({
      animation: false,
      /* `top` deja lugar para la leyenda MAS el nombre del eje, que ECharts dibuja encima de
         la primera marca: con menos, "Bolsas" se montaba sobre el 2.500.000. Comparando, la
         leyenda son cuatro entradas y se va a dos renglones. */
      grid: { left: 4, right: 4, top: otro ? 54 : 40, bottom: 4, containLabel: true },
      legend: {
        top: 0, left: 0, itemWidth: 14, itemHeight: 8,
        textStyle: { fontSize: 10, color: PIVOTAL.color("--texto-apoyo") }
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: function (params) {
          var i = params[0].dataIndex;
          var html = "<b>" + panel.etiquetas[i] + "</b>"
            + filaDeTooltip(panel, comp, comp ? comp.sujeto : "", i);
          if (otro) { html += filaDeTooltip(otro, comp, comp.otro, i); }
          return html;
        }
      },
      xAxis: ejeDeCategorias(panel),
      /* Una escala por unidad, la que contiene a las dos series de esa unidad. Nunca se
         mezclan bultos y toneladas en un mismo eje (regla 3 de JC). */
      yAxis: [
        ejeDeValores(ejeQueContiene(panel.eje, otro ? otro.eje : null), "left"),
        ejeDeValores(ejeQueContiene(panel.eje2, otro ? otro.eje2 : null), "right")
      ],
      series: series
    }, true);
  }

  /* -------- apiladas: una serie por categoria, el total es el alto de la pila --------
     El segundo cuadro de la maqueta. La leyenda va ABAJO, como en el grafico de JC. El tooltip
     muestra todas las series del año mas el total de la pila, que es el numero que el ojo lee
     en el alto de la barra y que si no estaria en ningun lado. */
  function pintarApiladas(nodo, panel) {
    /* Igual que el combo: la tabla de datos de JC va debajo, un departamento por fila y un
       año por columna. */
    pintarTablaDatos(nodo, panel);
    /* La leyenda, en HTML y debajo del grafico (JC la dibuja abajo). Misma forma que la del
       anillo: cuadradito de color + nombre. En HTML su alto lo reparte flexbox y no se monta
       nunca sobre las etiquetas del eje. */
    var leyenda = nodo.querySelector("[data-leyenda]");
    PIVOTAL.vaciar(leyenda);
    panel.series.forEach(function (serie) {
      var li = document.createElement("li");
      var muestra = document.createElement("span");
      muestra.className = "muestra";
      muestra.style.background = serie.color;
      var nombre = document.createElement("span");
      nombre.className = "nombre";
      nombre.textContent = serie.nombre;
      li.appendChild(muestra);
      li.appendChild(nombre);
      leyenda.appendChild(li);
    });

    var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
    chart.setOption({
      animation: false,
      /* `top` deja lugar al nombre del eje, que ECharts dibuja sobre la primera marca. Sin
         leyenda de ECharts, abajo solo van las etiquetas del eje. */
      grid: { left: 4, right: 8, top: 24, bottom: 4, containLabel: true },
      legend: { show: false },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: function (params) {
          var i = params[0].dataIndex;
          var html = "<b>" + panel.etiquetas[i] + "</b>";
          panel.series.forEach(function (serie) {
            html += "<br>" + serie.nombre + ": " + serie.textos[i];
          });
          html += "<br><b>Total: " + panel.totales[i] + "</b>";
          return html;
        }
      },
      xAxis: ejeDeCategorias(panel),
      yAxis: [ejeDeValores(panel.eje, "left")],
      series: panel.series.map(function (serie) {
        return {
          name: serie.nombre,
          type: "bar",
          stack: "total",
          data: serie.puntos,
          barMaxWidth: 46,
          itemStyle: { color: serie.color }
        };
      })
    }, true);
  }

  var DIBUJANTES = {
    anillo: pintarAnillo,
    mapa: pintarMapa,
    tendencia: pintarTendencia,
    "tabla-datos": pintarTablaDatos,
    "tabla-superficie": pintarTablaDatos,
    combo: pintarCombo,
    apiladas: pintarApiladas,
    top: pintarTop
  };

  /* Un panel sin datos dice por que no los tiene y se apaga entero: no se deja un grafico
     vacio ni un pie de fuente citando una fuente que no informo nada.
     Se apaga con una clase, NO vaciando el cuerpo: el filtro siguiente puede volver a tener
     datos y el panel tiene que poder encenderse de nuevo con su markup intacto. */
  function apagar(nodo, motivo) {
    nodo.classList.add("sin-datos");
    texto(nodo, "[data-vacio]", motivo);
    /* El TITULO tambien se borra, no solo el subtitulo. Si no, el cuadro queda con el titulo
       del producto anterior ("Cebolla - ...") encima del cartel que explica que no hay datos
       del que se acaba de pedir: dice una cosa y muestra otra. Es la misma regla que ya
       aplican `pintarVista` con el resumen y `apagarPrecios` con su propio titulo. */
    texto(nodo, "[data-titulo]", "");
    texto(nodo, "[data-subtitulo]", "");
  }

  function encender(nodo) {
    nodo.classList.remove("sin-datos");
  }

  function pintarKpisNota(nota) {
    var nodo = document.querySelector("[data-kpis-nota]");
    if (nodo) { nodo.textContent = nota || ""; }
  }

  /* ================= precios del MCBA: el panel con filtros propios =================
     Es el cuarto cuadro de la maqueta "Agri 2" de JC (chart8), alimentado por la base 8. Se
     dibuja aparte del resto del tablero porque sus filtros son SUYOS -grupo, especie, cuatro
     dimensiones de producto, modo y rango- y no entran en la combinacion del tablero.

     Este bloque no compone un solo texto ni formatea un solo numero: los titulos, las notas,
     los rotulos de cada punto, los de cada marca del eje y los de cada escala vienen resueltos
     del build. Lo unico que decide aca es CUALES se muestran: que opciones ofrece cada
     desplegable (las que existen), que tramo se dibuja (el rango) y cada cuantas marcas se
     escribe un mes (segun el ancho que tenga el cuadro en la pantalla). */

  var DIMENSIONES_PRECIO = ["variedad", "envase", "calidad", "tamanio"];
  var TODAS = "*";            /* el valor de la opcion "Todas" (site_build.TODAS) */
  var ANCHO_POR_MARCA = 34;   /* px que necesita una etiqueta de mes para no pisar a la otra */

  function iniciarPrecios() {
    var panel = document.querySelector("[data-precios]");
    if (!panel) { return; }

    var cache = {};
    var estadoPrecios = {
      grupo: null, especie: null, modo: null, datos: null,
      dims: {}, inicio: null, fin: null
    };

    function botones(selector) {
      return Array.prototype.slice.call(panel.querySelectorAll(selector));
    }

    function selectDe(atributo, valor) {
      return panel.querySelector("[" + atributo + '="' + valor + '"]');
    }

    /* Las opciones que EXISTEN para una dimension, dado lo ya elegido en las otras tres. Es la
       regla que evita las pantallas vacias: con seis dimensiones independientes, la mayoria de
       las combinaciones posibles no tiene ni una fila. */
    function valoresPosibles(indice) {
      var vistos = [];
      estadoPrecios.datos.combos.forEach(function (combo) {
        for (var i = 0; i < DIMENSIONES_PRECIO.length; i++) {
          if (i === indice) { continue; }
          var elegido = estadoPrecios.dims[DIMENSIONES_PRECIO[i]];
          if (elegido !== TODAS && combo[i] !== elegido) { return; }
        }
        if (vistos.indexOf(combo[indice]) === -1) { vistos.push(combo[indice]); }
      });
      return vistos;
    }

    function llenarSelect(nodo, opciones, valor) {
      PIVOTAL.vaciar(nodo);
      opciones.forEach(function (opcion) {
        var option = document.createElement("option");
        option.value = opcion.v;
        option.textContent = opcion.t;
        nodo.appendChild(option);
      });
      nodo.value = valor;
    }

    /* Los cuatro desplegables de producto, encadenados. El que se acaba de tocar conserva su
       valor; los que quedaron sin valor valido vuelven a "Todas", porque una seleccion
       imposible no se puede dejar puesta. */
    function pintarDimensiones() {
      DIMENSIONES_PRECIO.forEach(function (dimension, indice) {
        var posibles = valoresPosibles(indice);
        var todas = estadoPrecios.datos.dimensiones[dimension];
        var opciones = todas.filter(function (opcion) {
          return opcion.v === TODAS || posibles.indexOf(opcion.v) !== -1;
        });
        if (opciones.length === 0 || (estadoPrecios.dims[dimension] !== TODAS
            && posibles.indexOf(estadoPrecios.dims[dimension]) === -1)) {
          estadoPrecios.dims[dimension] = TODAS;
        }
        llenarSelect(selectDe("data-precios-dim", dimension), opciones,
                     estadoPrecios.dims[dimension]);
      });
    }

    function serieActual() {
      var clave = DIMENSIONES_PRECIO.map(function (d) { return estadoPrecios.dims[d]; })
        .join("|");
      var id = estadoPrecios.datos.claves[clave];
      return id ? estadoPrecios.datos.series[id] : null;
    }

    /* Las dos puntas del rango: SOLO los meses con cotizacion de esta seleccion (regla 3 de
       JC). Se conserva lo elegido si ese mes sigue existiendo; si no, se vuelve a la serie
       entera, que es el estado por defecto. */
    function pintarRango(serie) {
      var opciones = serie.meses.map(function (mes) {
        return { v: mes, t: estadoPrecios.datos.rotulos_mes[mes] };
      });
      if (serie.meses.indexOf(estadoPrecios.inicio) === -1) {
        estadoPrecios.inicio = serie.meses[0];
      }
      if (serie.meses.indexOf(estadoPrecios.fin) === -1) {
        estadoPrecios.fin = serie.meses[serie.meses.length - 1];
      }
      if (serie.meses.indexOf(estadoPrecios.fin) < serie.meses.indexOf(estadoPrecios.inicio)) {
        estadoPrecios.fin = serie.meses[serie.meses.length - 1];
      }
      llenarSelect(selectDe("data-precios-rango", "inicio"), opciones, estadoPrecios.inicio);
      llenarSelect(selectDe("data-precios-rango", "fin"), opciones, estadoPrecios.fin);
    }

    /* El tramo de puntos que cae dentro del rango. `inicios[k]` es el indice del primer punto
       del mes k, asi que recortar es quedarse entre dos de esos indices: no hay que mirar
       ninguna fecha. */
    function tramo(serie) {
      var desde = serie.meses.indexOf(estadoPrecios.inicio);
      var hasta = serie.meses.indexOf(estadoPrecios.fin);
      return {
        desde: serie.inicios[desde],
        hasta: hasta + 1 < serie.inicios.length ? serie.inicios[hasta + 1]
                                                : serie.valores.length
      };
    }

    /* La escala mas ajustada que cubre el maximo visible. Las escalas vienen del build, con
       sus rotulos ya escritos: aca solo se ELIGE una. Sin esto, con una escala fija de 0 a
       4.500 los primeros años de la serie quedarian pegados al piso. */
    function escalaDe(serie, valores) {
      var maximo = 0;
      valores.forEach(function (v) { if (v > maximo) { maximo = v; } });
      var candidatas = serie.escalas.map(function (i) {
        return estadoPrecios.datos.escalas[i];
      });
      for (var i = 0; i < candidatas.length; i++) {
        if (candidatas[i].max >= maximo) { return candidatas[i]; }
      }
      return candidatas[candidatas.length - 1];
    }

    /* El eje horizontal de JC: meses, y debajo el año una sola vez por grupo. Cuantas marcas
       entran lo decide el ANCHO del cuadro, no el build; que dice cada marca, el build. */
    function categorias(serie, corte, ancho) {
      var vacias = [];
      var largo = corte.hasta - corte.desde;
      for (var i = 0; i < largo; i++) { vacias.push(""); }
      var visibles = serie.marcas.filter(function (marca) {
        return marca[0] >= corte.desde && marca[0] < corte.hasta;
      });
      if (visibles.length === 0) { return vacias; }
      var maximo = Math.max(3, Math.floor(ancho / ANCHO_POR_MARCA));
      var paso = Math.ceil(visibles.length / maximo);
      var ultimoAnio = null;
      visibles.forEach(function (marca, i) {
        if (i % paso !== 0) { return; }
        var texto = "{m|" + marca[1] + "}";
        if (marca[2] !== ultimoAnio) {
          texto += "\n{a|" + marca[2] + "}";
          ultimoAnio = marca[2];
        }
        vacias[marca[0] - corte.desde] = texto;
      });
      return vacias;
    }

    function apagarPrecios(motivo) {
      panel.classList.add("sin-datos");
      texto(panel, "[data-vacio]", motivo);
      texto(panel, "[data-precios-titulo]", "");
      texto(panel, "[data-precios-subtitulo]", "");
      texto(panel, "[data-nota]", "");
    }

    function dibujarPrecios() {
      if (!estadoPrecios.datos) { return; }
      pintarDimensiones();
      var serie = serieActual();
      if (!serie) {
        apagarPrecios("Esta combinación no tiene cotizaciones en el Mercado Central.");
        return;
      }
      panel.classList.remove("sin-datos");
      pintarRango(serie);
      var corte = tramo(serie);
      var valores = serie.valores.slice(corte.desde, corte.hasta);
      var textos = serie.textos.slice(corte.desde, corte.hasta);
      var escala = escalaDe(serie, valores);

      texto(panel, "[data-precios-titulo]", serie.titulo);
      texto(panel, "[data-precios-subtitulo]", panel.dataset.subtitulo
        .replace("{desde}", estadoPrecios.datos.rotulos_mes[estadoPrecios.inicio])
        .replace("{hasta}", estadoPrecios.datos.rotulos_mes[estadoPrecios.fin]));
      texto(panel, "[data-nota]", serie.nota);
      var nota = panel.querySelector("[data-nota]");
      /* La nota se recorta a cuatro lineas en el CSS y estas son largas: el texto completo
         queda a mano en el title, no se pierde. */
      if (nota) { nota.title = serie.nota; }

      var caja = panel.querySelector("[data-grafico]");
      var chart = PIVOTAL.grafico(caja);
      /* Cuantas marcas del eje vertical entran sin encimarse. La escala la manda el build
         (paso, tope y el rotulo de cada marca); lo unico que se decide aca es cada cuantas se
         escribe, porque eso depende del ALTO que le haya tocado al cuadro en esta pantalla.
         Con las 7 marcas que el protocolo busca, en un cuadro de 92px los numeros se montan
         unos sobre otros.
         El PISO lo pone el protocolo y viaja en la escala (`minimo`): hasta el 28-sep este
         calculo podia bajar a 3 etiquetas, que incumple la regla de JC del minimo de 5
         valores en el eje vertical. Ahora lo resuelve PIVOTAL.saltoDeEje. */
      var saltoY = PIVOTAL.saltoDeEje(escala, caja.clientHeight || 160, 22);
      chart.setOption({
        animation: false,
        /* `top` deja lugar al nombre del eje, que ECharts dibuja encima de la primera marca:
           con menos, "$/kg" se montaba sobre el 800. */
        grid: { left: 4, right: 8, top: 22, bottom: 4, containLabel: true },
        tooltip: {
          trigger: "axis",
          confine: true,
          formatter: function (params) { return textos[params[0].dataIndex]; }
        },
        xAxis: {
          type: "category",
          data: categorias(serie, corte, caja.clientWidth || 360),
          boundaryGap: false,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: PIVOTAL.color("--borde") } },
          axisLabel: {
            interval: 0,
            fontSize: 10,
            lineHeight: 12,
            color: PIVOTAL.color("--texto-apoyo"),
            rich: {
              m: { fontSize: 10, color: PIVOTAL.color("--texto-apoyo") },
              a: { fontSize: 10, color: PIVOTAL.color("--texto"), fontWeight: "bold" }
            }
          }
        },
        yAxis: {
          type: "value",
          min: escala.min,
          max: escala.max,
          interval: escala.paso * saltoY,
          name: "$/kg",
          nameLocation: "end",
          nameGap: 8,
          nameTextStyle: { fontSize: 10, color: PIVOTAL.color("--texto-apoyo"), align: "left" },
          axisLabel: {
            show: true, fontSize: 10, color: PIVOTAL.color("--texto-apoyo"),
            formatter: function (v) { return PIVOTAL.etiquetaEje(escala, v); }
          },
          splitLine: { lineStyle: { color: PIVOTAL.color("--fondo-apoyo") } }
        },
        series: [{
          type: "line",
          data: valores,
          smooth: false,
          connectNulls: false,
          /* Con mas de 60 puntos el simbolo tapa la linea: en la serie diaria son cientos. */
          symbol: valores.length > 60 ? "none" : "circle",
          symbolSize: 4,
          lineStyle: { color: panel.dataset.color, width: 3 },
          itemStyle: { color: panel.dataset.color }
        }]
      }, true);
    }

    /* Baja el archivo de la especie y el modo elegidos (y solo ese) y redibuja. */
    function cargarPrecios() {
      var chip = panel.querySelector('[data-precios-especie] [data-valor="'
        + estadoPrecios.especie + '"]');
      var ruta = chip.dataset[estadoPrecios.modo];
      if (cache[ruta]) {
        estadoPrecios.datos = cache[ruta];
        dibujarPrecios();
        return Promise.resolve();
      }
      return fetch(ruta).then(function (r) { return r.json(); }).then(function (datos) {
        cache[ruta] = datos;
        estadoPrecios.datos = datos;
        dibujarPrecios();
      });
    }

    function marcarElegido(nodos, valor) {
      nodos.forEach(function (boton) {
        boton.setAttribute("aria-pressed", boton.dataset.valor === valor ? "true" : "false");
      });
    }

    /* Al cambiar de especie la seleccion de producto arranca en la que declara el archivo de
       esa especie (la de la maqueta de JC si existe ahi), y el rango vuelve a la serie entera:
       los meses de una especie no tienen por que existir en la siguiente. */
    function elegirEspecie(especie) {
      estadoPrecios.especie = especie;
      estadoPrecios.dims = {};
      estadoPrecios.inicio = null;
      estadoPrecios.fin = null;
      marcarElegido(botones("[data-precios-especie] button"), especie);
      var chip = panel.querySelector('[data-precios-especie] [data-valor="' + especie + '"]');
      return fetch(chip.dataset[estadoPrecios.modo])
        .then(function (r) { return r.json(); })
        .then(function (datos) {
          cache[chip.dataset[estadoPrecios.modo]] = datos;
          estadoPrecios.datos = datos;
          DIMENSIONES_PRECIO.forEach(function (dimension, i) {
            estadoPrecios.dims[dimension] = datos.defecto[i];
          });
          dibujarPrecios();
        });
    }

    function engancharPrecios() {
      panel.querySelector("[data-precios-grupo]").addEventListener("click", function (evento) {
        var boton = evento.target.closest("button[data-valor]");
        if (!boton || boton.dataset.valor === estadoPrecios.grupo) { return; }
        estadoPrecios.grupo = boton.dataset.valor;
        marcarElegido(botones("[data-precios-grupo] button"), estadoPrecios.grupo);
        botones("[data-precios-especie] button").forEach(function (chip) {
          chip.hidden = chip.dataset.grupo !== estadoPrecios.grupo;
        });
        elegirEspecie(boton.dataset.especie);
      });
      panel.querySelector("[data-precios-especie]").addEventListener("click", function (e) {
        var boton = e.target.closest("button[data-valor]");
        if (!boton || boton.dataset.valor === estadoPrecios.especie) { return; }
        elegirEspecie(boton.dataset.valor);
      });
      DIMENSIONES_PRECIO.forEach(function (dimension) {
        selectDe("data-precios-dim", dimension).addEventListener("change", function (e) {
          estadoPrecios.dims[dimension] = e.target.value;
          dibujarPrecios();
        });
      });
      panel.querySelector("[data-precios-modo]").addEventListener("change", function (e) {
        estadoPrecios.modo = e.target.value;
        cargarPrecios();
      });
      ["inicio", "fin"].forEach(function (punta) {
        selectDe("data-precios-rango", punta).addEventListener("change", function (e) {
          estadoPrecios[punta] = e.target.value;
          dibujarPrecios();
        });
      });
    }

    var pestania = panel.querySelector('[data-precios-grupo] [aria-pressed="true"]');
    estadoPrecios.grupo = pestania.dataset.valor;
    estadoPrecios.modo = panel.querySelector("[data-precios-modo]").value;
    engancharPrecios();
    /* Se vuelve a dibujar cuando la caja cambia de tamaño (el reparto de flexbox se resuelve
       despues de pintar) y cuando comun.js repinta el tablero: al exportar a PDF la pagina se
       pone en el formato de la HOJA y las marcas del eje no son las mismas que en pantalla. */
    if (window.ResizeObserver) {
      var espera = null;
      new ResizeObserver(function () {
        if (espera) { clearTimeout(espera); }
        espera = setTimeout(dibujarPrecios, 200);
      }).observe(panel.querySelector("[data-grafico]"));
    }
    PIVOTAL.alRepintar(dibujarPrecios);
    return elegirEspecie(pestania.dataset.especie);
  }

  PIVOTAL.arrancar(contenedor.dataset.datos, function (combo, datos) {
    var paneles = Array.prototype.slice.call(contenedor.querySelectorAll("[data-panel]"));
    if (!combo) {
      paneles.forEach(function (nodo) { apagar(nodo, datos.sin_combinacion); });
      pintarKpis([]);
      pintarContexto(null);
      pintarKpisNota("");
      return;
    }
    /* Un tablero puede no tener indicadores: la maqueta "Agri 2" de JC va de los selectores
       directo a los paneles. En ese caso el JSON no trae `kpis` y no hay tarjetas en el DOM;
       las tres funciones de abajo no encuentran nada que pintar y no hacen nada. */
    pintarContexto(combo.contexto);
    pintarKpis(combo.kpis || []);
    pintarKpisNota(combo.kpis_nota);
    /* Despues de los indicadores y ANTES de los paneles: los indicadores son lo ultimo que
       cambia de alto arriba del tablero, y los graficos tienen que medirse con el alto ya fijado. */
    ajustarAlto();
    paneles.forEach(function (nodo) {
      var panel = combo.paneles[nodo.dataset.panel];
      if (!panel) { return; }
      if (panel.vacio) { apagar(nodo, panel.vacio); return; }
      encender(nodo);
      /* Titulo y subtitulo pueden traer terminos del glosario marcados (regla de JC de las
         aclaraciones): es donde viven "superficie cosechada", "rendimiento" o "cabezas", y
         cambian con lo que el usuario elige, asi que no los puede dibujar el servidor. Sin
         terminos marcados `glosa` escribe el texto plano, igual que antes. */
      PIVOTAL.glosa(nodo, "[data-titulo]", panel.titulo, panel.titulo_partes);
      PIVOTAL.glosa(nodo, "[data-subtitulo]", panel.subtitulo, panel.subtitulo_partes);
      texto(nodo, "[data-pie]", panel.pie);
      texto(nodo, "[data-nota]", panel.nota);
      DIBUJANTES[nodo.dataset.panel](nodo, panel);
    });
  });

  /* El panel de precios del MCBA no tiene combinacion en el JSON del tablero: arranca solo,
     con sus propios filtros y su propio archivo de datos. */
  iniciarPrecios();
}
