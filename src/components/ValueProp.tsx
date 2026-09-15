import Container from "./Container";
import type { DepthCarouselItem } from "./DepthCarousel";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";
import ValueShowcase from "./ValueShowcase";
import { differentiators, resolves } from "@/lib/content";
import { VALUE_TONES, type ValueTone } from "@/lib/valueTones";

const GROUPS: { tone: ValueTone; items: { title: string; detail: string }[] }[] = [
  { tone: "resolves", items: resolves },
  { tone: "differentiators", items: differentiators },
];

// Grouped rather than interleaved: the front card reads in order, first what
// the system solves, then what sets it apart.
const items: DepthCarouselItem[] = GROUPS.flatMap(({ tone, items: group }) =>
  group.map((item, i) => {
    const t = VALUE_TONES[tone];
    const key = `${tone}-${i}`;
    return {
      key,
      label: item.title,
      className: t.card,
      // Keyed too: these elements are built inside a list on the server and
      // React validates them as list children once rendered on the client
      content: (
        <div key={key} className="flex h-full flex-col justify-between p-8">
          <div>
            <span className={`font-mono text-[0.65rem] uppercase tracking-[0.2em] ${t.tag}`}>
              {t.label}
            </span>
            <h3 className="mt-8 text-[1.375rem] font-semibold leading-tight">{item.title}</h3>
            <p className={`mt-3 text-[0.95rem] leading-relaxed ${t.detail}`}>{item.detail}</p>
          </div>
          <span className={`tnum font-mono text-6xl font-semibold ${t.numeral}`} aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
        </div>
      ),
    };
  }),
);

const tones: ValueTone[] = GROUPS.flatMap(({ tone, items: group }) => group.map(() => tone));

export default function ValueProp() {
  return (
    <section
      id="propuesta-de-valor"
      className="border-b border-cocoa/10 bg-cream py-24 md:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            index="05"
            eyebrow="Propuesta de valor"
            title="Lo que resuelve y por qué es distinto."
          />
        </Reveal>

        <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
          <div className="col-span-12 md:col-span-10 md:col-start-3">
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {GROUPS.map(({ tone }) => (
                  <span
                    key={tone}
                    className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-cocoa/80"
                  >
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ background: VALUE_TONES[tone].swatch }}
                    />
                    {VALUE_TONES[tone].label}
                  </span>
                ))}
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
                Arrastrá o usá las flechas
              </span>
            </div>

            <div className="mt-8">
              <ValueShowcase items={items} tones={tones} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
