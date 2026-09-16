// Public dashboards of B³ AgriFood Provincia (repo pivotal-dashboard, a static
// site served from its own origin: its pages use root-absolute paths).
//
// Set NEXT_PUBLIC_DASHBOARD_URL to the deployed address once the Vercel
// project exists. In development it falls back to the local server of that
// repo (`make serve`, port 8000). In production without the variable there is
// no address to send people to, so the access page offers a demo instead.
export const DASHBOARD_URL: string | null =
  process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/+$/, "") ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : null);

export function dashboardHref(path = "/"): string | null {
  return DASHBOARD_URL ? `${DASHBOARD_URL}${path}` : null;
}

// Published views, grouped as on the dashboard home
export const dashboardSections = [
  {
    area: "Agricultura",
    views: [
      {
        name: "Cultivos extensivos",
        detail: "Superficie sembrada y cosechada y producción, por campaña.",
        path: "/agricultura/cultivos-extensivos/",
      },
    ],
  },
  {
    area: "Ganadería",
    views: [
      {
        name: "Movimientos de hacienda",
        detail: "Movimientos por categoría, por departamento y mes a mes.",
        path: "/ganaderia/movimientos-hacienda/",
      },
      {
        name: "Stock bovino",
        detail: "Existencias por zona y por departamento, y su evolución.",
        path: "/ganaderia/stock-bovino/",
      },
    ],
  },
];
