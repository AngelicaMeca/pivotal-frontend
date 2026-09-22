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

export type Panel = {
  id: string;
  titulo: string;
  ancho?: string | number;
  alto?: string | number;
  detalle?: string | null;
  // `accion` solo la traen los items del panel UTILIDADES: con accion se dibujan como boton
  // (la engancha comun.js), sin accion siguen deshabilitados con "Próximamente".
  items?: { etiqueta: string; icono?: string; accion?: string }[];
};

export type PaginaVista = Comun & { vista: Vista };

export type PaginaTablero = Comun & {
  tablero: { slug: string; titulo: string; ruta_datos: string; tarjeta_contexto: boolean };
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
