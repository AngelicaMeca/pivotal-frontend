import Container from "./Container";
import Globe from "./Globe";
import MarketSegments from "./MarketSegments";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";
import { marketPhases } from "@/lib/content";

// Server component so the globe's land data stays on the server; only the
// animated segment cards run on the client.
// Same colours as the globe pins for each phase
const PHASE_DOTS = ["bg-clay", "bg-olive", "bg-cocoa/35"];

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

        {/* Expansion roadmap: markers share the globe pin colours. Phase 1
            carries a pulse because its pilot is already running. */}
        <Reveal delay={0.1}>
          <ol className="relative mt-20 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            <span
              aria-hidden="true"
              className="absolute top-[11px] right-0 left-0 hidden border-t border-dashed border-cocoa/25 md:block"
            />
            <span
              aria-hidden="true"
              className="absolute top-[11px] left-0 hidden h-px w-1/3 bg-clay md:block"
            />
            {marketPhases.map((phase, i) => (
              <li key={phase.index} className="relative">
                <span className="relative flex h-6 w-6 items-center justify-center" aria-hidden="true">
                  {i === 0 ? <span className="phase-pulse absolute inset-0 rounded-full bg-clay" /> : null}
                  <span className={`relative h-3.5 w-3.5 rounded-full ring-4 ring-cream ${PHASE_DOTS[i]}`} />
                </span>
                <span className="mt-5 block font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
                  Fase {phase.index}
                </span>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-cocoa">{phase.name}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-cocoa/80">{phase.detail}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        {/* Rises from the bottom edge of the section, which crops it */}
        <Globe className="mt-20 md:mt-28" />
      </Container>
    </section>
  );
}
