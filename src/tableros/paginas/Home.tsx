/* Home de los tableros (/plataforma/tableros): el arbol tematico del indice de JC. Las ramas que
   todavia no tienen datos se muestran igual, marcadas: el sitio tiene que contar que esto es
   el primero de varios ejes. El titulo y la bajada viven en la cabecera verde. */
import type { PaginaHome } from "@/tableros/tipos";
import Cascara from "./Cascara";

export default function Home({ pagina }: { pagina: PaginaHome }) {
  return (
    <Cascara pagina={pagina}>
      {/* Sin mencion al "análisis completo": en cultivos no existe más (tercera tanda del
          10-ago). Se describe solo la navegación vigente. */}
      <p className="aviso">
        Versión beta. Cada base publicada abre en su <strong>tablero</strong>: los indicadores del
        período y sus cuadros en una pantalla, con los botones y selectores de cada sección para
        recorrer el detalle.
      </p>

      <ul className="ramas">
        {pagina.ramas.map((rama) => (
          // El id ancla la rama: es el destino del nivel intermedio del breadcrumb
          <li key={rama.id} className="rama" id={`rama-${rama.id}`}>
            <span className={`rama-estado ${rama.secciones.length ? "con-datos" : "sin-datos"}`}>
              {rama.secciones.length ? "Con datos" : "Sin datos todavía"}
            </span>
            <h2>{rama.titulo}</h2>
            <p className="rama-bajada">{rama.bajada}</p>
            {rama.secciones.length ? (
              <ul>
                {rama.secciones.map((seccion) => (
                  // Sin vistas de detalle se nombra solo el tablero: "tablero y 0 vistas" se
                  // lee como que falta algo
                  <li key={seccion.url}>
                    <a href={`${pagina.base}/${seccion.url}`}>{seccion.titulo}</a> ·{" "}
                    {seccion.cantidad ? `tablero y ${seccion.cantidad} vistas` : "tablero"}
                  </li>
                ))}
              </ul>
            ) : null}
            {rama.pendientes.length ? (
              <ul>
                {rama.pendientes.map((pendiente) => (
                  <li key={pendiente} className="pendiente">
                    {pendiente}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Cascara>
  );
}
