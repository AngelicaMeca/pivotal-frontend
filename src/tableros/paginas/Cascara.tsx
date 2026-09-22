/* Cascara comun a TODAS las paginas (home, tablero, lista de vistas y vistas de detalle).
   Es la traduccion del viejo site/templates/base.html, con el mismo HTML: el JS de
   src/tableros/cliente/ y el CSS generado se apoyan en estas clases y en los data-*.

   Diseño: TEMA VISUAL del 10-ago-2026 (Facu, en persona con JC presente), regla en
   _protocolo-presentacion.formato_v1.tema_visual. Lo que define la cascara:
     - Cabecera blanca con el logo provincial a la izquierda y una franja verde con los
       botones de cabecera que declare la seccion. En las secciones que declaran
       `cabecera_banderas` el titulo no se dibuja: van las banderas es/en/pt.
     - Menu lateral VERDE: "Inicio" + sectores desplegables (site/navegacion.yaml). Sector sin
       secciones publicadas = "Proximamente", sin links muertos. La home va sin menu.
     - Banda VERDE de breadcrumb; el selector de PERIODO va a la derecha como tira de pestañitas.
     - El resto de los filtros va en una barra clara de chips.
   El reparto periodo/barra/selector lo decide el build (zona del filtro), no este archivo.

   Los enlaces internos son <a> comunes, no <Link>: cada pagina arranca su JS sobre un DOM
   recien cargado, como en el sitio estatico. */
import { Fragment, type ReactNode } from "react";
import type { Comun, Filtro } from "@/tableros/tipos";
import ClaseCuerpo from "./ClaseCuerpo";

function Periodo({ filtro }: { filtro: Filtro }) {
  // Mismo contrato data-* que lee comun.js
  return (
    <div
      className="periodo"
      data-control="chips"
      data-filtro={filtro.id}
      data-valor={filtro.defecto}
      role="group"
      aria-label={filtro.etiqueta}
    >
      <span className="periodo-rotulo">{filtro.etiqueta}</span>
      <span className="periodo-tira">
        {filtro.opciones.map((opcion) => (
          <button
            key={opcion.v}
            type="button"
            data-valor={opcion.v}
            aria-pressed={opcion.v === filtro.defecto ? "true" : "false"}
          >
            {opcion.corto || opcion.t}
          </button>
        ))}
      </span>
    </div>
  );
}

function FiltroBarra({ filtro }: { filtro: Filtro }) {
  if (filtro.control === "chips") {
    return (
      <div
        className="grupo-filtro"
        data-control="chips"
        data-filtro={filtro.id}
        data-valor={filtro.defecto}
      >
        <span className="rotulo">{filtro.etiqueta}</span>
        <div className="chips" role="group" aria-label={filtro.etiqueta}>
          {filtro.opciones.map((opcion) => (
            <button
              key={opcion.v}
              type="button"
              data-valor={opcion.v}
              aria-pressed={opcion.v === filtro.defecto ? "true" : "false"}
            >
              {opcion.icono ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="chip-ico ico-bn" src={opcion.icono} alt="" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="chip-ico ico-color" src={opcion.icono_color} alt="" />
                </>
              ) : null}
              {opcion.t}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      className="grupo-filtro"
      data-control="select"
      data-filtro={filtro.id}
      data-valor={filtro.defecto}
    >
      <label className="rotulo" htmlFor={`f-${filtro.id}`}>
        {filtro.etiqueta}
      </label>
      <select className="filtro-select" id={`f-${filtro.id}`} defaultValue={filtro.defecto}>
        {filtro.opciones.map((opcion) => (
          <option key={opcion.v} value={opcion.v}>
            {opcion.t}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Cascara({ pagina, children }: { pagina: Comun; children: ReactNode }) {
  const { theme } = pagina;
  const logo = theme.logo_provincia;
  const titulo = pagina.titulo_cabecera || theme.titulo_sitio;

  return (
    <>
      {pagina.clase_cuerpo ? <ClaseCuerpo clase={pagina.clase_cuerpo} /> : null}
      <header className="cabecera">
        {/* Logo provincial (theme.logo_provincia.archivo, parametrizado por cliente). Sin
            asset: wordmark sobrio de texto. */}
        <div className="cabecera-logo">
          {logo.archivo ? (
            <a className="logo-con-imagen" href={pagina.inicio}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-imagen" src={logo.archivo} alt={logo.nombre} />
              <span className="logo-bajada">{logo.bajada}</span>
            </a>
          ) : (
            <a className="logo-wordmark" href={pagina.inicio}>
              <span className="logo-nombre">{logo.nombre}</span>
              <span className="logo-bajada">{logo.bajada}</span>
            </a>
          )}
        </div>
        <div className="cabecera-franja">
          {/* Botones de cabecera que declara la seccion; viajan con la seleccion vigente
              (data-conserva). Sin declaracion queda el boton deshabilitado "Proximamente". */}
          {pagina.botones_cabecera.length ? (
            pagina.botones_cabecera.map((boton) => (
              <a key={boton.href} className="boton-cabecera" href={boton.href} data-conserva="">
                {boton.texto}
              </a>
            ))
          ) : (
            <button type="button" className="boton-cabecera" disabled title="Próximamente">
              Datos por Departamento <span className="prox">Próximamente</span>
            </button>
          )}
          {pagina.banderas_idioma.length ? (
            // Donde estaba el titulo van las banderas es/en/pt (tercera tanda, backlog 33)
            <div className="cabecera-banderas" aria-label="Idiomas">
              {pagina.banderas_idioma.map((bandera) =>
                bandera.activa ? (
                  <span key={bandera.codigo} className="bandera activa" title={bandera.nombre}>
                    <span className="sr-solo">{bandera.nombre}</span>
                    <span aria-hidden="true">{bandera.codigo.toUpperCase()}</span>
                  </span>
                ) : (
                  <span
                    key={bandera.codigo}
                    className="bandera deshabilitada"
                    title={`${bandera.nombre} · Próximamente`}
                  >
                    <span className="sr-solo">{bandera.nombre} · Próximamente</span>
                    <span aria-hidden="true">{bandera.codigo.toUpperCase()}</span>
                  </span>
                ),
              )}
            </div>
          ) : (
            <div className="cabecera-titulo">
              <h1>{titulo}</h1>
              {pagina.subtitulo_cabecera ? <p>{pagina.subtitulo_cabecera}</p> : null}
            </div>
          )}
          <span className="marca-estado">beta</span>
        </div>
      </header>

      <div className="marco">
        {pagina.con_menu ? (
          <aside className="menu-lateral" aria-label="Secciones">
            <a className="menu-inicio" href={pagina.inicio}>
              Inicio
            </a>
            {pagina.menu.map((sector) =>
              sector.secciones.length ? (
                <details key={sector.id} className="menu-sector" open={sector.actual}>
                  <summary>{sector.titulo}</summary>
                  <ul>
                    {sector.secciones.map((seccion) => (
                      <li key={seccion.url}>
                        <a
                          href={`${pagina.base}/${seccion.url}`}
                          aria-current={seccion.actual ? "page" : undefined}
                        >
                          {seccion.titulo}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                // Sector sin secciones publicadas: se muestra igual, sin links muertos
                <details key={sector.id} className="menu-sector">
                  <summary>{sector.titulo}</summary>
                  <p className="menu-prox">Próximamente</p>
                </details>
              ),
            )}
          </aside>
        ) : null}

        <div className="contenido">
          <div className="banda">
            {pagina.miga ? (
              <nav className="miga" aria-label="Ruta">
                {pagina.miga.map((paso, i) => (
                  <Fragment key={i}>
                    {paso.href ? (
                      <a href={paso.href}>{paso.texto}</a>
                    ) : paso.dinamico ? (
                      <span className="miga-actual" data-miga-dinamica={paso.dinamico}></span>
                    ) : (
                      <span aria-current="page">{paso.texto}</span>
                    )}
                    {i < pagina.miga!.length - 1 ? (
                      <>
                        {" "}
                        <span className="miga-sep">-</span>{" "}
                      </>
                    ) : null}
                  </Fragment>
                ))}
              </nav>
            ) : (
              <span className="banda-titulo">{titulo}</span>
            )}
            {pagina.filtros_periodo.map((filtro) => (
              <Periodo key={filtro.id} filtro={filtro} />
            ))}
            {/* Deshacer de verdad: vuelve al estado anterior de los filtros (comun.js). Arranca
                oculto y solo se muestra cuando hay a donde volver. */}
            <button type="button" className="borrar-filtros" data-borrar="" hidden>
              Volver
            </button>
          </div>

          {pagina.filtros_barra.length ? (
            <nav className="barra-filtros" aria-label="Filtros">
              {pagina.filtros_barra.map((filtro) => (
                <FiltroBarra key={filtro.id} filtro={filtro} />
              ))}
            </nav>
          ) : null}

          <main>
            {pagina.pestanias.length ? (
              <div className="pestanias">
                {pagina.pestanias.map((pestania) => (
                  <a
                    key={pestania.href}
                    href={pestania.href}
                    aria-current={pestania.actual ? "page" : undefined}
                  >
                    {pestania.texto}
                  </a>
                ))}
              </div>
            ) : null}
            {children}
          </main>

          {/* Pie del Modelo 2 + el pie de datos: la fecha sale del manifiesto de la entrega */}
          <footer className="pie-sitio">
            <p className="pie-tec">{theme.pie_tecnologia}</p>
            <p className="pie-linea">Pivotal · datos actualizados a {pagina.fecha_datos}</p>
            <p className="pie-linea pie-menor">{theme.pie}</p>
          </footer>
        </div>
      </div>
    </>
  );
}
