import Link from "next/link";
import { LinkedInIcon, MailIcon, XIcon } from "./icons";
import Container from "./Container";

const columns = [
  {
    title: "Producto",
    links: [
      { label: "B³ AgriFood", href: "/#producto" },
      { label: "B³ AgriFood Provincia", href: "/#provincia" },
      { label: "Tecnología", href: "/#tecnologia" },
      { label: "Plataforma", href: "/plataforma" },
    ],
  },
  {
    title: "Tecnologías",
    links: [
      { label: "B³ Big Black Box®", href: "/#tecnologia" },
      { label: "B³ Minibox®", href: "/#tecnologia" },
      { label: "∞ Prompt®", href: "/#tecnologia" },
    ],
  },
  {
    title: "Compañía",
    links: [
      { label: "Nosotros", href: "/nosotros" },
      { label: "Contacto", href: "/#contacto" },
    ],
  },
];

const socials = [
  { label: "LinkedIn", href: "https://linkedin.com", Icon: LinkedInIcon },
  { label: "X (Twitter)", href: "https://x.com", Icon: XIcon },
  { label: "Correo", href: "mailto:contacto@pivotal.ai", Icon: MailIcon },
];

const legal = ["Seguridad", "Términos de servicio", "Política de privacidad"];

const WORDMARK_SIZE = "clamp(4.1rem, 18vw, 15.5rem)";
const WORDMARK_FADE = "linear-gradient(to bottom, #000 20%, transparent 92%)";

// Full-width band rather than an inset card; content lines up with the
// Container used by every section above.
export default function Footer() {
  return (
    <footer className="overflow-hidden bg-cocoa">
      <Container className="pb-6 pt-16 sm:pt-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="max-w-xs text-lg leading-relaxed text-cream">
              Pivotal es el servicio de inteligencia gestionado en el que
              deciden los sectores especializados.
            </p>

            <div className="mt-8 flex items-center gap-3">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="fill-btn fill-btn-clay flex h-10 w-10 items-center justify-center rounded-lg border border-cream/20 text-cream transition-colors duration-200 hover:text-cocoa"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10">
            {columns.map((col) => (
              <div key={col.title}>
                <div className="border-t border-cream/15 pt-4">
                  <span className="text-sm font-semibold text-cream">
                    {col.title}
                  </span>
                  <ul className="mt-4 flex flex-col gap-3">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm text-cream/60 transition-colors duration-150 hover:text-cream"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>

      <div className="select-none overflow-hidden">
        <div className="flex justify-center">
          <span
            className="text-outline font-sans font-black uppercase leading-[0.8] tracking-[0.02em]"
            style={{
              fontSize: WORDMARK_SIZE,
              maskImage: WORDMARK_FADE,
              WebkitMaskImage: WORDMARK_FADE,
            }}
            aria-hidden="true"
          >
            Pivotal
          </span>
        </div>
      </div>

      <div className="border-t border-cream/10">
        <Container className="flex flex-col gap-4 py-6 font-mono text-xs uppercase tracking-[0.1em] text-cream/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Pivotal. Todos los derechos reservados.</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {legal.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </Container>
      </div>
    </footer>
  );
}
