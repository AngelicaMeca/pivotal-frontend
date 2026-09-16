import type { Metadata } from "next";
import type { ReactNode } from "react";
// Generado por el pipeline desde tableros/site/theme.yaml (make site): no se edita a mano
import "@/tableros/estilos/pivotal.css";

// Layout raiz propio de los tableros: su CSS no se mezcla con el del sitio institucional.
// Pasar de una seccion a la otra recarga la pagina entera, y eso es a proposito.
// Los tableros no deben ser indexables mientras sean beta (tableros/CLAUDE.md).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TablerosLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
