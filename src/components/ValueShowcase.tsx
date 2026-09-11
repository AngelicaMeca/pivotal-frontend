"use client";

import { useState } from "react";
import { VALUE_TONES, type ValueTone } from "@/lib/valueTones";
import Button from "./Button";
import DepthCarousel, { type DepthCarouselItem } from "./DepthCarousel";

// The value cards on the left and, beside them, a panel that follows the
// front card: which group it belongs to, where it sits among the ten, and a
// segmented bar that doubles as the carousel's indicators.
export default function ValueShowcase({
  items,
  tones,
}: {
  items: DepthCarouselItem[];
  // Group of each item, in the same order.
  tones: ValueTone[];
}) {
  const [active, setActive] = useState(0);
  const tone = VALUE_TONES[tones[active]];
  const total = items.length;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <DepthCarousel
        className="h-[470px] sm:h-[580px]"
        items={items}
        index={active}
        onChange={(i) => setActive(i)}
        showIndicators={false}
        align="start"
        label="Qué resuelve Pivotal y por qué es diferente"
        cardWidth={380}
        cardHeight={460}
        radius={24}
        tint="#2b1c18"
        depth={200}
        spread={80}
        tilt={20}
        tiltDirection="right"
        perspective={1400}
        visibleCards={4}
        falloff={0.18}
        blur={4}
      />

      {/* Top edge lines up with the front card; bottom with its base */}
      <div className="flex flex-col gap-10 lg:h-[488px] lg:justify-between lg:pt-7">
        <div>
          <span
            key={tone.label}
            className="value-panel__swap block font-mono text-xs uppercase tracking-[0.2em] text-cocoa/80"
          >
            {tone.label}
          </span>

          <div className="mt-6 flex items-baseline gap-3 text-cocoa" aria-hidden="true">
            <span className="tnum text-7xl font-semibold leading-none tracking-tight sm:text-8xl">
              {pad(active + 1)}
            </span>
            <span className="tnum font-mono text-lg text-cocoa/70">/ {pad(total)}</span>
          </div>
          <p className="sr-only" aria-live="polite">
            {`Tarjeta ${active + 1} de ${total}: ${tone.label}`}
          </p>

          <div className="mt-6 flex gap-1.5" role="tablist" aria-label="Tarjetas">
            {items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Ir a la tarjeta ${i + 1}: ${item.label}`}
                onClick={() => setActive(i)}
                // Tall hit area, thin visible bar
                className="group flex h-6 flex-1 items-center"
              >
                <span
                  className={`h-1 w-full rounded-full transition-colors duration-300 ${
                    i <= active ? VALUE_TONES[tones[i]].bar : "bg-cocoa/15"
                  } group-hover:bg-clay`}
                />
              </button>
            ))}
          </div>

          <p
            key={tones[active]}
            className="value-panel__swap mt-8 max-w-sm text-xl leading-snug text-cocoa"
          >
            {tone.intro}
          </p>
        </div>

        <div>
          <Button href="#contacto" variant="solid" withArrow>
            Solicitar demo
          </Button>
        </div>
      </div>
    </div>
  );
}
