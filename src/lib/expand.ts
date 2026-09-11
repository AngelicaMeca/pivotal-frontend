// Shared styling for the sections that open with ScrollExpand. Kept out of the
// client component file so server components can import the plain strings.

// Frosted panel behind each copy group: keeps the text readable while the
// photo stays visible around and between the boxes.
export const GLASS_PANEL =
  "rounded-2xl border border-cream/20 bg-cocoa/35 p-5 backdrop-blur-md sm:p-6";

// Tones down the saturated greens and violets of the renders and warms them
// toward the cocoa and clay of the palette.
export const PHOTO_FILTER = "saturate(0.45) sepia(0.25)";
