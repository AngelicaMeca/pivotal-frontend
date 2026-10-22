"use client";

import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import Button from "./Button";
import DepthCarousel, { type DepthCarouselItem } from "./DepthCarousel";
import { staggerContainer, staggerItem } from "./Reveal";
import { ArrowIcon } from "./icons";

// Piezas interactivas de la portada de B³ AgriFood Provincia (/plataforma): los mismos efectos
// que la landing principal (tarjetas que suben al pasar el mouse, como en Mercado, y el
// carrusel en profundidad con su panel, como en Propuesta de valor).

export type Solucion = {
  numero: string;
  titulo: string;
  cuerpo: ReactNode;
};

const pad = (n: number | string) => String(n).padStart(2, "0");

// Dos superficies alternadas, las mismas de las tarjetas de Propuesta de valor
const TONOS = [
  { card: "bg-cocoa text-cream", tag: "text-clay", numeral: "text-cream/15", bar: "bg-cocoa" },
  { card: "bg-[#999a7f] text-cocoa", tag: "text-cocoa/90", numeral: "text-cocoa/20", bar: "bg-olive" },
];

// Las cuatro soluciones en la portada: cada tarjeta baja al carrusel y lo deja en esa solución.
export function TarjetasPortada({ soluciones }: { soluciones: Solucion[] }) {
  return (
    <motion.ol
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {soluciones.map((s, i) => (
        <motion.li
          key={s.numero}
          variants={staggerItem}
          whileHover={{ y: -6 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
        >
          <a
            href="#soluciones"
            onClick={() => window.dispatchEvent(new CustomEvent("pack:solucion", { detail: i }))}
            className={`group flex h-full min-h-[150px] flex-col justify-between rounded-[22px] p-5 ${
              i % 3 === 0 ? "bg-clay text-cocoa" : "bg-cream/[0.07] text-cream ring-1 ring-cream/15"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="tnum font-mono text-xs">{pad(s.numero)}</span>
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-300 group-hover:rotate-45 ${
                  i % 3 === 0 ? "bg-cocoa text-cream" : "bg-cream/15 text-cream"
                }`}
              >
                <ArrowIcon className="h-3.5 w-3.5" />
              </span>
            </div>
            <span className="mt-6 block text-lg font-semibold leading-snug">{s.titulo}</span>
          </a>
        </motion.li>
      ))}
    </motion.ol>
  );
}

export function SolucionesShowcase({
  soluciones,
  entrar,
}: {
  soluciones: Solucion[];
  entrar: { href: string; texto: string };
}) {
  const [activa, setActiva] = useState(0);
  const total = soluciones.length;
  const s = soluciones[activa];

  // Las tarjetas de la portada eligen la solución antes de bajar hasta acá
  useEffect(() => {
    const elegir = (e: Event) => setActiva((e as CustomEvent<number>).detail);
    window.addEventListener("pack:solucion", elegir);
    return () => window.removeEventListener("pack:solucion", elegir);
  }, []);

  const items: DepthCarouselItem[] = soluciones.map((sol, i) => {
    const t = TONOS[i % TONOS.length];
    return {
      key: sol.numero,
      label: sol.titulo,
      className: t.card,
      content: (
        <div key={sol.numero} className="flex h-full flex-col justify-between p-8">
          <div>
            <span className={`font-mono text-[0.65rem] uppercase tracking-[0.2em] ${t.tag}`}>
              Solución {pad(sol.numero)}
            </span>
            <h3 className="mt-8 text-[1.6rem] font-semibold leading-tight">{sol.titulo}</h3>
          </div>
          <span
            aria-hidden="true"
            className={`tnum font-serif text-[9rem] leading-none ${t.numeral}`}
          >
            {sol.numero}
          </span>
        </div>
      ),
    };
  });

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2.4fr)]">
      <DepthCarousel
        className="h-[440px] sm:h-[540px]"
        items={items}
        index={activa}
        onChange={(i) => setActiva(i)}
        showIndicators={false}
        align="start"
        label="Las cuatro soluciones de B³ AgriFood Provincia"
        cardWidth={360}
        cardHeight={440}
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

      <div className="flex flex-col gap-8 lg:pt-7">
        <div className="flex items-baseline gap-3 text-cocoa" aria-hidden="true">
          <span className="tnum text-7xl font-semibold leading-none tracking-tight sm:text-8xl">
            {pad(activa + 1)}
          </span>
          <span className="tnum font-mono text-lg text-cocoa/70">/ {pad(total)}</span>
        </div>
        <p className="sr-only" aria-live="polite">
          {`Solución ${activa + 1} de ${total}: ${s.titulo}`}
        </p>

        <div className="flex gap-1.5" role="tablist" aria-label="Soluciones">
          {soluciones.map((sol, i) => (
            <button
              key={sol.numero}
              type="button"
              role="tab"
              aria-selected={i === activa}
              aria-label={`Ir a la solución ${i + 1}: ${sol.titulo}`}
              onClick={() => setActiva(i)}
              className="group flex h-6 flex-1 items-center"
            >
              <span
                className={`h-1 w-full rounded-full transition-colors duration-300 ${
                  i <= activa ? TONOS[i % TONOS.length].bar : "bg-cocoa/15"
                } group-hover:bg-clay`}
              />
            </button>
          ))}
        </div>

        <div key={s.numero} className="value-panel__swap">
          <h3 className="text-2xl font-semibold leading-snug tracking-tight text-cocoa">
            {s.titulo}
          </h3>
          <div className="mt-5 flex flex-col gap-3 text-[0.98rem] leading-relaxed text-cocoa/85">
            {s.cuerpo}
          </div>
        </div>

        <div>
          <Button href={entrar.href} variant="solid" withArrow>
            {entrar.texto}
          </Button>
        </div>
      </div>
    </div>
  );
}
