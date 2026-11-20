# Doctrina de JC

> Las reglas permanentes que dio Juan Carlos Antuña, con su cita textual, la fecha y dónde están
> implementadas. El agente `interprete-jc` lee este archivo ANTES de interpretar un comentario
> nuevo y lo amplía cuando el comentario deja una regla. Cualquiera que vaya a cambiar una página
> lo lee primero: acá está lo que no hay que volver a preguntarle.
>
> **Cómo se usa.** Una regla se cita, no se parafrasea. Si un pedido nuevo contradice una de estas,
> no se elige por criterio propio: se escriben las dos citas con su fecha y se le pregunta cuál
> manda (fila nueva en `backlog.md`). Si lo publicado contradice una de estas, es un defecto
> nuestro y se arregla sin preguntar.
>
> El detalle de implementación de cada una vive en `tableros/CLAUDE.md` (sección "Reglas de la capa
> de presentación") y en el spec de cada página. Acá está la regla y la cita, no la mecánica.

## 1. Todo adentro de AgriFood

**Nunca un link externo.** Lo que se muestra se muestra en nuestro sitio.

> "JAMAS DIJE QUE PONGAMOS LINKS EXTERNOS AL RESTO DE LOS MAPAS... la idea es QUE ESTEN DENTRO DE
> AGRIFOOD!!!! Nunca pusimos links externos a nada, por ende, no se porque se hizo en este caso."
> (18-nov-2026, tarea 1220512131004640)

**Orden de preferencia, de mayor a menor: visor propio > visor embebido > sacarlo. El link externo
no está en la lista.**

> "LA IDEA ERA BAJAR LAS CAPAS Y PONER NUESTRO PROPIO VISOR, SI NO SE PUEDE, ELIMINAMOS TODO. PARA
> QUE QUEDE DENTRO DE NUESTRA WEB." / "Si hay algun impedimento en la descarga de las capas, al
> menos hagamos como están los mapas de población del INDEC, pero no es lo ideal."
> (18-nov-2026, tarea 1220512131004640)

**Si la fuente tiene botón de descargar, la capa se baja.** No alcanza con que el organismo tenga
un visor.

> "Lo que no entiendo es que si se pudo hacer con el mapa de cultivos, porque no con los otros????
> TODOS TIENEN LA OPCION DE DESCARGAR LA CAPA..." / "Ahí está clarísimo el link a la descarga.
> TODOS TIENEN la opción DESCARGAR, por ende podemos ponerlo en nuestro propio visor."
> (18-nov-2026, tarea 1220512131004640)

Dónde: `configs/fuentes-geoespaciales.yaml` (`modo_visualizacion.resuelto`, estado por fuente),
`pipeline/fuentes_geo.py` (corta la corrida), `site_build.py` (`fuera_del_sitio` de cada tarjeta).
Una tarjeta que saca al visitante del sitio es un defecto, no una variante.

**Corolario del QA del 20-nov-2026: si el visor del organismo NO PUEDE mostrar lo que pidió, la
tarjeta no se queda enlazando otra cosa.** Las dos salidas son las de su orden de preferencia:
bajarla a nuestro visor o sacarla. Pasó dos veces el mismo día: la tarjeta "Parajes por
provincia" abría un indicador de POBLACIÓN porque el portal del INDEC no tiene ningún indicador
de parajes (se publica ahora como capa nuestra, en Infraestructura), y la de la cobertura de
bosque nativo abría el visor general de la CONAE porque esa capa no está publicada en ningún
servicio suyo ni hay un mapa con enlace propio (se quitó). Un visor embebido que abre en otra
cosa es peor que no tener la tarjeta: promete el mapa que JC pidió y muestra otro.

**Y la regla vale también para los enlaces de adentro de una página, no solo para las tarjetas**
(cómo la aplicamos, desde el QA del 19-nov-2026): la cita de la fuente es obligatoria y puede
nombrar su URL, pero **se escribe, no se linkea**. Así salieron el enlace "Visor y descarga del
INTA" del Mapa Nacional de Cultivos, el "Abrir en el sitio del organismo" del visor embebido y
las cinco citas clickeables al SEPA en AgroClima. El organismo se sigue nombrando en los tres
lugares; lo que no está es el clic que lleva afuera.

## 2. Los mapas tienen que servirle después al agente de IA

> "TENGAN EN CUENTA QUE LA IDEA ES QUE DESPUES EL AGENTE DE IA PUEDA TRABAJAR CON ESOS MAPAS..."
> (18-nov-2026, tarea 1220512131004640)

Consecuencia de diseño: entre una imagen y un vector con sus clases nombradas, se elige el vector,
aunque la imagen se vea igual. Un PNG no se puede consultar.

## 3. Un mapa se recorre: ocupa la página y hace zoom

> "SOLO PONEMOS COMO TITULO 'infraestructura' y que el mapa ocupe toda la página pudiendo hacer
> zoom al máximo. Que el usuario pueda agregar o quitar capas" (15-nov-2026, tarea 1217681319199651)

> "QUE SE VEA LA DIVISIÓN DEPARTAMENTAL" (15-nov-2026, misma tarea)

> "QUE SE VEA (incluido el zoom) TAL COMO ESPECTACULARMENTE BIEN HICISTE CON LOS DE AGROCLIMA"
> (17-nov-2026, tarea 1220512131004640) · "pregunta... ¿porque el mapa de cultivos tiene poco
> zoom???? gracias" (18-nov-2026)

El zoom es parte de la calidad que espera de cualquier mapa, no una opción. Cuando nombra una
página que aprobó (AgroClima), esa página es la especificación: hay que ir a verla.
Dónde: `zoom: true` en `paneles.orden`, `tablero-infraestructura-y-riesgo.yaml`, CLAUDE.md
"Mapas e Infraestructura: la revisión de JC del 15-nov-2026".

**"SOLO el título y el mapa" se toma literal** (QA del 19-nov-2026): esa página no lleva banda de
indicadores ni un segundo título arriba del mapa, y lo que quede debajo del mapa es lo que hay
que saberle al dato y nada más. Todo lo que va ARRIBA del mapa le saca alto a lo único que pidió.
Dos cosas más, aprendidas ahí: **la página abre con su mapa puesto** -una página de suelos que
abre sin un solo suelo a la vista no cumple el pedido- y **el encuadre es del visitante**: prender
o apagar una capa no lo devuelve al inicio.

> "AUMENTA TAMAÑO DE MAPA EN UN POP UP" (6-oct-2026, hoja "Agri 3 - C"): una galería de mapas se
> amplía en popup, no se abre en otra página.

**Cómo lo aplicamos, después del QA del 20-nov-2026: el que ocupa la página es el MAPA, no la
caja.** La provincia es más alta que ancha (relación 0,635) y se encuadra por el alto, así que una
caja a todo el ancho queda con el dibujo en el medio y crema a los costados -"el mapa ocupa cerca
de un tercio del ancho"-. Deformarla para que llene el ancho es lo que él mandó corregir en la
tercera tanda, así que lo que se ajusta es la caja: mide lo que mide el mapa y la leyenda queda
pegada al costado. Y **se recorre con botones, no solo con la rueda**: los tres mapas propios
llevan + / − / "Provincia" flotando sobre la esquina, como el visor georreferenciado que él puso
como referencia ("TAL COMO ESPECTACULARMENTE BIEN HICISTE CON LOS DE AGROCLIMA").

## 4. Su maqueta es literal

Títulos, orden de los cuadros, dónde pega cada imagen, qué columnas lleva una tabla. Inventar un
título es un error aunque el inventado quede mejor; una tabla que en su hoja no tiene título, no
lleva título.

Dónde: backlog 31, `_protocolo-presentacion.formato_v1.tercera_tanda.titulos_del_tablero_literales`.
Los errores de su maqueta (columnas corridas, categorías invertidas) no se copian: se publica el
dato bien y se le avisa en el backlog.

## 5. Lo que no está maquetado no se publica

> "TODO AQUELLO QUE NO ESTÉ MAQUETADO, NO DEBE ESTAR EN LA VERSIÓN PÚBLICA... Pueden quedar los
> títulos"

Dónde: CLAUDE.md "Lo que no está maquetado NO va a la versión pública"; una página sin maqueta pasa
a `estado: no-publicada` con el motivo y la cita, y su sector queda con el título y "Próximamente".

## 6. No se dibujan botones que no hacen nada

Excepción acotada y pedida por él: lo que él quiere ver en el lugar donde va, apagado y con
"Próximamente" al lado (banderas de idioma, secciones anunciadas, tarjetas sin página).
Dónde: backlog 33, `proximamente: true` en `site/navegacion.yaml`.

## 7. Un stock nunca se analiza separando categorías

> "JAMAS SE PUEDE ANALIZAR UN STOCK SEPARANDO LAS CATEGORIAS!!!!!!!! Por favor MANTENGAN EL MODELO"
> (13-oct-2026)

Vale para todas las especies: sin filtro, sin chips, sin comparación por categoría; el mapa, la
evolución y los KPIs de volumen son siempre el TOTAL. Dónde: CLAUDE.md y el verificador
`verificar_stock_sin_categorias` del build, que corta la corrida.

Del mismo orden, por la naturaleza del dato y no por gusto: **el rendimiento no se promedia y las
superficies no se suman entre estaciones** (backlog 29).

## 8. Organización temática, sin "análisis completo"

> "OLVIDATE DEL ANÁLISIS COMPLETO, ESO YA NO EXISTE MÁS... TE QUEDES CON LOS TABLEROS"
> (10-ago-2026, backlog 28)

El sitio se organiza por subdivisión temática. No hay pestañas tablero/análisis ni links "ver
detalle".

## 9. Cada cuadro cita su fuente, y el registro es formal

Fuente al pie de cada cuadro y de cada gráfico, obligatorio, lo pidió él. Forma adoptada de su
puño: **"Fuente: MAGyP (Ministerio de Agricultura, Ganadería y Pesca)"** (backlog 14). En el sitio
publicado el registro es **formal, sin tuteo ni voseo** (revisión del 16-oct-2026).

## 10. Una portada nueva se calca de la que ya aprobó

> "Con el mismo formato de 'Agroclima' hacemos un área de 'ingreso' con los títulos de los mapas
> que envié el link" (15-nov-2026, tarea 1217681319199651)

Cuando pide algo nuevo, lo pide con la forma de algo que ya vio funcionando. La forma anterior es
parte del pedido.

---

## Cómo comenta JC (criterios de lectura, no reglas suyas)

- **Mayúsculas = orden no negociable.**
- **"¿Por qué X está mal?" es "arreglen X"**, no una consulta.
- **"JAMAS DIJE QUE..." quiere decir que se hizo algo que no pidió**: el trabajo es deshacerlo y
  entender por qué nadie preguntó.
- **"No es lo ideal" autoriza un fallback, no lo convierte en la meta.**
- **"Si se pudo con X, por qué no con Y":** cuando dos páginas hermanas salen distintas, el motivo
  se escribe antes de que lo pregunte.
- **Puede comentar antes de que se le avise que está para revisar.** Él mismo lo aclaró el
  18-nov-2026: "pensé que ya estaba terminado y me explica Fran que está en proceso... Sólo soy un
  obsesivo perfeccionista que esta vez se adelantó". Un comentario con enojo no prueba que haya un
  defecto: primero se verifica el estado en el sitio construido.
