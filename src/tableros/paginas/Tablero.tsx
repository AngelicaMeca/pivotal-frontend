/* Tablero: la portada de una base (antes site/templates/tablero.html). Los indicadores y los
   paneles, todo en una pantalla.

   Este componente dibuja la CASCARA de cada panel (titulo, pie) y deja los huecos marcados con
   data-*; los llena src/tableros/cliente/tablero.js con la combinacion de filtros elegida.

   Las FORMAS de panel (anillo, mapa, tendencia, top, tabla-datos, combo, apiladas,
   utilidades) son las mismas en todas las bases, a proposito: el protocolo de JC pide que los
   formatos se repitan. Si aparece una forma nueva se agrega un bloque en CuerpoPanel y su
   dibujante en tablero.js, una sola vez, y queda disponible para todas.

   Tres disposiciones (deciden los specs con `tablero.disposicion`, no este archivo):
     - "mockup" CON selector grande (zona `selector`): el tablero de cultivos extensivos,
       CALCADO del mockup Modelo 2 de JC (tercera tanda del 10-ago-2026). Columna izquierda:
       mapa GRANDE + UTILIDADES. Columna derecha: chips de cultivo, tarjeta de contexto + KPIs,
       fila de graficos (tendencia | anillo) y fila de tablas (datos por campaña | ranking).
       SIN links "ver detalle": las unicas salidas son los botones de cabecera y el click del
       mapa.
     - "grilla-2x2": la maqueta "Agri 2" de JC (cultivos intensivos). Cuatro paneles en dos
       filas de a dos y nada mas. SIN indicadores (la maqueta va de los chips directo a los
       paneles), SIN selector grande arriba -los chips de producto viven ADENTRO de los dos
       paneles que los dibuja JC, manejados por el mismo filtro- y SIN tira de utilidades al
       final: "Más información →" y "Generar PDF" son el pie de cada cuadro
       (Francisco, 23-sep-2026).
     - SIN selector: grilla de 12 columnas con `data-ancho`/`data-alto` del spec (hacienda,
       stock), con los indicadores arriba y "Ver detalle" donde el spec lo declare.

   Sin badges de tipo de grafico: los saco JC el 10-ago-2026. */
import type { AccionDeCuadro, Filtro, PaginaTablero, Panel } from "@/tableros/tipos";
import Arranque from "./Arranque";
import Cascara from "./Cascara";

function TarjetasKpi({ contexto }: { contexto: boolean }) {
  return (
    <>
      {contexto ? (
        // La tarjeta de contexto del mockup: QUE se esta viendo (icono + cultivo + campaña)
        <div className="kpi kpi-contexto">
          <span className="kpi-contexto-ico">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-contexto-icono="" src={undefined} alt="" hidden />
          </span>
          <span className="kpi-contexto-texto">
            <span className="kpi-contexto-nombre" data-contexto-nombre=""></span>
            <span className="kpi-contexto-detalle" data-contexto-detalle=""></span>
          </span>
        </div>
      ) : null}
      {/* KPIs: valor y unidad. La variacion solo llega en las bases que la calculan; en
          cultivos esta PROHIBIDA (kpis_sin_variacion) y el build no la manda. */}
      {[0, 1, 2, 3].map((indice) => (
        <div key={indice} className="kpi" data-kpi={indice}>
          <span className="rotulo kpi-etiqueta" data-etiqueta=""></span>
          <span className="kpi-cifra">
            <span className="kpi-valor" data-valor=""></span>
            <span className="kpi-unidad" data-unidad=""></span>
          </span>
          <span className="kpi-var" data-variacion=""></span>
        </div>
      ))}
    </>
  );
}

// El CUERPO de cada forma de panel: compartido por las dos disposiciones
function CuerpoPanel({ id, mockup = false }: { id: string; mockup?: boolean }) {
  let cuerpo = null;
  if (id === "anillo") {
    cuerpo = (
      <>
        <div className="anillo-caja">
          <div className="grafico" data-grafico=""></div>
          {/* El centro se dibuja solo si el JSON trae `centro` (hacienda, stock). En cultivos
              va SIN cifra central y el total viaja en `total_linea`. */}
          <div className="anillo-centro">
            <span className="anillo-total" data-centro=""></span>
            <span className="rotulo anillo-unidad" data-centro-unidad=""></span>
            <span className="anillo-nota" data-centro-nota=""></span>
          </div>
        </div>
        <p className="anillo-total-linea" data-total-anillo=""></p>
        <ul className="anillo-leyenda" data-leyenda=""></ul>
      </>
    );
  } else if (id === "mapa") {
    cuerpo = (
      <>
        <div className="grafico" data-grafico=""></div>
        <div className="escala">
          <span className="escala-min" data-escala-min=""></span>
          <span className="escala-rampa" data-escala-rampa=""></span>
          <span className="escala-max" data-escala-max=""></span>
        </div>
        <p className="total-provincial" data-total=""></p>
      </>
    );
  } else if (id === "tendencia") {
    cuerpo = <div className="grafico chico" data-grafico=""></div>;
  } else if (id === "combo") {
    /* Barras de una medida de conteo con una linea de una medida de volumen sobre un segundo
       eje. Dos series: la leyenda de ECharts entra en una linea y dibuja el glifo de cada
       forma (barra y linea), que es lo que hace falta para distinguirlas.
       Debajo, la TABLA de datos del grafico (maqueta "Agri 2": JC pega una tabla con los
       mismos años como columnas bajo cada uno de los dos cuadros de la izquierda). */
    cuerpo = (
      <>
        <div className="grafico" data-grafico=""></div>
        <div className="tabla-datos tabla-bajo-grafico" data-tabla-datos=""></div>
      </>
    );
  } else if (id === "apiladas") {
    /* Barras apiladas, una serie por categoria. La leyenda va en HTML y no en ECharts: con
       siete departamentos la leyenda de ECharts envuelve a dos lineas, su alto lo decide
       ECharts despues de medir y termina montandose sobre las etiquetas del eje. En HTML el
       alto lo reparte flexbox y el grafico se encoge lo que haga falta.
       La tabla de datos va debajo de la leyenda, como en la maqueta. */
    cuerpo = (
      <>
        <div className="grafico" data-grafico=""></div>
        <ul className="leyenda-series" data-leyenda=""></ul>
        <div className="tabla-datos tabla-bajo-grafico" data-tabla-datos=""></div>
      </>
    );
  } else if (id === "tabla-datos" || id === "tabla-superficie") {
    // DOS bloques de campañas lado a lado, como los dibuja JC; los arma tablero.js
    cuerpo = <div className="tabla-datos" data-tabla-datos=""></div>;
  } else if (id === "top") {
    // TABLA calcada del mockup (cultivos) o lista de barras (hacienda, stock)
    cuerpo = mockup ? (
      <div className="tabla-datos top-tabla" data-barras=""></div>
    ) : (
      <ul className="lista-barras" data-barras=""></ul>
    );
  }
  return (
    <>
      {cuerpo}
      <p className="cuadro-nota" data-nota=""></p>
      {/* Se muestra en lugar del cuerpo cuando la combinacion elegida no tiene datos */}
      <p className="panel-vacio" data-vacio=""></p>
    </>
  );
}

/* Chips de producto DENTRO de un panel (maqueta "Agri 2"): icono + nombre, gris en reposo y
   color en el elegido, igual que el selector grande del mockup Modelo 2. Dos paneles dibujan
   esta fila con rotulos distintos ("DTV Cebolla" y "Cebolla") y es UN SOLO filtro: los dos
   controles declaran el mismo data-filtro y comun.js los mantiene en sincronia. */
function ChipsPanel({ filtro }: { filtro: Filtro }) {
  return (
    <div
      className="selector-cultivo chips-en-panel"
      data-control="chips"
      data-filtro={filtro.id}
      data-valor={filtro.defecto}
      role="group"
      aria-label={filtro.etiqueta}
    >
      {filtro.opciones.map((opcion) => (
        <button
          key={opcion.v}
          type="button"
          className="chip-cultivo"
          data-valor={opcion.v}
          aria-pressed={opcion.v === filtro.defecto ? "true" : "false"}
        >
          {opcion.icono ? (
            <span className="chip-ico-caja">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ico-bn" src={opcion.icono} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ico-color" src={opcion.icono_color} alt="" />
            </span>
          ) : (
            <span className="chip-ico-caja chip-ico-vacia"></span>
          )}
          <span className="chip-nombre">{opcion.t}</span>
        </button>
      ))}
    </div>
  );
}

/* El pie de un cuadro de la maqueta "Agri 2": "Más información →" y "Generar PDF", uno por
   cuadro. Reemplaza al panel de utilidades unico del final (Francisco, 23-sep-2026).
   Tres formas, las decide el build: boton con accion, link con destino, o deshabilitado. */
function AccionesDeCuadro({ acciones }: { acciones?: AccionDeCuadro[] }) {
  if (!acciones || acciones.length === 0) return null;
  return (
    <span className="panel-acciones">
      {acciones.map((accion) => {
        const contenido = (
          <>
            {accion.icono ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={accion.icono} alt="" />
            ) : null}
            <span className="accion-nombre">{accion.etiqueta}</span>
            {accion.flecha ? <span className="accion-flecha">→</span> : null}
          </>
        );
        if (accion.accion) {
          return (
            <button
              key={accion.id}
              type="button"
              className="panel-accion panel-accion-activa"
              data-utilidad={accion.accion}
            >
              {contenido}
            </button>
          );
        }
        if (accion.href) {
          return (
            <a key={accion.id} className="panel-accion" href={accion.href} data-conserva="">
              {contenido}
            </a>
          );
        }
        return (
          <span key={accion.id} className="panel-accion" title={accion.rotulo}>
            {contenido}
            <span className="prox">{accion.rotulo}</span>
          </span>
        );
      })}
    </span>
  );
}

// El toggle del panel es un control mas: mismo contrato data-* que los chips de la barra
function TogglePanel({ filtro }: { filtro?: Filtro }) {
  if (!filtro) return null;
  return (
    <div
      className="panel-toggle"
      data-control="chips"
      data-filtro={filtro.id}
      data-valor={filtro.defecto}
      role="group"
      aria-label={filtro.etiqueta}
    >
      {filtro.opciones.map((opcion) => (
        <button
          key={opcion.v}
          type="button"
          data-valor={opcion.v}
          title={opcion.t}
          aria-label={opcion.t}
          aria-pressed={opcion.v === filtro.defecto ? "true" : "false"}
        >
          {opcion.corto || opcion.t}
        </button>
      ))}
    </div>
  );
}

function PanelComun({ panel, filtro }: { panel: Panel; filtro?: Filtro }) {
  return (
    <section
      className="panel"
      data-panel={panel.id}
      data-ancho={panel.ancho}
      data-alto={panel.alto}
    >
      <div className="panel-cab">
        <div>
          <h2 data-titulo="">{panel.titulo}</h2>
          <p className="panel-sub" data-subtitulo=""></p>
        </div>
        <TogglePanel filtro={filtro} />
      </div>

      <div className="panel-cuerpo">
        {panel.id === "mapa" ? <p className="rotulo mapa-accion" data-accion=""></p> : null}
        <CuerpoPanel id={panel.id} />
      </div>

      <div className="panel-pie">
        <span className="panel-fuente" data-pie=""></span>
        {/* El enlace solo aparece si la seccion ya tiene su vista de detalle construida */}
        {panel.detalle ? (
          <a className="panel-detalle" href={panel.detalle} data-conserva="">
            Ver detalle →
          </a>
        ) : null}
      </div>
    </section>
  );
}

/* Panel del tablero de cultivos, calcado de la captura: titulo centrado (lo pinta tablero.js
   por combinacion), sin subtitulo y SIN "Ver detalle". El mapa no lleva titulo: arriba va el
   rotulo "Seleccione departamento" con el selector de variable al lado. */
function PanelMockup({ panel, filtro }: { panel: Panel; filtro?: Filtro }) {
  /* Dos maneras de dibujar el filtro del panel: el toggle chiquito de siempre (PROD. /
     SEMBRADA / REND. sobre el mapa de cultivos) y la fila de chips con icono de la maqueta
     "Agri 2". Decide el propio filtro: si sus opciones traen icono, son chips. */
  const conIconos = Boolean(filtro && filtro.opciones.some((opcion) => opcion.icono));
  return (
    <section className="panel" data-panel={panel.id}>
      {panel.id === "mapa" ? (
        <div className="mapa-cab">
          <p className="mapa-accion" data-accion=""></p>
          <TogglePanel filtro={filtro} />
        </div>
      ) : panel.id !== "tabla-datos" ? (
        /* `tabla-datos` es el unico panel sin titulo (asi lo dibuja el mockup Modelo 2). La
           tabla de superficies de la maqueta "Agri 2" SI lo lleva, porque el titulo es de JC
           ("Estimaciones de superficies cosechadas (*)") y porque depende de los selectores. */
        <div className="panel-cab panel-cab-mockup">
          {conIconos && filtro ? <ChipsPanel filtro={filtro} /> : null}
          <h2 data-titulo="">{panel.titulo}</h2>
          <p className="panel-sub" data-subtitulo=""></p>
          {conIconos ? null : <TogglePanel filtro={filtro} />}
        </div>
      ) : null}
      <div className="panel-cuerpo">
        <CuerpoPanel id={panel.id} mockup />
      </div>
      <div className="panel-pie">
        <span className="panel-fuente" data-pie=""></span>
        <AccionesDeCuadro acciones={panel.acciones} />
      </div>
    </section>
  );
}

/* "Información relacionada (abre en nueva ventana)": panel ESTATICO del mockup, dibujado con
   sus links deshabilitados y "Próximamente" (cuarta tanda). Sin data-panel: no muestra datos,
   tablero.js no lo toca y no lleva pie de fuente. */
function PanelInformacion({ panel }: { panel: Panel }) {
  return (
    <section className="panel panel-info">
      <h2 className="info-titulo">{panel.titulo}</h2>
      <ul className="info-items">
        {(panel.items || []).map((item) => (
          <li key={item.etiqueta} className="info-item" title="Próximamente">
            <span className="info-nombre">{item.etiqueta}</span>
            <span className="prox">Próximamente</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Panel con filtros y datos PROPIOS: hoy es uno solo, el cuadro de precios del MCBA que JC
   dibuja en su maqueta "Agri 2" (chart8), alimentado por la base 8.

   Es la unica forma de panel que no se dibuja desde la combinacion del tablero: sus filtros
   -grupo, especie, cuatro dimensiones de producto, modo y rango- son suyos y no tienen nada
   que ver con el producto y el año que gobiernan los otros tres cuadros. Por eso sus controles
   NO llevan `data-control` (no entran en la clave de la combinacion) y su JSON es aparte,
   partido por especie y por modo.

   Aca va la CASCARA y nada mas: los desplegables se llenan y el grafico se dibuja en
   src/tableros/cliente/tablero.js, que es el unico que lee el JSON de datos. Los rotulos y los
   textos de los chips vienen del build, como en todo el resto. */
function PanelPrecios({ panel }: { panel: Panel }) {
  const precios = panel.precios;
  if (!precios) return null;
  const grupoActual = precios.pestanias.find((p) => p.actual) || precios.pestanias[0];
  return (
    <section
      className="panel panel-precios"
      data-precios=""
      data-color={precios.color}
      data-subtitulo={precios.subtitulo}
    >
      <div className="panel-cab panel-cab-mockup">
        <p className="rotulo precios-familia">{precios.familia}</p>
        <h2>{panel.titulo}</h2>
        {panel.subtitulo ? <p className="panel-sub">{panel.subtitulo}</p> : null}
      </div>

      {/* Primer y segundo nivel de filtrado de la hoja "Modelo analisis" de JC: el grupo en dos
          sub-pestañas y la especie en una fila de chips. Los chips llevan la ruta de su propio
          JSON: el navegador baja el de la especie que se esta mirando y ninguno mas.
          Los dos niveles comparten renglon (JC los dibuja en filas separadas): este cuadro es
          el unico con tres filas de controles encima del grafico, y cada fila le saca 16px a
          un dibujo que en una pantalla de 900px ya arranca con 73. Lo que se pierde es una
          linea en blanco; lo que se gana es el grafico. */}
      <div className="precios-filtros">
      <div className="precios-pestanias" data-precios-grupo="" role="group">
        {precios.pestanias.map((pestania) => (
          <button
            key={pestania.id}
            type="button"
            className="precios-pestania"
            data-valor={pestania.id}
            data-especie={pestania.especie}
            aria-pressed={pestania.id === grupoActual.id ? "true" : "false"}
          >
            {pestania.etiqueta}
          </button>
        ))}
      </div>
      <div className="precios-chips" data-precios-especie="" role="group">
        {precios.chips.map((chip) => (
          <button
            key={chip.v}
            type="button"
            className="precios-chip"
            data-valor={chip.v}
            data-grupo={chip.grupo}
            data-mensual={chip.archivos.mensual}
            data-diario={chip.archivos.diario}
            hidden={chip.grupo !== grupoActual.id}
            aria-pressed={chip.v === grupoActual.especie ? "true" : "false"}
          >
            {chip.t}
          </button>
        ))}
      </div>
      </div>

      {/* Los cuatro desplegables de producto, el modo y las dos puntas del rango. Arrancan
          vacios: sus opciones dependen de la especie elegida y las llena tablero.js con lo que
          EXISTE en el mart (es la regla 3 de JC, "rangos solo donde aparece la especie"). */}
      <div className="precios-controles">
        {precios.dimensiones.map((dimension) => (
          <label key={dimension.id} className="precios-control">
            <span className="rotulo">{dimension.rotulo}</span>
            <select data-precios-dim={dimension.id}></select>
          </label>
        ))}
        <label className="precios-control">
          <span className="rotulo">{precios.modo.rotulo}</span>
          <select data-precios-modo="" defaultValue={precios.modo.defecto}>
            {precios.modo.opciones.map((opcion) => (
              <option key={opcion.v} value={opcion.v}>
                {opcion.t}
              </option>
            ))}
          </select>
        </label>
        <label className="precios-control">
          <span className="rotulo">{precios.rango.inicio}</span>
          <select data-precios-rango="inicio"></select>
        </label>
        <label className="precios-control">
          <span className="rotulo">{precios.rango.fin}</span>
          <select data-precios-rango="fin"></select>
        </label>
      </div>

      <div className="panel-cuerpo">
        {/* El titulo del GRAFICO (el literal de JC) es distinto del titulo del cuadro: cambia
            con la especie y la variedad elegidas, asi que lo pinta tablero.js. Va en un <p> y
            no en un <h3>: el h3 del sitio es un rotulo en versalita y este es un titulo de
            cuadro, con las mismas reglas que el de los otros tres paneles. */}
        <p className="precios-titulo" data-precios-titulo=""></p>
        <p className="panel-sub precios-sub" data-precios-subtitulo=""></p>
        <div className="grafico" data-grafico=""></div>
        <p className="cuadro-nota" data-nota=""></p>
        <p className="panel-vacio" data-vacio=""></p>
      </div>

      <div className="panel-pie">
        <span className="panel-fuente">{panel.pie}</span>
        <AccionesDeCuadro acciones={panel.acciones} />
      </div>
    </section>
  );
}

/* Panel del Modelo 2 (backlog 33). Cada item se dibuja segun lo que declare el spec: con
   `accion` es un boton de verdad, que engancha comun.js por su data-utilidad (hoy solo
   "Exportar como PDF"); sin `accion` queda deshabilitado con "Proximamente" (Asistente IA).
   En el mockup los paneles no declaran ancho/alto; en la grilla generica los declara el spec. */
function PanelUtilidades({ panel }: { panel: Panel }) {
  return (
    <section
      className="panel panel-utilidades"
      data-ancho={panel.ancho ?? ""}
      data-alto={panel.alto ?? ""}
    >
      <h2 className="utilidades-titulo">{panel.titulo}</h2>
      <div className="utilidades-items">
        {(panel.items || []).map((item) =>
          item.accion ? (
            <button
              key={item.etiqueta}
              type="button"
              className="utilidad utilidad-activa"
              data-utilidad={item.accion}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.icono} alt="" />
              <span className="utilidad-nombre">{item.etiqueta}</span>
            </button>
          ) : (
            <span key={item.etiqueta} className="utilidad" title="Próximamente">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.icono} alt="" />
              <span className="utilidad-nombre">{item.etiqueta}</span>
              <span className="prox">Próximamente</span>
            </span>
          ),
        )}
      </div>
    </section>
  );
}

function SelectorCultivo({ filtro }: { filtro: Filtro }) {
  return (
    <div className="panel panel-selector">
      <div
        className="selector-cultivo"
        data-control="chips"
        data-filtro={filtro.id}
        data-valor={filtro.defecto}
        role="group"
        aria-label={filtro.etiqueta}
      >
        {filtro.opciones.map((opcion) =>
          opcion.grande ? (
            <button
              key={opcion.v}
              type="button"
              className="chip-grande"
              data-valor={opcion.v}
              aria-pressed={opcion.v === filtro.defecto ? "true" : "false"}
            >
              {opcion.t}
            </button>
          ) : (
            <button
              key={opcion.v}
              type="button"
              className="chip-cultivo"
              data-valor={opcion.v}
              aria-pressed={opcion.v === filtro.defecto ? "true" : "false"}
            >
              {opcion.icono ? (
                <span className="chip-ico-caja">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ico-bn" src={opcion.icono} alt="" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ico-color" src={opcion.icono_color} alt="" />
                </span>
              ) : (
                <span className="chip-ico-caja chip-ico-vacia"></span>
              )}
              <span className="chip-nombre">{opcion.t}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export default function Tablero({ pagina }: { pagina: PaginaTablero }) {
  const { tablero, paneles, filtros_panel: filtros, filtro_selector: selector } = pagina;
  const porId = Object.fromEntries(paneles.map((panel) => [panel.id, panel]));

  /* Las tarjetas de indicadores viven ARRIBA del tablero y solo en la disposicion generica
     (hacienda, stock). En el mockup Modelo 2 van dentro de la columna derecha, y la maqueta
     "Agri 2" directamente no tiene: va de los chips a los paneles. */
  const conIndicadoresArriba = !selector && tablero.disposicion !== "grilla-2x2";

  return (
    <Cascara pagina={pagina}>
      {conIndicadoresArriba ? (
        <>
          <div className="kpis" id="kpis">
            <TarjetasKpi contexto={tablero.tarjeta_contexto} />
          </div>
          {/* Aclaracion de las unidades abreviadas de los indicadores (formato_v1) */}
          <p className="kpis-nota" data-kpis-nota=""></p>
        </>
      ) : null}

      <noscript>
        <p className="noscript">El tablero se dibuja en el navegador. Habilitá JavaScript para verlo.</p>
      </noscript>

      {tablero.disposicion === "grilla-2x2" ? (
        // ---- DISPOSICION DE LA MAQUETA "Agri 2" (cultivos intensivos, 23-sep-2026) ----
        // Cuatro paneles en dos filas de a dos y nada mas: SIN selector global arriba (los
        // chips de producto viven adentro de los paneles que los dibuja JC) y SIN la tira de
        // utilidades abajo ("Más información" y "Generar PDF" son el pie de cada cuadro,
        // Francisco 23-sep-2026). El orden de los paneles es el de las anclas de la hoja de
        // JC y lo declara el spec; aca se buscan por id para que mover uno no toque este
        // archivo.
        <div
          className="tablero con-selector tablero-maqueta"
          id="tablero"
          data-datos={tablero.ruta_datos}
        >
          <div className="fila-tablero fila-maqueta">
            <PanelMockup panel={porId["combo"]} filtro={filtros["combo"]} />
            <PanelPrecios panel={porId["precios-mcba"]} />
          </div>
          <div className="fila-tablero fila-maqueta">
            <PanelMockup panel={porId["apiladas"]} filtro={filtros["apiladas"]} />
            <PanelMockup panel={porId["tabla-superficie"]} filtro={filtros["tabla-superficie"]} />
          </div>
        </div>
      ) : selector ? (
        // ---- DISPOSICION DEL MOCKUP MODELO 2 (cultivos, tercera tanda del 10-ago-2026) ----
        <div
          className="tablero con-selector tablero-mockup"
          id="tablero"
          data-datos={tablero.ruta_datos}
        >
          <div className="col-mapa">
            <PanelMockup panel={porId["mapa"]} filtro={filtros["mapa"]} />
            <PanelUtilidades panel={porId["utilidades"]} />
          </div>
          <div className="col-datos">
            <SelectorCultivo filtro={selector} />
            <div className="kpis kpis-grilla" id="kpis">
              <TarjetasKpi contexto={tablero.tarjeta_contexto} />
              <p className="kpis-nota" data-kpis-nota=""></p>
            </div>
            <div className="fila-tablero fila-graficos">
              <PanelMockup panel={porId["tendencia"]} filtro={filtros["tendencia"]} />
              <PanelMockup panel={porId["anillo"]} filtro={filtros["anillo"]} />
            </div>
            <div className="fila-tablero fila-tablas">
              {/* La celda izquierda apila la tabla de campañas y "Información relacionada",
                  como el mockup, y llena el hueco que dejaba la tabla sola */}
              <div className="pila-tablas">
                <PanelMockup panel={porId["tabla-datos"]} filtro={filtros["tabla-datos"]} />
                <PanelInformacion panel={porId["informacion-relacionada"]} />
              </div>
              <PanelMockup panel={porId["top"]} filtro={filtros["top"]} />
            </div>
          </div>
        </div>
      ) : (
        // ---- Disposicion generica en grilla de 12 (hacienda, stock) ----
        <div className="tablero" id="tablero" data-datos={tablero.ruta_datos}>
          {paneles.map((panel) =>
            panel.id === "utilidades" ? (
              <PanelUtilidades key={panel.id} panel={panel} />
            ) : (
              <PanelComun key={panel.id} panel={panel} filtro={filtros[panel.id]} />
            ),
          )}
        </div>
      )}

      <Arranque tipo="tablero" />
    </Cascara>
  );
}
