# Maqueta "INGRESO a PACK PROVINCIA" (hoja "Pack Provi Ingreso", 22-oct-2026)

Archivo de JC: `Maqueta INGRESO a PACK PROVINCIA.xlsx`. "Hoja1" son borradores (rótulos
"PIVOTAL", "Versión Beta", "Pack Provincia" sueltos) y no se publica. Leída por los anclajes del
dibujo (`xl/drawings/drawing1.xml`) y con la hoja exportada a PDF desde Excel.

Es la portada de B³ AgriFood Provincia, ANTES de los tableros. Publicada en `/plataforma`
(`src/app/(sitio)/plataforma/page.tsx`), que antes era la lista de accesos directos; el botón
"Ingresar a los tableros" abre la seccion que declara `entrada:` en `site/navegacion.yaml` (hoy
Cultivos extensivos; hasta el 26-oct-2026 era `/plataforma/tableros`, la home que se saco). No
pasa por el pipeline: no tiene datos.

**Diseño (22-oct-2026, pedido de la usuaria):** se respetan los TEXTOS, no la estructura de la
maqueta. La página usa las piezas animadas de la landing principal: tarjetas que suben al pasar
el mouse (portada), el acordeón de tecnologías y el carrusel en profundidad con panel lateral para
las cuatro soluciones (`src/components/PackProvincia.tsx`). Sin el "PIVOTAL" gigante arriba.

## Qué trae y dónde quedó

- **Cabecera** (imágenes 62-67, 79, 91): logo provincial, "B³ AgriFood® Provincia" + "Versión
  Beta" y las tres banderas. Se usa el logo del manual de marca y las banderas de
  `site/assets/banderas/` (copiados a `public/pack-provincia/`); en y pt van apagadas con
  "Próximamente", como en los tableros.
- **Imagen 71 + imagen 68 (A5:T22)**: captura del hero del sitio institucional ("PIVOTAL",
  "Datos · Criterio · Escenarios", "El servicio de inteligencia…", "Pivotal convierte…"). Se
  publica con los mismos textos, dibujado, no la captura.
- **Imagen 75 (U5:BH21) + imágenes 76-77**: captura de "Tres tecnologías propietarias, un solo
  sistema." (Big Black Box, Minibox, Prompt). Se reusa el componente `Technologies` del sitio.
- **Imagen 111 + CuadroTexto 92 (A24:BG25)**: "B³ AgriFood® Provincia" y "Cuatro soluciones -
  Máxima eficiencia profesional y aprovechamiento de recursos, todo tercerizado".
- **Rectángulos 93, 104, 105, 106 con los números 1-4 (imágenes 109, 108, 110, 113)** y los
  cuadros de texto 114-118, 131, 136, 137: las cuatro soluciones, con los textos de JC.
  - En la 1, la imagen 119 es el logo del SID entre el tercer y el cuarto párrafo: va igual y
    lleva a `/plataforma/sid`.
  - En la 2, las imágenes 133-134 son los logos de B³ Minibox® y ∞ Prompt® pegados al inicio de
    la frase "son las tecnologías…": van como marcas dentro del texto.
- **CuadroTexto 11 "Alberdi"** (Q12:V13) y los textos 16-17 (fila 98+): restos de plantillas
  anteriores, fuera del área dibujada. No se publican.

## Correcciones al texto

- Solución 2: se agregó "y" entre los dos logos ("B³ Minibox® y ∞ Prompt® son las tecnologías").
- Solución 3: "últil para el productos" → "útil para el productor".

## Agregados nuestros (para que JC valide)

- El botón "Ingresar a los tableros" (cabecera, portada y tarjeta 1): la maqueta no dibuja cómo
  se entra a los tableros. Sin tableros en el build pasa a "Solicitar una demo".
- El pie del sitio institucional al final de la página.
