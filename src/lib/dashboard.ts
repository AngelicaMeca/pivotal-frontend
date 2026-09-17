// Tableros públicos de B³ AgriFood Provincia. Viven en este mismo sitio, bajo /plataforma: el
// pipeline de tableros/ genera su contenido y src/app/(tableros)/ los dibuja.
// Server-only: reads the generated content at build time.
import fs from "node:fs";
import path from "node:path";

export const DASHBOARD_HOME = "/plataforma/tableros";

// False when this build had no dashboard content (e.g. Vercel before the SharePoint
// credentials are set): the platform page then shows them as "en preparación".
export function hasDashboards(): boolean {
  return fs.existsSync(
    path.join(process.cwd(), "src", "tableros", "contenido", "paginas", "tableros.json"),
  );
}

// Vistas publicadas, agrupadas como en la home de los tableros
export const dashboardSections = [
  {
    area: "Agricultura",
    views: [
      {
        name: "Cultivos extensivos",
        detail: "Superficie sembrada y cosechada y producción, por campaña.",
        href: "/plataforma/agricultura/cultivos-extensivos",
      },
    ],
  },
  {
    area: "Ganadería",
    views: [
      {
        name: "Movimientos de hacienda",
        detail: "Movimientos por categoría, por departamento y mes a mes.",
        href: "/plataforma/ganaderia/movimientos-hacienda",
      },
      {
        name: "Stock bovino",
        detail: "Existencias por zona y por departamento, y su evolución.",
        href: "/plataforma/ganaderia/stock-bovino",
      },
    ],
  },
];
