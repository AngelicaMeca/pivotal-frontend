import { GLASS_PANEL as PANEL } from "@/lib/expand";
import { provinciaProducts } from "@/lib/content";
import Button from "./Button";
import ExpandSection from "./ExpandSection";

const IMAGE_SRC = "/b3-provincia.webp";
const IMAGE_ALT =
  "Tres personas revisan en una laptop el tablero de B³ AgriFood, con el mapa de Argentina, rendimiento, producción y escenarios posibles, en una mesa frente a un cultivo al atardecer";

function ProvinciaCopy() {
  return (
    <div className="w-full max-w-[1240px] text-left">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`${PANEL} lg:col-span-5`}>
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-cream/75">
            03 · El paquete institucional
          </span>
          <h2 className="mt-2 font-serif text-3xl font-normal leading-[1.05] text-cream xl:text-4xl">
            B³ AgriFood® Provincia
          </h2>
          <p className="mt-3 text-base leading-relaxed text-cream">
            Traslada la infraestructura de Pivotal al Estado: terceriza
            integralmente la gestión, verificación y actualización permanente
            de la información productiva de una provincia, respaldada en más de
            100 fuentes certificadas.
          </p>
        </div>

        <div className={`${PANEL} lg:col-span-7`}>
          <p className="text-base leading-relaxed text-cream">
            El organismo que contrata Pivotal no tiene que conformar ni sostener
            una unidad propia de datos, y quien ya tiene una deja de operarla:
            pasa a recibir resultados. Es un entorno de gestión y consulta
            configurado a su medida. Pivotal absorbe la complejidad técnica; la
            provincia conserva el control sobre qué información publica, cuál
            usa internamente y con quién la comparte.
          </p>
          <div className="mt-6">
            <Button href="/plataforma" variant="solid-light" withArrow>
              Ver el tablero de Santiago del Estero
            </Button>
          </div>
        </div>

        {provinciaProducts.map((item) => (
          <div key={item.index} className={`${PANEL} lg:col-span-4`}>
            <span className="tnum font-mono text-xs text-cream/75">{item.index}</span>
            <h3 className="mt-2 text-lg font-semibold text-cream">{item.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-cream/90">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Provincia() {
  return (
    <ExpandSection
      id="provincia"
      src={IMAGE_SRC}
      alt={IMAGE_ALT}
      title="B³ AgriFood® Provincia"
      compactClassName="border-b border-cocoa/10 bg-cocoa"
    >
      <ProvinciaCopy />
    </ExpandSection>
  );
}
