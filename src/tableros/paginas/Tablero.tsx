/* Tablero: la portada de una base (antes site/templates/tablero.html). Los indicadores y los
   paneles, todo en una pantalla.

   Este componente dibuja la CASCARA de cada panel (titulo, pie) y deja los huecos marcados con
   data-*; los llena src/tableros/cliente/tablero.js con la combinacion de filtros elegida.

   Las FORMAS de panel (anillo, mapa, tendencia, top, tabla-datos, utilidades) son las mismas
   en todas las bases, a proposito: el protocolo de JC pide que los formatos se repitan. Si
   aparece una forma nueva se agrega un bloque en CuerpoPanel y su dibujante en tablero.js.

   Dos disposiciones (deciden los specs, no este archivo):
     - CON selector grande (zona `selector`): el tablero de cultivos, CALCADO del mockup
       Modelo 2 de JC (tercera tanda del 10-ago-2026). Columna izquierda: mapa GRANDE +
       UTILIDADES. Columna derecha: chips de cultivo, tarjeta de contexto + KPIs, fila de
       graficos (tendencia | anillo) y fila de tablas (datos por campaña | ranking). SIN links
       "ver detalle": las unicas salidas son los botones de cabecera y el click del mapa.
     - SIN selector: grilla de 12 columnas con `data-ancho`/`data-alto` del spec (hacienda,
       stock), con los indicadores arriba y "Ver detalle" donde el spec lo declare.

   Sin badges de tipo de grafico: los saco JC el 10-ago-2026. */
import type { Filtro, PaginaTablero, Panel } from "@/tableros/tipos";
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
  } else if (id === "tabla-datos") {
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
  return (
    <section className="panel" data-panel={panel.id}>
      {panel.id === "mapa" ? (
        <div className="mapa-cab">
          <p className="mapa-accion" data-accion=""></p>
          <TogglePanel filtro={filtro} />
        </div>
      ) : panel.id !== "tabla-datos" ? (
        <div className="panel-cab panel-cab-mockup">
          <h2 data-titulo="">{panel.titulo}</h2>
          <TogglePanel filtro={filtro} />
        </div>
      ) : null}
      <div className="panel-cuerpo">
        <CuerpoPanel id={panel.id} mockup />
      </div>
      <div className="panel-pie">
        <span className="panel-fuente" data-pie=""></span>
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

/* Panel ESTATICO del Modelo 2 (backlog 33): iconos deshabilitados con "Proximamente". En el
   mockup los paneles no declaran ancho/alto; en la grilla generica los declara el spec. */
function PanelUtilidades({ panel }: { panel: Panel }) {
  return (
    <section
      className="panel panel-utilidades"
      data-ancho={panel.ancho ?? ""}
      data-alto={panel.alto ?? ""}
    >
      <h2 className="utilidades-titulo">{panel.titulo}</h2>
      <div className="utilidades-items">
        {(panel.items || []).map((item) => (
          <span key={item.etiqueta} className="utilidad" title="Próximamente">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.icono} alt="" />
            <span className="utilidad-nombre">{item.etiqueta}</span>
            <span className="prox">Próximamente</span>
          </span>
        ))}
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

  return (
    <Cascara pagina={pagina}>
      {!selector ? (
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

      {selector ? (
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
