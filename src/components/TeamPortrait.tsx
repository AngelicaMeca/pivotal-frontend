"use client";

import { useEffect, useRef, useState } from "react";

// Portrait on a clay panel. The photo is greyscaled and multiplied onto the
// panel, so its white studio background takes the clay tone and the person
// reads as a clay duotone. Until the file exists, the initials stand in.
export default function TeamPortrait({
  src,
  name,
  className = "",
}: {
  src: string;
  name: string;
  className?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  // A load error can fire before hydration attaches onError: check once
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div
      className={`relative isolate aspect-[4/5] overflow-hidden rounded-[28px] bg-clay ${className}`}
    >
      {failed ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[7rem] font-semibold tracking-tight text-cream"
        >
          {initials}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={`Retrato de ${name}`}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top mix-blend-multiply [filter:grayscale(1)_contrast(1.08)]"
        />
      )}
    </div>
  );
}
