/* Pivotal - el tablero: cuatro indicadores y cuatro paneles compactos en una pantalla.

   Un dibujante por FORMA de panel (anillo, mapa, tendencia, top). Las formas son las mismas en
   todas las bases: el spec del tablero dice que panel usa cual y con que datos, y aca solo se
   dibuja. Todos los textos y todos los colores vienen resueltos del build; este archivo no
   formatea un solo numero. */

import * as echarts from "echarts";

export default function iniciar(PIVOTAL) {

  var contenedor = document.getElementById("tablero");
  var geoListo = null;

  function texto(nodo, selector, valor) {
    var destino = nodo.querySelector(selector);
    if (destino) { destino.textContent = valor || ""; }
  }

  /* -------- alto: el tablero entra en UNA pantalla --------
     JC pidio un tablero y no un informe, asi que los cuatro paneles tienen que verse sin
     scrollear. El alto no se puede escribir en el CSS porque lo que hay ARRIBA del tablero
     cambia de pagina en pagina: el titulo puede irse a dos lineas y los chips de filtro pueden
     envolver. Se mide una sola vez, ya pintados los indicadores, y se le fija al contenedor lo
     que sobra de la ventana; el CSS reparte ese alto entre las filas (.alto-fijo).

     Por debajo de ALTO_MINIMO no se fuerza nada y la pagina scrollea como cualquier otra: en
     una ventana muy baja un tablero aplastado se lee peor que uno que no entra. */
  var ALTO_MINIMO = 500;   /* px de tablero por debajo de los cuales conviene dejar scrollear */
  var AIRE_ABAJO = 16;     /* respiro entre el ultimo panel y el borde de la ventana */
  var ANGOSTO = window.matchMedia("(max-width: 1000px)");   /* el mismo corte que el CSS */

  function ajustarAlto() {
    /* Mientras se imprime manda la HOJA y no la ventana: comun.js ya dejo el tablero con el
       reparto de alto que corresponde y es la hoja la que le da la altura. Sin esta guarda,
       el repintado que hace falta antes de sacar las fotos le borraba ese reparto y en una
       ventana angosta los paneles se montaban sobre el pie. */
    if (document.documentElement.classList.contains("imprimiendo")) { return; }
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
    texto(nodo, "[data-accion]", panel.accion);
    texto(nodo, "[data-escala-min]", panel.escala.min);
    texto(nodo, "[data-escala-max]", panel.escala.max);
    var rampa = nodo.querySelector("[data-escala-rampa]");
    rampa.style.background = "linear-gradient(to right, " + panel.escala.rampa.join(", ") + ")";

    var porId = {};
    panel.deptos.forEach(function (d) { porId[d.id] = d; });

    cargarGeo(panel.geojson).then(function () {
      var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
      /* "Seleccione departamento" (mockup de JC): el clic abre la ficha del departamento,
         conservando la seleccion vigente (persistencia_de_filtros). off() antes de on():
         el panel se repinta en cada cambio de filtro y los handlers no se apilan. */
      chart.off("click");
      if (panel.ficha) {
        chart.getZr().setCursorStyle("pointer");
        chart.on("click", function (p) {
          if (!p.name) { return; }
          var extra = PIVOTAL.parametros();
          window.location.href = panel.ficha + encodeURIComponent(p.name)
            + (extra ? "&" + extra : "");
        });
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
          /* Sin esto ECharts rotula el poligono resaltado con su `name`, que aca es el
             geo_id: era el bug del mouseover que marco Facu (el ID dibujado sobre el mapa).
             El nombre legible va en el tooltip, nunca el codigo. */
          emphasis: { label: { show: false } },
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
          /* Sin rotulos: en un panel de 340px los 27 nombres no entran y lo unico que hacen es
             ensuciar. El nombre esta en el tooltip y en el Top 5 de al lado. */
          label: { show: false },
          itemStyle: { borderColor: PIVOTAL.color("--fondo-cuadro"), borderWidth: 0.7 },
          data: panel.deptos.map(function (d) {
            return {
              name: d.id,
              value: d.v,
              itemStyle: { areaColor: d.color },
              emphasis: { itemStyle: { areaColor: d.color, borderColor: PIVOTAL.color("--texto"),
                                       borderWidth: 1.4 } }
            };
          })
        }]
      }, true);
    });
  }

  /* -------- tendencia --------
     Una linea (panel.puntos, forma original) o varias (panel.series, cada una con su eje:
     el mockup de JC dibuja cosecha y produccion juntas y son unidades distintas, asi que la
     segunda serie va sobre un eje secundario que el build calcula con la misma cantidad de
     intervalos que el primero). */
  function pintarTendencia(nodo, panel) {
    var chart = PIVOTAL.grafico(nodo.querySelector("[data-grafico]"));
    var series = [];
    /* Serie de referencia opcional (el periodo anterior). Va primero y en gris punteado: es
       contexto para leer la principal, no un dato que compita con ella. `silent` la deja fuera
       del hover para que el tooltip siempre hable del periodo elegido. */
    if (panel.referencia) {
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

    var lineas = panel.series || [{
      nombre: "", color: panel.color, eje: 0, puntos: panel.puntos, textos: panel.textos
    }];
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
        lineStyle: { color: linea.color, width: 2 },
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

    /* Eje vertical VISIBLE cuando el build lo pide (`eje_visible`): rotulo de escala
       ("Millones") y marcas con sus etiquetas, como lo dibuja JC en el mockup (tercera
       tanda: "no está el eje vertical y tampoco la escala"). Los textos de las marcas vienen
       resueltos del build (etiquetas por valor); aca no se formatea ningun numero. */
    /* Escala legible (cuarta tanda, escala_legible): el build manda el paso fino que dibujo
       JC (0,50 de referencia) y aca solo se cuida que las etiquetas no se pisen cuando el
       panel quedo bajo: si no hay ~16px por intervalo se rotula una marca de por medio (las
       lineas de grilla siguen en el paso fino, que es lo que deja leer las variaciones).
       Nunca menos de 5 marcas rotuladas: partiendo de 8 intervalos o mas, saltear de a una
       deja 5 o mas, que es el minimo del protocolo (seccion 7). `getHeight()` se relee en
       cada render, asi que al agrandar la ventana vuelven todas las etiquetas. */
    function etiquetaLegible(v) {
      var intervalos = Math.round((panel.eje.max - panel.eje.min) / panel.eje.paso);
      /* El area de dibujo es el alto del canvas menos el cromo de arriba (leyenda + nombre
         del eje) y las campañas rotadas de abajo: ~70px que no son plot. Menos de ~13px por
         intervalo = etiquetas pisadas. */
      if (intervalos >= 8 && (chart.getHeight() - 70) < intervalos * 13) {
        var indice = Math.round((v - panel.eje.min) / panel.eje.paso);
        if (indice % 2 === 1) { return ""; }
      }
      return PIVOTAL.etiquetaEje(panel.eje, v);
    }

    var ejes = [{
      type: "value",
      min: panel.eje.min,
      max: panel.eje.max,
      interval: panel.eje.paso,
      name: panel.eje_visible ? panel.eje.nombre : undefined,
      nameLocation: "end",
      nameGap: 8,
      nameTextStyle: { fontSize: 10, color: PIVOTAL.color("--texto-apoyo"), align: "left" },
      axisLabel: panel.eje_visible
        ? { show: true, fontSize: 10, color: PIVOTAL.color("--texto-apoyo"),
            formatter: etiquetaLegible }
        : { show: false },
      splitLine: { lineStyle: { color: PIVOTAL.color("--fondo-apoyo") } }
    }];
    if (panel.eje2) {
      ejes.push({
        type: "value",
        min: panel.eje2.min,
        max: panel.eje2.max,
        interval: panel.eje2.paso,
        axisLabel: { show: false },
        splitLine: { show: false }
      });
    }

    chart.setOption({
      animation: false,
      grid: { left: 4, right: 8, top: (varias ? 26 : 12) + (panel.eje_visible ? 12 : 0),
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
          if (panel.referencia) {
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
        /* Con el eje visible (cultivos, mockup literal) se rotulan TODAS las campañas,
           rotadas a 45 grados como en el dibujo de JC (protocolo, eje_horizontal: nunca se
           ocultan etiquetas). En los otros tableros queda el salteo compacto de siempre. */
        axisLabel: panel.eje_visible
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
  function armarTablaCampanias(columnas, filas) {
    var tabla = document.createElement("table");
    var thead = document.createElement("thead");
    var trCabeza = document.createElement("tr");
    columnas.forEach(function (columna) {
      var th = document.createElement("th");
      th.textContent = columna.etiqueta;
      if (columna.num) { th.className = "num"; }
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
        if (columnas[i] && columnas[i].num) { td.className = "num"; }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    return tabla;
  }

  function pintarTablaDatos(nodo, panel) {
    var caja = nodo.querySelector("[data-tabla-datos]");
    PIVOTAL.vaciar(caja);
    var bloques = panel.bloques || [{ columnas: panel.columnas, filas: panel.filas }];
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
      lista.appendChild(armarTablaCampanias(panel.columnas, panel.filas));
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

  var DIBUJANTES = {
    anillo: pintarAnillo,
    mapa: pintarMapa,
    tendencia: pintarTendencia,
    "tabla-datos": pintarTablaDatos,
    top: pintarTop
  };

  /* Un panel sin datos dice por que no los tiene y se apaga entero: no se deja un grafico
     vacio ni un pie de fuente citando una fuente que no informo nada.
     Se apaga con una clase, NO vaciando el cuerpo: el filtro siguiente puede volver a tener
     datos y el panel tiene que poder encenderse de nuevo con su markup intacto. */
  function apagar(nodo, motivo) {
    nodo.classList.add("sin-datos");
    texto(nodo, "[data-vacio]", motivo);
    texto(nodo, "[data-subtitulo]", "");
  }

  function encender(nodo) {
    nodo.classList.remove("sin-datos");
  }

  function pintarKpisNota(nota) {
    var nodo = document.querySelector("[data-kpis-nota]");
    if (nodo) { nodo.textContent = nota || ""; }
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
    pintarContexto(combo.contexto);
    pintarKpis(combo.kpis);
    pintarKpisNota(combo.kpis_nota);
    /* Despues de los indicadores y ANTES de los paneles: los indicadores son lo ultimo que
       cambia de alto arriba del tablero, y los graficos tienen que medirse con el alto ya fijado. */
    ajustarAlto();
    paneles.forEach(function (nodo) {
      var panel = combo.paneles[nodo.dataset.panel];
      if (!panel) { return; }
      if (panel.vacio) { apagar(nodo, panel.vacio); return; }
      encender(nodo);
      texto(nodo, "[data-titulo]", panel.titulo);
      texto(nodo, "[data-subtitulo]", panel.subtitulo);
      texto(nodo, "[data-pie]", panel.pie);
      texto(nodo, "[data-nota]", panel.nota);
      DIBUJANTES[nodo.dataset.panel](nodo, panel);
    });
  });
}
