// Forma del JSON de cada pagina (src/tableros/contenido/paginas/<ruta>.json). Lo escribe
// tableros/pipeline/site_build.py -> escribir_sitio(); aca solo se describe lo que se lee.

/* Un texto partido en pedazos, con los terminos del glosario marcados. Lo arma el pipeline
   (site_build.partes_con_terminos) y lo dibuja <Glosa>. Regla de JC (hoja INDICACIONES de su
   maqueta): las aclaraciones de terminos se abren con mouseover o click en un mini popup.
   Donde hay `<campo>_partes` se dibuja eso; donde no, el string de siempre. */
export type ParteDeTexto = { t: string; termino?: string };

export type Termino = { termino: string; aclaracion: string };

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
  etiqueta_partes?: ParteDeTexto[];
  defecto: string;
  control: "chips" | "select";
  zona: string;
  opciones: Opcion[];
  panel?: string;
};

/* `accion` marca un tramo que no navega a una URL sino que cambia el estado de la pagina.
   Hoy solo "provincia": el tramo que vuelve a los datos provinciales desde un departamento
   (hoja "Agri 1 Dto" de la maqueta de JC, nota 2). */
export type PasoMiga = { texto: string; href?: string | null; dinamico?: string;
                         accion?: string };

export type SectorMenu = {
  id: string;
  titulo: string;
  // La portada de la rama, si declara una (Ganaderia): el nombre del sector lleva ahi y la
  // portada no figura como renglon. `portada_actual`: la pagina es la portada.
  href?: string | null;
  portada_actual?: boolean;
  actual: boolean;
  // `proximamente`: la seccion esta declarada y anunciada, pero todavia no tiene datos.
  // Se dibuja en el menu sin link (ver Cascara.tsx).
  secciones: { titulo: string; url: string; actual: boolean; proximamente?: boolean }[];
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
  // `href` nulo = boton anunciado y todavia sin pagina (se dibuja apagado con "Próximamente").
  // `imagen`: el boton es un logo (el del SID); `texto` queda como texto accesible.
  botones_cabecera: {
    texto: string;
    href: string | null;
    imagen?: string | null;
    // Un logo que lleva a la portada de otra area (el SID) no arrastra los filtros.
    sin_conservar?: boolean;
  }[];
  // El menu lateral del SID: los departamentos en vez de los sectores. `elegir`: el renglon
  // cambia el departamento de ESTA pagina sin recargarla.
  menu_departamentos: { texto: string; geo: string; href: string; elegir: boolean }[];
  // Las otras paginas de la seccion, dibujadas a la derecha de la banda del breadcrumb (es
  // donde las pone JC). `href` vacio = declarada y todavia sin construir: se muestra apagada.
  // La tira de SECCIONES HERMANAS (en ganadería, las especies). Va arriba de la de
  // páginas y está siempre a la vista: es lo que hace que no haga falta un botón de
  // "volver", porque nunca te fuiste del lugar. Vacía en las ramas que no la declaran.
  tira_de_secciones: { texto: string; href: string | null; actual: boolean }[];
  paginas_de_seccion: {
    texto: string;
    href: string | null;
    actual: boolean;
    // geo_id cuando la entrada elige un departamento: el navegador lo cambia en el acto en vez
    // de recargar la pagina entera para mover un filtro.
    departamento?: string | null;
  }[];
  // Si la sección dibuja el botón deshabilitado "Datos por Departamento" cuando no
  // declara botones propios. Lo esperan las secciones del mockup Modelo 2; una sección
  // que no lo espera no debe prometer una página que no existe.
  boton_proximamente: boolean;
  banderas_idioma: { codigo: string; nombre: string; activa: boolean; imagen?: string }[];
  // Definiciones de los terminos marcados en ESTA pagina (site/glosario.yaml). Vacio si no
  // hay ninguno: ahi la cascara no dibuja el recuadro de aclaraciones.
  glosario: Record<string, Termino>;
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
  notas: { titulo: string; texto: string; texto_partes?: ParteDeTexto[] }[];
  enlaces: Enlace[];
  elementos_default: Elemento[];
};

// Un item del pie de un cuadro: "Más información →" o "Generar PDF". Lo dibuja JC al pie de
// cada cuadro de la maqueta "Agri 2" y reemplaza al panel de utilidades unico del final.
// Con `accion` es un boton de verdad (la engancha comun.js); con `href` es un link; sin
// ninguna de las dos queda deshabilitado con su `rotulo`.
export type AccionDeCuadro = {
  // Que bloque del popup "Más información" abre este boton, cuando el tablero tiene mas de
  // uno (hoja "Agri 2": uno por columna). null en los tableros con un solo bloque.
  variante?: string | null;
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

/* Una capa del IGN que un mapa ofrece prender (rutas, ferrocarril...). Aca va solo lo que
   necesita el CONTROL; el archivo, el estilo y la fuente viajan en el JSON de datos del
   tablero (`capas`) y los usa src/tableros/cliente/capas.js. */
export type CapaDeMapa = {
  id: string;
  etiqueta: string;
  prendida: boolean;
};

export type Panel = {
  id: string;
  // Un ranking (`top`) que se dibuja como TABLA fuera del mockup de cultivos (el SID).
  tabla?: boolean;
  titulo: string;
  titulo_partes?: ParteDeTexto[];
  subtitulo?: string;
  subtitulo_partes?: ParteDeTexto[];
  ancho?: string | number;
  alto?: string | number;
  // La tabla scrollea adentro de su cuadro en vez de estirar las filas que ocupa (ganaderia,
  // paginas de Estratos). Lo declara el spec en `paneles.orden`.
  scroll_interno?: boolean;
  // Disposicion "columnas": en que columna de su banda va el cuadro ("izq" o "der"). Si el
  // spec no lo dice, lo decide el ancho (ver bandasEnColumnas en Tablero.tsx).
  columna?: "izq" | "centro" | "der" | "fila";
  // Disposicion "columnas": este panel abre una banda nueva.
  nueva_banda?: boolean;
  // Disposicion "columnas": el titulo que JC escribe SOBRE una banda en fila (los dos
  // graficos de precio de "GanPorcRAZ"). Lo declara el primer panel de la fila.
  titulo_fila?: string;
  // Tabla ancha que tiene que entrar entera sin scroll horizontal (letra y aire mas chicos).
  compacta?: boolean;
  // El cuadro NO se muestra con un departamento elegido (JC, "GanBov DTE" E122: "Gráficos
  // de participaciones, salvo la departamental").
  solo_provincia?: boolean;
  // Dos paneles seguidos con `en_par` van lado a lado dentro de su columna.
  en_par?: boolean;
  // La nota del cuadro va al costado de la tabla y no debajo ("izq" o "der"), como JC pega
  // sus cuadros de texto (*)/(**) junto a sus tablas.
  nota_al_lado?: string;
  detalle?: string | null;
  rotulo?: string;
  rotulo_partes?: ParteDeTexto[];
  pie?: string;
  // Panel con filtros y datos propios: hoy solo "Precios MCBA" (`forma: precios` en el spec).
  precios?: PanelPrecios;
  acciones?: AccionDeCuadro[];
  // Solo en los cuadros donde el spec habilita cruzar datos (ver ComparacionDeCuadro)
  comparacion?: ComparacionDeCuadro | null;
  // Capas del IGN que este mapa ofrece prender (opt-in del spec, `paneles.<id>.capas`). En un
  // mapa de calor arrancan apagadas y el control es un desplegable; en la portada de
  // Infraestructura y riesgo el control es la leyenda, a la vista. Sin capas, no viene.
  capas?: CapaDeMapa[];
  capas_modo?: "lista" | "desplegable";
  // El rotulo del boton del desplegable ("Capas"), de configs/dims/capas-ign.yaml.
  capas_rotulo?: string;
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
    // Como resuelve el ALTO (site_build.ALTOS_DE_TABLERO): "una-pantalla" = tablero.js le
    // fija el alto de la ventana y entra entero; "fluye" = cada cuadro se queda con el alto
    // que necesita y la pagina scrollea (pedido de JC del 30-sep-2026, hoy solo agricultura).
    alto: string;
    tarjeta_contexto: boolean;
    // Cuantas tarjetas de indicador dibuja la banda (las del spec; 0 = ninguna).
    kpis?: number;
    // El mapa se dibuja solo con un departamento elegido (pasturas y forrajes).
    mapa_por_departamento?: boolean;
    // El SID siempre mira UN departamento: el geo_id con que arranca si la URL no trae uno.
    departamento_obligatorio?: string | null;
  };
  paneles: Panel[];
  filtros_panel: Record<string, Filtro>;
  filtro_selector: Filtro | null;
  // Las acciones SUELTAS del pie de la hoja "Agri 1" ("Más información →" y "Generar PDF").
  // No cuelgan de ningun panel: en la maqueta de JC no hay ninguna caja alrededor. Los
  // tableros que no las declaran (hacienda, stock) mandan la lista vacia.
  acciones_tablero: AccionDeCuadro[];
  // Las notas metodologicas, al pie. Son el destino de la pestaña "Metodología", que no es
  // otra pagina: es un ancla a esta misma (asi lo enlaza JC en su Excel).
  notas: { titulo: string; texto: string; texto_partes?: ParteDeTexto[] }[];
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
    bajada_partes?: ParteDeTexto[];
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
    // La portada de la rama, si declara una (Ganaderia): el titulo lleva ahi.
    href?: string | null;
    bajada: string;
    secciones: { titulo: string; url: string; cantidad: number }[];
    pendientes: string[];
  }[];
};

export type Pagina = PaginaVista | PaginaTablero | PaginaSeccion | PaginaPrivado | PaginaHome;
