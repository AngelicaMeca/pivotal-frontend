// Surfaces of the two groups of value cards, shared by the cards and the
// legend above the carousel.
export const VALUE_TONES = {
  resolves: {
    label: "Qué resuelve",
    intro: "Los problemas que Pivotal saca del camino del cliente.",
    swatch: "#2b1c18",
    // Progress segment: needs 3:1 against the cream section
    bar: "bg-cocoa",
    card: "bg-cocoa text-cream",
    tag: "text-clay",
    detail: "text-cream/80",
    numeral: "text-cream/15",
  },
  // Olive lifted 25% toward cream so cocoa text on it clears 4.5:1
  differentiators: {
    label: "Por qué es diferente",
    intro: "Lo que ninguna alternativa del mercado reúne en un solo servicio.",
    swatch: "#999a7f",
    bar: "bg-olive",
    card: "bg-[#999a7f] text-cocoa",
    tag: "text-cocoa/90",
    detail: "text-cocoa/90",
    numeral: "text-cocoa/20",
  },
} as const;

export type ValueTone = keyof typeof VALUE_TONES;
