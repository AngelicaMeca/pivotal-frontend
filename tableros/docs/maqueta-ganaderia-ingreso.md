# Maqueta "INGRESO a GANADERIA" (hoja "Ganad Ingreso", 15-oct-2026)

Archivo de JC: `Maqueta INGRESO a GANADERIA.xlsx`. "Hoja1" está vacía. Leída por los anclajes
del dibujo (`xl/drawings/drawing1.xml`) y las celdas. Spec: `specs/modelos/tablero-ganaderia-ingreso.yaml`;
comunes: `specs/modelos/_comunes-ganaderia-ingreso.yaml`. Publicada en `/plataforma/ganaderia`.

## Qué trae y dónde quedó

- **N5** miga "Ganadería - Provincia - acceso a datos e informes": literal (`breadcrumb`).
- **B8:B13** menú lateral (Agricultura ... General): el de siempre. La portada es la primera
  entrada de Ganadería y la rama declara `portada: ganaderia-ingreso` en `site/navegacion.yaml`.
- **G6:AL7** "Accesos directos a información por especie - Provincia y departamentos" y
  **G8:AL35** siete grupos (foto + nombre + "> página"), de a dos por fila: Bovinos | Bubalinos
  (Búfalos), Porcinos | Equinos, Ovinos | Caprinos, Apícolas. Panel `accesos-especies`, con el
  orden y los rótulos de JC. Las fotos se reemplazan por los íconos de especie de su paquete
  (G49: "EN EL DOCUMENTO 'ICONOS' ESTÁN LAS IMÁGENES ORIGINALES DE LAS ESPECIES").
- **AL6:BI39** recuadro "Destacados": seis anillos (imágenes 56-61) en tres filas de a dos, el
  texto **AM17** entre la primera y la segunda fila y **AM38** "Elaborado por Pivotal con
  Tecnología Minibox®" al pie. Panel `destacados-hacienda`: los anillos se calculan de los marts
  de stock (no se pegan las imágenes).
- **BE45** "Generar PDF": `acciones_de_tablero`, como en las otras portadas.
- No se dibujan: **AT1** "Santiago en el NOA" y **Q12:V13** "Alberdi" (link a 'Agri 1 Dto',
  restos de la plantilla de agricultura), como en AgroClima. **H46** es el pie global del sitio.

## Links de las tarjetas

Todos van a páginas existentes. Van a una página que contiene lo pedido: Bubalinos "Estratos y
UP" y "Categorías" (página única de bubalinos), Equinos "Estratos y UP" y "Faena" ("Stocks, UP y
Estratos"), Apícolas "Apiarios" y "Colmenas" (página apícola). Apagados con "Próximamente":
Bubalinos > Movimientos, Caprinos > Faena.

## Control de los anillos (2025)

| Anillo | JC | Sitio |
|---|---|---|
| Mayor / menor, cabezas | 59,09 / 40,91 | 59,09 / 40,91 |
| Mayor / menor, UP | 46,86 / 53,14 | 49,87 / 50,13 |
| Mayor por especie, cabezas | 90,10 / 0,20 / 9,70 | 90,10 / 0,20 / 9,70 |
| Mayor por especie, UP | 51,19 / 0,27 / 48,54 | 45,37 / 0,24 / 54,39 |
| Menor por especie, cabezas | 16,30 / 25,55 / 58,14 | 16,30 / 25,55 / 58,14 |
| Menor por especie, UP | 31,43 / 27,06 / 41,51 | 31,43 / 27,06 / 41,51 |

Totales: cabezas bovinos 1.083.349, bubalinos 2.386, equinos 116.597, porcinos 135.715, ovinos
212.758, caprinos 484.091; UP 9.009, 48, 10.800, 6.273, 5.400 y 8.285. La diferencia de UP es de
equinos: JC usó los establecimientos (8.543) y el sitio usa su UP/RENSPA (10.800), que es la que
publica la página de equinos. Backlog 111.
