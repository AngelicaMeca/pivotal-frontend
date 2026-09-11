import AccordionGallery, { type AccordionItem } from "./AccordionGallery";
import Container from "./Container";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";
import { technologies } from "@/lib/content";

// Line drawings standing in for photos in the accordion's media layer. Drawn
// in the current text colour and kept faint, so they read as texture.
const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinejoin: "round" as const,
};

// Big Black Box: a closed cube holding a second one, the sealed environment.
function CubeArt() {
  const cube = (s: number) => {
    const p = (x: number, y: number) => `${200 + x * s},${200 + y * s}`;
    return (
      <g {...LINE}>
        <polygon points={[p(0, -110), p(110, -50), p(0, 10), p(-110, -50)].join(" ")} />
        <polygon points={[p(-110, -50), p(0, 10), p(0, 130), p(-110, 70)].join(" ")} />
        <polygon points={[p(110, -50), p(0, 10), p(0, 130), p(110, 70)].join(" ")} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 400 400" className="tech-art">
      {cube(1)}
      {cube(0.45)}
    </svg>
  );
}

// Minibox: a grid of small boxes, some lit, the metadata layer that sorts data.
function GridArt() {
  const lit = new Set([1, 6, 7, 9, 14]);
  const cells = Array.from({ length: 16 }, (_, i) => {
    const x = 70 + (i % 4) * 68;
    const y = 70 + Math.floor(i / 4) * 68;
    return (
      <rect
        key={i}
        x={x}
        y={y}
        width={56}
        height={56}
        rx={6}
        {...LINE}
        fill={lit.has(i) ? "currentColor" : "none"}
        fillOpacity={0.35}
      />
    );
  });
  return (
    <svg viewBox="0 0 400 400" className="tech-art">
      <rect x={52} y={52} width={296} height={296} rx={14} {...LINE} />
      {cells}
    </svg>
  );
}

// ∞ Prompt: nested infinity loops, the agent that never stops crossing data.
function LoopArt() {
  const loop =
    "M 200 200 C 250 120, 350 120, 350 200 C 350 280, 250 280, 200 200 C 150 120, 50 120, 50 200 C 50 280, 150 280, 200 200 Z";
  return (
    <svg viewBox="0 0 400 400" className="tech-art">
      {[1, 0.72, 0.44].map((s) => (
        <path
          key={s}
          d={loop}
          {...LINE}
          transform={`translate(${200 - 200 * s} ${200 - 200 * s}) scale(${s})`}
          strokeWidth={1.5 / s}
        />
      ))}
    </svg>
  );
}

const ART = [CubeArt, GridArt, LoopArt];

// Three palette tones, each deepened toward cocoa until cream text on it
// clears 4.5:1: olive, brown and clay.
const TONES = [
  "color-mix(in srgb, var(--color-olive) 60%, var(--color-cocoa))",
  "color-mix(in srgb, var(--color-brown) 85%, var(--color-cocoa))",
  "color-mix(in srgb, var(--color-clay) 50%, var(--color-cocoa))",
];

const items: AccordionItem[] = technologies.map((tech, i) => {
  const Art = ART[i % ART.length];
  return {
    key: tech.index,
    background: TONES[i % TONES.length],
    media: <Art />,
    header: (
      <div className="flex items-baseline justify-between gap-4">
        <span className="tnum font-mono text-xs text-cream/85">{tech.index}</span>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-cream/90">
          {tech.role}
        </span>
      </div>
    ),
    title: (
      <h3 className="text-2xl font-semibold leading-snug text-cream">{tech.name}</h3>
    ),
    detail: (
      <p className="text-[0.95rem] leading-relaxed text-cream">{tech.description}</p>
    ),
  };
});

export default function Technologies() {
  return (
    <section
      id="tecnologia"
      className="swiss-grid-bg-dark border-b border-cocoa/10 bg-cocoa py-24 md:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeading
            index="04"
            eyebrow="El motor"
            title="Tres tecnologías propietarias, un solo sistema."
            tone="dark"
            description="No se contratan por separado: operan integradas como un único motor, y esa integración, no cada pieza por sí sola, es lo que hace al sistema difícil de replicar."
          />
        </Reveal>

        <Reveal delay={0.1}>
          <AccordionGallery
            className="mt-16"
            items={items}
            label="Tecnologías de Pivotal"
            defaultIndex={0}
            expandRatio={0.56}
            height={500}
            gap={14}
            radius={28}
            padding={32}
            tilt={6}
            accentColor="#f1dccb"
            overlayColor="#2b1c18"
          />
        </Reveal>
      </Container>
    </section>
  );
}
