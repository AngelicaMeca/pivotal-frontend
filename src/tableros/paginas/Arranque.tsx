"use client";

import { useEffect } from "react";

// El JS de cada tipo de pagina (src/tableros/cliente/). Es el mismo que usaba el sitio estatico:
// lee los data-* del HTML, baja el JSON de la pagina y dibuja con ECharts.
const MODULOS = {
  tablero: () => import("@/tableros/cliente/tablero"),
  ranking: () => import("@/tableros/cliente/ranking"),
  serie: () => import("@/tableros/cliente/serie"),
  torta: () => import("@/tableros/cliente/torta"),
  mapa: () => import("@/tableros/cliente/mapa"),
  "flujo-od": () => import("@/tableros/cliente/flujo-od"),
  lista: () => import("@/tableros/cliente/lista"),
  "tabla-variaciones": () => import("@/tableros/cliente/tabla-variaciones"),
};

export type TipoDePagina = keyof typeof MODULOS;

// Arranca el dibujo cuando la pagina ya esta en pantalla. No dibuja nada propio: el HTML lo
// pone el servidor y el JS lo completa, igual que antes. `vigente` evita el doble arranque del
// modo estricto de React en desarrollo.
export default function Arranque({ tipo }: { tipo: TipoDePagina }) {
  useEffect(() => {
    let vigente = true;
    Promise.all([import("@/tableros/cliente/comun"), MODULOS[tipo]()]).then(([comun, modulo]) => {
      if (vigente) modulo.default(comun.default());
    });
    return () => {
      vigente = false;
    };
  }, [tipo]);
  return null;
}
