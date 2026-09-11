import { GLASS_PANEL as PANEL } from "@/lib/expand";
import Button from "./Button";
import ExpandSection from "./ExpandSection";

const IMAGE_SRC = "/b3-agrifood-campo.webp";
const IMAGE_ALT =
  "Dos analistas trabajan con tableros de B³ AgriFood en una mesa en medio de un cultivo al atardecer; al centro, las tres capas del sistema: inteligencia artificial, bases de datos e infraestructura";

function ProductCopy() {
  return (
    <div className="w-full max-w-[1240px] text-left">
      {/* Two rows of wide panels rather than three tall columns: the long
          paragraphs get enough measure to stay inside one pinned viewport. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`${PANEL} lg:col-span-5`}>
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-cream/75">
            02 · El producto
          </span>
          <h2 className="mt-2 font-serif text-3xl font-normal leading-[1.05] text-cream xl:text-4xl">
            B³ AgriFood®
          </h2>
          <p className="mt-3 text-base leading-relaxed text-cream">
            Un sistema de bases de datos e inteligencia artificial para el agro:
            un entorno visual donde se cruzan variables, regiones y campañas del
            sector, construido sobre una arquitectura de tres capas.
          </p>
        </div>

        <div className={`${PANEL} lg:col-span-7`}>
          <p className="text-base leading-relaxed text-cream">
            Mientras que una herramienta de Business Intelligence ordena datos
            que alguien cargó a mano, B³ AgriFood los busca, los verifica y los
            organiza según el criterio de especialistas del sector. Lo que
            entrega no son gráficos sueltos: son lecturas del estado del agro,
            mediciones y resultados históricos, que muestran los escenarios
            posibles y lo que ocurrió en situaciones equivalentes.
          </p>
        </div>

        <div className={`${PANEL} lg:col-span-7`}>
          <p className="text-base leading-relaxed text-cream">
            La versión Beta se construye sobre 100 bases de datos del sector
            agroalimentario, normalizadas bajo la metodología B³ Minibox. El
            universo completo del sistema ya alcanza las 240 bases, nacionales e
            internacionales, que se incorporan de forma progresiva a medida que
            el proyecto escala: primero Argentina, luego Latinoamérica y el
            resto del mundo.
          </p>
        </div>

        <div className={`${PANEL} lg:col-span-5`}>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-cream/75">
            Posicionamiento
          </span>
          <p className="mt-2 text-base font-medium leading-snug text-cream">
            El sistema de inteligencia sobre el que el agro decide, con el
            análisis y el criterio experto ya disponibles en el momento de
            decidir.
          </p>
          {/* CTA sits beside the pilot line rather than under it: stacking the
              two overflows the pinned stage on a 640px-tall viewport. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-cream/25 pt-3">
            <div>
              <div className="font-mono text-lg font-semibold text-cream">
                Santiago del Estero
              </div>
              <div className="text-sm text-cream/80">
                Prueba piloto de la plataforma
              </div>
            </div>
            <Button href="#contacto" variant="solid-light" withArrow>
              Solicitar demo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Product() {
  return (
    <ExpandSection
      id="producto"
      src={IMAGE_SRC}
      alt={IMAGE_ALT}
      title="B³ AgriFood®"
      compactClassName="border-b border-cocoa/10 bg-olive"
    >
      <ProductCopy />
    </ExpandSection>
  );
}
