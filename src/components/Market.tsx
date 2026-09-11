import Container from "./Container";
import Globe from "./Globe";
import MarketSegments from "./MarketSegments";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

// Server component so the globe's land data stays on the server; only the
// animated segment cards run on the client.
export default function Market() {
  return (
    <section className="overflow-hidden border-b border-cocoa/10 bg-cream pt-24 md:pt-32">
      <Container>
        <Reveal>
          <SectionHeading
            index="06"
            eyebrow="Mercado"
            title="Argentina primero, con expansión planificada por fases."
            description="Primero el ecosistema agroalimentario argentino, luego Latinoamérica, después el resto del mundo: el análisis agroalimentario exige una mirada sistémica, no compartimentos aislados por país."
          />
        </Reveal>

        <MarketSegments />

        {/* Rises from the bottom edge of the section, which crops it */}
        <Globe className="mt-20 md:mt-28" />
      </Container>
    </section>
  );
}
