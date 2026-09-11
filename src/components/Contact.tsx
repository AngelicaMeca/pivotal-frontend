import Button from "./Button";
import Container from "./Container";
import Reveal from "./Reveal";

export default function Contact() {
  return (
    <section id="contacto" className="bg-cream py-24 md:py-32">
      <Container>
        <Reveal>
          <div className="rounded-[32px] border border-olive/40 bg-olive/30 px-8 py-14 backdrop-blur-md sm:px-14 sm:py-20">
            <div className="grid grid-cols-12 gap-x-6 gap-y-10 md:gap-x-8">
              <div className="col-span-12 md:col-span-2">
                <span className="font-mono text-sm tnum text-cocoa/60">08</span>
              </div>
              <div className="col-span-12 md:col-span-7">
                <div className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
                  <span className="h-px w-8 bg-cocoa/40" />
                  Hablemos
                </div>
                <h2 className="max-w-xl text-3xl font-semibold leading-[1.1] tracking-tight text-cocoa sm:text-4xl">
                  Pida una demo de B³ AgriFood y vea el sistema en operación.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-cocoa/75">
                  El sistema ya cuenta con una demo funcional, independiente
                  del cronograma de la Beta, disponible para mostrarse en
                  operación ante gobiernos e instituciones del agro.
                </p>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Button href="mailto:contacto@pivotal.ai" variant="solid" withArrow>
                    Escribir a Pivotal
                  </Button>
                  <Button href="#producto" variant="outline">
                    Volver al producto
                  </Button>
                </div>
              </div>
              <div className="col-span-12 md:col-span-3 md:col-start-10">
                <div className="rounded-2xl border-l-2 border-clay bg-clay/[0.06] p-6">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
                    Contacto directo
                  </span>
                  <p className="mt-3 text-sm leading-relaxed text-cocoa">
                    contacto@pivotal.ai
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-cocoa">
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
