"use client";

import { useEffect } from "react";

// `clase_cuerpo` (site/navegacion.yaml, `tema_cuerpo`) iba en el <body>. El body es del layout
// comun, asi que la pagina que la declara se la pone al cargar. Hoy ninguna seccion la usa:
// queda el gancho para el proximo cliente (F3).
export default function ClaseCuerpo({ clase }: { clase: string }) {
  useEffect(() => {
    document.body.classList.add(clase);
    return () => document.body.classList.remove(clase);
  }, [clase]);
  return null;
}
