// Tableros públicos de B³ AgriFood Provincia. Viven en este mismo sitio, bajo /plataforma: el
// pipeline de tableros/ genera su contenido y src/app/(tableros)/ los dibuja.
// Server-only: reads the generated content at build time.
import fs from "node:fs";
import path from "node:path";

export const DASHBOARD_HOME = "/plataforma/tableros";

const INDICE = path.join(
  process.cwd(),
  "src",
  "tableros",
  "contenido",
  "paginas",
  "tableros.json",
);

// False when this build had no dashboard content (e.g. Vercel before the SharePoint
// credentials are set): the platform page then shows them as "en preparación".
export function hasDashboards(): boolean {
  return fs.existsSync(INDICE);
}

export type DashboardView = { name: string; detail: string; href: string };
export type DashboardSection = { area: string; views: DashboardView[] };

// Forma de lo que publica el pipeline en paginas/tableros.json (ver site_build.ramas_de_home)
type IndiceTableros = {
  ramas: {
    titulo: string;
    secciones: { url: string; titulo: string; bajada?: string }[];
  }[];
};

/* Las secciones publicadas, agrupadas por área, LEÍDAS DEL CONTENIDO GENERADO.
 *
 * Antes esta lista estaba escrita a mano acá y se quedó vieja: cuando entró Cultivos
 * intensivos, el tablero apareció en el menú de /plataforma pero no en esta página, que es
 * justamente la que invita a entrar. Un segundo lugar donde anotar lo mismo se desactualiza
 * siempre; ahora la única fuente es `tableros/site/navegacion.yaml`, que es donde se declara
 * una sección, y de ahí sale también la frase de una línea (`bajada_corta`).
 *
 * Se lee en el build, no al pedir la página: el contenido lo genera `npm run build` antes de
 * compilar el sitio (scripts/tableros.mjs). Sin contenido devuelve una lista vacía y la
 * página muestra las áreas "en preparación".
 */
export function dashboardSections(): DashboardSection[] {
  if (!hasDashboards()) return [];
  const indice = JSON.parse(fs.readFileSync(INDICE, "utf8")) as IndiceTableros;
  return indice.ramas
    .filter((rama) => rama.secciones.length > 0)
    .map((rama) => ({
      area: rama.titulo,
      views: rama.secciones.map((seccion) => ({
        name: seccion.titulo,
        detail: seccion.bajada ?? "",
        href: `/plataforma/${seccion.url}`,
      })),
    }));
}
