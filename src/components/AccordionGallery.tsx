"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { gsap } from "gsap";

// Port of React Bits' AccordionGallery, reworked to carry content panels
// rather than photos: each panel has a decorative media layer (which keeps
// the parallax drift) under a header, a title and a detail block that is
// revealed on the open panel.
export type AccordionItem = {
  key: string;
  // Panel colour behind the media layer.
  background?: string;
  // Decorative layer that drifts with the parallax as panels resize.
  media?: ReactNode;
  // Always visible, pinned to the top of the panel.
  header: ReactNode;
  // Always visible, above the detail block.
  title: ReactNode;
  // Revealed only on the open panel.
  detail: ReactNode;
};

type AccordionGalleryProps = {
  items: AccordionItem[];
  defaultIndex?: number;
  accentColor?: string;
  overlayColor?: string;
  height?: number;
  gap?: number;
  radius?: number;
  // Content inset inside each panel, in pixels.
  padding?: number;
  expandRatio?: number;
  duration?: number;
  ease?: string;
  parallax?: number;
  tilt?: number;
  stagger?: number;
  trigger?: "hover" | "click";
  label?: string;
  className?: string;
};

const clampRatio = (r: number) => Math.min(Math.max(r, 0.2), 0.9);

export default function AccordionGallery({
  items,
  defaultIndex = 0,
  accentColor = "#ffffff",
  overlayColor = "#060010",
  height = 460,
  gap = 10,
  radius = 16,
  padding = 28,
  expandRatio = 0.52,
  duration = 0.6,
  ease = "power3.out",
  parallax = 0.5,
  tilt = 8,
  stagger = 0.06,
  trigger = "hover",
  label,
  className = "",
}: AccordionGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mediaRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const firstRunRef = useRef(true);
  const mediaSizeRef = useRef(320);

  const count = items.length;
  const [active, setActive] = useState(
    Math.min(Math.max(defaultIndex, 0), Math.max(count - 1, 0)),
  );

  const applyLayout = useCallback(
    (animate: boolean) => {
      const panels = panelRefs.current;
      if (!panels.length) return;

      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const r = clampRatio(expandRatio);
      // flex-grow that gives the open panel `r` of the row next to n-1 panels at 1
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      const mediaSize = mediaSizeRef.current;
      const dur = animate && !prefersReduced ? duration : 0;

      tlRef.current?.kill();
      const tl = gsap.timeline();

      panels.forEach((panel, i) => {
        if (!panel) return;
        const isActive = i === active;
        const media = mediaRefs.current[i];
        const bar = barRefs.current[i];
        const text = textRefs.current[i];

        // Dim lives on the panel, the common ancestor of the media and the
        // overlay that reads it.
        tl.to(
          panel,
          {
            flexGrow: isActive ? grow : 1,
            rotateY: isActive ? 0 : i < active ? tilt : -tilt,
            "--ag-dim": isActive ? 0 : 0.35,
            duration: dur,
            ease,
          },
          0,
        );

        if (media) {
          const drift = Math.max(-1.5, Math.min(1.5, active - i));
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: isActive ? 0 : drift * parallax * mediaSize * 0.06,
              duration: dur,
              ease,
            },
            0,
          );
        }

        if (bar && text) {
          if (isActive) {
            tl.to([bar, text], {
              opacity: 1,
              x: 0,
              duration: dur,
              ease,
              // An instant layout (first paint, resize) must not stagger
              // either, or the detail would wait a frame to appear.
              stagger: dur === 0 ? 0 : stagger,
            }, 0);
          } else {
            tl.to([bar, text], { opacity: 0, x: -14, duration: dur * 0.6, ease }, 0);
          }
        }
      });

      tlRef.current = tl;
    },
    [active, count, expandRatio, duration, ease, tilt, parallax, stagger],
  );

  // The resize observer below outlives changes to `active`; it reads the
  // latest layout through this ref instead of resubscribing on every hover.
  const layoutRef = useRef(applyLayout);
  useEffect(() => {
    layoutRef.current = applyLayout;
  });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.getBoundingClientRect().width;
      const usable = Math.max(width - gap * (count - 1), 120);
      const open = usable * clampRatio(expandRatio);
      mediaSizeRef.current = Math.max(140, open * 1.22);
      el.style.setProperty("--ag-media-size", `${mediaSizeRef.current}px`);
      // Detail copy is laid out at the open panel's width so it never reflows
      // while a panel is growing or shrinking; narrower panels clip it.
      el.style.setProperty("--ag-content-w", `${Math.max(120, open - padding * 2)}px`);
      layoutRef.current(false);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gap, count, expandRatio, padding]);

  useEffect(() => {
    applyLayout(!firstRunRef.current);
    firstRunRef.current = false;
  }, [applyLayout]);

  useEffect(() => () => void tlRef.current?.kill(), []);

  const handleClick = (i: number, e: MouseEvent) => {
    if (i !== active) {
      e.preventDefault();
      setActive(i);
    }
  };

  const handleKeyDown = (i: number, e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (i + 1) % count;
      setActive(next);
      panelRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (i - 1 + count) % count;
      setActive(prev);
      panelRefs.current[prev]?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`accordion-gallery ${className}`.trim()}
      style={
        {
          "--ag-accent": accentColor,
          "--ag-overlay": overlayColor,
          "--ag-gap": `${gap}px`,
          "--ag-radius": `${radius}px`,
          "--ag-pad": `${padding}px`,
          "--ag-height": `${height}px`,
        } as CSSProperties
      }
      role="list"
      aria-label={label}
    >
      {items.map((item, i) => {
        const isActive = i === active;
        return (
          <div
            key={item.key}
            ref={(el) => {
              panelRefs.current[i] = el;
            }}
            className={`ag-panel${isActive ? " ag-panel--active" : ""}`}
            style={{ background: item.background }}
            onMouseEnter={() => trigger === "hover" && setActive(i)}
            onClick={(e) => handleClick(i, e)}
            onFocus={() => setActive(i)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? "true" : undefined}
          >
            <span className="ag-panel__frame" aria-hidden="true">
              {item.media ? (
                <span
                  className="ag-panel__media"
                  ref={(el) => {
                    mediaRefs.current[i] = el;
                  }}
                >
                  {item.media}
                </span>
              ) : null}
              <span className="ag-panel__overlay" />
            </span>

            <div className="ag-panel__content">
              <div>{item.header}</div>
              <div>
                {item.title}
                <div className="ag-panel__detail">
                  <span
                    className="ag-panel__bar"
                    ref={(el) => {
                      barRefs.current[i] = el;
                    }}
                  />
                  <div
                    className="ag-panel__text"
                    ref={(el) => {
                      textRefs.current[i] = el;
                    }}
                  >
                    {item.detail}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
