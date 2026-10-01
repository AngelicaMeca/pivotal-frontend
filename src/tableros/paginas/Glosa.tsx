/* Un texto con los términos del glosario marcados.

   Regla de JC (hoja INDICACIONES de "0000000000 Maqueta Agri.xlsx", 29-sep-2026): "será
   necesario agregar ACLARACIONES de términos que se podrán visualizar con un mouseover o
   click, como uds elijan, y un mini popup con el texto aclaratorio". Y aclara que no es sólo
   para el público no técnico: "un profesional economista puede no tener en claro un término
   específico que sea agronómico".

   Acá NO se decide qué palabra es un término ni qué dice la aclaración: el texto ya viene
   partido del pipeline (site_build.partes_con_terminos) y las definiciones viajan en
   pagina.glosario. Este componente sólo dibuja los pedazos.

   El disparador es un <button>: así entra en el orden de tabulación y se abre con teclado,
   además de con el mouse. Quién lo abre y lo cierra es src/tableros/cliente/comun.js. */
import { Fragment } from "react";
import type { ParteDeTexto } from "@/tableros/tipos";

export default function Glosa({ texto, partes }: { texto?: string; partes?: ParteDeTexto[] }) {
  if (!partes || !partes.length) return <>{texto ?? ""}</>;
  return (
    <>
      {partes.map((parte, i) =>
        parte.termino ? (
          <button key={i} type="button" className="termino" data-termino={parte.termino}>
            {parte.t}
          </button>
        ) : (
          <Fragment key={i}>{parte.t}</Fragment>
        ),
      )}
    </>
  );
}
