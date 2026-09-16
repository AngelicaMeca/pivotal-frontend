// Lectura del contenido que genera el pipeline (make site en tableros/) en
// src/tableros/contenido/paginas/. Corre solo en el servidor: cada pagina es un JSON.
import fs from "node:fs";
import path from "node:path";
import type { Pagina } from "./tipos";

const RAIZ = path.join(process.cwd(), "src", "tableros", "contenido", "paginas");

function listar(carpeta: string): string[] {
  const salida: string[] = [];
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      salida.push(...listar(ruta));
    } else if (entrada.name.endsWith(".json")) {
      salida.push(path.relative(RAIZ, ruta).split(path.sep).join("/").replace(/\.json$/, ""));
    }
  }
  return salida;
}

// La ruta del JSON a partir de los segmentos de la URL, sin el prefijo /plataforma:
// /plataforma/a/b es a/b/index (la portada de la seccion) y /plataforma/a/b/c es a/b/c
function archivoDe(segmentos: string[]): string {
  const ruta = segmentos.join("/");
  if (fs.existsSync(path.join(RAIZ, ruta + ".json"))) return ruta;
  return ruta + "/index";
}

export function leerPagina(segmentos: string[]): Pagina {
  const archivo = path.join(RAIZ, archivoDe(segmentos) + ".json");
  return JSON.parse(fs.readFileSync(archivo, "utf-8")) as Pagina;
}

// Todas las paginas de los tableros, como segmentos (para generateStaticParams)
export function rutasDelSitio(): string[][] {
  if (!fs.existsSync(RAIZ)) return [];
  return listar(RAIZ)
    .sort()
    .map((ruta) => ruta.replace(/\/index$/, "").split("/"));
}
