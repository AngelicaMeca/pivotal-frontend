"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRightIcon } from "./icons";

export type Pillar = {
  index: string;
  // Rendered icon: components cannot cross into a client component as props
  icon: ReactNode;
  title: string;
  description: string;
  linkLabel: string;
  href: string;
};

// The row is rendered three times over. The middle copy is the real one; the
// copies either side give the scroll somewhere to go past the ends, and once
// scrolling settles on a copy the position jumps by one set width to the same
// card in the middle copy. Cards are identical, so the jump never shows and
// the row has no first or last card in either direction.
const COPIES = 3;
const REAL = 1;

// Neutral surface for the controls under the row
const TILE = "bg-[color-mix(in_srgb,var(--color-cocoa)_7%,var(--color-cream))]";

// One palette colour per pillar, dark and light alternating so neighbours
// read apart. Olive is lifted 10% toward cream so cocoa copy on it clears
// 4.5:1; brown carries cream at full strength for the same reason.
const TONES = [
  { card: "bg-cocoa text-cream", body: "text-cream/85", meta: "text-cream/70", plus: "hover:bg-clay" },
  {
    card: "bg-[color-mix(in_srgb,var(--color-olive)_90%,var(--color-cream))] text-cocoa",
    body: "text-cocoa",
    meta: "text-cocoa",
    plus: "hover:bg-cocoa hover:text-cream",
  },
  { card: "bg-brown text-cream", body: "text-cream", meta: "text-cream", plus: "hover:bg-cocoa hover:text-cream" },
  { card: "bg-clay text-cocoa", body: "text-cocoa", meta: "text-cocoa", plus: "hover:bg-cocoa hover:text-cream" },
];

function PillarCard({
  pillar,
  tone,
  panelId,
  isOpen,
  onToggle,
  clone,
}: {
  pillar: Pillar;
  tone: (typeof TONES)[number];
  panelId: string;
  isOpen: boolean;
  onToggle: () => void;
  clone: boolean;
}) {
  const { index, icon, title, description, linkLabel, href } = pillar;
  // Copies stay clickable (they are on screen between jumps) but are kept
  // out of the tab order so keyboard users walk the real set once.
  const tab = clone ? -1 : undefined;

  return (
    <>
      <div className="flex items-start justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream text-cocoa">
          {icon}
        </span>
        <span className={`tnum font-mono text-xs ${tone.meta}`}>{index}</span>
      </div>

      <div
        id={panelId}
        className={`mt-8 flex-1 transition-[opacity,visibility,translate] duration-300 ${
          isOpen ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0"
        }`}
      >
        <p className={`text-[0.95rem] leading-relaxed ${tone.body}`}>{description}</p>
        <a
          href={href}
          tabIndex={tab}
          className="group mt-5 inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          {linkLabel}
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </a>
      </div>

      <h3 className="text-2xl font-medium leading-tight tracking-tight">{title}</h3>
      <button
        type="button"
        tabIndex={tab}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? `Cerrar ${title}` : `Ver más sobre ${title}`}
        className={`mt-5 flex h-9 w-9 items-center justify-center rounded-full bg-cream text-cocoa transition-colors duration-200 ${tone.plus}`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}

// Left padding of the scroller, which is also its snap inset. Cards are
// positioned relative to the scroller, so offsetLeft includes it.
function inset(scroller: HTMLElement) {
  return parseFloat(getComputedStyle(scroller).paddingLeft) || 0;
}

export default function PillarCarousel({ pillars }: { pillars: Pillar[] }) {
  const n = pillars.length;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  // Keyed by pillar, so a card reads the same in every copy
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const slides = Array.from({ length: n * COPIES }, (_, k) => ({
    k,
    pillar: pillars[k % n],
    copy: Math.floor(k / n),
  }));

  // Card whose left edge is closest to the scroller's start edge
  const nearest = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return REAL * n;
    const start = scroller.scrollLeft + inset(scroller);
    let best = 0;
    let bestDist = Infinity;
    cardRefs.current.forEach((card, k) => {
      if (!card) return;
      const dist = Math.abs(card.offsetLeft - start);
      if (dist < bestDist) {
        bestDist = dist;
        best = k;
      }
    });
    return best;
  }, [n]);

  const setWidth = useCallback(() => {
    const cards = cardRefs.current;
    return cards[n] && cards[0] ? cards[n].offsetLeft - cards[0].offsetLeft : 0;
  }, [n]);

  const jumpTo = useCallback((k: number) => {
    const scroller = scrollerRef.current;
    const card = cardRefs.current[k];
    if (scroller && card) scroller.scrollLeft = card.offsetLeft - inset(scroller);
  }, []);

  // Back into the middle copy, instantly, at the same card
  const recentre = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const copy = Math.floor(nearest() / n);
    if (copy === REAL) return;
    scroller.scrollLeft += (REAL - copy) * setWidth();
  }, [n, nearest, setWidth]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    jumpTo(REAL * n);

    let settle = 0;
    const hasScrollEnd = "onscrollend" in window;
    const onScroll = () => {
      setActive(nearest() % n);
      // Fallback where scrollend is missing: wait for scroll events to stop
      if (!hasScrollEnd) {
        window.clearTimeout(settle);
        settle = window.setTimeout(recentre, 150);
      }
    };
    const onResize = () => jumpTo(REAL * n + (nearest() % n));

    scroller.addEventListener("scroll", onScroll, { passive: true });
    if (hasScrollEnd) scroller.addEventListener("scrollend", recentre);
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(settle);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", recentre);
      window.removeEventListener("resize", onResize);
    };
  }, [n, jumpTo, nearest, recentre]);

  const scrollToCard = (k: number) => {
    const scroller = scrollerRef.current;
    const card = cardRefs.current[k];
    if (!scroller || !card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: card.offsetLeft - inset(scroller), behavior: reduce ? "auto" : "smooth" });
  };

  const step = (dir: 1 | -1) => scrollToCard(nearest() + dir);

  // Nearest copy of pillar i to where the row is now, so a dot never sends
  // the row the long way round
  const goToPillar = (i: number) => {
    const here = nearest();
    const candidates = Array.from({ length: COPIES }, (_, c) => c * n + i);
    scrollToCard(candidates.reduce((a, b) => (Math.abs(b - here) < Math.abs(a - here) ? b : a)));
  };

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div>
      <div
        ref={scrollerRef}
        className="pillar-scroller relative flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2"
        aria-label="Pilares de Pivotal"
        role="region"
        tabIndex={0}
      >
        {slides.map(({ k, pillar, copy }) => {
          const clone = copy !== REAL;
          const i = k % n;
          return (
            <article
              key={k}
              ref={(el) => {
                cardRefs.current[k] = el;
              }}
              aria-hidden={clone || undefined}
              className={`flex h-[26rem] w-[80vw] max-w-[22.5rem] shrink-0 snap-start flex-col rounded-[28px] p-7 sm:h-[30rem] sm:w-[22.5rem] ${TONES[i % TONES.length].card}`}
            >
              <PillarCard
                pillar={pillar}
                tone={TONES[i % TONES.length]}
                panelId={`pillar-${pillar.index}-${copy}`}
                isOpen={open.has(i)}
                onToggle={() => toggle(i)}
                clone={clone}
              />
            </article>
          );
        })}
      </div>

      <div className="mt-10 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Pilar anterior"
          className={`flex h-10 w-10 items-center justify-center rounded-full text-cocoa transition-colors duration-200 hover:bg-cocoa hover:text-cream ${TILE}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className={`flex h-10 items-center gap-0.5 rounded-full px-2 ${TILE}`}>
          {pillars.map((p, i) => (
            <button
              key={p.index}
              type="button"
              onClick={() => goToPillar(i)}
              aria-label={`Ir a ${p.title}`}
              aria-current={i === active ? "true" : undefined}
              // 24px hit area around a small visible dot
              className="group flex h-6 min-w-6 items-center justify-center"
            >
              <span
                className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ${
                  i === active ? "w-6 bg-cocoa" : "w-1.5 bg-cocoa/30 group-hover:bg-cocoa/60"
                }`}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Pilar siguiente"
          className={`flex h-10 w-10 items-center justify-center rounded-full text-cocoa transition-colors duration-200 hover:bg-cocoa hover:text-cream ${TILE}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
