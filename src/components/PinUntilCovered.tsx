"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Holds a section in place once its bottom edge reaches the bottom of the
// viewport, so whatever follows it in the same wrapper scrolls up over it.
// A plain `top: 0` would pin a section taller than the screen before its
// lower half had been seen; the offset makes it pin only once fully read.
export default function PinUntilCovered({
  children,
  className = "",
  dimWhenCovered = false,
}: {
  children: ReactNode;
  className?: string;
  // Blurs and darkens the pinned view as the next section rises over it.
  dimWhenCovered?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const top = Math.min(0, window.innerHeight - el.offsetHeight);
      el.style.setProperty("--pin-top", `${top}px`);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    const veil = veilRef.current;
    if (!dimWhenCovered || !el || !veil) return;

    // 0 while the next section is still below the fold, 1 once its top
    // reaches the top of the viewport. Only opacity changes: the blur radius
    // stays fixed, which keeps the backdrop filter cheap to animate.
    const update = () => {
      const next = el.nextElementSibling;
      if (!next) return;
      const h = window.innerHeight;
      const covered = (h - next.getBoundingClientRect().top) / h;
      veil.style.opacity = `${Math.min(1, Math.max(0, covered))}`;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [dimWhenCovered]);

  return (
    <div ref={ref} className={`cover-pin ${className}`.trim()}>
      {children}
      {dimWhenCovered ? (
        <div ref={veilRef} className="cover-pin__veil" aria-hidden="true" />
      ) : null}
    </div>
  );
}
