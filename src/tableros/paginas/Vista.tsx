/* Vistas de detalle (antes site/templates/vista_base.html + un template por tipo).

   Chrome comun: avisos, cascara de los cuadros, notas metodologicas y enlaces. Cada tipo solo
   aporta el CUERPO de sus cuadros; lo dibuja src/tableros/cliente/<tipo>.js.

   Para agregar un tipo de vista nuevo: sumar su cuerpo en CUERPOS, su modulo en Arranque.tsx
   y el archivo src/tableros/cliente/<tipo>.js. Nada mas. */
import type { ReactNode } from "react";
import type { Elemento, PaginaVista } from "@/tableros/tipos";
import Arranque, { type TipoDePagina } from "./Arranque";
import Cascara from "./Cascara";

/* Cascara de un cuadro: titulo de protocolo arriba y pie de fuente abajo. Titulo y pie son
   OBLIGATORIOS en todo mapa, grafico y tabla del sitio. El texto ya viene compuesto por
   pipeline/presentacion.py: aca no se arma ningun string. */
function Cuadro({ el, i, children }: { el: Elemento; i: number; children: ReactNode }) {
  return (
    <figure className="cuadro" data-elemento={i}>
      <figcaption className="cuadro-cab">
        <div>
          <h2 className="titulo-protocolo" data-titulo="">
            {el.titulo}
          </h2>
          <p className="subtitulo" data-subtitulo="">
            {el.subtitulo}
          </p>
        </div>
      </figcaption>
      {children}
      <p className="pie-fuente">{el.pie}</p>
    </figure>
  );
}

function Tabla({ clase = "" }: { clase?: string }) {
  return (
    <div className={`tabla-scroll${clase ? " " + clase : ""}`}>
      <table className="datos" data-tabla=""></table>
    </div>
  );
}

function Nota({ el }: { el: Elemento }) {
  return (
    <p className="cuadro-nota" data-nota="">
      {el.nota}
    </p>
  );
}

// Tipo `ranking`, `lista` y `tabla-variaciones`: la fila del total va ARRIBA de la tabla
function Ranking({ elementos }: { elementos: Elemento[] }) {
  return elementos.map((el, i) => (
    <Cuadro key={i} el={el} i={i}>
      <div className="grafico alto" data-grafico=""></div>
      <Tabla />
      <Nota el={el} />
    </Cuadro>
  ));
}

function SoloTabla({ elementos }: { elementos: Elemento[] }) {
  return elementos.map((el, i) => (
    <Cuadro key={i} el={el} i={i}>
      <Tabla />
      <Nota el={el} />
    </Cuadro>
  ));
}

/* Tipo `serie`: un elemento con `clase: tabla` se dibuja como tabla de datos. El resumen va
   ARRIBA del grafico: son los indicadores del cuadro y se leen primero. */
function Serie({ elementos }: { elementos: Elemento[] }) {
  return elementos.map((el, i) => (
    <Cuadro key={i} el={el} i={i}>
      {el.clase === "tabla" ? (
        <Tabla />
      ) : (
        <>
          <div className="resumen" data-resumen=""></div>
          <div className="grafico" data-grafico=""></div>
        </>
      )}
      <Nota el={el} />
    </Cuadro>
  ));
}

// Tipo `torta`: una vista puede traer mas de una torta (verano e invierno)
function Torta({ elementos }: { elementos: Elemento[] }) {
  return (
    <div className="dos-columnas">
      {elementos.map((el, i) => (
        <Cuadro key={i} el={el} i={i}>
          <div className="grafico" data-grafico=""></div>
          <p className="total-provincial" data-total=""></p>
          <Nota el={el} />
        </Cuadro>
      ))}
    </div>
  );
}

// Tipo `mapa`: coropleta por departamento + ranking vinculado, cada uno con su titulo y su pie
function Mapa({ elementos }: { elementos: Elemento[] }) {
  const [mapa, tabla] = elementos;
  return (
    <div className="mapa-fila">
      <Cuadro el={mapa} i={0}>
        <div className="grafico alto" data-grafico=""></div>
        <div className="leyenda" data-leyenda=""></div>
        <p className="total-provincial" data-total=""></p>
        <p className="advertencia-escala">{mapa.advertencia}</p>
      </Cuadro>
      <Cuadro el={tabla} i={1}>
        <Tabla />
        <Nota el={tabla} />
      </Cuadro>
    </div>
  );
}

/* Tipo `flujo-od`: matriz de origen contra destino con intensidad de color. No es un diagrama
   de cintas: con 27 origenes y 27 destinos las curvas se tapan entre si. */
function FlujoOD({ elementos }: { elementos: Elemento[] }) {
  return elementos.map((el, i) => (
    <Cuadro key={i} el={el} i={i}>
      <div className="tabla-scroll matriz-scroll">
        <table className="datos matriz-od" data-tabla=""></table>
      </div>
      <div className="leyenda" data-leyenda=""></div>
      <Nota el={el} />
    </Cuadro>
  ));
}

const CUERPOS: Record<string, (props: { elementos: Elemento[] }) => ReactNode> = {
  ranking: Ranking,
  serie: Serie,
  torta: Torta,
  mapa: Mapa,
  "flujo-od": FlujoOD,
  lista: SoloTabla,
  "tabla-variaciones": SoloTabla,
};

export default function Vista({ pagina }: { pagina: PaginaVista }) {
  const { vista } = pagina;
  const Cuerpo = CUERPOS[pagina.plantilla];
  if (!Cuerpo) throw new Error(`No hay cuerpo para el tipo de vista ${pagina.plantilla}`);

  return (
    <Cascara pagina={pagina}>
      {vista.reservada ? (
        <p className="aviso reservado">
          <strong>Vista no publicada.</strong> {vista.motivo_reserva}
        </p>
      ) : null}

      {vista.advertencias.map((aviso, i) => (
        <p key={i} className="aviso">
          {aviso}
        </p>
      ))}

      <noscript>
        <p className="noscript">Este cuadro se dibuja en el navegador. Habilitá JavaScript para verlo.</p>
      </noscript>

      <div id="cuadros" data-datos={vista.ruta_datos}>
        <Cuerpo elementos={vista.elementos_default} />
      </div>

      {vista.notas.length ? (
        <div className="notas">
          {vista.notas.map((nota, i) => (
            <details key={i}>
              <summary>{nota.titulo}</summary>
              <p>{nota.texto}</p>
            </details>
          ))}
        </div>
      ) : null}

      {/* data-conserva: los links entre vistas viajan con la seleccion vigente (comun.js) */}
      {vista.enlaces.length ? (
        <p className="enlaces">
          {vista.enlaces.map((enlace) => (
            <a key={enlace.href} href={enlace.href} data-conserva="">
              {enlace.texto}
            </a>
          ))}
        </p>
      ) : null}

      <Arranque tipo={pagina.plantilla as TipoDePagina} />
    </Cascara>
  );
}
