import Container from "./Container";
import Reveal from "./Reveal";

const attributes = [
  {
    index: "01",
    name: "Confiable",
    detail: "El atributo central e innegociable del sistema.",
  },
  {
    index: "02",
    name: "Especializado",
    detail: "Frente a las soluciones genéricas para problemas complejos.",
  },
  {
    index: "03",
    name: "Permanente",
    detail: "Un servicio que trabaja de forma continua, no un producto que se archiva.",
  },
];

export default function AttributeStrip() {
  return (
    // Extra room up top: the looping ribbon overlaps this edge by half its
    // height, and the first row of attributes has to clear it.
    <section className="bg-olive pt-6 md:pt-10">
      <Container>
        <Reveal>
          <div className="grid grid-cols-1 divide-y divide-cream/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {attributes.map((attr) => (
              <div
                key={attr.index}
                className="flex flex-col gap-3 rounded-2xl py-10 transition-colors duration-200 hover:bg-cream/[0.06] sm:px-8 sm:first:pl-2 sm:last:pr-2"
              >
                <span className="font-mono text-xs tnum text-cream/80">{attr.index}</span>
                <span className="text-2xl font-semibold tracking-tight text-cream">
                  {attr.name}
                </span>
                <span className="text-sm leading-relaxed text-cream">{attr.detail}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
