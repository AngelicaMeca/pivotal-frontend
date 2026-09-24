// Forma del JSON de cada pagina (src/tableros/contenido/paginas/<ruta>.json). Lo escribe
// tableros/pipeline/site_build.py -> escribir_sitio(); aca solo se describe lo que se lee.

export type Opcion = {
  v: string;
  t: string;
  corto?: string;
  icono?: string;
  icono_color?: string;
  grande?: boolean;
};

export type Filtro = {
  id: string;
  etiqueta: string;
  defecto: string;
  control: "chips" | "select";
  zona: string;
  opciones: Opcion[];
  panel?: string;
};

export type PasoMiga = { texto: string; href?: string | null; dinamico?: string };

export type SectorMenu = {
  id: string;
  titulo: string;
  actual: boolean;
  secciones: { titulo: string; url: string; actual: boolean }[];
};

export type Enlace = { texto: string; href: string };

export type Theme = {
  titulo_sitio: string;
  pie: string;
  pie_tecnologia: string;
  logo_provincia: { archivo?: string; nombre?: string; bajada?: string };
};

// Lo que la cascara (base.html) pedia en todas las paginas
export type Comun = {
  plantilla: string;
  // Prefijo de los tableros dentro del sitio (/plataforma) y URL de su home
  base: string;
  inicio: string;
  theme: Theme;
  titulo_pestania: string;
  titulo_cabecera: string;
  subtitulo_cabecera: string | null;
  fecha_datos: string;
  miga: PasoMiga[] | null;
  menu: SectorMenu[];
  con_menu: boolean;
  clase_cuerpo: string;
  filtros_periodo: Filtro[];
  filtros_barra: Filtro[];
  pestanias: { texto: string; href: string; actual: boolean }[];
  botones_cabecera: Enlace[];
  banderas_idioma: { codigo: string; nombre: string; activa: boolean }[];
};

export type Elemento = {
  titulo: string;
  subtitulo: string;
  pie: string;
  nota?: string;
  clase?: string;
  advertencia?: string;
};

export type Vista = {
  slug: string;
  tipo: string;
  titulo: string;
  reservada: boolean;
  motivo_reserva: string | null;
  advertencias: string[];
  ruta_datos: string;
  notas: { titulo: string; texto: string }[];
  enlaces: Enlace[];
  elementos_default: Elemento[];
};

// Un item del pie de un cuadro: "Más información →" o "Generar PDF". Lo dibuja JC al pie de
// cada cuadro de la maqueta "Agri 2" y reemplaza al panel de utilidades unico del final.
// Con `accion` es un boton de verdad (la engancha comun.js); con `href` es un link; sin
// ninguna de las dos queda deshabilitado con su `rotulo`.
export type AccionDeCuadro = {
  id: string;
  etiqueta: string;
  flecha: boolean;
  href: string | null;
  accion: string | null;
  rotulo: string;
  icono?: string;
};

// El panel de precios del MCBA (base 8), el cuarto cuadro de la maqueta "Agri 2". Tiene
// filtros PROPIOS -grupo, especie y cuatro dimensiones de producto, mas el modo y el rango- que
// no viajan en las combinaciones del tablero, y su propio JSON partido por especie y por modo.
// Esto es la CASCARA: los desplegables se llenan y el grafico se dibuja en tablero.js.
export type PanelPrecios = {
  familia: string;
  pestanias: { id: string; etiqueta: string; actual: boolean; especie: string }[];
  chips: { v: string; t: string; grupo: string; archivos: Record<string, string> }[];
  dimensiones: { id: string; rotulo: string }[];
  modo: { rotulo: string; opciones: Opcion[]; defecto: string };
  rango: { inicio: string; fin: string };
  // Plantilla del subtitulo, con {desde} y {hasta}. Los dos slots se reemplazan por rotulos de
  // mes que ya compuso el build ("Jul 2017"): el navegador sustituye, no arma ningun texto.
  subtitulo: string;
  color: string;
  pie: string;
};

/* Los dos controles de CRUCE que el zoom le pone a un cuadro (Francisco, 24-sep-2026): uno
   elige un segundo valor del filtro principal de ese cuadro y el otro una segunda medida. Los
   declara el spec, panel por panel, y solo los cuadros de serie temporal los tienen: en un
   mapa o en un anillo una segunda serie no se lee sin mentir.
   Las `plantilla_*` son los textos con slots ({valor}, {medida}, {titulo}, {otro}, {nota},
   {otra}): el navegador sustituye, nunca escribe. */
export type ComparacionDeCuadro = {
  filtro: string;
  rotulo: string;
  ninguno: string;
  opciones: Opcion[];
  plantilla_serie: string;
  plantilla_titulo: string;
  plantilla_titulo_medida: string;
  plantilla_nota: string;
  nota: string;
  medidas: { rotulo: string; ninguna: string; opciones: Opcion[] } | null;
};

export type Panel = {
  id: string;
  titulo: string;
  subtitulo?: string;
  ancho?: string | number;
  alto?: string | number;
  detalle?: string | null;
  rotulo?: string;
  pie?: string;
  // Panel con filtros y datos propios: hoy solo "Precios MCBA" (`forma: precios` en el spec).
  precios?: PanelPrecios;
  acciones?: AccionDeCuadro[];
  // Solo en los cuadros donde el spec habilita cruzar datos (ver ComparacionDeCuadro)
  comparacion?: ComparacionDeCuadro | null;
  // `accion` solo la traen los items del panel UTILIDADES: con accion se dibujan como boton
  // (la engancha comun.js), sin accion siguen deshabilitados con "Próximamente".
  items?: { etiqueta: string; icono?: string; accion?: string }[];
};

export type PaginaVista = Comun & { vista: Vista };

export type PaginaTablero = Comun & {
  tablero: {
    slug: string;
    titulo: string;
    ruta_datos: string;
    // Que disposicion dibuja Tablero.tsx. La elige el spec (site_build.DISPOSICIONES):
    // "mockup" = las dos columnas de cultivos extensivos; "grilla-2x2" = la maqueta "Agri 2".
    disposicion: string;
    tarjeta_contexto: boolean;
  };
  paneles: Panel[];
  filtros_panel: Record<string, Filtro>;
  filtro_selector: Filtro | null;
};

export type Ficha = {
  archivo: string;
  titulo: string;
  subtitulo_pagina: string;
  tipo: string;
  slug?: string;
};

export type PaginaSeccion = Comun & {
  seccion: {
    titulo: string;
    bajada: string;
    url: string;
    grupos: { titulo: string; vistas: Ficha[] }[];
  };
};

export type PaginaPrivado = Comun & {
  privadas: { titulo: string; bajada: string; vistas: Ficha[] };
};

export type PaginaHome = Comun & {
  ramas: {
    id: string;
    titulo: string;
    bajada: string;
    secciones: { titulo: string; url: string; cantidad: number }[];
    pendientes: string[];
  }[];
};

export type Pagina = PaginaVista | PaginaTablero | PaginaSeccion | PaginaPrivado | PaginaHome;
