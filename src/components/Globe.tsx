"use client";

import { useEffect, useRef } from "react";

// Dotted globe rising from the bottom of its section: spins slowly on its
// own, can be dragged (with inertia) or turned with the arrow keys, and eases
// back to Argentina on request. Dots are drawn on a canvas every frame; the
// sphere shading and halo underneath are static SVG.
//
// Land grid: ~12k points on a 1° grid generated from Natural Earth 1:110m.
// Each dot is [lat, lon, group]: 0 rest of world, 1 Latin America, 2 Argentina.
// Loaded as a separate chunk once the globe mounts.

const VIEW_W = 1200;
const VIEW_H = 600;
const R = 470;
const CX = VIEW_W / 2;
const CY = R + 50;

// Home view: centred south of Argentina, so the country and the region sit
// in the upper half of the disk that stays on screen
const HOME = { lat: -50, lon: -62 };
const LAT_MIN = -75;
const LAT_MAX = 15;
const SPIN_DEG_PER_S = 7;
const IDLE_BEFORE_SPIN_MS = 2500;

const RAD = Math.PI / 180;

const BANDS = [
  { min: 0.02, alpha: 0.4 },
  { min: 0.35, alpha: 0.7 },
  { min: 0.7, alpha: 1 },
];

const GROUPS = [
  { color: "43, 28, 24", alpha: 0.32, size: 3.1 }, // rest of world
  { color: "124, 132, 101", alpha: 0.95, size: 3.4 }, // Latin America
  { color: "193, 132, 119", alpha: 1, size: 3.6 }, // Argentina
];

type Pin = {
  lat: number;
  lon: number;
  phase: string;
  label: string;
  swatch: string;
  // Hidden on narrow screens, where the labels would crowd the disk
  wide?: boolean;
};

const PINS: Pin[] = [
  { lat: -36, lon: -65, phase: "Fase 1", label: "Argentina", swatch: "bg-clay" },
  { lat: -27.8, lon: -64.3, phase: "Piloto", label: "Santiago del Estero", swatch: "bg-cocoa", wide: true },
  { lat: -9, lon: -54, phase: "Fase 2", label: "Latinoamérica", swatch: "bg-olive" },
  { lat: 8, lon: 2, phase: "Fase 3", label: "Resto del mundo", swatch: "bg-cocoa/30", wide: true },
];

type View = { lat: number; lon: number };

// Orthographic projection from precomputed trig of a point, for a view
// centred at (lat0, lon0). z is the depth: z <= 0 is the far side.
function projector(view: View) {
  const sP0 = Math.sin(view.lat * RAD);
  const cP0 = Math.cos(view.lat * RAD);
  const sL0 = Math.sin(view.lon * RAD);
  const cL0 = Math.cos(view.lon * RAD);
  return (sP: number, cP: number, sL: number, cL: number) => {
    const sinL = sL * cL0 - cL * sL0;
    const cosL = cL * cL0 + sL * sL0;
    const z1 = cP * cosL;
    return {
      x: CX + R * cP * sinL,
      y: CY - R * (cP0 * sP - sP0 * z1),
      z: sP0 * sP + cP0 * z1,
    };
  };
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
const clampLat = (lat: number) => Math.min(LAT_MAX, Math.max(LAT_MIN, lat));

export default function Globe({ className = "" }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLLIElement | null)[]>([]);
  const homeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const view: View = { ...HOME };
    // Per-dot trig, filled once the land data arrives
    let trig: Float32Array | null = null;
    let groups: Uint8Array | null = null;
    let scale = 1;
    let dpr = 1;

    const pinTrig = PINS.map((p) => [
      Math.sin(p.lat * RAD),
      Math.cos(p.lat * RAD),
      Math.sin(p.lon * RAD),
      Math.cos(p.lon * RAD),
    ]);

    const draw = () => {
      const project = projector(view);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

      if (trig && groups) {
        // One path per group and depth band keeps fills to a handful a frame
        const paths = GROUPS.map(() => BANDS.map(() => new Path2D()));
        // Dots stay at least ~1 CSS px across on small screens
        const minR = 0.9 / scale;
        const radii = GROUPS.map((g) => Math.max(g.size / 2, minR));
        for (let i = 0, n = groups.length; i < n; i++) {
          const o = i * 4;
          const p = project(trig[o], trig[o + 1], trig[o + 2], trig[o + 3]);
          if (p.z <= BANDS[0].min || p.y > VIEW_H + 4) continue;
          const band = p.z >= BANDS[2].min ? 2 : p.z >= BANDS[1].min ? 1 : 0;
          const g = groups[i];
          const path = paths[g][band];
          path.moveTo(p.x + radii[g], p.y);
          path.arc(p.x, p.y, radii[g], 0, Math.PI * 2);
        }
        GROUPS.forEach((g, gi) =>
          BANDS.forEach((b, bi) => {
            ctx.fillStyle = `rgba(${g.color}, ${g.alpha * b.alpha})`;
            ctx.fill(paths[gi][bi]);
          }),
        );
      }

      // Crisp rim over the dots
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(193, 132, 119, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pins follow the surface and fade out toward the limb
      PINS.forEach((_, i) => {
        const el = pinRefs.current[i];
        if (!el) return;
        const [sP, cP, sL, cL] = pinTrig[i];
        const p = project(sP, cP, sL, cL);
        const visible = p.y < VIEW_H - 10 ? Math.min(1, Math.max(0, (p.z - 0.08) / 0.2)) : 0;
        el.style.left = `${(p.x / VIEW_W) * 100}%`;
        el.style.top = `${(p.y / VIEW_H) * 100}%`;
        el.style.opacity = visible.toFixed(3);
        el.style.visibility = visible > 0 ? "visible" : "hidden";
      });
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (!rect.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      scale = rect.width / VIEW_W;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      draw();
    };

    // --- motion: auto spin, drag with inertia, easing home -----------------
    let raf = 0;
    let last = 0;
    let visible = true;
    let dragging = false;
    let lastInput = -Infinity;
    let velocity = { lon: 0, lat: 0 }; // degrees per second
    let homing: { from: View; to: View; t0: number } | null = null;

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      let moving = false;

      if (homing) {
        const t = Math.min(1, (now - homing.t0) / 1100);
        const e = 1 - Math.pow(1 - t, 3);
        view.lat = homing.from.lat + (homing.to.lat - homing.from.lat) * e;
        view.lon = wrapLon(homing.from.lon + (homing.to.lon - homing.from.lon) * e);
        if (t >= 1) homing = null;
        moving = true;
      } else if (!dragging && (Math.abs(velocity.lon) > 0.5 || Math.abs(velocity.lat) > 0.5)) {
        // Inertia after a fling, decaying smoothly
        view.lon = wrapLon(view.lon + velocity.lon * dt);
        view.lat = clampLat(view.lat + velocity.lat * dt);
        const decay = Math.exp(-dt * 3.2);
        velocity = { lon: velocity.lon * decay, lat: velocity.lat * decay };
        moving = true;
      } else if (!dragging && !reduce && now - lastInput > IDLE_BEFORE_SPIN_MS) {
        // Idle spin, easing in so it never starts with a jolt
        const ramp = Math.min(1, (now - lastInput - IDLE_BEFORE_SPIN_MS) / 1500);
        view.lon = wrapLon(view.lon + SPIN_DEG_PER_S * ramp * dt);
        moving = true;
      }

      draw();
      if (visible && (moving || !reduce)) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf && visible) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    let lastX = 0;
    let lastY = 0;
    let lastT = 0;

    // Degrees of rotation per CSS pixel dragged: the point under the pointer
    // roughly tracks it near the centre of the disk
    const degPerPx = () => 180 / (Math.PI * R * scale);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      homing = null;
      velocity = { lon: 0, lat: 0 };
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = performance.now();
      lastInput = lastT;
      wrap.setPointerCapture(e.pointerId);
      wrap.dataset.dragging = "true";
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const k = degPerPx();
      const dLon = -(e.clientX - lastX) * k;
      // Vertical drag tilts only for mouse and pen; on touch it scrolls the page
      const dLat = e.pointerType === "touch" ? 0 : (e.clientY - lastY) * k;
      view.lon = wrapLon(view.lon + dLon);
      view.lat = clampLat(view.lat + dLat);
      const dt = Math.max(1, now - lastT) / 1000;
      velocity = { lon: dLon / dt, lat: dLat / dt };
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
      lastInput = now;
      // Drawn straight away: pointer events already arrive once per frame
      draw();
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      delete wrap.dataset.dragging;
      if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
      // A pause before letting go means no fling
      if (performance.now() - lastT > 80 || reduce) velocity = { lon: 0, lat: 0 };
      lastInput = performance.now();
      kick();
    };

    const onKey = (e: KeyboardEvent) => {
      const turn: Record<string, [number, number]> = {
        ArrowLeft: [-12, 0],
        ArrowRight: [12, 0],
        ArrowUp: [0, 6],
        ArrowDown: [0, -6],
      };
      const step = turn[e.key];
      if (!step) return;
      e.preventDefault();
      homing = null;
      velocity = { lon: 0, lat: 0 };
      view.lon = wrapLon(view.lon + step[0]);
      view.lat = clampLat(view.lat + step[1]);
      lastInput = performance.now();
      draw();
      kick();
    };

    homeRef.current = () => {
      velocity = { lon: 0, lat: 0 };
      lastInput = performance.now();
      // Shortest way round
      const dLon = wrapLon(HOME.lon - view.lon);
      const from = { ...view };
      const to = { lat: HOME.lat, lon: from.lon + dLon };
      if (reduce) {
        Object.assign(view, HOME);
        draw();
        return;
      }
      homing = { from, to, t0: performance.now() };
      kick();
    };

    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    wrap.addEventListener("keydown", onKey);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // Nothing to animate while the globe is off screen
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(wrap);

    let cancelled = false;
    import("@/lib/land-dots.json").then(({ default: data }) => {
      if (cancelled) return;
      const dots = data as [number, number, number][];
      trig = new Float32Array(dots.length * 4);
      groups = new Uint8Array(dots.length);
      dots.forEach(([lat, lon, g], i) => {
        trig![i * 4] = Math.sin(lat * RAD);
        trig![i * 4 + 1] = Math.cos(lat * RAD);
        trig![i * 4 + 2] = Math.sin(lon * RAD);
        trig![i * 4 + 3] = Math.cos(lon * RAD);
        groups![i] = g;
      });
      draw();
      kick();
    });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      wrap.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={`relative ${className}`.trim()}>
      <div className="relative z-10 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
          Arrastrá para rotar el globo
        </span>
        <button
          type="button"
          onClick={() => homeRef.current()}
          className="rounded-full bg-cocoa px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-cream transition-colors duration-200 hover:bg-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
        >
          Volver a Argentina
        </button>
      </div>

      <div
        ref={wrapRef}
        className="globe relative aspect-[2/1] w-full"
        tabIndex={0}
        role="img"
        aria-label="Globo interactivo centrado en Sudamérica: Argentina resaltada como primera fase, Latinoamérica como segunda y el resto del mundo como tercera. Arrastrá o usá las flechas del teclado para rotarlo."
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {/* Cream sphere, lit from the upper left and shaded toward cocoa
                at the limb so it lifts off the cream section */}
            <radialGradient id="globe-shade" cx="40%" cy="28%" r="78%">
              <stop offset="0%" stopColor="#f1dccb" />
              <stop offset="55%" stopColor="#eacfbd" />
              <stop offset="88%" stopColor="#d9c1b0" />
              <stop offset="100%" stopColor="#c9ae9c" />
            </radialGradient>
            <filter id="globe-glow-tight" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id="globe-glow-wide" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="26" />
            </filter>
          </defs>
          {/* Clay halo: a wide soft bloom and a bright band hugging the limb */}
          <circle cx={CX} cy={CY} r={R + 10} fill="none" stroke="#c18477" strokeWidth="36" opacity="0.25" filter="url(#globe-glow-wide)" />
          <circle cx={CX} cy={CY} r={R + 3} fill="none" stroke="#c18477" strokeWidth="8" opacity="0.85" filter="url(#globe-glow-tight)" />
          <circle cx={CX} cy={CY} r={R} fill="url(#globe-shade)" />
        </svg>

        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />

        {/* Positioned every frame from the same projection as the dots */}
        <ul className="pointer-events-none absolute inset-0">
          {PINS.map((pin, i) => (
            <li
              key={pin.label}
              ref={(el) => {
                pinRefs.current[i] = el;
              }}
              className={`invisible absolute -translate-y-1/2 opacity-0 ${pin.wide ? "hidden sm:block" : ""}`}
            >
              <span className="flex items-center gap-2 rounded-lg bg-cream py-1 pr-3 pl-1 shadow-[0_6px_20px_-8px_rgba(43,28,24,0.45)]">
                <span className={`h-7 w-7 shrink-0 rounded-md ${pin.swatch}`} aria-hidden="true" />
                <span className="flex flex-col leading-tight">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-cocoa/70">
                    {pin.phase}
                  </span>
                  <span className="whitespace-nowrap text-xs font-semibold text-cocoa">{pin.label}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
