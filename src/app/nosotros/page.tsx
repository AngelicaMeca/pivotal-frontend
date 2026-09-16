import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Mission from "@/components/Mission";
import Container from "@/components/Container";
import Button from "@/components/Button";
import Contact from "@/components/Contact";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import TeamPortrait from "@/components/TeamPortrait";
import ValuesDeck from "@/components/ValuesDeck";
import { values } from "@/lib/content";

export const metadata: Metadata = {
  title: "Nosotros · Pivotal",
  description:
    "Quiénes somos en Pivotal: el equipo detrás de la infraestructura de inteligencia gestionada para sectores especializados.",
};

const team = [
  {
    name: "Francisco Battan",
    role: "CEO y Fundador",
    photo: "/equipo/francisco-battan.webp",
    bio: "Fundó Pivotal y lidera su estrategia y el desarrollo de B³ AgriFood, el primer sistema construido sobre la infraestructura de la compañía.",
  },
];

const facts = [
  { label: "Primer sistema", value: "B³ AgriFood" },
  { label: "Mercado inicial", value: "Argentina" },
  { label: "Modelo", value: "Servicio gestionado" },
];

export default function NosotrosPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        {/* Opening statement */}
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
                    Nosotros
                  </div>
                  {/* Same type as the home hero headline */}
                  <h1 className="max-w-3xl font-serif text-[2.75rem] font-normal leading-[1.05] tracking-tight text-cream sm:text-6xl">
                    Construimos la infraestructura que nos hubiera gustado tener.
                  </h1>
                  <p className="mt-8 max-w-xl text-base leading-relaxed text-cream/75 sm:text-lg">
                    Pivotal diseña y opera bases de datos y entornos de
                    inteligencia artificial cerrados, construidos y mantenidos
                    por especialistas de cada sector, para que las
                    organizaciones decidan sobre información confiable.
                  </p>
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

        {/* Mission, vision and values, moved here from the home page */}
        <Mission index="01" />

        {/* Leadership */}
        <section id="equipo" className="bg-cocoa py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="02"
                eyebrow="Equipo"
                title="Las personas que responden por el resultado."
                tone="dark"
              />
            </Reveal>

            {team.map((person) => (
              <Reveal key={person.name} delay={0.1}>
                <article className="mt-16 grid grid-cols-12 items-end gap-x-6 gap-y-10 md:gap-x-8">
                  <div className="col-span-12 sm:col-span-8 md:col-span-4 md:col-start-3">
                    <TeamPortrait src={person.photo} name={person.name} />
                  </div>
                  <div className="col-span-12 md:col-span-5 md:pb-2">
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-clay">
                      {person.role}
                    </span>
                    <h3 className="mt-4 text-4xl font-semibold tracking-tight text-cream sm:text-5xl">
                      {person.name}
                    </h3>
                    <p className="mt-6 max-w-md text-base leading-relaxed text-cream/80 sm:text-lg">
                      {person.bio}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </Container>
        </section>

        {/* Values as a depth carousel. Cards leaving the front slide out past
            the right edge: clip them there rather than let the page scroll. */}
        <section className="overflow-x-clip bg-cream py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="03"
                eyebrow="Valores"
                title="Lo que no negociamos."
              />
            </Reveal>

            <Reveal delay={0.1}>
              <div className="mt-14">
                <ValuesDeck values={values} />
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="mt-12 flex flex-wrap gap-3">
                <Button href="/#producto" variant="solid" withArrow>
                  Conocer B³ AgriFood
                </Button>
                <Button href="/" variant="outline">
                  Volver al inicio
                </Button>
              </div>
            </Reveal>
          </Container>
        </section>

        <Contact index="04" />
      </main>
      <Footer />
    </>
  );
}
