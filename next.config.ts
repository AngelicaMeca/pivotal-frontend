import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los tableros (/plataforma/...) son beta y no deben indexarse: ademas del meta robots de
  // sus paginas, el encabezado cubre los JSON de datos y los assets. /plataforma sola (la
  // pagina de ingreso) queda afuera.
  async headers() {
    return [
      {
        source: "/plataforma/:ruta+",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
