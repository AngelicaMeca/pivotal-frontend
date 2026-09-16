// Elige el componente segun la `plantilla` que escribio el pipeline para la pagina
import type {
  Pagina as DatosPagina,
  PaginaHome,
  PaginaPrivado,
  PaginaSeccion,
  PaginaTablero,
  PaginaVista,
} from "@/tableros/tipos";
import Home from "./Home";
import Privado from "./Privado";
import Seccion from "./Seccion";
import Tablero from "./Tablero";
import Vista from "./Vista";

export default function Pagina({ pagina }: { pagina: DatosPagina }) {
  switch (pagina.plantilla) {
    case "home":
      return <Home pagina={pagina as PaginaHome} />;
    case "tablero":
      return <Tablero pagina={pagina as PaginaTablero} />;
    case "seccion":
      return <Seccion pagina={pagina as PaginaSeccion} />;
    case "privado":
      return <Privado pagina={pagina as PaginaPrivado} />;
    default:
      return <Vista pagina={pagina as PaginaVista} />;
  }
}
