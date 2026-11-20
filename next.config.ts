import type { NextConfig } from "next";

/* Los archivos de public/ los sirve Next con `Cache-Control: public, max-age=0`, porque no
 * puede saber cuáles cambian. Para los tableros eso es caro: cada visita vuelve a pedir el
 * mapa del SEPA que se está mirando (1,6 MB), sus miniaturas y los límites de los
 * departamentos, y después de cada publicación el CDN arranca vacío. De ahí que "cuando hago
 * el deploy a producción, los mapas demoran mucho en cargar" (la usuaria, 27-oct-2026).
 *
 * Acá se declara cuánto dura cada familia de archivos. La regla para elegir es una sola: si el
 * CONTENIDO de un nombre de archivo puede cambiar, no se puede cachear largo.
 *
 * Y UNA SEGUNDA REGLA, que costó una página vieja en pantalla (QA de Francisco del
 * 20-nov-2026): **una regla de caché acá matchea el CAMINO del pedido, no la carpeta de
 * `public/`**. Los nombres de las carpetas de archivos se pisan con los de las PÁGINAS: los
 * mapas del SEPA viven en `public/plataforma/mapas/` y las páginas de mapas son
 * `/plataforma/mapas/suelos-y-uso-del-suelo` y `/plataforma/mapas/cuencas-y-cursos-de-agua`.
 * Con `/plataforma/mapas/:ruta*` esas dos páginas y la portada de Mapas se publicaron
 * `immutable` por un año: quien ya las había visitado seguía viendo el HTML viejo -sin los
 * arreglos del 19-nov- hasta forzar la recarga. Por eso cada regla pide ahora una EXTENSIÓN de
 * archivo, que una URL de página no tiene. Regla para la próxima: el `source` de una regla de
 * caché larga termina siempre en `archivos(...)`.
 */

// Las extensiones de cada familia. `:archivo(...)` acepta subcarpetas porque en una expresión
// regular el punto también matchea la barra; lo que no matchea es una URL sin punto, que es
// justo lo que son las páginas.
function archivos(carpeta: string, extensiones: string[]): string {
  return `/plataforma/${carpeta}/:archivo(.*\\.(?:${extensiones.join("|")}))`;
}

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

// Las PÁGINAS de los tableros se revalidan siempre. Es el default de Next para una página
// estática, y acá queda escrito a propósito: así una regla de archivos mal escrita no se las
// puede llevar puestas de nuevo, porque esta regla va primero y la de archivos ya no matchea
// una URL sin extensión.
const SIEMPRE_FRESCO = [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }];

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
      // Una URL de pagina es la que NO tiene punto en su ultimo tramo.
      { source: "/plataforma/:ruta((?:[^/.]+/)*[^/.]+)", headers: SIEMPRE_FRESCO },
      { source: archivos("mapas", ["png", "jpg", "jpeg", "gif", "webp", "svg"]),
        headers: PARA_SIEMPRE },
      { source: archivos("documentos", ["pdf"]), headers: PARA_SIEMPRE },
      { source: archivos("geo", ["geojson", "json"]), headers: UNA_SEMANA },
      { source: archivos("iconos", ["png", "svg", "webp"]), headers: UNA_SEMANA },
      { source: archivos("banderas", ["png", "svg"]), headers: UNA_SEMANA },
      // Lo que NO entra acá a propósito: /plataforma/data, que es lo que el pipeline
      // regenera con cada entrega de Excels y publica cada hora con el mismo nombre. Ahí el
      // dato viejo servido de más sería un dato equivocado en pantalla, así que sigue
      // revalidando en cada visita.
    ];
  },
};

export default nextConfig;
