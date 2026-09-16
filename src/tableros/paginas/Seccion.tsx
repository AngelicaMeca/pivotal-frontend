/* "Análisis completo": la lista de todas las vistas de una base, agrupadas segun
   site/navegacion.yaml (antes site/templates/seccion.html). Desde el 3-ago-2026 la portada es
   el tablero y esto es la segunda pestaña. El titulo vive en la cabecera verde. */
import { Fragment } from "react";
import type { PaginaSeccion } from "@/tableros/tipos";
import Cascara from "./Cascara";

export default function Seccion({ pagina }: { pagina: PaginaSeccion }) {
  const { seccion } = pagina;
  return (
    <Cascara pagina={pagina}>
      <p className="bajada">{seccion.bajada}</p>

      {seccion.grupos.map((grupo) => (
        <Fragment key={grupo.titulo}>
          <h3>{grupo.titulo}</h3>
          <ul className="grupo-vistas">
            {grupo.vistas.map((vista) => (
              // Sin rotulo de tipo de grafico en la tarjeta: regla de JC del 10-ago-2026
              <li key={vista.archivo}>
                <a className="tarjeta" href={`${pagina.base}/${seccion.url}/${vista.archivo}`}>
                  <span className="tarjeta-titulo">{vista.titulo}</span>
                  <span className="tarjeta-sub">{vista.subtitulo_pagina}</span>
                </a>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </Cascara>
  );
}
