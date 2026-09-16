"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import gsap from "gsap";

// Port of React Bits' DepthCarousel for content cards rather than images.
// Changes from the original:
// - cards carry arbitrary markup, so text stays real, readable DOM;
// - only horizontal wheel/trackpad movement drives it: vertical wheel keeps
//   scrolling the page instead of being swallowed while the pointer is over it;
// - on narrow screens the fan closes up before the stack is scaled down, so
//   the copy on the front card keeps a readable size;
// - config refs are synced in a layout effect instead of during render.
export type DepthCarouselItem = {
  key: string;
  // Accessible name of the slide.
  label: string;
  content: ReactNode;
  // Card surface, e.g. background and text colour classes.
  className?: string;
};

type Config = {
  count: number;
  depth: number;
  spread: number;
  tilt: number;
  dir: number;
  visibleCards: number;
  falloff: number;
  blur: number;
  duration: number;
  ease: string;
  loop: boolean;
  cardWidth: number;
  autoplayDelay: number;
  align: "center" | "start" | "end";
};

type Drag = {
  x: number;
  startPos: number;
  lastX: number;
  lastT: number;
  v: number;
  moved: boolean;
  id: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

export default function DepthCarousel({
  items,
  cardWidth = 300,
  cardHeight = 380,
  radius = 18,
  tint = "#05060a",
  depth = 220,
  spread = 90,
  tilt = 22,
  tiltDirection = "right",
  align = "center",
  perspective = 1400,
  visibleCards = 4,
  falloff = 0.2,
  blur = 6,
  duration = 700,
  ease = "power3.out",
  autoplay = false,
  autoplayDelay = 3200,
  loop = true,
  showControls = true,
  showIndicators = true,
  label = "Carrusel",
  index,
  onChange,
  className = "",
}: {
  items: DepthCarouselItem[];
  cardWidth?: number;
  cardHeight?: number;
  radius?: number;
  tint?: string;
  depth?: number;
  spread?: number;
  tilt?: number;
  tiltDirection?: "left" | "right";
  // "start" pins the front card to the left edge and lets the stack fan out
  // to its right, instead of centring it; "end" mirrors that on the right
  // edge (pair it with tiltDirection "left").
  align?: "center" | "start" | "end";
  perspective?: number;
  visibleCards?: number;
  falloff?: number;
  blur?: number;
  duration?: number;
  ease?: string;
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  showControls?: boolean;
  showIndicators?: boolean;
  label?: string;
  // Focused card when driven from outside; pair with onChange to keep it in sync.
  index?: number;
  onChange?: (index: number, item: DepthCarouselItem) => void;
  className?: string;
}) {
  const count = items.length;

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overlayRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const posRef = useRef(0);
  const focusRef = useRef(0);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  // Fitting to the container: first the fan narrows, then everything scales
  const scaleRef = useRef(1);
  const spreadFitRef = useRef(1);
  const dragRef = useRef<Drag | null>(null);
  const wheelTimerRef = useRef(0);
  const reducedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const itemsRef = useRef(items);
  const cfgRef = useRef<Config>({
    count,
    depth,
    spread,
    tilt,
    dir: tiltDirection === "left" ? -1 : 1,
    visibleCards,
    falloff,
    blur,
    duration,
    ease,
    loop,
    cardWidth,
    autoplayDelay,
    align,
  });

  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    itemsRef.current = items;
    cfgRef.current = {
      count,
      depth,
      spread,
      tilt,
      dir: tiltDirection === "left" ? -1 : 1,
      visibleCards,
      falloff,
      blur,
      duration,
      ease,
      loop,
      cardWidth,
      autoplayDelay,
      align,
    };
  });

  const layout = useCallback((pos: number) => {
    const cfg = cfgRef.current;
    const n = cfg.count;
    if (!n) return;
    const sc = scaleRef.current;
    const spreadPx = cfg.spread * spreadFitRef.current;

    for (let i = 0; i < n; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;

      // Signed distance from the focused card, wrapped for a looping stack
      let d = i - pos;
      if (cfg.loop && n > 1) {
        d = wrapIndex(d, n);
        if (d > n / 2) d -= n;
      }

      const back = Math.max(0, d);
      const shown = Math.abs(d) <= cfg.visibleCards + 0.5;
      const tz = -cfg.depth * d;
      const tx = cfg.dir * spreadPx * d;
      const ry = cfg.dir * cfg.tilt * clamp(d, 0, 1);
      // Cards that have passed the front fade out as they leave
      const opacity = shown ? (d < 0 ? Math.max(0, 1 + d) : 1) : 0;
      const brightness = Math.max(0.15, 1 - back * cfg.falloff);
      const blurPx =
        cfg.blur > 0 ? Math.min(cfg.blur, (back / Math.max(1, cfg.visibleCards)) * cfg.blur) : 0;

      // Anchor point of every card: the centre of the front card
      const half = (cfg.cardWidth * sc) / 2;
      el.style.left =
        cfg.align === "start"
          ? `${half}px`
          : cfg.align === "end"
            ? `calc(100% - ${half}px)`
            : "50%";
      el.style.transform = `translate(-50%, -50%) scale(${sc}) translateX(${tx.toFixed(2)}px) translateZ(${tz.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.filter = `brightness(${brightness.toFixed(3)}) blur(${blurPx.toFixed(2)}px)`;
      el.style.zIndex = String(Math.round(2000 - d * 20));
      el.style.pointerEvents = shown && opacity > 0.05 ? "auto" : "none";

      const ov = overlayRefs.current[i];
      if (ov) ov.style.opacity = clamp(back * cfg.falloff * 1.25, 0, 0.86).toFixed(3);
    }
  }, []);

  const tweenTo = useCallback(
    (target: number, animate: boolean) => {
      tweenRef.current?.kill();
      const cfg = cfgRef.current;
      const proxy = { p: posRef.current };
      tweenRef.current = gsap.to(proxy, {
        p: target,
        duration: animate && !reducedRef.current ? cfg.duration / 1000 : 0,
        ease: cfg.ease,
        onUpdate: () => {
          posRef.current = proxy.p;
          layout(proxy.p);
        },
        onComplete: () => {
          if (cfg.count > 0) posRef.current = wrapIndex(posRef.current, cfg.count);
          layout(posRef.current);
        },
      });
    },
    [layout],
  );

  const setFocus = useCallback(
    (rawIndex: number, animate = true) => {
      const cfg = cfgRef.current;
      const n = cfg.count;
      if (!n) return;
      const idx = cfg.loop ? wrapIndex(rawIndex, n) : clamp(rawIndex, 0, n - 1);
      // Shortest way round the loop
      let delta = idx - posRef.current;
      if (cfg.loop && n > 1) {
        delta = wrapIndex(delta, n);
        if (delta > n / 2) delta -= n;
      }
      tweenTo(posRef.current + delta, animate);
      if (idx !== focusRef.current) {
        focusRef.current = idx;
        setActive(idx);
        onChangeRef.current?.(idx, itemsRef.current[idx]);
      }
    },
    [tweenTo],
  );

  const navigateBy = useCallback(
    (step: number) => setFocus(focusRef.current + step, true),
    [setFocus],
  );

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (index !== undefined && index !== focusRef.current) setFocus(index, true);
  }, [index, setFocus]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = (w: number) => {
      const cfg = cfgRef.current;
      const fan = Math.abs(cfg.spread) * 2;
      // Room the fan can have once the front card and a margin are placed
      const room = Math.max(0, w - cfg.cardWidth - 40);
      spreadFitRef.current = fan ? clamp(room / fan, 0, 1) : 1;
      const needed = cfg.cardWidth + fan * spreadFitRef.current + 40;
      scaleRef.current = clamp(w / needed, 0.4, 1);
      layout(posRef.current);
    };
    fit(root.clientWidth);
    const ro = new ResizeObserver((entries) => fit(entries[0].contentRect.width));
    ro.observe(root);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cfg = cfgRef.current;
      // Only sideways movement belongs to the carousel; vertical wheel is
      // the page scrolling past it and must not be captured.
      if (cfg.count < 2 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      tweenRef.current?.kill();
      const delta = e.deltaMode === 1 ? e.deltaX * 24 : e.deltaX;
      posRef.current += clamp(delta / (cfg.cardWidth * 0.9), -0.6, 0.6);
      layout(posRef.current);
      window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = window.setTimeout(
        () => setFocus(Math.round(posRef.current), true),
        130,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(wheelTimerRef.current);
    };
  }, [layout, setFocus]);

  const stepPx = () => Math.max(cfgRef.current.cardWidth * 0.55 * scaleRef.current, 40);

  const onPointerDown = (e: PointerEvent) => {
    if (cfgRef.current.count < 2) return;
    // Controls handle their own clicks
    if ((e.target as HTMLElement).closest("button")) return;
    tweenRef.current?.kill();
    dragRef.current = {
      x: e.clientX,
      startPos: posRef.current,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
      moved: false,
      id: e.pointerId,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      rootRef.current?.setPointerCapture(drag.id);
    }
    if (!drag.moved) return;
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(now - drag.lastT, 1);
    drag.lastX = e.clientX;
    drag.lastT = now;
    posRef.current = drag.startPos - dx / stepPx();
    layout(posRef.current);
  };

  const onPointerEnd = () => {
    const drag = dragRef.current;
    if (!drag) return;
    // Cleared after the click that follows pointerup, so a drag release
    // does not also count as a click on the card under the pointer
    window.setTimeout(() => {
      dragRef.current = null;
    });
    if (!drag.moved) {
      dragRef.current = null;
      return;
    }
    // Carry the release velocity a little further before settling
    setFocus(Math.round(posRef.current - (drag.v * 180) / stepPx()), true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateBy(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateBy(1);
    }
  };

  const onCardClick = (index: number) => {
    if (dragRef.current?.moved) return;
    setFocus(index, true);
  };

  useEffect(() => {
    if (!autoplay || reducedRef.current || count < 2) return;
    const root = rootRef.current;
    let paused = false;
    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };
    const timer = window.setInterval(() => {
      if (!paused) navigateBy(1);
    }, Math.max(autoplayDelay, 600));
    root?.addEventListener("mouseenter", pause);
    root?.addEventListener("mouseleave", resume);
    root?.addEventListener("focusin", pause);
    root?.addEventListener("focusout", resume);
    return () => {
      window.clearInterval(timer);
      root?.removeEventListener("mouseenter", pause);
      root?.removeEventListener("mouseleave", resume);
      root?.removeEventListener("focusin", pause);
      root?.removeEventListener("focusout", resume);
    };
  }, [autoplay, autoplayDelay, count, navigateBy]);

  useEffect(() => {
    layout(posRef.current);
  }, [layout, depth, spread, tilt, tiltDirection, align, visibleCards, falloff, blur, cardWidth, cardHeight, radius, count]);

  useEffect(() => () => void tweenRef.current?.kill(), []);

  return (
    <div
      ref={rootRef}
      className={`depth-carousel ${className}`.trim()}
      style={
        {
          "--dc-perspective": `${perspective}px`,
          "--dc-controls-h": (showControls || showIndicators) && count > 1 ? "64px" : "0px",
        } as CSSProperties
      }
      role="group"
      aria-roledescription="carrusel"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div className="depth-carousel__stage">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={`depth-carousel__card ${item.className ?? ""}`.trim()}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            style={{ width: cardWidth, height: cardHeight, borderRadius: radius }}
            role="group"
            aria-roledescription="tarjeta"
            aria-label={`${i + 1} de ${count}: ${item.label}`}
            aria-hidden={active !== i}
            onClick={() => onCardClick(i)}
          >
            {item.content}
            <span
              className="depth-carousel__tint"
              ref={(el) => {
                overlayRefs.current[i] = el;
              }}
              style={{ background: tint }}
            />
          </div>
        ))}
      </div>

      {(showControls || showIndicators) && count > 1 ? (
        <div className={`depth-carousel__controls depth-carousel__controls--${align}`}>
          {showControls ? (
            <button
              type="button"
              className="depth-carousel__arrow"
              aria-label="Tarjeta anterior"
              onClick={() => navigateBy(-1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}

          {showIndicators ? (
            <div className="depth-carousel__dots" role="tablist" aria-label="Tarjetas">
              {items.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active === i}
                  aria-label={`Ir a la tarjeta ${i + 1}`}
                  className={`depth-carousel__dot${active === i ? " is-active" : ""}`}
                  onClick={() => setFocus(i, true)}
                />
              ))}
            </div>
          ) : null}

          {showControls ? (
            <button
              type="button"
              className="depth-carousel__arrow"
              aria-label="Tarjeta siguiente"
              onClick={() => navigateBy(1)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
