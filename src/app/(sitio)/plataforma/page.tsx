import type { Metadata } from "next";
import Image from "next/image";
import Footer from "@/components/Footer";
import Container from "@/components/Container";
import Button from "@/components/Button";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import Technologies from "@/components/Technologies";
import { SolucionesShowcase, TarjetasPortada, type Solucion } from "@/components/PackProvincia";
import { DASHBOARD_HOME, hasDashboards } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "B³ AgriFood Provincia · Pivotal",
  description:
    "Ingreso a B³ AgriFood Provincia para Santiago del Estero: cuatro soluciones de Pivotal, todo tercerizado.",
};

/* Portada de B³ AgriFood Provincia, antes de los tableros.
 *
 * Los textos salen de la maqueta de JC "Maqueta INGRESO a PACK PROVINCIA.xlsx" (lectura en
 * tableros/docs/maqueta-pack-provincia-ingreso.md). El diseño NO sigue la estructura de la
 * maqueta (pedido del 22-oct-2026): usa las piezas animadas de la landing principal.
 */

type Entrada = { href: string; texto: string };

const SID_URL = "/plataforma/sid";

const banderas = [
  { codigo: "es", nombre: "Español", src: "/pack-provincia/es.png", activa: true },
  { codigo: "en", nombre: "English", src: "/pack-provincia/en.png", activa: false },
  { codigo: "pt", nombre: "Português", src: "/pack-provincia/pt.png", activa: false },
];

function Encabezado({ entrar }: { entrar: Entrada }) {
  return (
    <header className="sticky top-0 z-40 border-b border-cream/10 bg-cocoa/95 backdrop-blur">
      <Container className="flex h-20 items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-5">
          <Image
            src="/pack-provincia/logo-provincia-sde.png"
            alt="Santiago del Estero"
            width={977}
            height={234}
            priority
            className="h-8 w-auto shrink-0 sm:h-9"
          />
          <span aria-hidden="true" className="hidden h-8 w-px bg-cream/20 md:block" />
          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <span className="truncate font-serif text-xl text-cream">B³ AgriFood® Provincia</span>
            <span className="shrink-0 rounded-full bg-clay px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-cocoa">
              Versión Beta
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <ul aria-label="Idiomas" className="hidden items-center gap-2 sm:flex">
            {banderas.map((b) => (
              <li key={b.codigo} title={b.activa ? b.nombre : `${b.nombre} · Próximamente`}>
                <Image
                  src={b.src}
                  alt={b.activa ? b.nombre : `${b.nombre} · Próximamente`}
                  width={28}
                  height={19}
                  className={`h-[19px] w-7 rounded-[3px] object-cover ${
                    b.activa ? "" : "opacity-40 grayscale"
                  }`}
                />
              </li>
            ))}
          </ul>
          {/* En celular no entra al lado del logo; el mismo botón está en la portada */}
          <div className="hidden sm:block">
            <Button href={entrar.href} variant="solid-light" withArrow>
              {entrar.texto}
            </Button>
          </div>
        </div>
      </Container>
    </header>
  );
}

function Portada({ entrar, soluciones }: { entrar: Entrada; soluciones: Solucion[] }) {
  return (
    // Mismo fondo plano que la sección de tecnologías que sigue (cocoa con la grilla), sin
    // degradados ni resplandores: las dos se leen como un solo bloque.
    <section className="swiss-grid-bg-dark relative overflow-hidden bg-cocoa pt-20 pb-8 md:pt-28 md:pb-12">
      <Container className="relative">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-olive-soft">
              Datos · Criterio · Escenarios
            </div>
            <h1 className="mt-7 max-w-xl font-serif text-[2.6rem] font-normal leading-[1.05] tracking-tight text-cream sm:text-6xl">
              El servicio de inteligencia sobre el que deciden los sectores especializados.
            </h1>
            <p className="mt-7 max-w-lg text-base leading-relaxed text-cream/75 sm:text-lg">
              Pivotal convierte fuentes dispersas en bases verificadas, criterio experto aplicado y
              escenarios ya procesados: sin planillas en el medio, sin sorpresas al momento de
              decidir.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button href={entrar.href} variant="solid-light" withArrow>
                {entrar.texto}
              </Button>
              <Button href="#soluciones" variant="outline-light">
                Las cuatro soluciones
              </Button>
            </div>
          </Reveal>

          <div>
            <div className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-cream/60">
              <span className="h-px w-8 bg-cream/40" />
              B³ AgriFood® Provincia · Cuatro soluciones
            </div>
            <TarjetasPortada soluciones={soluciones} />
          </div>
        </div>
      </Container>
    </section>
  );
}

// Una marca de producto dentro del texto: JC pega los logos de Minibox y Prompt en la frase.
function Marca({ children }: { children: string }) {
  return (
    <span className="mx-0.5 inline-block whitespace-nowrap rounded-md bg-cocoa px-1.5 py-0.5 font-semibold text-cream">
      {children}
    </span>
  );
}

function soluciones(disponibles: boolean): Solucion[] {
  return [
    {
      numero: "1",
      titulo: "Web pública en 3 idiomas con datos actualizados",
      cuerpo: (
        <>
          <p>
            Contenidos a niveles provincial y departamental provenientes de más de 250 bases de
            datos confiables y reconocidas, nacionales e internacionales.
          </p>
          <p>
            Organización temática de simple comprensión con formato de dashboards. El cliente
            decide los contenidos.
          </p>
          <p>
            Pivotal se encarga de la actualización de los datos de manera permanente en base a la
            frecuencia de la base de origen.
          </p>
          <a
            // Sin tableros en el build el SID no existe: queda como texto, sin link
            href={disponibles ? SID_URL : undefined}
            className="mt-1 flex items-center gap-4 rounded-2xl bg-cocoa p-4 text-cream transition-transform duration-300 hover:-translate-y-1"
          >
            <Image
              src="/pack-provincia/logo-sid.png"
              alt="SID · Sistema de Información Departamental"
              width={265}
              height={130}
              className="h-10 w-auto shrink-0"
            />
            <span className="text-sm leading-relaxed">
              El Sistema de Información Departamental permite visualizar toda la información
              disponible de cada departamento de manera organizada.
            </span>
          </a>
        </>
      ),
    },
    {
      numero: "2",
      titulo: "SAAS especializado y configurable",
      cuerpo: (
        <>
          <p>
            La SAAS es de uso interno institucional con 3 niveles: Funcionarios, técnicos y nodos
            de información.
          </p>
          <p>
            El contenido de los datos es amplio y permite procesar información, generar reportes y
            hacer análisis de escenarios.
          </p>
          <p>
            <Marca>B³ Minibox®</Marca> y <Marca>∞ Prompt®</Marca> son las tecnologías con agentes
            de IA específicamente diseñados para el sector que facilitan las tareas y generan
            informes, reportes y análisis complejos que permiten una mejor toma de decisiones.
          </p>
          <p>La SAAS se configura en base a las necesidades de cada cliente.</p>
        </>
      ),
    },
    {
      numero: "3",
      titulo: "App para productores con servicios de información",
      cuerpo: (
        <>
          <p>
            La App para productores está destinada a proveer información a los mismos en base a su
            actividad, así como también ser un canal de comunicación directa con herramientas que
            permiten segmentar y configurar las prestaciones en base a los perfiles acordados con
            el cliente. Por ejemplo, seleccionar comunicación con productores ganaderos de
            determinados departamentos o de toda la provincia.
          </p>
          <p>
            Es una herramienta de extensión y comunicacional sumamente eficiente y útil para el
            productor, ya que él mismo selecciona el tipo de datos que quiere recibir, generalmente
            de mercado y perspectivas, incluso climáticas.
          </p>
        </>
      ),
    },
    {
      numero: "4",
      titulo: "Servicios de web service e infraestructura",
      cuerpo: (
        <>
          <p>
            Pivotal provee toda la infraestructura de servidores, conectividad, evitando
            inversiones y costos de mantenimiento.
          </p>
          <p>
            Al ser un servicio tercerizado y fuera del entorno informático del cliente, elimina el
            riesgo de intrusiones y aporta tranquilidad en la seguridad interna.
          </p>
        </>
      ),
    },
  ];
}

export default function PlataformaPage() {
  // Sin contenido de tableros en este build (p. ej. Vercel sin credenciales de SharePoint), el
  // botón de entrada pasa a pedir una demo, como antes.
  const disponibles = hasDashboards();
  const entrar: Entrada = disponibles
    ? { href: DASHBOARD_HOME, texto: "Ingresar a los tableros" }
    : { href: "/#contacto", texto: "Solicitar una demo" };
  const lista = soluciones(disponibles);

  return (
    <>
      <Encabezado entrar={entrar} />
      <main className="flex-1">
        <Portada entrar={entrar} soluciones={lista} />
        <Technologies index="01" />
        <section id="soluciones" className="scroll-mt-20 bg-cream py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="02"
                eyebrow="B³ AgriFood® Provincia"
                title="Cuatro soluciones"
                description="Máxima eficiencia profesional y aprovechamiento de recursos, todo tercerizado."
              />
            </Reveal>
            <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
              <div className="col-span-12 md:col-span-10 md:col-start-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
                  Arrastrá o usá las flechas
                </span>
                <div className="mt-8">
                  <SolucionesShowcase soluciones={lista} entrar={entrar} />
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
