/* Indice de las vistas reservadas (antes site/templates/privado.html). NO se enlaza desde
   ninguna parte del sitio. Existe para que Francisco pueda mirar las comparaciones antes de
   decidir si se publican. Su contenido esta gitignoreado: no viaja al deploy. */
import type { PaginaPrivado } from "@/tableros/tipos";
import Cascara from "./Cascara";

export default function Privado({ pagina }: { pagina: PaginaPrivado }) {
  const { privadas } = pagina;
  return (
    <Cascara pagina={pagina}>
      <h1>{privadas.titulo}</h1>
      <p className="bajada">{privadas.bajada}</p>

      <p className="aviso reservado">
        <strong>Estas páginas no están publicadas.</strong> No figuran en la home, ni en el menú,
        ni en ninguna sección del sitio. Para publicarlas hay que escribir{" "}
        <code>aprobado_por</code> con la fecha en el spec de cada una y volver a correr{" "}
        <code>make site</code>: no hace falta tocar código.
      </p>

      <ul className="grupo-vistas">
        {privadas.vistas.map((vista) => (
          <li key={vista.archivo}>
            <a className="tarjeta" href={`${pagina.base}/_privado/${vista.archivo}`}>
              <span className="tarjeta-titulo">{vista.titulo}</span>
              <span className="tarjeta-sub">{vista.subtitulo_pagina}</span>
              {/* El slug queda (es un indice interno), sin el tipo de grafico: regla de JC */}
              <span className="tarjeta-tipo">{vista.slug}</span>
            </a>
          </li>
        ))}
      </ul>
    </Cascara>
  );
}
