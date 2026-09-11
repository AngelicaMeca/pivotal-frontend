import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Container from "@/components/Container";
import Button from "@/components/Button";

export const metadata: Metadata = {
  title: "Nosotros · Pivotal",
  description:
    "Quiénes somos en Pivotal: el equipo detrás de la infraestructura de inteligencia gestionada para sectores especializados.",
};

export default function NosotrosPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <section className="swiss-grid-bg-dark bg-cocoa pt-44 pb-24 md:pb-32">
          <Container>
            <div className="mb-6 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-clay">
              <span className="h-px w-8 bg-clay" />
              Nosotros
            </div>
            <h1 className="max-w-3xl font-serif text-[2.5rem] font-normal leading-[1.05] tracking-tight text-cream sm:text-6xl">
              El equipo detrás de la infraestructura.
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-cream/70 sm:text-lg">
              Esta página está en construcción. Acá va a vivir la historia de
              Pivotal: quiénes somos, cómo trabajamos y por qué decidimos
              hacernos cargo de la inteligencia de sectores donde decidir mal
              cuesta caro.
            </p>
            <div className="mt-10">
              <Button href="/" variant="outline-light">
                Volver al inicio
              </Button>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
