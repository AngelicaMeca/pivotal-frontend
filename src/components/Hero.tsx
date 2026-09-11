"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import Button from "./Button";
import Container from "./Container";
import CountUp from "./CountUp";
import MetaBalls from "./MetaBalls";
import { staggerContainer, staggerItem } from "./Reveal";
import {
  CheckCircleIcon,
  ClockIcon,
  LayersIcon,
  ShieldIcon,
  SparkIcon,
} from "./icons";

const sources = [
  {
    code: "RD",
    name: "Rendimientos por departamento",
    meta: "12 series · actualización diaria",
    status: "Verificado",
    highlight: true,
  },
  {
    code: "PF",
    name: "Precios FOB",
    meta: "Bolsa de Cereales · diario",
    status: "En proceso",
    highlight: false,
  },
  {
    code: "RT",
    name: "Retenciones y tipo de cambio",
    meta: "BCRA · diario",
    status: "En revisión",
    highlight: false,
  },
];

const assurances = [
  { Icon: ShieldIcon, label: "Servidores propios" },
  { Icon: ClockIcon, label: "Demo funcional disponible" },
];

const SPRING = { stiffness: 110, damping: 20, mass: 0.6 };

export default function Hero() {
  const areaRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  const springX = useSpring(pointerX, SPRING);
  const springY = useSpring(pointerY, SPRING);

  const panelX = useTransform(springX, [-0.5, 0.5], [-8, 8]);
  const panelY = useTransform(springY, [-0.5, 0.5], [-6, 6]);
  const cardAX = useTransform(springX, [-0.5, 0.5], [-26, 26]);
  const cardAY = useTransform(springY, [-0.5, 0.5], [-18, 18]);
  const cardBX = useTransform(springX, [-0.5, 0.5], [22, -22]);
  const cardBY = useTransform(springY, [-0.5, 0.5], [16, -16]);

  const trackPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = areaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <section
      id="top"
      className="swiss-grid-bg-dark relative overflow-hidden bg-cocoa pt-36 pb-20 md:pb-28"
      style={{
        backgroundImage:
          "linear-gradient(155deg, #2b1c18 0%, #2b1c18 55%, #3a281f 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-clay/20 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 left-0 h-96 w-96 rounded-full bg-olive/40 blur-[110px]"
      />

      <Container className="relative">
        <div
          ref={areaRef}
          onMouseMove={trackPointer}
          onMouseLeave={resetPointer}
          className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12"
        >
          <motion.div variants={staggerContainer} initial="hidden" animate="show">
            <motion.div
              variants={staggerItem}
              className="font-mono text-xs uppercase tracking-[0.25em] text-olive-soft"
            >
              Datos · Criterio · Escenarios
            </motion.div>

            <motion.h1
              variants={staggerItem}
              className="mt-7 max-w-xl font-serif text-[2.75rem] font-normal leading-[1.05] tracking-tight text-cream sm:text-6xl"
            >
              El servicio de inteligencia sobre el que deciden los sectores especializados.
            </motion.h1>

            <motion.p
              variants={staggerItem}
              className="mt-7 max-w-lg text-base leading-relaxed text-cream/70"
            >
              Pivotal convierte fuentes dispersas en bases verificadas,
              criterio experto aplicado y escenarios ya procesados: sin
              planillas en el medio, sin sorpresas al momento de decidir.
            </motion.p>

            <motion.div variants={staggerItem} className="mt-10 flex flex-wrap gap-4">
              <Button href="#contacto" variant="solid-light" withArrow>
                Solicitar una demo
              </Button>
              <Button href="#producto" variant="outline-light">
                Conocer B³ AgriFood
              </Button>
            </motion.div>

            <motion.div
              variants={staggerItem}
              className="mt-12 max-w-sm border-t border-cream/10 pt-6"
            >
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {assurances.map(({ Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 text-sm text-cream/60"
                  >
                    <Icon className="h-4 w-4 text-clay" />
                    {label}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              aria-hidden="true"
              className="absolute -inset-16 opacity-50 sm:-inset-24 sm:opacity-90"
            >
              <MetaBalls
                color="#c18477"
                cursorBallColor="#f1dccb"
                cursorBallSize={2}
                ballCount={10}
                animationSize={20}
                clumpFactor={0.85}
                speed={0.25}
                hoverSmoothness={0.06}
                enableTransparency
              />
            </div>

            <motion.div
              style={{ x: panelX, y: panelY }}
              className="pointer-events-none relative rounded-[28px] border border-cream/15 bg-cream/[0.06] p-6 backdrop-blur-xl sm:p-7"
            >
              <div className="flex items-center gap-4 pb-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cream text-cocoa">
                  <LayersIcon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-cream">
                    Campaña 2024/25 · Santiago del Estero
                  </div>
                  <div className="mt-0.5 text-xs text-cream/50">
                    100 bases normalizadas · actualización permanente
                  </div>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-cream/10 border-t border-cream/10">
                {sources.map((source) => (
                  <div
                    key={source.code}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="tnum flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cream/15 font-mono text-[0.65rem] text-cream/70">
                        {source.code}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-cream">
                          {source.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-cream/50">
                          {source.meta}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] ${
                        source.highlight
                          ? "bg-cream text-cocoa"
                          : "border border-cream/20 text-cream/60"
                      }`}
                    >
                      {source.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-cream/10 bg-cocoa/50 p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-cream/50">
                    Bases normalizadas
                  </span>
                  <span className="tnum font-mono text-2xl font-semibold text-cream">
                    <CountUp value={100} />
                    <span className="text-cream/40">/240</span>
                  </span>
                </div>
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-cream/10">
                  <motion.div
                    className="h-full rounded-full bg-clay"
                    initial={{ width: 0 }}
                    animate={{ width: "42%" }}
                    transition={{ duration: 1.1, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <div className="mt-3 text-xs text-cream/50">
                  Beta Santiago del Estero · universo en expansión
                </div>
              </div>
            </motion.div>

            <motion.div
              style={{ x: cardAX, y: cardAY }}
              className="pointer-events-none absolute -top-6 right-2 flex items-center gap-3 rounded-2xl border border-cream/15 bg-cocoa/90 px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:-right-6"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cream/20 text-clay">
                <CheckCircleIcon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-medium text-cream">
                  Fuente verificada
                </div>
                <div className="text-xs text-cream/50">
                  Bolsa de Cereales · hace 2 min
                </div>
              </div>
            </motion.div>

            <motion.div
              style={{ x: cardBX, y: cardBY }}
              className="pointer-events-none absolute -bottom-7 left-2 flex items-center gap-3 rounded-2xl border border-cream/15 bg-cocoa/90 px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:-left-8"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cream/20 text-olive">
                <SparkIcon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-medium text-cream">
                  Escenario procesado
                </div>
                <div className="text-xs text-cream/50">
                  ∞ Prompt · 1.240 combinaciones
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
