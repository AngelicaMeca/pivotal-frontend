import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
// Generado por el pipeline desde tableros/site/theme.yaml (make site): no se edita a mano
import "@/tableros/estilos/pivotal.css";

// Las mismas tipografías del sitio institucional. El CSS de los tableros las pide por estas
// variables (tableros/site/theme.yaml, bloque `tipografia`), así que los nombres importan.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Layout raiz propio de los tableros: su CSS no se mezcla con el del sitio institucional.
// Pasar de una seccion a la otra recarga la pagina entera, y eso es a proposito.
// Los tableros no deben ser indexables mientras sean beta (tableros/CLAUDE.md).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TablerosLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es-AR"
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
