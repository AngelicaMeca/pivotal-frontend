import type { NextConfig } from "next";

/* Los archivos de public/ los sirve Next con `Cache-Control: public, max-age=0`, porque no
 * puede saber cuáles cambian. Para los tableros eso es caro: cada visita vuelve a pedir el
 * mapa del SEPA que se está mirando (1,6 MB), sus miniaturas y los límites de los
 * departamentos, y después de cada publicación el CDN arranca vacío. De ahí que "cuando hago
 * el deploy a producción, los mapas demoran mucho en cargar" (la usuaria, 27-oct-2026).
 *
 * Acá se declara cuánto dura cada familia de archivos. La regla para elegir es una sola: si el
 * CONTENIDO de un nombre de archivo puede cambiar, no se puede cachear largo.
 */

// Los mapas y los PDF son FOTOS DE UN PERÍODO y el nombre del archivo lo dice
// (et_202609_3.gif, la 3ra década de septiembre de 2026; el ejemplar 922 del AgroMet). Un mapa
// nuevo es un nombre nuevo, nunca una versión nueva de uno que ya está. Por eso `immutable`:
// el navegador no vuelve a preguntar por ellos ni una vez. Si alguna vez hubiera que corregir
// una imagen ya publicada, hay que cambiarle el nombre, no el contenido.
const PARA_SIEMPRE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

// Los límites de los departamentos, las capas del IGN, los íconos, los logos y las banderas sí
// conservan el nombre cuando se regeneran. Una semana de validez, y hasta un mes sirviendo el
// que ya está mientras se busca el nuevo por detrás: rápido, y una corrección llega sola.
const UNA_SEMANA = [{
  key: "Cache-Control",
  value: "public, max-age=604800, stale-while-revalidate=2592000",
}];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Los tableros (/plataforma/...) son beta y no deben indexarse: ademas del meta robots de
      // sus paginas, el encabezado cubre los JSON de datos y los assets. /plataforma sola (la
      // pagina de ingreso) queda afuera.
      {
        source: "/plataforma/:ruta+",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      { source: "/plataforma/mapas/:ruta*", headers: PARA_SIEMPRE },
      { source: "/plataforma/documentos/:ruta*", headers: PARA_SIEMPRE },
      { source: "/plataforma/geo/:ruta*", headers: UNA_SEMANA },
      { source: "/plataforma/iconos/:ruta*", headers: UNA_SEMANA },
      { source: "/plataforma/banderas/:ruta*", headers: UNA_SEMANA },
      // Lo que NO entra acá a propósito: /plataforma/data, que es lo que el pipeline
      // regenera con cada entrega de Excels y publica cada hora con el mismo nombre. Ahí el
      // dato viejo servido de más sería un dato equivocado en pantalla, así que sigue
      // revalidando en cada visita.
    ];
  },
};

export default nextConfig;
