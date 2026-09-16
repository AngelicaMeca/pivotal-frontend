import AccordionGallery, { type AccordionItem } from "./AccordionGallery";
import Container from "./Container";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import { values } from "@/lib/content";

// Same three deepened palette tones as the technology panels, where cream
// text clears 4.5:1; cycled across the five values.
const TONES = [
  "color-mix(in srgb, var(--color-clay) 50%, var(--color-cocoa))",
  "color-mix(in srgb, var(--color-olive) 60%, var(--color-cocoa))",
  "color-mix(in srgb, var(--color-brown) 85%, var(--color-cocoa))",
];

const valueItems: AccordionItem[] = values.map((value, i) => {
  const index = String(i + 1).padStart(2, "0");
  return {
    key: index,
    background: TONES[i % TONES.length],
    // Outlined numeral as the drifting media layer, where the technology
    // panels use line drawings
    media: (
      <span className="value-numeral text-outline" aria-hidden="true">
        {index}
      </span>
    ),
    header: (
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-cream/90">
        Valor {index}
      </span>
    ),
    // Horizontal only on the open panel, which is wide enough for it; closed
    // panels carry the name vertically instead of cutting it
    title: <h3 className="text-lg font-semibold leading-snug text-cream">{value.name}</h3>,
    collapsedTitle: <span className="text-base font-semibold text-cream">{value.name}</span>,
    detail: <p className="text-[0.95rem] leading-relaxed text-cream">{value.detail}</p>,
  };
});

// Mission, vision and values. Lives on /nosotros.
// index: the section number on the page that hosts it
export default function Mission({ index }: { index: string }) {
  return (
    <section
      id="nosotros"
      className="border-b border-cocoa/10 bg-cream py-24 md:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            index={index}
            eyebrow="Misión, visión y valores"
            title="El estándar de inteligencia confiable de los sectores especializados."
            description="Vivimos el mismo desorden de fuentes, planillas y versiones que el resto del sector. En lugar de sumar otra herramienta, nos hicimos cargo del problema: operamos la inteligencia del cliente de forma permanente y respondemos por su calidad."
          />
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-16 grid grid-cols-12 gap-x-6 gap-y-14 md:gap-x-8">
            <div className="col-span-12 md:col-span-2" />

            <div className="col-span-12 md:col-span-4">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-brown">
                Misión
              </span>
              <p className="mt-5 text-2xl font-medium leading-snug text-cocoa">
                Garantizar que las organizaciones decidan sobre información
                confiable.
              </p>
            </div>

            <div className="col-span-12 md:col-span-4">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-brown">
                Visión
              </span>
              <p className="mt-5 text-2xl font-medium leading-snug text-cocoa">
                Ser el estándar de inteligencia confiable de los sectores
                especializados, primero en Latinoamérica y luego en el mundo.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-16 border-t border-cocoa/15 pt-14">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
              Valores
            </span>
            {/* The open panel takes 40% of the row so the four closed ones stay
                wide enough for their titles */}
            <AccordionGallery
              className="mt-8"
              items={valueItems}
              label="Valores de Pivotal"
              defaultIndex={0}
              expandRatio={0.4}
              height={440}
              gap={12}
              radius={24}
              padding={24}
              tilt={6}
              hideMediaWhenCollapsed
              accentColor="#f1dccb"
              overlayColor="#2b1c18"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
