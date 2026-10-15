/* Tablero: la portada de una base (antes site/templates/tablero.html). Los indicadores y los
   paneles, todo en una pantalla.

   Este componente dibuja la CASCARA de cada panel (titulo, pie) y deja los huecos marcados con
   data-*; los llena src/tableros/cliente/tablero.js con la combinacion de filtros elegida.

   Las FORMAS de panel (anillo, mapa, tendencia, top, tabla-datos, combo, apiladas) son las
   mismas en todas las bases, a proposito: el protocolo de JC pide que los formatos se
   repitan. Si aparece una forma nueva se agrega un bloque en CuerpoPanel y su
   dibujante en tablero.js, una sola vez, y queda disponible para todas.

   Tres disposiciones (deciden los specs con `tablero.disposicion`, no este archivo):
     - "mockup" CON selector grande (zona `selector`): el tablero de cultivos extensivos,
       CALCADO de la hoja "Agri 1" de JC. Columna izquierda: el mapa GRANDE, el solo. Columna
       derecha: chips de cultivo, tarjeta de contexto + KPIs, fila de graficos
       (tendencia | anillo) y fila de tablas (datos por campaña | ranking), con las dos
       acciones del pie SUELTAS debajo de la tabla de campañas ("Más información →" y
       "Generar PDF"), alineadas a la derecha como las dibuja JC.
       Los paneles "UTILIDADES" e "Información relacionada" del mockup Modelo 2 de agosto se
       SACARON el 2-oct-2026: no estan en ninguna hoja de JC (Francisco, "apegate al 100% a
       la estructura que plantea JC en las maquetas").
       SIN links "ver detalle": las unicas salidas son los botones de cabecera y el click del
       mapa.
     - "grilla-2x2": la maqueta "Agri 2" de JC (cultivos intensivos). Cuatro paneles en dos
       filas de a dos y nada mas. SIN indicadores (la maqueta va de los chips directo a los
       paneles) y SIN selector grande arriba: los chips de producto viven ADENTRO de los dos
       paneles que los dibuja JC, manejados por el mismo filtro. Ahi "Más información →" y
       "Generar PDF" son el pie de CADA cuadro (Francisco, 23-sep-2026), no una tira suelta.
     - SIN selector: grilla de 12 columnas con `data-ancho`/`data-alto` del spec (hacienda,
       stock), con los indicadores arriba y "Ver detalle" donde el spec lo declare.

   Sin badges de tipo de grafico: los saco JC el 10-ago-2026. */
import type {
  AccionDeCuadro,
  CapaDeMapa,
  ComparacionDeCuadro,
  Filtro,
  PaginaTablero,
  Panel,
} from "@/tableros/tipos";
import Arranque from "./Arranque";
import Cascara from "./Cascara";
import Glosa from "./Glosa";

function TarjetasKpi({ contexto, cantidad = 4 }: { contexto: boolean; cantidad?: number }) {
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
      {Array.from({ length: cantidad }, (_, indice) => indice).map((indice) => (
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

/* Disposicion "columnas" (ganaderia): los paneles se reparten en BANDAS. Cada banda tiene
   dos columnas que se apilan cada una a su ritmo, asi una tabla corta no deja un hueco al
   lado de un mapa alto (en la grilla de 12, la fila tomaba el alto del cuadro mas alto). Un
   panel de ancho 12 corta la banda y va solo, a todo el ancho.
   La columna la dice el spec (`columna: izq | der`); si no, el ancho: hasta 5 va a la
   izquierda y de 6 en adelante a la derecha. El ancho de la izquierda es el mayor de sus
   paneles y la derecha se queda con el resto de las 12. */
type Banda =
  | { ancha: Panel }
  | { fila: Panel[]; titulo?: string }
  | { izq: Panel[]; der: Panel[]; anchoIzq: number; centro: Panel[]; anchoCentro: number };

function bandasEnColumnas(paneles: Panel[]): Banda[] {
  const bandas: Banda[] = [];
  let actual: { izq: Panel[]; der: Panel[]; anchoIzq: number; centro: Panel[];
                anchoCentro: number } | null = null;
  let fila: Panel[] | null = null;
  let tituloFila: string | undefined;
  for (const panel of paneles) {
    const ancho = Number(panel.ancho ?? 4);
    // `columna: fila`: los paneles consecutivos que lo declaran van LADO A LADO, cada uno con
    // su ancho (tres anillos, dos graficos de precio). Es una banda aparte.
    if (panel.columna === "fila") {
      if (actual) bandas.push(actual);
      actual = null;
      // Un panel con `titulo_fila` abre una fila NUEVA con ese titulo encima (el que JC
      // escribe sobre sus dos graficos de precio).
      if (fila && panel.titulo_fila) {
        bandas.push({ fila, titulo: tituloFila });
        fila = null;
      }
      if (!fila) {
        fila = [];
        tituloFila = panel.titulo_fila;
      }
      fila.push(panel);
      continue;
    }
    if (fila) {
      bandas.push({ fila, titulo: tituloFila });
      fila = null;
    }
    if (ancho >= 12) {
      if (actual) bandas.push(actual);
      actual = null;
      bandas.push({ ancha: panel });
      continue;
    }
    // `nueva_banda` (spec): este panel abre una banda nueva. Sirve para emparejar alturas:
    // un grafico con su tabla en una banda, el siguiente par en otra.
    if (panel.nueva_banda && actual) {
      bandas.push(actual);
      actual = null;
    }
    if (!actual) actual = { izq: [], der: [], anchoIzq: 0, centro: [], anchoCentro: 0 };
    const columna = panel.columna ?? (ancho <= 5 ? "izq" : "der");
    if (columna === "izq") {
      actual.izq.push(panel);
      actual.anchoIzq = Math.max(actual.anchoIzq, ancho);
    } else if (columna === "centro") {
      // Tercera columna (la hoja "GanApi" de JC tiene tres: mapa y anillo | tabla | ranking).
      actual.centro.push(panel);
      actual.anchoCentro = Math.max(actual.anchoCentro, ancho);
    } else {
      actual.der.push(panel);
    }
  }
  if (fila) bandas.push({ fila, titulo: tituloFila });
  if (actual) bandas.push(actual);
  return bandas;
}

// El CUERPO de cada forma de panel: compartido por las dos disposiciones
// Ids de panel que se dibujan con una FORMA que ya existe. El dibujante se busca por id
// (una pagina puede tener dos anillos o dos graficos de lineas), pero el cuerpo es el de su
// forma: asi no se repite el markup por cada id nuevo.
const FORMA_DEL_PANEL: Record<string, string> = {
  "anillo-departamentos": "anillo",
  "anillo-estratos": "anillo",
  "anillo-estratos-up": "anillo",
  "precios-faena-1": "lineas",
  "evolucion-vs-otra": "evolucion-total",
  "precios-faena-2": "lineas",
  "precios-leche-1": "lineas",
  "precios-razas-1": "lineas",
  "precios-razas-2": "lineas",
  "tabla-categorias": "tabla-estratos",
  "tabla-eac": "tabla-estratos",
  "tabla-relaciones": "tabla-estratos",
  "tabla-ranking": "tabla-estratos",
  "tabla-anios-deptos-cab": "tabla-estratos",
  "tabla-anios-deptos-tn": "tabla-estratos",
  "tabla-anios-razas-cab": "tabla-estratos",
  "tabla-anios-razas-tn": "tabla-estratos",
  "tabla-peso-razas": "tabla-estratos",
  "precios-categorias": "lineas",
  "tabla-hilton": "tabla-estratos",
  "tabla-tambo": "tabla-estratos",
  "tabla-razas": "tabla-estratos",
  "tabla-razas-departamentos": "tabla-estratos",
  "anillo-razas": "anillo",
  "precios-leche-2": "lineas",
  "tabla-cuenca": "tabla-estratos",
  "tabla-calidad": "tabla-estratos",
  "tabla-faena": "tabla-estratos",
  "tabla-departamento-estratos": "tabla-estratos",
  "tabla-tipos": "tabla-estratos",
  "tabla-balance": "tabla-estratos",
  "tabla-provincias-destino": "tabla-estratos",
  "tabla-provincias-origen": "tabla-estratos",
  "anillo-categorias": "anillo",
  "anillo-provincias-destino": "anillo",
  "anillo-provincias-origen": "anillo",
  // General > Infraestructura y riesgo (capas del IGN, 14-oct-2026)
  "tabla-red-vial": "tabla-estratos",
  "tabla-ferrocarril": "tabla-estratos",
  "tabla-eventos-departamento": "tabla-estratos",
  "tabla-sinagir": "tabla-estratos",
  "anillo-eventos": "anillo",
  // AgroClima > Estaciones agrometeorologicas INTA (14-oct-2026): la tabla diaria y la linea
  // de temperatura usan formas que ya existen.
  "tabla-diaria": "tabla-estratos",
  "lineas-temperatura": "lineas",
};

/* El control de las CAPAS DEL IGN de un mapa (rutas, caminos rurales, ferrocarril y
   estaciones; pedido de JC del 14-oct-2026). Un checkbox por capa, en el orden del spec.

   Dos modos, los decide el build (`capas_modo`):
     - "desplegable": sobre un mapa de CALOR. Un boton chico arriba a la derecha del cuadro
       que despliega la lista por encima del mapa; cerrado no ocupa lugar en el layout, asi
       que con las capas apagadas el cuadro es el de siempre. Las capas arrancan apagadas.
     - "lista": en la portada de Infraestructura y riesgo, donde las capas SON el dato. La
       lista va a la vista arriba del mapa y hace de leyenda.
   Las muestras de color y los trazos de cada capa los pinta src/tableros/cliente/capas.js con
   el estilo del protocolo: aca no hay ningun color. Los checkbox NO llevan `data-control`:
   prender una capa no cambia la combinacion de filtros, solo el dibujo de ESTE mapa. */
function ControlCapas({ capas, modo, rotulo }: { capas?: CapaDeMapa[]; modo?: string; rotulo?: string }) {
  if (!capas || capas.length === 0) return null;
  const lista = (
    <ul className="capas-lista">
      {capas.map((capa) => (
        <li key={capa.id} data-capa-item={capa.id}>
          <label>
            <input type="checkbox" data-capa={capa.id} defaultChecked={capa.prendida} />
            <span className="capas-muestra" data-muestra-capa={capa.id}></span>
            <span className="capas-etiqueta">{capa.etiqueta}</span>
          </label>
          <span className="capas-variantes" data-variantes-capa={capa.id}></span>
        </li>
      ))}
    </ul>
  );
  if (modo === "lista") {
    return <div className="capas capas-a-la-vista" data-capas="">{lista}</div>;
  }
  return (
    <details className="capas capas-desplegable" data-capas="">
      <summary>{rotulo}</summary>
      {lista}
    </details>
  );
}

function CuerpoPanel({ id: idPanel, mockup = false, panel }: { id: string; mockup?: boolean; panel?: Panel }) {
  const id = idPanel.startsWith("imagen-") ? "imagen"
    : idPanel.startsWith("texto-") ? "texto"
    // Una tabla escrita en el spec (equivalencias de categorias de "GanBuba ST").
    : idPanel.startsWith("fija-") ? "tabla-estratos"
    : idPanel.startsWith("cifras-") ? "cifras"
    // Un anillo escrito en el spec (categorias de la faena equina de SENASA).
    : idPanel.startsWith("anillo-fijo-") ? "anillo"
    // Bloques de tarjetas con miniatura que llevan a otras paginas (portada de AgroClima).
    : idPanel.startsWith("accesos-") ? "accesos"
    // Contenido de un ejemplar de otro organismo: imagenes con su texto y parrafos ("Destacados"
    // de AgroMet en la portada de AgroClima).
    : idPanel.startsWith("destacados-") ? "destacados"
    : (FORMA_DEL_PANEL[idPanel] ?? idPanel);
  let cuerpo = null;
  if (id === "destacados") {
    /* "Destacados" de la hoja "Clima Ingreso" de JC: la primera pagina del ultimo AgroMet. Dos
       imagenes lado a lado con su texto debajo y, a todo el ancho, los parrafos del "Estado de
       los cultivos". Todo el contenido viene del spec por el JSON; lo arma tablero.js. */
    cuerpo = <div className="destacados" data-destacados=""></div>;
  } else if (id === "accesos") {
    /* Las tarjetas de la portada de AgroClima ("Datos e informes" y "Mapas" de la hoja "Clima
       Ingreso" de JC): miniatura + texto, cada una un link a su pagina. Las arma tablero.js con
       lo que manda el build; una tarjeta sin pagina todavia va apagada con "Próximamente". */
    cuerpo = <div className="accesos" data-accesos=""></div>;
  } else if (id === "mapa-estaciones") {
    /* El mapa de la provincia con las estaciones del INTA como puntos (hoja "ClimEAI"): es el
       selector de la pagina. El clic en un punto aprieta el chip de esa estacion de la lista de
       arriba, que es la misma eleccion hecha con el teclado. */
    cuerpo = <div className="grafico" data-grafico=""></div>;
  } else if (id === "cifras") {
    // Tarjetas de cifras y, debajo, una serie en lineas (caravanas bovinas de SENASA).
    cuerpo = (
      <>
        <div className="cifras" data-cifras=""></div>
        <p className="cifras-serie" data-cifras-serie=""></p>
        <div className="grafico" data-grafico=""></div>
      </>
    );
  } else if (id === "texto") {
    // Un texto de JC (metodologia de la hoja "GanBov IN"). Los parrafos los pinta tablero.js.
    cuerpo = <div className="cuadro-texto" data-texto=""></div>;
  } else if (id === "imagen") {
    // Una captura publicada por otro organismo (caravanas de SENASA). La pinta tablero.js.
    cuerpo = (
      <figure className="cuadro-imagen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-imagen="" alt="" />
      </figure>
    );
  } else if (id === "anillo") {
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
  } else if (id === "mapa-capas") {
    /* El mapa de la portada de Infraestructura y riesgo: los departamentos de fondo neutro y
       las capas del IGN encima, con la lista de capas a la vista (es su leyenda). */
    cuerpo = (
      <>
        <ControlCapas capas={panel?.capas} modo={panel?.capas_modo} rotulo={panel?.capas_rotulo} />
        <div className="grafico" data-grafico=""></div>
      </>
    );
  } else if (id === "mapa") {
    cuerpo = (
      <>
        {/* Las capas del IGN, si el spec las ofrece: un desplegable que flota sobre el mapa y
            no le quita lugar. Sin capas no se dibuja nada y el cuadro es el de siempre. */}
        <ControlCapas capas={panel?.capas} modo={panel?.capas_modo} rotulo={panel?.capas_rotulo} />
        <div className="grafico" data-grafico=""></div>
        {/* Las cinco muestras de la escala (una por quintil, con su tramo debajo) y la unidad
            una sola vez, como las dibuja JC bajo el mapa en su maqueta. Las llena tablero.js
            con los tramos que ya vienen escritos del build. */}
        <div className="escala" data-escala=""></div>
        <p className="escala-unidad" data-escala-unidad=""></p>
        <p className="total-provincial" data-total=""></p>
        {/* Que es cada trazo de las capas PRENDIDAS. Vacia (y sin dibujarse) con todo apagado.
            Va tambien al PDF, donde el desplegable no sale. */}
        {panel?.capas?.length ? <ul className="capas-leyenda" data-leyenda-capas=""></ul> : null}
        {/* La invitacion a elegir departamento va DEBAJO del mapa y su escala, que es donde
            la escribe JC en las dos hojas de su maqueta ("seleccione departamento para..." en
            "Agri 1" y "Seleccione otro departamento si desea visualizar" en "Agri 1 Dto").
            Antes estaba arriba, en una pildora: con el texto largo de la hoja departamental
            entraba en dos renglones y empujaba el mapa hacia abajo. */}
        <p className="mapa-accion" data-accion=""></p>
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
  } else if (id === "grafico-pct") {
    /* Pasturas y forrajes: las barras apiladas AL 100% de JC. Mismo cuerpo que `apiladas` -el
       dibujante es el mismo- pero sin la tabla debajo, porque acá la tabla es un cuadro aparte
       (JC le da su propio recuadro en la hoja, al lado del gráfico). */
    cuerpo = (
      <>
        <div className="grafico" data-grafico=""></div>
        <ul className="leyenda-series" data-leyenda=""></ul>
      </>
    );
  } else if (id === "lineas") {
    // Varias lineas con su leyenda dibujada por ECharts (precios de faena de bubalinos).
    cuerpo = <div className="grafico" data-grafico=""></div>;
  } else if (id === "grafico-ha") {
    // Las seis líneas en hectáreas. Su leyenda la dibuja ECharts, como en `tendencia`.
    cuerpo = <div className="grafico" data-grafico=""></div>;
  } else if (id === "evolucion-total" || id === "evolucion-categorias") {
    // Ganadería, hoja "GanBov ST": barras apiladas por año. Su leyenda la dibuja el sitio
    // (es la lista de categorías), igual que en `apiladas` de cultivos intensivos.
    cuerpo = (
      <>
        <div className="grafico" data-grafico=""></div>
        <ul className="leyenda-series" data-leyenda=""></ul>
      </>
    );
  } else if (id === "tabla-datos" || id === "tabla-superficie"
             || id === "tabla-pct" || id === "tabla-ha"
             || id === "tabla-departamentos" || id === "tabla-evolucion"
             || id === "tabla-departamento-anios" || id === "tabla-estratos") {
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
              /* Que bloque del popup abre ESTE boton. En la hoja "Agri 2" hay dos "Más
                 información", uno por columna, con contenido distinto; en la "Agri 1" hay uno
                 solo y esto no viaja. */
              data-variante={accion.variante ?? undefined}
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

/* CRUZAR DATOS: los dos controles del zoom (Francisco, 24-sep-2026).

   Viven adentro del panel y OCULTOS: en el tablero no se dibujan -la maqueta de JC son cuatro
   cuadros y una pantalla, y meterle selectores de comparacion rompe justo eso- y es el zoom el
   que los muda a su barra al ampliar el cuadro, los muestra y los devuelve al cerrar. Van
   adentro del panel porque son SUYOS: cada cuadro compara lo que su spec le habilita.

   No llevan `data-control`: no forman parte de la clave de la combinacion de la pagina. Lo
   que hacen es pedir una SEGUNDA clave (el mismo cuadro con otro valor del filtro) o una
   segunda medida, y de eso se encarga comun.js.

   Arrancan los dos apagados, con la opcion "sin comparacion" / "ninguna" primera y elegida. */
function ControlesDeComparacion({ comparacion }: { comparacion?: ComparacionDeCuadro | null }) {
  if (!comparacion) return null;
  return (
    <div
      className="comparar"
      hidden
      data-comparar=""
      data-filtro-base={comparacion.filtro}
      data-serie={comparacion.plantilla_serie}
      data-titulo={comparacion.plantilla_titulo}
      data-titulo-medida={comparacion.plantilla_titulo_medida}
      data-nota={comparacion.plantilla_nota}
    >
      <label className="comparar-control">
        <span className="rotulo">{comparacion.rotulo}</span>
        <select className="filtro-select" data-comparar-valor="" defaultValue="">
          <option value="">{comparacion.ninguno}</option>
          {comparacion.opciones.map((opcion) => (
            <option key={opcion.v} value={opcion.v}>
              {opcion.t}
            </option>
          ))}
        </select>
      </label>
      {comparacion.medidas ? (
        <label className="comparar-control">
          <span className="rotulo">{comparacion.medidas.rotulo}</span>
          <select className="filtro-select" data-comparar-medida="" defaultValue="">
            <option value="">{comparacion.medidas.ninguna}</option>
            {comparacion.medidas.opciones.map((opcion) => (
              <option key={opcion.v} value={opcion.v}>
                {opcion.t}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {/* Lo que la comparacion NO hace, dicho donde se la prende: el PDF es siempre el tablero
          completo (decision registrada en el spec de cada tablero). */}
      <p className="comparar-nota">{comparacion.nota}</p>
    </div>
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

/* Los paneles de UNA columna, de arriba abajo. Dos paneles seguidos con `en_par` van lado a
   lado dentro de la columna (los dos anillos de estratos de "GanBuba ST", que JC pega uno al
   lado del otro debajo de su tabla por departamento). */
function PanelesDeColumna({ paneles, filtros }: { paneles: Panel[]; filtros: Record<string, Filtro> }) {
  const grupos: Panel[][] = [];
  for (const panel of paneles) {
    const ultimo = grupos[grupos.length - 1];
    if (panel.en_par && ultimo && ultimo.length === 1 && ultimo[0].en_par) {
      ultimo.push(panel);
    } else {
      grupos.push([panel]);
    }
  }
  return (
    <>
      {grupos.map((grupo) =>
        grupo.length > 1 ? (
          <div className="par-en-columna" key={grupo[0].id}>
            {grupo.map((panel) => (
              <PanelComun key={panel.id} panel={panel} filtro={filtros[panel.id]} />
            ))}
          </div>
        ) : (
          <PanelComun key={grupo[0].id} panel={grupo[0]} filtro={filtros[grupo[0].id]} />
        ),
      )}
    </>
  );
}

function PanelComun({ panel, filtro }: { panel: Panel; filtro?: Filtro }) {
  return (
    <section
      className="panel"
      data-panel={panel.id}
      data-ancho={panel.ancho}
      data-alto={panel.alto}
      data-scroll-interno={panel.scroll_interno ? "" : undefined}
      data-compacta={panel.compacta ? "" : undefined}
      data-solo-provincia={panel.solo_provincia ? "" : undefined}
      data-nota-al-lado={panel.nota_al_lado || undefined}
    >
      <div className="panel-cab">
        <div>
          <h2 data-titulo="">
            <Glosa texto={panel.titulo} partes={panel.titulo_partes} />
          </h2>
          <p className="panel-sub" data-subtitulo="">
            <Glosa texto={panel.subtitulo} partes={panel.subtitulo_partes} />
          </p>
        </div>
        <TogglePanel filtro={filtro} />
      </div>

      <div className={panel.capas?.length ? "panel-cuerpo con-capas" : "panel-cuerpo"}>
        <CuerpoPanel id={panel.id} panel={panel} />
      </div>

      <div className="panel-pie">
        <span className="panel-fuente" data-pie=""></span>
        <PieDeCapas panel={panel} />
        {/* Las acciones del cuadro (hoy "Zoom") tambien en la disposicion generica: la tira
            de acciones al pie es del CUADRO, no de una disposicion. Cada panel declara las
            suyas en el spec; un cuadro sin gráfico no lleva ninguna y esto no dibuja nada. */}
        <AccionesDeCuadro acciones={panel.acciones} />
        {/* El enlace solo aparece si la seccion ya tiene su vista de detalle construida */}
        {panel.detalle ? (
          <a className="panel-detalle" href={panel.detalle} data-conserva="">
            Ver detalle →
          </a>
        ) : null}
      </div>

      <ControlesDeComparacion comparacion={panel.comparacion} />
    </section>
  );
}

/* La cita de las capas del IGN PRENDIDAS, al pie del cuadro y al lado de la de sus datos
   (regla de JC: fuente al pie de todo lo que se dibuja). La escribe capas.js con las fuentes
   que manda el build; vacia, no se ve. */
function PieDeCapas({ panel }: { panel: Panel }) {
  if (!panel.capas?.length) return null;
  return <span className="panel-fuente-capas" data-pie-capas=""></span>;
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
          <TogglePanel filtro={filtro} />
        </div>
      ) : panel.id !== "tabla-datos" ? (
        /* `tabla-datos` es el unico panel sin titulo (asi lo dibuja el mockup Modelo 2). La
           tabla de superficies de la maqueta "Agri 2" SI lo lleva, porque el titulo es de JC
           ("Estimaciones de superficies cosechadas (*)") y porque depende de los selectores. */
        <div className="panel-cab panel-cab-mockup">
          {conIconos && filtro ? <ChipsPanel filtro={filtro} /> : null}
          <h2 data-titulo="">
            <Glosa texto={panel.titulo} partes={panel.titulo_partes} />
          </h2>
          <p className="panel-sub" data-subtitulo="">
            <Glosa texto={panel.subtitulo} partes={panel.subtitulo_partes} />
          </p>
          {conIconos ? null : <TogglePanel filtro={filtro} />}
        </div>
      ) : null}
      <div className={panel.capas?.length ? "panel-cuerpo con-capas" : "panel-cuerpo"}>
        <CuerpoPanel id={panel.id} mockup panel={panel} />
      </div>
      <div className="panel-pie">
        <span className="panel-fuente" data-pie=""></span>
        <PieDeCapas panel={panel} />
        <AccionesDeCuadro acciones={panel.acciones} />
      </div>
      <ControlesDeComparacion comparacion={panel.comparacion} />
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
  const {
    tablero,
    paneles,
    filtros_panel: filtros,
    filtro_selector: selector,
    acciones_tablero: accionesDelPie,
  } = pagina;
  const porId = Object.fromEntries(paneles.map((panel) => [panel.id, panel]));

  /* Las tarjetas de indicadores viven ARRIBA del tablero y solo en la disposicion generica
     (hacienda, stock). En el mockup Modelo 2 van dentro de la columna derecha, y la maqueta
     "Agri 2" directamente no tiene: va de los chips a los paneles. */
  const conIndicadoresArriba = !selector && tablero.disposicion !== "grilla-2x2";

  /* Como resuelve el alto, decidido por el SPEC (site_build.ALTOS_DE_TABLERO) y no por este
     archivo: con "fluye" el tablero lleva la clase `alto-fluido`, que en el CSS le devuelve a
     cada cuadro un alto donde el dibujo se lea y deja que la pagina scrollee, y que tablero.js
     mira para no fijarle el alto de la ventana. Sin ella sigue el comportamiento de siempre
     (entra todo en una pantalla). */
  /* El unico embudo de clases del nodo del tablero. `mapa-por-departamento` es la que
     habilita la regla que esconde el mapa mientras no haya departamento elegido: va colgada
     de ESTA clase y no de `#tablero`, que es el id de todos los tableros del sitio. */
  const clasesTablero = (base: string) => {
    const clases = [base];
    if (tablero.alto === "fluye") { clases.push("alto-fluido"); }
    if (tablero.mapa_por_departamento) { clases.push("mapa-por-departamento"); }
    return clases.join(" ");
  };

  return (
    <Cascara pagina={pagina}>
      {conIndicadoresArriba ? (
        <>
          <div className="kpis" id="kpis">
            <TarjetasKpi contexto={tablero.tarjeta_contexto} cantidad={tablero.kpis ?? 4} />
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
          className={clasesTablero("tablero con-selector tablero-maqueta")}
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
          className={clasesTablero("tablero con-selector tablero-mockup")}
          id="tablero"
          data-datos={tablero.ruta_datos}
        >
          <div className="col-mapa">
            <PanelMockup panel={porId["mapa"]} filtro={filtros["mapa"]} />
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
              {/* La celda izquierda apila la tabla de campañas y, debajo, las dos acciones
                  del pie SUELTAS y alineadas a la derecha, que es exactamente donde las
                  dibuja JC en su hoja "Agri 1". No van adentro de ningun panel: en la maqueta
                  no hay ninguna caja alrededor. */}
              <div className="pila-tablas">
                <PanelMockup panel={porId["tabla-datos"]} filtro={filtros["tabla-datos"]} />
                <div className="acciones-tablero">
                  <AccionesDeCuadro acciones={accionesDelPie} />
                </div>
              </div>
              <PanelMockup panel={porId["top"]} filtro={filtros["top"]} />
            </div>
          </div>
        </div>
      ) : tablero.disposicion === "columnas" ? (
        // ---- Disposicion en COLUMNAS (ganaderia): bandas de dos columnas independientes ----
        <div className={clasesTablero("tablero tablero-columnas")} id="tablero"
             data-datos={tablero.ruta_datos}>
          {bandasEnColumnas(paneles).map((banda, i) =>
            "fila" in banda ? (
              <div className="banda-con-titulo" key={i}>
                {banda.titulo ? <h2 className="titulo-banda">{banda.titulo}</h2> : null}
                <div className="banda-en-fila">
                  {banda.fila.map((panel) => (
                    <PanelComun key={panel.id} panel={panel} filtro={filtros[panel.id]} />
                  ))}
                </div>
              </div>
            ) : "ancha" in banda ? (
              <div className="banda-ancha" key={i}>
                <PanelComun panel={banda.ancha} filtro={filtros[banda.ancha.id]} />
              </div>
            ) : (
              <div
                className="banda-columnas"
                key={i}
                style={{
                  gridTemplateColumns: banda.centro.length
                    ? `minmax(0, ${banda.anchoIzq || 4}fr) minmax(0, ${banda.anchoCentro}fr) minmax(0, ${12 - (banda.anchoIzq || 4) - banda.anchoCentro}fr)`
                    : banda.izq.length && banda.der.length
                    ? `minmax(0, ${banda.anchoIzq || 4}fr) minmax(0, ${12 - (banda.anchoIzq || 4)}fr)`
                    : "minmax(0, 1fr)",
                }}
              >
                {banda.izq.length ? (
                  <div className="columna">
                    <PanelesDeColumna paneles={banda.izq} filtros={filtros} />
                  </div>
                ) : null}
                {banda.centro.length ? (
                  <div className="columna">
                    <PanelesDeColumna paneles={banda.centro} filtros={filtros} />
                  </div>
                ) : null}
                {banda.der.length ? (
                  <div className="columna">
                    <PanelesDeColumna paneles={banda.der} filtros={filtros} />
                  </div>
                ) : null}
              </div>
            ),
          )}
        </div>
      ) : (
        // ---- Disposicion generica en grilla de 12 (hacienda, stock) ----
        <div className={clasesTablero("tablero")} id="tablero" data-datos={tablero.ruta_datos}>
          {paneles.map((panel) => (
            <PanelComun key={panel.id} panel={panel} filtro={filtros[panel.id]} />
          ))}
        </div>
      )}


      {/* Las notas metodologicas, al pie y con su ancla. La pestaña "Metodología" de la
          banda apunta acá: en el Excel de JC ese hipervínculo no salta a otra hoja, apunta a
          una celda de la suya (la celda BD5 de "Agri 3" lleva a 'Agri 3'!H79). */}
      {pagina.notas.length ? (
        <div className="notas" id="metodologia">
          {pagina.notas.map((nota, i) => (
            /* ABIERTO: en la hoja de JC el texto de metodología está a la vista, en un
               recuadro al pie, no plegado detrás de un título. Sigue siendo <details> para
               que se pueda cerrar. */
            <details key={i} open className={nota.texto.length > 400 ? "nota-larga" : undefined}>
              <summary>{nota.titulo}</summary>
              <p>
                <Glosa texto={nota.texto} partes={nota.texto_partes} />
              </p>
            </details>
          ))}
        </div>
      ) : null}

      {/* Las acciones sueltas del pie, alineadas a la derecha. En la grilla generica van
          DESPUES del tablero y no adentro, porque esa grilla reparte celdas de 12 columnas y
          una tira de botones no es una celda. Es donde las dibuja JC en pasturas y forrajes
          ("Generar PDF", celda BF77) igual que en la hoja "Agri 1" de extensivos. */}
      {/* La condicion es la MISMA con la que se elige la grilla generica unas lineas mas
          arriba, y no `disposicion !== "mockup"`: `mockup` es el valor por defecto y lo
          traen tambien los tableros que caen en la grilla generica, asi que mirar eso
          dejaba la tira sin dibujar. */}
      {!selector && tablero.disposicion !== "grilla-2x2" && accionesDelPie?.length ? (
        <div className="acciones-tablero">
          <AccionesDeCuadro acciones={accionesDelPie} />
        </div>
      ) : null}

      <Arranque tipo="tablero" />
    </Cascara>
  );
}
