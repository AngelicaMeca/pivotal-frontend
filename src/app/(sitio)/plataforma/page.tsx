import type { Metadata } from "next";
import Image from "next/image";
import Footer from "@/components/Footer";
import Container from "@/components/Container";
import Button from "@/components/Button";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import Technologies from "@/components/Technologies";
import {
  HerramientasShowcase,
  TarjetasPortada,
  type Herramienta,
} from "@/components/PackProvincia";
import { entradaTableros } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "B³ AgriFood Provincia · Pivotal",
  description:
    "B³ AgriFood Provincia para Santiago del Estero: qué es el Sistema, qué hace, qué herramientas contiene y cómo probarlo.",
};

/* Portada de B³ AgriFood Provincia, antes del Sistema.
 *
 * LOS TEXTOS SON DE JC Y NO SE REESCRIBEN. Salen del "Resumen B3 Agrifood Provincias - V2.docx"
 * (18-nov-2026), que él chequeó con lectores de poca experiencia sectorial -entre ellos un ex
 * Subsecretario de la Producción de la provincia- y mandó con el pedido textual: "Distribuyan
 * como mejor les parezca desde lo estético, PERO POR FAVOR NO CAMBIEN LOS TEXTOS". Así que lo
 * nuestro acá es el reparto y el diseño; la redacción es suya, palabra por palabra.
 *
 * Las preguntas que encabezan cada bloque ("¿Qué es?", "¿Qué hace?"...) también son suyas y se
 * conservan: él avisó que con ellas los lectores entendieron mejor de qué se trata.
 *
 * Lo único que se tocó de su texto son erratas de tipeo, anotadas en la pregunta 128 del backlog
 * para que las revise: "Prrompt" → "Prompt", "escenaffios" → "escenarios", "dese ser" → "debe
 * ser", "los Agente de IA" → "los Agentes de IA", el "¿" que falta al abrir cada pregunta y el
 * acento de "cuál". Lo que NO se tocó, aunque suene raro, es su redacción: "de manera simple
 * comprensión" y "con formatos dashboards" quedan como él las escribió.
 *
 * El rótulo del botón de entrada dice "Acceso al sistema" y no "Ingresar a los tableros" por
 * pedido suyo del 18-nov-2026: "OMITAN ESO DE 'ACCESO A TABLEROS' (no tienen en claro de qué se
 * trata), sino ACCESO AL SISTEMA".
 *
 * El diseño NO sigue la estructura de ninguna maqueta (pedido del 22-oct-2026): usa las piezas
 * animadas de la landing principal.
 */

type Entrada = { href: string; texto: string };

const SID_URL = "/plataforma/sid";

// Tarjeta clara sobre las secciones cremas, espejo de la oscura (bg-cream/[0.07] + ring)
const TARJETA_CLARA = "rounded-[22px] bg-cocoa/[0.04] p-6 ring-1 ring-cocoa/10";
const TARJETA_OSCURA = "rounded-[22px] bg-cream/[0.07] p-6 ring-1 ring-cream/15";

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

/* La portada responde la primera pregunta de JC, "¿Qué es?", con su párrafo entero: es la
   definición más llana que dio y por eso va arriba de todo, en lugar de una frase nuestra. */
function Portada({ entrar, herramientas }: { entrar: Entrada; herramientas: Herramienta[] }) {
  return (
    // Mismo fondo plano que la sección de tecnologías que sigue (cocoa con la grilla), sin
    // degradados ni resplandores: las dos se leen como un solo bloque.
    <section className="swiss-grid-bg-dark relative overflow-hidden bg-cocoa pt-20 pb-8 md:pt-28 md:pb-12">
      <Container className="relative">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-olive-soft">
              Producto
            </div>
            <h1 className="mt-7 max-w-xl font-serif text-[2.6rem] font-normal leading-[1.05] tracking-tight text-cream sm:text-6xl">
              B³ AgriFood® Provincia
            </h1>
            <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-cream/60">
              ¿Qué es?
            </p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-cream/90 sm:text-lg">
              Es un Sistema de Gestión y procesamiento Integral de Datos e información productiva
              a nivel nacional, provincial y departamental con tecnología de IA de cuarta
              generación (módulos de razonamiento) y ciencia de datos desarrollado íntegramente en
              la provincia. Si bien es imposible detallar todas las opciones y configuraciones del
              Sistema, se incluyeron de manera resumida.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button href={entrar.href} variant="solid-light" withArrow>
                {entrar.texto}
              </Button>
              <Button href="#herramientas" variant="outline-light">
                Las herramientas
              </Button>
            </div>
          </Reveal>

          <div>
            <div className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-cream/60">
              <span className="h-px w-8 bg-cream/40" />
              B³ AgriFood® Provincia · Las herramientas
            </div>
            <TarjetasPortada herramientas={herramientas} />
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

/* "¿Qué hace?": los cuatro puntos de JC, uno por tarjeta y en su orden. El tercero dice "Estos
   se detallan posteriormente" y sigue siendo cierto en la página: las herramientas vienen
   después. */
const QUE_HACE = [
  "Recopila bases de datos productivos, económicos y de mercado de fuentes altamente confiables y verificadas, las depura y elimina inconsistencias. De esta manera baja a mínimos de alto estándar la posibilidad de “índice de alucinación” (errores en las fuentes). La actualización de los datos es automática y permanente.",
  "Procesa los datos convirtiéndolos en información y posteriormente en conocimiento en base a las necesidades del cliente y las configuraciones que éste estipule, generando de manera automática reportes, informes o análisis configurables. Los modelos de análisis fueron configurados por analistas profesionales del sector. También permite realizar análisis de manera manual con las herramientas de las bases de datos para requerimientos muy puntuales. Empleamos Agentes de IA con algoritmos genéticos que están permanentemente “aprendiendo” de sí mismos y sus resultados.",
  "Dispone de 3 módulos específicos para diferentes niveles de necesidades. Estos se detallan posteriormente.",
  "Aporta toda la infraestructura y soporte necesaria para que el sistema esté disponible de manera permanente, incluyendo servidores, agentes de IA diseñados a medida, soporte y evoluciones constantes de nuevas herramientas o perfeccionamiento de las actuales.",
];

/* "¿Qué soluciona?": los cinco puntos de JC, en su orden. */
const QUE_SOLUCIONA = [
  "Evita el desarrollo que conlleva grandes inversiones por sus características, no sólo en equipos, sino tecnológicos de alto nivel de especialización sectorial.",
  "Evita la conformación de equipos técnicos no sólo sectoriales para realizar análisis, sino también de recopilación de datos (ingeniería y ciencia de datos), informáticos y de soporte que en total implicaría no menos de 8 personas calificadas y especializadas.",
  "La tercerización total e integral facilita no sólo los procesos administrativos y de gestión, sino de recursos financieros, ya que el servicio se factura regularmente, en montos preestipulados y sin erogaciones no previstas.",
  "Disponer de la más alta tecnología y en permanente evolución para mejorar la toma de decisiones en base a información confiable, actualizada y de alta calidad.",
  "Evita gastos en recursos de seguridad informática, ya que los servidores y aplicaciones están alojadas en la sede de Pivotal sin riesgo alguno de intrusiones no deseadas.",
];

/* Los tres niveles de la SaaS. JC los escribe seguidos, separados por ">", dentro del mismo
   párrafo; acá cada uno es un renglón con su nombre adelante, que es lo mismo pero legible. */
const NIVELES_SAAS = [
  {
    nombre: "Funcionarios",
    cuerpo: (
      <>
        Genera reportes configurables en base a las necesidades de cada usuario a nivel personal
        con alertas y envíos automáticos a su mail o WhatsApp si así lo desea, manteniéndolo al
        tanto de manera resumida y eficiente. Este nivel integra una herramienta tecnológica
        llamada <Marca>Infinite Prompt</Marca> que es un agente diseñado para analizar de manera
        permanente escenarios posibles y los resultados probables.
      </>
    ),
  },
  {
    nombre: "Técnicos",
    cuerpo: (
      <>
        Acceso a todas las bases de datos configurables y reportes genéricos que configuran los
        Agentes de IA por producto.
      </>
    ),
  },
  {
    nombre: "Nodos de información",
    cuerpo: (
      <>
        Similar al anterior pero adaptados a nivel de productor para que puedan ser reenviados o
        configurarse en centros de consulta (por ejemplos de precios, mercados, tendencias, etc.).
        Para el caso de Santiago del Estero, este nivel es ideal para ser implementado en las
        Agencias de Desarrollo, manteniendo informado a su personal y a los productores de su zona
        de influencia.
      </>
    ),
  },
];

/* Las tres herramientas que enumera JC, con sus nombres tal como él los escribe. La
   infraestructura y el soporte NO son una cuarta herramienta acá: en su texto son el cuarto
   punto de "¿Qué hace?", y así quedan. */
function herramientas(disponibles: boolean): Herramienta[] {
  return [
    {
      numero: "1",
      titulo: "Web pública",
      cuerpo: (
        <>
          <p>
            Contenidos a nivel provincial y departamental en 3 idiomas (español, inglés y
            portugués) provenientes de más de 100 bases de datos. Está organizada temáticamente de
            manera simple comprensión con formatos dashboards. El cliente decide sobre los
            contenidos. La actualización es permanente.
          </p>
          <a
            // Sin el Sistema en el build el SID no existe: queda como texto, sin link
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
              Contiene el SID (Sistema de Información Departamental), un área donde toda la
              información disponible no está organizada de manera temática, sino departamento por
              departamento y la relevancia de cada uno.
            </span>
          </a>
        </>
      ),
    },
    {
      numero: "2",
      titulo: "SaaS (Software as a Service)",
      cuerpo: (
        <>
          <p>
            Herramienta de uso interno institucional que integra aproximadamente 300 bases de
            datos con mayor nivel de detalle y alcance, incluso internacionales, y está organizada
            en 3 niveles:
          </p>
          <dl className="flex flex-col gap-3">
            {NIVELES_SAAS.map((n) => (
              <div key={n.nombre}>
                <dt className="font-semibold text-cocoa">{n.nombre}</dt>
                <dd>{n.cuerpo}</dd>
              </div>
            ))}
          </dl>
        </>
      ),
    },
    {
      numero: "3",
      titulo: "App para Productores",
      cuerpo: (
        <>
          <p>
            La App para productores está destinada a proveer información a los mismos en base a su
            actividad (productiva, de mercado, precios, climática, etc.), así como también ser un
            canal de comunicación directa con herramientas que permiten segmentar y configurar las
            prestaciones en base a los perfiles acordados con el cliente. Permite la comunicación
            institucional directa y permanente.
          </p>
          <p>
            Es un producto OPCIONAL que debe ser configurado a medida en base a los requerimientos
            del cliente.
          </p>
        </>
      ),
    },
  ];
}

export default function PlataformaPage() {
  // Sin contenido del Sistema en este build (p. ej. Vercel sin credenciales de SharePoint), el
  // botón de entrada pasa a pedir una demo, como antes. La página que abre la declara
  // tableros/site/navegacion.yaml (`entrada:`), no este archivo.
  const entrada = entradaTableros();
  const disponibles = entrada !== null;
  const entrar: Entrada = entrada
    ? { href: entrada.url, texto: "Acceso al sistema" }
    : { href: "/#contacto", texto: "Solicitar una demo" };
  const lista = herramientas(disponibles);

  return (
    <>
      <Encabezado entrar={entrar} />
      <main className="flex-1">
        <Portada entrar={entrar} herramientas={lista} />

        <section className="border-b border-cocoa/10 bg-cream py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="01"
                eyebrow="B³ AgriFood® Provincia"
                title="¿Qué hace?"
              />
            </Reveal>
            <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
              <div className="col-span-12 md:col-span-10 md:col-start-3">
                <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {QUE_HACE.map((texto, i) => (
                    <li key={i} className={TARJETA_CLARA}>
                      <span className="tnum font-mono text-xs text-olive">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="mt-3 text-[0.98rem] leading-relaxed text-cocoa/85">{texto}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Container>
        </section>

        <Technologies index="02" />

        <section id="herramientas" className="scroll-mt-20 bg-cream py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="03"
                eyebrow="B³ AgriFood® Provincia"
                title="¿Qué herramientas contiene el Sistema y cuál es su utilidad?"
              />
            </Reveal>
            <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
              <div className="col-span-12 md:col-span-10 md:col-start-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-cocoa/70">
                  Arrastre o utilice las flechas
                </span>
                <div className="mt-8">
                  <HerramientasShowcase herramientas={lista} entrar={entrar} />
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className="swiss-grid-bg-dark relative overflow-hidden bg-cocoa py-24 md:py-32">
          <Container className="relative">
            <Reveal>
              <SectionHeading
                index="04"
                eyebrow="B³ AgriFood® Provincia"
                title="¿Qué soluciona?"
                description="Independientemente de las soluciones ya descriptas en las herramientas, aporta diversas soluciones para las provincias:"
                tone="dark"
              />
            </Reveal>
            <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
              <div className="col-span-12 md:col-span-10 md:col-start-3">
                <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {QUE_SOLUCIONA.map((texto, i) => (
                    <li
                      key={i}
                      className={`${TARJETA_OSCURA} ${
                        // El quinto queda solo en la última fila: ocupa el ancho entero
                        i === QUE_SOLUCIONA.length - 1 && QUE_SOLUCIONA.length % 2 === 1
                          ? "lg:col-span-2"
                          : ""
                      }`}
                    >
                      <span className="tnum font-mono text-xs text-olive-soft">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="mt-3 text-[0.98rem] leading-relaxed text-cream/85">{texto}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Container>
        </section>

        <section className="border-b border-cocoa/10 bg-cream py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                index="05"
                eyebrow="B³ AgriFood® Provincia"
                title="¿Qué hacemos diferente?"
              />
            </Reveal>
            <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
              <div className="col-span-12 flex flex-col gap-5 md:col-span-10 md:col-start-3">
                <p className="max-w-3xl text-base leading-relaxed text-cocoa/85 sm:text-lg">
                  Luego de un estudio preliminar y posteriormente un estudio de mercado
                  tercerizado, ha dejado de manifiesto que nuestro desarrollo NO EXISTE EN EL PAIS
                  y las herramientas no las dispone ningún gobierno provincial ni empresa privada,
                  no sólo en Argentina, sino en toda Latinoamérica (nuestros próximos niveles de
                  expansión).
                </p>
                <p className="max-w-3xl text-base leading-relaxed text-cocoa/85 sm:text-lg">
                  Es un orgullo QUE ESTA TECNOLOGÍA DESARROLLADA EN SANTIAGO DEL ESTERO, en poco
                  tiempo estará disponible más allá de nuestra provincia, y entendemos que PRIMERO
                  DEBE IMPLEMENTARSE LOCALMENTE.
                </p>
              </div>
            </div>
          </Container>
        </section>

        <section className="swiss-grid-bg-dark relative overflow-hidden bg-cocoa py-24 md:py-32">
          <Container className="relative">
            <Reveal>
              <SectionHeading
                index="06"
                eyebrow="B³ AgriFood® Provincia"
                title="¿Cómo probar el Sistema?"
                tone="dark"
              />
            </Reveal>
            <div className="mt-14 grid grid-cols-12 gap-x-6 md:gap-x-8">
              <div className="col-span-12 md:col-span-10 md:col-start-3">
                <p className="max-w-3xl text-base leading-relaxed text-cream/90 sm:text-lg">
                  Hemos desarrollado una Versión Beta en permanente evolución (hasta el día de la
                  fecha solamente la Web Pública) pero absolutamente funcional y con los datos y
                  herramientas ya desarrolladas. En nuestra demostración, el cliente podrá acceder
                  y probar por sí mismo las utilidades y prestaciones.
                </p>
                <div className="mt-10">
                  <Button href={entrar.href} variant="solid-light" withArrow>
                    {entrar.texto}
                  </Button>
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
