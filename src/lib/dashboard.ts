// Tableros públicos de B³ AgriFood Provincia. Viven en este mismo sitio, bajo /plataforma: el
// pipeline de tableros/ genera su contenido y src/app/(tableros)/ los dibuja.
// Server-only: reads the generated content at build time.
import fs from "node:fs";
import path from "node:path";

/* La PUERTA DE ENTRADA a los tableros, LEÍDA DEL CONTENIDO GENERADO.
 *
 * Hasta el 26-oct-2026 esto era la constante `/plataforma/tableros`: la home con el árbol
 * temático del índice de JC. Esa vista se sacó (pedido de la usuaria) porque listaba bases sin
 * maqueta ni página -justo lo que JC pide dejar fuera de la versión pública- y porque la
 * portada de `/plataforma` ya es la entrada. Ahora la sección que abre el botón se declara en
 * `tableros/site/navegacion.yaml` (`entrada:`) y el pipeline escribe acá su URL.
 *
 * Por qué no escribirla a mano en este archivo: es la misma razón por la que la lista de
 * accesos directos dejó de estar acá. Un segundo lugar donde anotar la misma URL se queda
 * viejo, y acá el síntoma sería el peor de todos: el botón que invita a entrar llevando a
 * ninguna parte.
 *
 * Se lee en el build, no al pedir la página: el contenido lo genera `npm run build` antes de
 * compilar el sitio (scripts/tableros.mjs). Sin contenido (por ejemplo, Vercel antes de cargar
 * las credenciales de SharePoint) devuelve null y la página muestra los tableros "en
 * preparación", con "Solicitar una demo" en vez de "Ingresar a los tableros".
 */
const ENTRADA = path.join(process.cwd(), "src", "tableros", "contenido", "entrada.json");

// Lo que escribe el pipeline (ver site_build.entrada_a_los_tableros).
export type EntradaTableros = { url: string; titulo: string };

export function entradaTableros(): EntradaTableros | null {
  if (!fs.existsSync(ENTRADA)) return null;
  return JSON.parse(fs.readFileSync(ENTRADA, "utf8")) as EntradaTableros;
}
