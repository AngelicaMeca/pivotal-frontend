"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PHOTO_FILTER } from "@/lib/expand";
import ScrollExpand from "./ScrollExpand";

// The pinned stage is one viewport tall and clips its overflow, so the full
// copy only fits on a viewport that is both wide and tall enough. Anything
// smaller gets the same content laid out normally instead of a cropped one.
// Keep the query in step with the .cover-pin rule in globals.css.
function useCompactLayout() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px), (max-height: 699px)");
    const update = () => setCompact(query.matches);
    update();
    // resize as well as the media query: change events can be missed when the
    // viewport is resized programmatically or the page zoom changes.
    query.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return compact;
}

// A section whose photo arrives as a card, rises over whatever is pinned
// above it and opens to full bleed with the copy laid over it.
export default function ExpandSection({
  id,
  src,
  alt,
  title,
  compactClassName,
  children,
}: {
  id: string;
  src: string;
  alt: string;
  title: string;
  // Background for the stacked layout, where the section flows on its own.
  compactClassName: string;
  children: ReactNode;
}) {
  const compact = useCompactLayout();

  return (
    <section
      id={id}
      // Pinned layout: no background of its own, the card rises over the
      // section before it. z-30 keeps it above that section, below the nav.
      className={compact ? compactClassName : "pointer-events-none relative z-30"}
    >
      {compact ? (
        <div className="px-6 py-20">
          <div className="mb-10 overflow-hidden rounded-[28px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="w-full"
              style={{ filter: PHOTO_FILTER }}
            />
          </div>
          {children}
        </div>
      ) : (
        <ScrollExpand
          src={src}
          alt={alt}
          title={title}
          useWindowScroll
          startWidth={62}
          startHeight={58}
          startRadius={28}
          mediaZoom={1.08}
          mediaBlur={10}
          mediaBlurEnd={3}
          mediaFilter={PHOTO_FILTER}
          scrollDistance={1}
          holdDistance={0.3}
          overlayScrim={0.45}
        >
          {children}
        </ScrollExpand>
      )}
    </section>
  );
}
