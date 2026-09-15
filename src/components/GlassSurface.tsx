"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

// Port of React Bits' GlassSurface: a panel that refracts what is behind it
// through an SVG displacement filter used as a backdrop-filter. Only Chromium
// supports url() in backdrop-filter; elsewhere a frosted fallback is used.
// Changes from the original: palette-tinted frost and shadows, no dark-mode
// branch (the site is light only), filter ids safe for React 19's useId, and
// the filter attributes rendered directly instead of set through refs.

type Channel = "R" | "G" | "B";

type GlassSurfaceProps = {
  children?: ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  // Edge thickness of the displacement map, as a fraction of the short side
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  // Output blur (stdDeviation) after the channels are recombined
  displace?: number;
  // Cream frost laid over the refracted backdrop, 0-1
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: Channel;
  yChannel?: Channel;
  mixBlendMode?: CSSProperties["mixBlendMode"];
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
};

let svgBackdropSupport: boolean | undefined;

function supportsSvgBackdrop() {
  if (svgBackdropSupport !== undefined) return svgBackdropSupport;
  const ua = navigator.userAgent;
  const webkit = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const firefox = /Firefox/.test(ua);
  if (webkit || firefox) {
    svgBackdropSupport = false;
  } else {
    const probe = document.createElement("div");
    probe.style.backdropFilter = "url(#glass-probe)";
    svgBackdropSupport = probe.style.backdropFilter !== "";
  }
  return svgBackdropSupport;
}

const noSubscription = () => () => {};

export default function GlassSurface({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = "R",
  yChannel = "G",
  mixBlendMode = "difference",
  className = "",
  contentClassName = "",
  style,
}: GlassSurfaceProps) {
  // useId output can contain characters that break url(#…) references
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const filterId = `glass-filter-${uid}`;
  const redGradId = `glass-red-${uid}`;
  const blueGradId = `glass-blue-${uid}`;

  // Server render and first hydration use the fallback; the client then
  // switches to the SVG filter where it is supported
  const svgSupported = useSyncExternalStore(noSubscription, supportsSvgBackdrop, () => false);

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);

  // The displacement map is drawn at the panel's measured size, so it is
  // rebuilt whenever the panel resizes
  useEffect(() => {
    const el = containerRef.current;
    const feImage = feImageRef.current;
    if (!el || !feImage) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width || 400;
      const h = rect.height || 200;
      const edge = Math.min(w, h) * (borderWidth * 0.5);
      const svg = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="red"/>
            </linearGradient>
            <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="blue"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${redGradId})"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}"/>
          <rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/>
        </svg>`;
      feImage.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [borderRadius, borderWidth, brightness, opacity, blur, mixBlendMode, redGradId, blueGradId]);

  const channels = [
    { offset: redOffset, matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", name: "red" },
    { offset: greenOffset, matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", name: "green" },
    { offset: blueOffset, matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", name: "blue" },
  ];

  return (
    <div
      ref={containerRef}
      className={`glass-surface ${svgSupported ? "glass-surface--svg" : "glass-surface--fallback"} ${className}`.trim()}
      style={
        {
          ...style,
          width: typeof width === "number" ? `${width}px` : width,
          height: typeof height === "number" ? `${height}px` : height,
          borderRadius: `${borderRadius}px`,
          "--glass-frost": backgroundOpacity,
          "--glass-saturation": saturation,
          "--filter-id": `url(#${filterId})`,
        } as CSSProperties
      }
    >
      <svg className="glass-surface__filter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={feImageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            {/* Each colour channel is displaced by a slightly different amount,
                which gives the edges their chromatic split. Fragments, not <g>:
                filter primitives must be direct children of <filter>. */}
            {channels.map(({ offset, matrix, name }) => (
              <Fragment key={name}>
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={distortionScale + offset}
                  xChannelSelector={xChannel}
                  yChannelSelector={yChannel}
                  result={`disp-${name}`}
                />
                <feColorMatrix in={`disp-${name}`} type="matrix" values={matrix} result={name} />
              </Fragment>
            ))}
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur in="output" stdDeviation={displace} />
          </filter>
        </defs>
      </svg>

      <div className={`glass-surface__content ${contentClassName}`.trim()}>{children}</div>
    </div>
  );
}
