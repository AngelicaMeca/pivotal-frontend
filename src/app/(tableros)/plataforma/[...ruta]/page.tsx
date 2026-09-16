import type { Metadata } from "next";
import { leerPagina, rutasDelSitio } from "@/tableros/contenido";
import Pagina from "@/tableros/paginas/Pagina";

type Props = { params: Promise<{ ruta: string[] }> };

// Solo existen las paginas que genero el pipeline (make site en tableros/)
export const dynamicParams = false;

export function generateStaticParams() {
  return rutasDelSitio().map((ruta) => ({ ruta }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ruta } = await params;
  return { title: leerPagina(ruta).titulo_pestania };
}

export default async function PaginaDeTablero({ params }: Props) {
  const { ruta } = await params;
  return <Pagina pagina={leerPagina(ruta)} />;
}
