import Button from "./Button";
import PillarCarousel, { type Pillar } from "./PillarCarousel";
import Reveal from "./Reveal";
import { CheckCircleIcon, ClockIcon, LayersIcon, ShieldIcon } from "./icons";

const pillars: Pillar[] = [
  {
    index: "01",
    icon: <ShieldIcon className="h-5 w-5" />,
    title: "Un entorno cerrado",
    description:
      "Solo entran datos verificados, controlados y normalizados desde fuentes conocidas. No corre sobre internet abierto.",
    linkLabel: "Ver la tecnología",
    href: "/#tecnologia",
  },
  {
    index: "02",
    icon: <LayersIcon className="h-5 w-5" />,
    title: "Criterio experto en el sistema",
    description:
      "La metodología de los especialistas está incorporada al sistema y se aplica sola. El cliente no necesita saber qué preguntar.",
    linkLabel: "Conocer B³ AgriFood",
    href: "/#producto",
  },
  {
    index: "03",
    icon: <ClockIcon className="h-5 w-5" />,
    title: "Trabajo permanente",
    description:
      "Los cruces se procesan de forma continua, sin intervención manual. El análisis ya está hecho cuando se lo necesita.",
    linkLabel: "Ver el paquete institucional",
    href: "/#provincia",
  },
  {
    index: "04",
    icon: <CheckCircleIcon className="h-5 w-5" />,
    title: "Un servicio gestionado",
    description:
      "Pivotal retiene la responsabilidad de operar, mantener y actualizar el sistema. El cliente recibe el resultado, no el problema.",
    linkLabel: "Ver la propuesta de valor",
    href: "/#propuesta-de-valor",
  },
];

// Split screen: statement on the left, a row of pillar cards on the right
// that runs off the page edge, divided by a full-height rule.
export default function About() {
  return (
    <section id="quienes-somos" className="@container bg-cream">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left inset matches Container, so the copy lines up with the other
            sections even though this half has no max width of its own.
            cqw rather than vw: vw counts the scrollbar, Container does not. */}
        <div className="flex items-center px-6 pt-24 pb-16 md:px-10 lg:py-32 lg:pr-16 lg:pl-[max(4rem,calc((100cqw-1400px)/2+4rem))]">
          <Reveal>
            <div className="mb-8 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-olive">
              <span className="h-px w-8 bg-olive" />
              Quiénes somos
            </div>
            <h2 className="max-w-xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              <span className="text-cocoa">Porque decidir sobre datos dispersos</span>{" "}
              <span className="text-brown">no debería ser tan complicado</span>
            </h2>
            <p className="mt-8 max-w-md text-base leading-relaxed text-cocoa/75 sm:text-lg">
              Vivimos el mismo desorden de fuentes, planillas y versiones que el
              resto del sector, así que construimos la infraestructura que nos
              hubiera gustado tener.
            </p>
            <div className="mt-10">
              <Button href="/nosotros" variant="solid" withArrow>
                Conocer Pivotal
              </Button>
            </div>
          </Reveal>
        </div>

        <div className="flex min-w-0 flex-col justify-center border-t border-cocoa/15 pt-16 pb-24 [--pillar-inset:1.5rem] md:[--pillar-inset:2.5rem] lg:border-t-0 lg:border-l lg:py-32">
          <PillarCarousel pillars={pillars} />
        </div>
      </div>
    </section>
  );
}
