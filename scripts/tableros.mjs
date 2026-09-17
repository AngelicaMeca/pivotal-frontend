// Genera el contenido de los tableros (/plataforma) antes de `next build` (npm "prebuild").
//
// Con las credenciales de Microsoft (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, cargadas en
// Vercel): baja los Excels de SharePoint, corre el pipeline de tableros/ y deja el resultado en
// src/tableros/contenido, src/tableros/estilos y public/plataforma. Nada de eso se guarda en git:
// se regenera en cada publicacion. Ver tableros/docs/actualizacion-automatica.md.
//
// Sin credenciales (una computadora de desarrollo) usa lo que ya haya generado `make build` en
// tableros/, y si no hay nada, compila el sitio sin tableros y lo avisa.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = process.cwd();
const TABLEROS = path.join(RAIZ, "tableros");
const GENERADO = path.join(RAIZ, "src", "tableros", "contenido", "paginas");
const EXCELS = path.join(RAIZ, ".excels");
const HUELLA = path.join(RAIZ, "public", "plataforma", "estado-origen.json");
const CSS = path.join(RAIZ, "src", "tableros", "estilos", "pivotal.css");
const WINDOWS = process.platform === "win32";

function correr(comando, args, opciones = {}) {
  console.log(`[tableros] ${comando} ${args.join(" ")}`);
  const r = spawnSync(comando, args, { stdio: "inherit", cwd: TABLEROS, ...opciones });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`[tableros] fallo: ${comando} ${args.join(" ")} (codigo ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function pythonDelSistema() {
  for (const candidato of WINDOWS ? ["python", "py"] : ["python3", "python"]) {
    const r = spawnSync(candidato, ["--version"], { encoding: "utf-8" });
    if (r.status === 0) return candidato;
  }
  console.error("[tableros] No hay Python en esta maquina: el pipeline de tableros lo necesita.");
  process.exit(1);
}

const hayCredenciales = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"].every(
  (v) => process.env[v],
);

if (!hayCredenciales) {
  if (existsSync(GENERADO)) {
    console.log("[tableros] sin credenciales de SharePoint: se usa el contenido ya generado.");
    process.exit(0);
  }
  // Sin credenciales ni contenido (por ejemplo, Vercel antes de cargar las credenciales): el sitio
  // institucional se publica igual, SIN tableros, y /plataforma los muestra "en preparacion".
  // Queda un CSS vacio porque el layout de los tableros lo importa.
  console.warn(
    "[tableros] AVISO: no hay credenciales de SharePoint ni contenido generado.\n" +
      "  El sitio se compila SIN tableros. Para incluirlos: definir MS_TENANT_ID, MS_CLIENT_ID y\n" +
      "  MS_CLIENT_SECRET (ver tableros/docs/actualizacion-automatica.md), o generar el contenido\n" +
      "  a mano con: cd tableros && make build",
  );
  mkdirSync(GENERADO, { recursive: true });
  mkdirSync(path.dirname(CSS), { recursive: true });
  writeFileSync(CSS, "/* Sin tableros en esta compilacion (ver scripts/tableros.mjs) */\n");
  process.exit(0);
}

// Entorno de Python propio, fuera de git
const venv = path.join(TABLEROS, ".venv-build");
const python = WINDOWS
  ? path.join(venv, "Scripts", "python.exe")
  : path.join(venv, "bin", "python");
if (!existsSync(python)) correr(pythonDelSistema(), ["-m", "venv", venv]);
correr(python, ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "-r", "requirements.txt"]);

// Excels de SharePoint -> pipeline -> contenido del sitio
rmSync(EXCELS, { recursive: true, force: true });
mkdirSync(EXCELS, { recursive: true });
const huellaTemporal = path.join(os.tmpdir(), "pivotal-estado-origen.json");
correr(python, ["-m", "pipeline.sharepoint", "--destino", EXCELS, "--huella", huellaTemporal]);
correr(python, ["-m", "pipeline.cli", "build"], {
  env: { ...process.env, PIVOTAL_RAW: EXCELS },
});
// El material reservado (comparaciones entre provincias sin aprobar) NUNCA se publica: el pipeline
// lo genera para mirarlo en una computadora, pero de una compilacion con credenciales sale el sitio
// que va a Vercel.
for (const reservado of [
  path.join(GENERADO, "_privado"),
  path.join(RAIZ, "public", "plataforma", "_privado"),
]) {
  rmSync(reservado, { recursive: true, force: true });
}
// La huella se publica al final, con el contenido ya generado: dice que Excels usa este sitio
copyFileSync(huellaTemporal, HUELLA);
console.log("[tableros] contenido generado desde SharePoint.");
