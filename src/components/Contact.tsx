import Button from "./Button";
import Container from "./Container";
import MetaBalls from "./MetaBalls";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

export default function Contact() {
  return (
    <section id="contacto" className="relative isolate overflow-hidden bg-cocoa py-24 md:py-32">
      {/* The hero metaballs, sharp, spread around the card. They only soften
          where they pass behind it, through its backdrop blur. The layer sits
          inside the section and contain keeps every blob off its edges, so
          none is cut off. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-4 -z-10 opacity-80 sm:inset-8">
        <MetaBalls
          color="#c18477"
          cursorBallColor="#f1dccb"
          cursorBallSize={2}
          ballCount={12}
          animationSize={14}
          clumpFactor={0.85}
          speed={0.25}
          hoverSmoothness={0.06}
          contain
          enableTransparency
        />
      </div>

      <Container>
        <Reveal>
          {/* Frosted cocoa panel, dense enough that the copy keeps at least
              4.5:1 even with the cream cursor blob directly behind it; the
              bubbles still show through it and all around it */}
          <div className="rounded-[32px] border border-cream/15 bg-cocoa/70 px-6 py-12 backdrop-blur-xl sm:px-12 sm:py-16">
            <SectionHeading
              index="08"
              eyebrow="Hablemos"
              title="Pida una demo de B³ AgriFood y vea el sistema en operación."
              tone="glass"
              description="El sistema ya cuenta con una demo funcional, independiente del cronograma de la Beta, disponible para mostrarse en operación ante gobiernos e instituciones del agro."
            />

            <div className="mt-12 grid grid-cols-12 gap-x-6 gap-y-10 md:gap-x-8">
              <div className="col-span-12 flex flex-wrap items-start gap-4 md:col-span-6 md:col-start-3">
                <Button href="mailto:contacto@pivotal.ai" variant="solid-light" withArrow>
                  Escribir a Pivotal
                </Button>
                <Button href="#producto" variant="outline-light">
                  Volver al producto
                </Button>
              </div>

              <div className="col-span-12 md:col-span-4">
                <div className="rounded-[24px] border border-cream/15 bg-cream/[0.06] p-7">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-cream/80">
                    Contacto directo
                  </span>
                  <a
                    href="mailto:contacto@pivotal.ai"
                    className="mt-4 block text-lg font-medium text-cream underline-offset-4 hover:underline"
                  >
                    contacto@pivotal.ai
                  </a>
                  <p className="mt-2 text-sm leading-relaxed text-cream/90">
                    Santiago del Estero, Argentina
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
