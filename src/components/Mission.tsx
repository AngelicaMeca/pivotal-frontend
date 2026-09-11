import Container from "./Container";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import { values } from "@/lib/content";

export default function Mission() {
  return (
    <section
      id="nosotros"
      className="swiss-grid-bg-dark border-b border-cocoa/10 bg-cocoa py-24 md:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            index="07"
            eyebrow="Misión, visión y valores"
            title="El estándar de inteligencia confiable de los sectores especializados."
            tone="dark"
          />
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-16 grid grid-cols-12 gap-x-6 gap-y-14 md:gap-x-8">
            <div className="col-span-12 md:col-span-2" />

            <div className="col-span-12 md:col-span-4">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-clay">
                Misión
              </span>
              <p className="mt-5 text-2xl font-medium leading-snug text-cream">
                Garantizar que las organizaciones decidan sobre información
                confiable.
              </p>
            </div>

            <div className="col-span-12 md:col-span-4">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-clay">
                Visión
              </span>
              <p className="mt-5 text-2xl font-medium leading-snug text-cream">
                Ser el estándar de inteligencia confiable de los sectores
                especializados, primero en Latinoamérica y luego en el mundo.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-16 grid grid-cols-12 gap-x-6 gap-y-8 border-t border-cream/10 pt-14 md:gap-x-8">
            <div className="col-span-12 md:col-span-2">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-cream/50">
                Valores
              </span>
            </div>
            <div className="col-span-12 grid grid-cols-1 gap-x-8 gap-y-8 md:col-span-10 md:grid-cols-2">
              {values.map((value) => (
                <div key={value.name} className="border-t border-cream/10 pt-5">
                  <h4 className="text-base font-semibold text-cream">
                    {value.name}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-cream/60">
                    {value.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
