import dots from "@/lib/land-dots.json";

// Dotted globe centred on South America, rising from the bottom of its
// section. A server component: the land grid (~12k points on a 1° grid,
// generated from Natural Earth 1:110m data) is projected here at build time, so the page
// ships a finished SVG and none of the point data.
//
// Each dot is [lat, lon, group]: 0 rest of world, 1 Latin America, 2 Argentina.

const VIEW_W = 1200;
const VIEW_H = 600;
const R = 470;
const CX = VIEW_W / 2;
const CY = R + 50;
// View centre, south of Argentina so the country and the region sit in the
// upper half of the disk that stays on screen
const LAT0 = -50;
const LON0 = -62;

const RAD = Math.PI / 180;
const sinP0 = Math.sin(LAT0 * RAD);
const cosP0 = Math.cos(LAT0 * RAD);

// Orthographic projection; cosC <= 0 is the far side of the globe
function project(lat: number, lon: number) {
  const p = lat * RAD;
  const l = (lon - LON0) * RAD;
  const cosC = sinP0 * Math.sin(p) + cosP0 * Math.cos(p) * Math.cos(l);
  return {
    x: CX + R * Math.cos(p) * Math.sin(l),
    y: CY - R * (cosP0 * Math.sin(p) - sinP0 * Math.cos(p) * Math.cos(l)),
    cosC,
  };
}

// Dots fade toward the limb for depth: three bands per group keep that to a
// handful of paths. Each dot is a zero-length segment drawn with a round cap.
const BANDS = [
  { min: 0.02, max: 0.35, alpha: 0.4 },
  { min: 0.35, max: 0.7, alpha: 0.7 },
  { min: 0.7, max: 1.01, alpha: 1 },
];

const GROUPS = [
  { color: "#2b1c18", alpha: 0.32, size: 3.1 }, // rest of world
  { color: "#7c8465", alpha: 0.95, size: 3.4 }, // Latin America
  { color: "#c18477", alpha: 1, size: 3.6 }, // Argentina
];

const paths = GROUPS.map(() => BANDS.map(() => [] as string[]));
for (const [lat, lon, group] of dots as [number, number, number][]) {
  const { x, y, cosC } = project(lat, lon);
  if (cosC <= BANDS[0].min || y > VIEW_H + 4) continue;
  const band = BANDS.findIndex((b) => cosC >= b.min && cosC < b.max);
  paths[group][band].push(`M${x.toFixed(1)} ${y.toFixed(1)}h0`);
}

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
  // West Africa: the nearest land outside the region that faces the viewer
  { lat: 8, lon: 2, phase: "Fase 3", label: "Resto del mundo", swatch: "bg-cocoa/30", wide: true },
];

export default function Globe({ className = "" }: { className?: string }) {
  return (
    <div className={`relative aspect-[2/1] w-full ${className}`.trim()}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 h-full w-full overflow-visible"
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
          <clipPath id="globe-disk">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
        </defs>

        {/* Clay halo: a wide soft bloom and a bright band hugging the limb */}
        <circle cx={CX} cy={CY} r={R + 10} fill="none" stroke="#c18477" strokeWidth="36" opacity="0.25" filter="url(#globe-glow-wide)" />
        <circle cx={CX} cy={CY} r={R + 3} fill="none" stroke="#c18477" strokeWidth="8" opacity="0.85" filter="url(#globe-glow-tight)" />
        <circle cx={CX} cy={CY} r={R} fill="url(#globe-shade)" />

        <g clipPath="url(#globe-disk)" fill="none" strokeLinecap="round">
          {paths.map((bands, g) =>
            bands.map((segments, b) =>
              segments.length ? (
                <path
                  key={`${g}-${b}`}
                  d={segments.join("")}
                  stroke={GROUPS[g].color}
                  strokeOpacity={GROUPS[g].alpha * BANDS[b].alpha}
                  strokeWidth={GROUPS[g].size}
                />
              ) : null,
            ),
          )}
        </g>

        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#c18477" strokeWidth="2" opacity="0.8" />
      </svg>

      {/* Labels are HTML over the SVG, placed by the same projection */}
      <ul className="absolute inset-0">
        {PINS.map((pin) => {
          const { x, y, cosC } = project(pin.lat, pin.lon);
          // A point on the far side still projects inside the disk
          if (cosC <= 0) return null;
          return (
            <li
              key={pin.label}
              className={`absolute -translate-y-1/2 ${pin.wide ? "hidden sm:block" : ""}`}
              style={{ left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%` }}
            >
              <span className="flex items-center gap-2 rounded-lg bg-cream py-1 pr-3 pl-1 shadow-[0_6px_20px_-8px_rgba(43,28,24,0.45)]">
                <span className={`h-7 w-7 shrink-0 rounded-md ${pin.swatch}`} aria-hidden="true" />
                <span className="flex flex-col leading-tight">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-cocoa/70">
                    {pin.phase}
                  </span>
                  <span className="text-xs font-semibold text-cocoa">{pin.label}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
