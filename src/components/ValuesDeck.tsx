"use client";

import { useState } from "react";
import DepthCarousel, { type DepthCarouselItem } from "./DepthCarousel";

type Value = { name: string; detail: string };

// Deep palette tones where cream copy clears 4.5:1. One per value, ordered so
// no two neighbours match, including the last and first once the loop wraps.
const TONES = [
  "bg-cocoa",
  "bg-[color-mix(in_srgb,var(--color-olive)_60%,var(--color-cocoa))]",
  "bg-[color-mix(in_srgb,var(--color-brown)_85%,var(--color-cocoa))]",
  "bg-[color-mix(in_srgb,var(--color-clay)_50%,var(--color-cocoa))]",
  "bg-[color-mix(in_srgb,var(--color-olive)_60%,var(--color-cocoa))]",
];

const pad = (n: number) => String(n).padStart(2, "0");

// Value cards fanned from the right edge, and on the left a panel that
// follows the front card: its numeral, a counter and the index of all values,
// which also navigates.
export default function ValuesDeck({ values }: { values: Value[] }) {
  const [active, setActive] = useState(0);
  const total = values.length;

  const items: DepthCarouselItem[] = values.map((value, i) => ({
    key: pad(i + 1),
    label: value.name,
    className: `${TONES[i % TONES.length]} text-cream`,
    content: (
      <div className="flex h-full flex-col justify-between p-8">
        <div>
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-cream/90">
            Valor {pad(i + 1)}
          </span>
          <h3 className="mt-8 text-[1.375rem] font-semibold leading-tight">{value.name}</h3>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-cream">{value.detail}</p>
        </div>
        <span className="tnum font-mono text-6xl font-semibold text-cream/15" aria-hidden="true">
          {pad(i + 1)}
        </span>
      </div>
    ),
  }));

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* Top edge lines up with the front card; bottom with the controls */}
      <div className="flex flex-col gap-10 lg:h-[540px] lg:justify-between lg:pt-12">
        <div className="flex items-end gap-5" aria-hidden="true">
          <span
            key={active}
            className="value-panel__swap tnum text-[7.5rem] font-semibold leading-[0.8] tracking-tight text-transparent [-webkit-text-stroke:2px_var(--color-brown)] sm:text-[9rem]"
          >
            {pad(active + 1)}
          </span>
          <span className="tnum pb-1 font-mono text-lg text-cocoa/70">/ {pad(total)}</span>
        </div>
        <p className="sr-only" aria-live="polite">
          {`Valor ${active + 1} de ${total}: ${values[active].name}`}
        </p>

        <ol className="border-t border-cocoa/15">
          {values.map((value, i) => (
            <li key={value.name} className="border-b border-cocoa/15">
              <button
                type="button"
                aria-current={i === active ? "true" : undefined}
                onClick={() => setActive(i)}
                className={`group flex w-full items-center gap-4 py-3 text-left transition-colors duration-200 ${
                  i === active ? "text-cocoa" : "text-cocoa/70 hover:text-cocoa"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 shrink-0 rounded-full transition-[width] duration-300 ${TONES[i]} ${
                    i === active ? "w-8" : "w-2.5"
                  }`}
                />
                <span className="tnum font-mono text-xs">{pad(i + 1)}</span>
                <span className={`text-base ${i === active ? "font-semibold" : ""}`}>
                  {value.name}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <span className="hidden font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70 lg:block">
          Arrastrá o usá las flechas
        </span>
      </div>

      <DepthCarousel
        className="h-[470px] sm:h-[540px]"
        items={items}
        index={active}
        onChange={(i) => setActive(i)}
        label="Valores de Pivotal"
        align="end"
        tiltDirection="left"
        cardWidth={360}
        cardHeight={440}
        radius={24}
        tint="#2b1c18"
        depth={200}
        spread={80}
        tilt={20}
        perspective={1400}
        visibleCards={4}
        falloff={0.18}
        blur={4}
      />
    </div>
  );
}
