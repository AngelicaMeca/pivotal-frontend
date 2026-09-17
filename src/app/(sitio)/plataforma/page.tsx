import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Container from "@/components/Container";
import Button from "@/components/Button";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import { ArrowIcon } from "@/components/icons";
import { DASHBOARD_HOME, dashboardSections, hasDashboards } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Plataforma · Pivotal",
  description:
    "Ingreso a los tableros públicos de B³ AgriFood Provincia para Santiago del Estero.",
};

const facts = [
  { label: "Provincia", value: "Santiago del Estero" },
  { label: "Áreas publicadas", value: "Agricultura y ganadería" },
  { label: "Estado", value: "Beta" },
];

// Direct access to the B³ AgriFood Provincia dashboards, served by this same
// site under /plataforma (see src/app/(tableros)/).
export default function PlataformaPage() {
  const disponibles = hasDashboards();

  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="bg-cocoa pt-44 pb-24 md:pb-32">
          <Container>
            <Reveal>
              <div className="grid grid-cols-12 gap-x-6 gap-y-10 md:gap-x-8">
                <div className="col-span-12 md:col-span-2">
                  <span className="font-mono text-sm tnum text-cream/50">00</span>
                </div>
                <div className="col-span-12 md:col-span-10">
                  <div className="mb-6 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-olive-soft">
                    <span className="h-px w-8 bg-olive-soft" />
                    Plataforma
                  </div>
                  <h1 className="max-w-3xl font-serif text-[2.75rem] font-normal leading-[1.05] tracking-tight text-cream sm:text-6xl">
                    B³ AgriFood Provincia, en funcionamiento para Santiago del Estero.
                  </h1>
                  <p className="mt-8 max-w-xl text-base leading-relaxed text-cream/75 sm:text-lg">
                    Los tableros reúnen la información productiva de la
                    provincia, verificada y actualizada por Pivotal, lista para
                    consultar por área, por departamento y por campaña.
                  </p>
                  <div className="mt-10 flex flex-wrap gap-3">
                    {disponibles ? (
                      <Button href={DASHBOARD_HOME} variant="solid-light" withArrow>
                        Ingresar al tablero
                      </Button>
                    ) : (
                      <Button href="/#contacto" variant="solid-light" withArrow>
                        Solicitar una demo
                      </Button>
                    )}
                    <Button href="/#provincia" variant="outline-light">
                      Qué es B³ AgriFood Provincia
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <dl className="mt-20 grid grid-cols-1 border-t border-cream/15 sm:grid-cols-3">
                {facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="border-b border-cream/15 py-6 sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0"
                  >
                    <dt className="font-mono text-xs uppercase tracking-[0.2em] text-cream/60">
                      {fact.label}
                    </dt>
                    <dd className="mt-3 text-2xl font-semibold tracking-tight text-cream">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </Container>
        </section>

        <section className="bg-cream py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="01"
                eyebrow="Acceso directo"
                title="Entrá directo a la vista que necesitás."
                description={
                  disponibles
                    ? "Cada enlace abre el tablero en esa sección. Las demás áreas se suman a medida que se incorporan sus bases."
                    : "Los tableros se están actualizando con los datos más recientes y vuelven a estar disponibles en breve."
                }
              />
            </Reveal>

            <Reveal delay={0.1}>
              <div className="mt-16 grid grid-cols-12 gap-x-6 md:gap-x-8">
                <div className="col-span-12 md:col-span-10 md:col-start-3">
                  {dashboardSections.map((section) => (
                    <div
                      key={section.area}
                      className="grid grid-cols-12 gap-x-6 border-t border-cocoa/15 py-6 last:border-b md:gap-x-8"
                    >
                      <span className="col-span-12 pb-3 font-mono text-xs uppercase tracking-[0.2em] text-brown md:col-span-3 md:pt-4 md:pb-0">
                        {section.area}
                      </span>
                      <ul className="col-span-12 md:col-span-9">
                        {section.views.map((view) => {
                          const body = (
                            <span className="min-w-0">
                              <span className="block text-xl font-semibold tracking-tight text-cocoa">
                                {view.name}
                              </span>
                              <span className="mt-1 block text-sm leading-relaxed text-cocoa/80">
                                {view.detail}
                              </span>
                            </span>
                          );
                          return (
                            <li key={view.href}>
                              {disponibles ? (
                                // Plain <a>: the dashboards have their own root layout, so
                                // the jump is a full page load either way
                                <a
                                  href={view.href}
                                  className="group flex items-center justify-between gap-6 rounded-2xl px-4 py-4 transition-colors duration-200 hover:bg-cocoa/[0.06] md:-mx-4"
                                >
                                  {body}
                                  <span
                                    aria-hidden="true"
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cocoa text-cream transition-transform duration-300 group-hover:rotate-45"
                                  >
                                    <ArrowIcon className="h-4 w-4" />
                                  </span>
                                </a>
                              ) : (
                                <div className="flex items-center justify-between gap-6 px-4 py-4 md:-mx-4">
                                  {body}
                                  <span className="shrink-0 rounded-full border border-cocoa/20 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-cocoa/80">
                                    En preparación
                                  </span>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
