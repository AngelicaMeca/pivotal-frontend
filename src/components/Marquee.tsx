import TextLoop from "./TextLoop";

const segments = [
  "Ministerios de Producción",
  "Entes de Desarrollo Productivo",
  "Cámaras del Agro",
  "Exportadores",
  "Organismos de Estadística",
  "Aseguradoras del Agro",
  "Entidades de Financiamiento",
];

// Floats over the seam between the hero and the attribute strip rather than
// taking a band of its own: the wrapper is laid out with no height and the
// ribbon is pulled up by half of itself to straddle the boundary.
export default function Marquee() {
  return (
    <div className="relative z-20 h-0">
      <div className="absolute inset-x-0 h-[clamp(64px,5.5vw,110px)] -translate-y-1/2">
        <TextLoop
          text={segments.join(" · ")}
          label={`Sectores: ${segments.join(", ")}`}
          shape="wave"
          separator="·"
          speed={80}
          curviness={7}
          viewHeight={90}
          fontSize={18}
          fontWeight={600}
          letterSpacing={2}
          color="#2b1c18"
          ribbon
          ribbonColor="#f1dccb"
          ribbonWidth={32}
          pauseOnHover
        />
      </div>
    </div>
  );
}
