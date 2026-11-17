# -*- coding: utf-8 -*-
"""Base de informes de contexto para el agente de IA (ERS de Mapas y Contexto IA).

Cubre RF7 a RF9 (alta, rechazo por metadatos incompletos, carga masiva, alcance temporal,
respaldo metodologico, indexacion, reindexacion, inventario y huecos de cobertura) y RF28 a
RF30 (recuperacion de contexto con fuente citable, acceso restringido y separacion de
productos).

Igual que el catalogo de fuentes geoespaciales, esto NO es una pantalla de administracion: es
un registro declarativo versionado (`corpus/indice-corpus.yaml`) y un indice reproducible. El
"alta" de RF7 es escribir una entrada en ese YAML, a mano o con `cargar-lote`, y lo que hace
este modulo es hacerla cumplir.

---------------------------------------------------------------------------------------------
LA DECISION QUE FALTA Y POR QUE NO LA TOMAMOS ACA
---------------------------------------------------------------------------------------------
RF8 pide que los fragmentos sean recuperables "por similitud semantica". Similitud semantica
de verdad quiere decir embeddings, y eso significa o un modelo local nuevo o un servicio
externo al que se le mandan los informes. Las dos cosas estan explicitamente fuera de lo que
un agente puede decidir solo (CLAUDE.md: nada de dependencias nuevas sin justificacion
escrita, y "prohibido sin decision explicita de Francisco: ... servicios cloud nuevos"), y
mandarle 2.000 informes de organismos a un tercero es ademas una decision de negocio.

Asi que esto esta construido en dos partes:

- **La interfaz de recuperacion (RF28) y todo lo que la rodea estan terminados** y no cambian
  el dia que se decida el motor: `recuperar()` devuelve fragmentos con su documento, su
  ubicacion y su cita completa, y eso es el contrato que consumen los minibox (RF28.4).
- **El motor de puntaje es intercambiable** (`MOTORES`). Hoy funciona `lexico`, que es BM25
  sobre el texto normalizado: biblioteca estandar, determinista, y sirve de verdad para lo
  que mas se va a pedir (un sector, un periodo y un territorio con un par de palabras).
  Cuando Francisco decida el de embeddings se agrega un motor mas y se cambia una linea del
  YAML; el indice lexico se queda, porque los dos se complementan.

Lo honesto es decir que hoy la busqueda es lexica y no semantica. Esta anotado en el backlog.
"""

import hashlib
import io
import json
import math
import os
import re
import sys
import unicodedata

import yaml


class ErrorDeCorpus(Exception):
    """El corpus esta mal declarado y seguir seria indexar algo que no se puede citar."""


CARPETA = "corpus"
REGISTRO = os.path.join(CARPETA, "indice-corpus.yaml")
TEXTOS = os.path.join(CARPETA, "texto")
INDICE = os.path.join(CARPETA, "indice")

# RF7: los siete datos que el sistema pide para dar de alta un informe.
METADATOS_OBLIGATORIOS = (
    "titulo", "organismo", "tipo_institucion", "fecha_publicacion",
    "periodo_referencia", "sector", "alcance_territorial",
)

# RF7.1: de esos siete, los cuatro que BLOQUEAN la indexacion si faltan. El informe queda
# registrado y en el inventario, pero no entra al indice y por lo tanto el agente no lo puede
# devolver. Son justo los que hacen falta para citarlo y para filtrarlo.
METADATOS_QUE_BLOQUEAN = ("organismo", "periodo_referencia", "sector", "alcance_territorial")

MOTORES = ("lexico",)

# Un fragmento es la unidad que se recupera. 1.200 caracteres con 200 de solape: lo bastante
# largo para que un parrafo entre entero y lo bastante corto para que el agente lo pueda citar
# sin pegar tres paginas. El solape existe para que una frase partida al medio aparezca
# completa en alguno de los dos.
LARGO_FRAGMENTO = 1200
SOLAPE = 200

# Palabras que no distinguen un informe de otro. Sin esto, "de" y "la" pesan como "sequia".
VACIAS = frozenset("""
a al algo algun alguna algunas alguno algunos ante antes aquel aquella aquellas aquello
aquellos aqui asi aun aunque cada como con contra cual cuales cuando cuanto de del desde
donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba
estan estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me
mi mientras mis mucho muy nada ni no nos nuestra nuestro o os otra otras otro otros para
pero poco por porque que quien se ser si sin sobre son su sus tambien tan tanto te tiene
tienen toda todas todo todos tras un una unas uno unos y ya
""".split())


def _texto(valor):
    return valor if isinstance(valor, str) else ("" if valor is None else str(valor))


def normalizar(texto):
    """Pasa un texto a las palabras con las que se indexa y se busca.

    Minusculas, sin tildes, partido por lo que no sea letra o numero, sin palabras vacias y
    con un plural simple sacado ("sequias" y "sequia" tienen que encontrarse). No es un
    stemmer de verdad y no pretende serlo: es la misma funcion para indexar y para buscar, que
    es lo unico que de verdad importa para que el puntaje cierre.
    """
    sin_tilde = unicodedata.normalize("NFKD", texto.lower())
    sin_tilde = "".join(c for c in sin_tilde if not unicodedata.combining(c))
    palabras = []
    for cruda in re.split(r"[^0-9a-zñ]+", sin_tilde):
        if len(cruda) < 3 or cruda in VACIAS:
            continue
        if len(cruda) > 4 and cruda.endswith("es"):
            cruda = cruda[:-2]
        elif len(cruda) > 3 and cruda.endswith("s"):
            cruda = cruda[:-1]
        palabras.append(cruda)
    return palabras


# --- EL REGISTRO -----------------------------------------------------------------------------

def cargar(raiz="."):
    ruta = os.path.join(raiz, REGISTRO)
    if not os.path.exists(ruta):
        raise ErrorDeCorpus("No existe %s. Es el registro de la base de contexto." % REGISTRO)
    with io.open(ruta, encoding="utf-8") as f:
        registro = yaml.safe_load(f) or {}
    for clave in ("vocabularios", "documentos"):
        if clave not in registro:
            raise ErrorDeCorpus("%s no declara `%s`." % (REGISTRO, clave))
    registro["documentos"] = registro.get("documentos") or []
    registro["lotes"] = registro.get("lotes") or []
    return registro


def lote_de(registro, documento):
    """El lote del documento, o {} si no tiene. RF7.2: el lote trae los metadatos de a muchos."""
    lid = documento.get("lote")
    if not lid:
        return {}
    for lote in registro["lotes"]:
        if lote.get("id") == lid:
            return lote
    raise ErrorDeCorpus("El documento %s dice ser del lote `%s`, que no esta declarado."
                        % (documento.get("id"), lid))


def resuelto(registro, documento):
    """El documento con los metadatos de su lote aplicados abajo de los propios.

    Es el corazon de la carga masiva de RF7.2: el lote pone el organismo y el sector de los
    2.000 archivos y cada documento refina lo suyo encima. Lo que gana siempre es lo que dice
    el documento.
    """
    base = dict(lote_de(registro, documento))
    base.pop("id", None)
    base.pop("descripcion", None)
    base.pop("origen", None)
    junto = dict(base)
    junto.update({k: v for k, v in documento.items() if v is not None})
    return junto


def anio_de_periodo(periodo):
    """El primer anio del periodo de referencia, sea un dict {desde,hasta}, un anio o un texto."""
    if isinstance(periodo, dict):
        desde = periodo.get("desde")
        if desde is None:
            return None
        return getattr(desde, "year", None) or int(_texto(desde)[:4])
    if isinstance(periodo, int):
        return periodo
    encontrado = re.search(r"(\d{4})", _texto(periodo))
    return int(encontrado.group(1)) if encontrado else None


def anios_de_periodo(periodo):
    """Todos los anios que toca el periodo de referencia, para el inventario y los huecos."""
    if isinstance(periodo, dict):
        desde, hasta = periodo.get("desde"), periodo.get("hasta")
        a = anio_de_periodo({"desde": desde})
        b = anio_de_periodo({"desde": hasta}) if hasta is not None else a
        if a is None:
            return []
        return list(range(a, (b or a) + 1))
    uno = anio_de_periodo(periodo)
    return [uno] if uno else []


# --- RF7 / RF7.1: QUE SE ACEPTA Y QUE NO ----------------------------------------------------

def faltantes(documento):
    """Los metadatos obligatorios que le faltan al documento ya resuelto (RF7)."""
    return [m for m in METADATOS_OBLIGATORIOS
            if documento.get(m) in (None, "", [], {})]


def motivo_de_rechazo(documento, registro):
    """Por que este informe NO se puede indexar, o None si se puede (RF7.1).

    Devolver el motivo y no un booleano es a proposito: el inventario lo muestra y alguien
    tiene que poder completar el dato que falta sin adivinar cual es.
    """
    sin = [m for m in METADATOS_QUE_BLOQUEAN if documento.get(m) in (None, "", [], {})]
    if sin:
        return ("le faltan metadatos que no se pueden suplir: %s. Sin eso el agente no puede "
                "citar el informe ni filtrarlo por periodo o territorio (RF7.1)."
                % ", ".join(sin))
    vocab = registro["vocabularios"]
    for campo in ("tipo_institucion", "sector", "alcance_territorial"):
        valor = documento.get(campo)
        permitidos = vocab.get(campo) or []
        if valor is not None and permitidos and valor not in permitidos:
            return "su `%s` dice \"%s\", que no esta en el vocabulario declarado." % (
                campo, valor)
    return None


def verificar(registro, raiz="."):
    """Controla el registro entero. Devuelve (fallos, avisos).

    Fallos = esta mal declarado y hay que arreglarlo. Avisos = esta bien declarado pero hay
    algo que una persona tiene que mirar (un informe que no se va a indexar, por ejemplo).
    """
    fallos, avisos = [], []
    vistos = set()
    variables = {v["id"] for v in (registro.get("variables_respaldables") or [])}
    minimo = (registro["vocabularios"] or {}).get("periodo_minimo")

    for crudo in registro["documentos"]:
        did = crudo.get("id")
        if not did:
            fallos.append("Hay un documento sin `id`. El id es con lo que se lo cita.")
            continue
        if did in vistos:
            fallos.append("%s: el id esta dos veces." % did)
        vistos.add(did)

        doc = resuelto(registro, crudo)
        for m in faltantes(doc):
            # RF7 pide los siete, pero solo cuatro bloquean (RF7.1): los otros tres se avisan.
            if m in METADATOS_QUE_BLOQUEAN:
                continue
            avisos.append("%s: no declara `%s`, que RF7 pide en el alta." % (did, m))

        motivo = motivo_de_rechazo(doc, registro)
        if motivo:
            avisos.append("%s NO se indexa: %s" % (did, motivo))

        # RF7.4: un respaldo tiene que apuntar a una variable que exista, o no respalda nada.
        for vid in (doc.get("respalda") or []):
            if vid not in variables:
                fallos.append("%s: dice respaldar la variable `%s`, que no esta en "
                              "`variables_respaldables`." % (did, vid))

        # RF7.3: se admiten informes desde 2016. Uno anterior no es un error -puede ser una
        # serie historica- pero se avisa, porque queda fuera de la cobertura declarada.
        anio = anio_de_periodo(doc.get("periodo_referencia"))
        if minimo and anio and anio < minimo:
            avisos.append("%s: su periodo de referencia empieza en %d, antes del %d que "
                          "declara la cobertura." % (did, anio, minimo))

        if not doc.get("archivo") and not doc.get("url"):
            fallos.append("%s: no dice ni el archivo ni la URL. No se puede llegar al "
                          "documento." % did)

    return fallos, avisos


def verificar_o_cortar(raiz="."):
    registro = cargar(raiz)
    fallos, avisos = verificar(registro, raiz)
    if fallos:
        raise ErrorDeCorpus("La base de contexto esta mal declarada:\n  - "
                            + "\n  - ".join(fallos))
    return registro, avisos


# --- RF29 / RF30: ESTO NO SE PUBLICA --------------------------------------------------------

def verificar_no_publicado(raiz="."):
    """Corta si algo del corpus se filtro a lo que se publica (RF29 y RF30).

    No es paranoia: el material geoespacial SI va a los dos productos y el corpus NO, asi que
    la unica diferencia entre las dos cosas es una regla, y una regla sin control se rompe en
    el primer `cp -r`. Se controla por el nombre de los archivos del registro y por el nombre
    de la carpeta.
    """
    publicados = [
        os.path.join(raiz, "..", "public", "plataforma"),
        os.path.join(raiz, "..", "src", "tableros", "contenido"),
    ]
    registro = cargar(raiz)
    nombres = {os.path.basename(_texto(d.get("archivo"))).lower()
               for d in registro["documentos"] if d.get("archivo")}
    encontrados = []
    for carpeta in publicados:
        if not os.path.isdir(carpeta):
            continue
        for base, dirs, archivos in os.walk(carpeta):
            if "corpus" in [d.lower() for d in dirs]:
                encontrados.append(os.path.join(base, "corpus"))
            for a in archivos:
                if a.lower() in nombres:
                    encontrados.append(os.path.join(base, a))
    if encontrados:
        raise ErrorDeCorpus(
            "Hay material de la base de contexto en lo que se publica, y RF29/RF30 no lo "
            "permiten:\n  - " + "\n  - ".join(encontrados))
    return True


# --- RF8: INDEXACION ------------------------------------------------------------------------

def ruta_de_texto(raiz, did):
    return os.path.join(raiz, TEXTOS, "%s.txt" % did)


def leer_texto(raiz, did):
    """El texto extraido del documento, o None si todavia no se extrajo.

    La extraccion del PDF no la hace este modulo: el pipeline no depende de ninguna libreria
    de PDF (es la misma regla con la que se saco el logo del manual de marca), asi que el
    texto llega como un `.txt` al lado y eso es lo que se indexa y se versiona. Un informe sin
    texto queda en el inventario como `sin_texto`, nunca se indexa a medias.
    """
    ruta = ruta_de_texto(raiz, did)
    if not os.path.exists(ruta):
        return None
    with io.open(ruta, encoding="utf-8") as f:
        return f.read()


def fragmentar(texto):
    """Parte el texto en fragmentos con su ubicacion (RF8: se conserva donde estaba).

    La ubicacion es el numero de fragmento y el rango de caracteres, mas la pagina cuando el
    texto trae las marcas que escribe el extractor (`=== pagina N ===`). Sin ubicacion un
    fragmento no se puede verificar contra el original, y entonces no se puede citar.
    """
    fragmentos = []
    paginas = []
    for m in re.finditer(r"=+\s*pagina\s+(\d+)\s*=+", texto, re.I):
        paginas.append((m.start(), int(m.group(1))))

    def pagina_en(pos):
        cual = None
        for inicio, numero in paginas:
            if inicio <= pos:
                cual = numero
            else:
                break
        return cual

    paso = LARGO_FRAGMENTO - SOLAPE
    i = 0
    n = 0
    while i < len(texto):
        pedazo = texto[i:i + LARGO_FRAGMENTO]
        if pedazo.strip():
            fragmentos.append({
                "n": n,
                "desde": i,
                "hasta": i + len(pedazo),
                "pagina": pagina_en(i),
                "texto": " ".join(pedazo.split()),
            })
            n += 1
        i += paso
    return fragmentos


def indexar(raiz=".", solo=None, avisar=None):
    """Arma el indice de los informes indexables (RF8) y lo escribe en `corpus/indice/`.

    `solo` reindexa nada mas que esos ids (RF8.1), conservando el resto del indice: un informe
    al que le corrigieron los metadatos no obliga a releer los otros 1.999.
    """
    registro, avisos = verificar_o_cortar(raiz)
    if avisar:
        for a in avisos:
            avisar(a)

    anterior = leer_indice(raiz) or {"documentos": {}, "fragmentos": []}
    porId = {}
    for frag in anterior.get("fragmentos", []):
        porId.setdefault(frag["documento"], []).append(frag)
    docs = dict(anterior.get("documentos", {}))

    estado = []
    for crudo in registro["documentos"]:
        did = crudo["id"]
        doc = resuelto(registro, crudo)
        if solo and did not in solo:
            continue

        motivo = motivo_de_rechazo(doc, registro)
        if motivo:
            estado.append((did, "rechazado", motivo))
            porId.pop(did, None)
            docs.pop(did, None)
            continue

        texto = leer_texto(raiz, did)
        if texto is None:
            estado.append((did, "sin-texto",
                           "falta %s. El documento esta declarado pero su texto no se "
                           "extrajo todavia." % os.path.join(TEXTOS, "%s.txt" % did)))
            porId.pop(did, None)
            docs.pop(did, None)
            continue

        fragmentos = fragmentar(texto)
        porId[did] = [{
            "documento": did,
            "n": f["n"],
            "desde": f["desde"],
            "hasta": f["hasta"],
            "pagina": f["pagina"],
            "texto": f["texto"],
            "palabras": normalizar(f["texto"]),
        } for f in fragmentos]
        docs[did] = {
            "titulo": doc.get("titulo"),
            "organismo": doc.get("organismo"),
            "tipo_institucion": doc.get("tipo_institucion"),
            "fecha_publicacion": _texto(doc.get("fecha_publicacion")),
            "periodo_referencia": {k: _texto(v) for k, v in
                                   (doc.get("periodo_referencia") or {}).items()}
            if isinstance(doc.get("periodo_referencia"), dict)
            else _texto(doc.get("periodo_referencia")),
            "anios": anios_de_periodo(doc.get("periodo_referencia")),
            "sector": doc.get("sector"),
            "alcance_territorial": doc.get("alcance_territorial"),
            "territorio": doc.get("territorio"),
            "respalda": doc.get("respalda") or [],
            "url": doc.get("url"),
            "archivo": doc.get("archivo"),
            "fragmentos": len(fragmentos),
            # La huella del texto es lo que permite saber si hay que reindexar (RF8.1) sin
            # guardar una fecha, que rompria el determinismo.
            "huella_texto": hashlib.sha256(texto.encode("utf-8")).hexdigest(),
        }
        estado.append((did, "indexado", "%d fragmentos" % len(fragmentos)))

    # Se ordena todo para que el indice salga igual en cada corrida.
    fragmentos = []
    for did in sorted(porId):
        fragmentos.extend(sorted(porId[did], key=lambda f: f["n"]))

    indice = {
        "motor": "lexico",
        "documentos": docs,
        "fragmentos": fragmentos,
        "estadisticas": estadisticas(fragmentos),
    }
    escribir_indice(raiz, indice)
    return indice, estado


def estadisticas(fragmentos):
    """Lo que BM25 necesita saber del conjunto: en cuantos fragmentos sale cada palabra."""
    docs_por_palabra = {}
    largo_total = 0
    for f in fragmentos:
        largo_total += len(f["palabras"])
        for palabra in set(f["palabras"]):
            docs_por_palabra[palabra] = docs_por_palabra.get(palabra, 0) + 1
    return {
        "fragmentos": len(fragmentos),
        "largo_promedio": (largo_total / float(len(fragmentos))) if fragmentos else 0.0,
        "docs_por_palabra": dict(sorted(docs_por_palabra.items())),
    }


def escribir_indice(raiz, indice):
    carpeta = os.path.join(raiz, INDICE)
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta)
    ruta = os.path.join(carpeta, "indice.json")
    with io.open(ruta, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(indice, ensure_ascii=False, sort_keys=True, indent=1))
        f.write("\n")
    return ruta


def leer_indice(raiz="."):
    ruta = os.path.join(raiz, INDICE, "indice.json")
    if not os.path.exists(ruta):
        return None
    with io.open(ruta, encoding="utf-8") as f:
        return json.load(f)


def desactualizados(raiz="."):
    """Los informes cuyo texto cambio despues de indexarse (RF8.1: hay que reindexarlos)."""
    indice = leer_indice(raiz) or {"documentos": {}}
    cambiados = []
    for did, meta in indice["documentos"].items():
        texto = leer_texto(raiz, did)
        if texto is None:
            cambiados.append((did, "ya no esta su texto"))
            continue
        if hashlib.sha256(texto.encode("utf-8")).hexdigest() != meta.get("huella_texto"):
            cambiados.append((did, "el texto cambio"))
    return sorted(cambiados)


# --- RF9: INVENTARIO Y HUECOS ----------------------------------------------------------------

def inventario(raiz=".", organismo=None, tipo_institucion=None, sector=None,
               anio=None, alcance_territorial=None):
    """El inventario de la base, filtrable por lo que pide RF9.

    Devuelve una fila por informe con su estado real: indexado, sin texto todavia, o
    rechazado con el motivo. Que el rechazado APAREZCA es el punto: es la lista de lo que hay
    que completar.
    """
    registro = cargar(raiz)
    indice = leer_indice(raiz) or {"documentos": {}}
    filas = []
    for crudo in registro["documentos"]:
        doc = resuelto(registro, crudo)
        did = crudo["id"]
        anios = anios_de_periodo(doc.get("periodo_referencia"))
        if organismo and organismo.lower() not in _texto(doc.get("organismo")).lower():
            continue
        if tipo_institucion and doc.get("tipo_institucion") != tipo_institucion:
            continue
        if sector and doc.get("sector") != sector:
            continue
        if alcance_territorial and doc.get("alcance_territorial") != alcance_territorial:
            continue
        if anio and int(anio) not in anios:
            continue
        motivo = motivo_de_rechazo(doc, registro)
        if motivo:
            estado, detalle = "rechazado", motivo
        elif did in indice["documentos"]:
            estado = "indexado"
            detalle = "%d fragmentos" % indice["documentos"][did]["fragmentos"]
        else:
            estado, detalle = "sin-texto", "falta extraer el texto del documento"
        filas.append({
            "id": did,
            "titulo": doc.get("titulo"),
            "organismo": doc.get("organismo"),
            "tipo_institucion": doc.get("tipo_institucion"),
            "sector": doc.get("sector"),
            "alcance_territorial": doc.get("alcance_territorial"),
            "anios": anios,
            "respalda": doc.get("respalda") or [],
            "estado": estado,
            "detalle": detalle,
        })
    return sorted(filas, key=lambda f: f["id"])


def huecos(raiz="."):
    """Las combinaciones de sector y anio sin un solo informe INDEXABLE (RF9.1).

    Se cuenta lo indexable y no lo declarado a proposito: un sector-anio que solo tiene
    informes rechazados por metadatos esta igual de vacio para el agente, y esconderlo seria
    decir que hay contexto donde no lo hay.
    """
    registro = cargar(raiz)
    esperada = registro.get("cobertura_esperada") or {}
    desde = esperada.get("desde") or (registro["vocabularios"] or {}).get("periodo_minimo")
    sectores = esperada.get("sectores") or (registro["vocabularios"] or {}).get("sector") or []
    if not desde or not sectores:
        raise ErrorDeCorpus("%s no declara `cobertura_esperada`: sin eso no se puede decir "
                            "que falta (RF9.1)." % REGISTRO)
    hasta = esperada.get("hasta")
    if not hasta:
        # El ultimo anio con algun informe, o el `desde` si no hay ninguno. No se usa el anio
        # del reloj: eso haria que el resultado cambie solo y rompa el determinismo.
        topes = [a for d in registro["documentos"]
                 for a in anios_de_periodo(resuelto(registro, d).get("periodo_referencia"))]
        hasta = max(topes) if topes else desde

    hay = set()
    for crudo in registro["documentos"]:
        doc = resuelto(registro, crudo)
        if motivo_de_rechazo(doc, registro):
            continue
        for a in anios_de_periodo(doc.get("periodo_referencia")):
            hay.add((doc.get("sector"), a))

    faltan = []
    for sector in sectores:
        for anio in range(desde, hasta + 1):
            if (sector, anio) not in hay:
                faltan.append({"sector": sector, "anio": anio})
    return {"desde": desde, "hasta": hasta, "sectores": list(sectores), "huecos": faltan}


# --- RF28: RECUPERACION DE CONTEXTO ---------------------------------------------------------

def _puntaje_lexico(consulta, fragmentos, stats):
    """BM25 sobre los fragmentos ya filtrados. k1 y b son los valores de siempre."""
    k1, b = 1.2, 0.75
    n = max(1, stats.get("fragmentos") or 1)
    promedio = stats.get("largo_promedio") or 1.0
    docs_por_palabra = stats.get("docs_por_palabra") or {}
    terminos = normalizar(consulta) if consulta else []
    puntuados = []
    for f in fragmentos:
        if not terminos:
            puntuados.append((0.0, f))
            continue
        largo = max(1, len(f["palabras"]))
        cuenta = {}
        for p in f["palabras"]:
            cuenta[p] = cuenta.get(p, 0) + 1
        total = 0.0
        for t in terminos:
            tf = cuenta.get(t, 0)
            if not tf:
                continue
            df = docs_por_palabra.get(t, 0) or 1
            idf = math.log(1.0 + (n - df + 0.5) / (df + 0.5))
            total += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * largo / promedio))
        puntuados.append((total, f))
    return puntuados


def cita_de(meta):
    """La cita del fragmento: organismo, titulo y fecha (RF28.3).

    Se compone aca y viaja pegada al fragmento para que el agente no tenga que ir a buscarla
    -y para que no pueda devolver un fragmento sin ella-.
    """
    partes = [p for p in (meta.get("organismo"), meta.get("titulo")) if p]
    fecha = _texto(meta.get("fecha_publicacion"))[:10]
    if fecha:
        partes.append(fecha)
    return " - ".join(partes)


def recuperar(raiz=".", sector=None, periodo=None, territorio=None, consulta=None,
              tope=8, solo_el_periodo=False):
    """La interfaz de recuperacion de contexto de RF28.

    `sector`, `periodo` y `territorio` son los tres ejes que pide el ERS. `consulta` es el
    texto con el que se ordena por relevancia.

    Dos decisiones que son requisitos y no detalles:

    - **El periodo no recorta por defecto** (`solo_el_periodo=False`, RF28.2). Pedir el
      contexto de 2024 trae primero lo de 2024 pero no esconde el historico desde 2016: el
      ERS pide explicitamente que se pueda consultar la serie completa, porque el escenario de
      coyuntura de un anio se entiende contra los anteriores.
    - **Todo fragmento sale con su cita** (RF28.3). No hay forma de pedirlo sin ella.
    """
    indice = leer_indice(raiz)
    if not indice:
        raise ErrorDeCorpus("No hay indice todavia. Hay que correr "
                           "`python -m pipeline.corpus indexar`.")
    docs = indice["documentos"]
    anio = anio_de_periodo(periodo) if periodo is not None else None

    candidatos = []
    for f in indice["fragmentos"]:
        meta = docs.get(f["documento"])
        if not meta:
            continue
        if sector and meta.get("sector") != sector:
            continue
        if territorio:
            t = _texto(meta.get("territorio")).lower()
            alcance = _texto(meta.get("alcance_territorial")).lower()
            # Un informe nacional aplica a cualquier territorio de su sector: el escenario de
            # la campania nacional es contexto valido para un departamento.
            if alcance not in ("nacional", "internacional") and territorio.lower() not in t:
                continue
        if solo_el_periodo and anio and anio not in (meta.get("anios") or []):
            continue
        candidatos.append(f)

    puntuados = _puntaje_lexico(consulta, candidatos, indice.get("estadisticas") or {})

    def orden(par):
        puntaje, f = par
        meta = docs[f["documento"]]
        # Primero la relevancia; con el periodo pedido, lo de ese periodo adelante (RF28.1:
        # lo que se quiere es el escenario del periodo analizado); y al final el id y el
        # numero de fragmento, que es lo que hace el resultado reproducible.
        del_periodo = 1 if (anio and anio in (meta.get("anios") or [])) else 0
        return (-round(puntaje, 6), -del_periodo, f["documento"], f["n"])

    salida = []
    for puntaje, f in sorted(puntuados, key=orden)[:tope]:
        meta = docs[f["documento"]]
        salida.append({
            "documento": f["documento"],
            "titulo": meta.get("titulo"),
            "organismo": meta.get("organismo"),
            "tipo_institucion": meta.get("tipo_institucion"),
            "fecha_publicacion": meta.get("fecha_publicacion"),
            "periodo_referencia": meta.get("periodo_referencia"),
            "sector": meta.get("sector"),
            "alcance_territorial": meta.get("alcance_territorial"),
            "respalda": meta.get("respalda"),
            "url": meta.get("url"),
            "ubicacion": {"fragmento": f["n"], "pagina": f["pagina"],
                          "desde": f["desde"], "hasta": f["hasta"]},
            "texto": f["texto"],
            "cita": cita_de(meta),
            "puntaje": round(puntaje, 6),
            "del_periodo_pedido": bool(anio and anio in (meta.get("anios") or [])),
        })
    return salida


def respaldo_de(raiz=".", variable=None):
    """Los informes que respaldan metodologicamente una variable (RF7.4).

    Es lo que le permite al agente contestar "de donde sale este numero" con un documento de
    un organismo y no con una explicacion propia.
    """
    registro = cargar(raiz)
    salida = []
    for crudo in registro["documentos"]:
        doc = resuelto(registro, crudo)
        if variable and variable not in (doc.get("respalda") or []):
            continue
        if not variable and not (doc.get("respalda") or []):
            continue
        salida.append({"id": crudo["id"], "titulo": doc.get("titulo"),
                       "organismo": doc.get("organismo"), "url": doc.get("url"),
                       "respalda": doc.get("respalda"), "cita": cita_de(doc)})
    return sorted(salida, key=lambda d: d["id"])


# --- RF7.2: CARGA MASIVA ---------------------------------------------------------------------

def cargar_lote(raiz, lote_id, carpeta, avisar=None):
    """Escribe una entrada por archivo de la carpeta, con los metadatos del lote (RF7.2).

    Lo que NO hace es inventar metadatos por archivo: el titulo sale del nombre y el resto lo
    pone el lote. Lo que falte queda faltando, visible en el inventario, para el "refinamiento
    individual posterior" que pide el ERS. Es la unica forma honesta de cargar 2.000 archivos:
    rapido y con la deuda a la vista.
    """
    registro = cargar(raiz)
    if not any(l.get("id") == lote_id for l in registro["lotes"]):
        raise ErrorDeCorpus("El lote `%s` no esta declarado en %s." % (lote_id, REGISTRO))
    if not os.path.isdir(carpeta):
        raise ErrorDeCorpus("No existe la carpeta %s." % carpeta)

    ya = {d.get("archivo") for d in registro["documentos"]}
    nuevos = []
    for nombre in sorted(os.listdir(carpeta)):
        ruta = os.path.join(carpeta, nombre)
        if not os.path.isfile(ruta) or nombre in ya:
            continue
        base = os.path.splitext(nombre)[0]
        did = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
        nuevos.append({
            "id": "%s-%s" % (lote_id, did) if not did.startswith(lote_id) else did,
            "lote": lote_id,
            "titulo": base,
            "archivo": nombre,
            "bytes": os.path.getsize(ruta),
            "md5": _md5(ruta),
        })
        if avisar:
            avisar("%s -> %s" % (nombre, nuevos[-1]["id"]))
    return nuevos


def _md5(ruta):
    h = hashlib.md5()
    with open(ruta, "rb") as f:
        for pedazo in iter(lambda: f.read(1 << 20), b""):
            h.update(pedazo)
    return h.hexdigest()


# --- CLI -------------------------------------------------------------------------------------

def main(argv=None):
    import argparse
    p = argparse.ArgumentParser(
        description="Base de informes de contexto para el agente de IA (RF7 a RF9, RF28).")
    p.add_argument("accion", choices=("estado", "indexar", "reindexar", "inventario",
                                      "huecos", "recuperar", "respaldo", "cargar-lote",
                                      "verificar-no-publicado"))
    p.add_argument("--raiz", default=".")
    p.add_argument("--id", action="append", help="reindexar: que informes")
    p.add_argument("--organismo")
    p.add_argument("--tipo")
    p.add_argument("--sector")
    p.add_argument("--anio", type=int)
    p.add_argument("--alcance")
    p.add_argument("--consulta")
    p.add_argument("--territorio")
    p.add_argument("--variable")
    p.add_argument("--lote")
    p.add_argument("--carpeta")
    p.add_argument("--tope", type=int, default=8)
    p.add_argument("--solo-el-periodo", action="store_true",
                   help="recorta al periodo pedido. Por defecto NO, por RF28.2.")
    args = p.parse_args(argv)

    def decir(t):
        print("[corpus] %s" % t)

    if args.accion == "estado":
        registro = cargar(args.raiz)
        fallos, avisos = verificar(registro, args.raiz)
        print("%d informes declarados, %d lotes" % (len(registro["documentos"]),
                                                    len(registro["lotes"])))
        for f in fallos:
            print("  FALLA  %s" % f)
        for a in avisos:
            print("  aviso  %s" % a)
        indice = leer_indice(args.raiz)
        if indice:
            print("indice: %d fragmentos de %d informes (motor %s)"
                  % (len(indice["fragmentos"]), len(indice["documentos"]), indice["motor"]))
            for did, motivo in desactualizados(args.raiz):
                print("  hay que reindexar %s: %s" % (did, motivo))
        else:
            print("indice: todavia no se armo")
        return 1 if fallos else 0

    if args.accion in ("indexar", "reindexar"):
        solo = set(args.id) if args.accion == "reindexar" and args.id else None
        indice, estado = indexar(args.raiz, solo=solo, avisar=decir)
        for did, como, detalle in estado:
            print("  %-10s %-26s %s" % (como, did, detalle))
        print("indice: %d fragmentos de %d informes"
              % (len(indice["fragmentos"]), len(indice["documentos"])))
        return 0

    if args.accion == "inventario":
        filas = inventario(args.raiz, organismo=args.organismo,
                           tipo_institucion=args.tipo, sector=args.sector,
                           anio=args.anio, alcance_territorial=args.alcance)
        print("%d informes" % len(filas))
        for f in filas:
            print("  %-26s %-11s %-14s %-12s %s" % (
                f["id"], f["estado"], f["sector"] or "-",
                ",".join(str(a) for a in f["anios"]) or "-", f["titulo"] or ""))
            if f["estado"] == "rechazado":
                print("      %s" % f["detalle"])
        return 0

    if args.accion == "huecos":
        h = huecos(args.raiz)
        print("cobertura esperada %d-%d en %d sectores"
              % (h["desde"], h["hasta"], len(h["sectores"])))
        if not h["huecos"]:
            print("  no hay huecos")
        porSector = {}
        for x in h["huecos"]:
            porSector.setdefault(x["sector"], []).append(x["anio"])
        for sector in sorted(porSector):
            anios = porSector[sector]
            print("  %-14s sin informes en %d anios: %s"
                  % (sector, len(anios), ", ".join(str(a) for a in anios)))
        return 0

    if args.accion == "recuperar":
        hallados = recuperar(args.raiz, sector=args.sector, periodo=args.anio,
                             territorio=args.territorio, consulta=args.consulta,
                             tope=args.tope, solo_el_periodo=args.solo_el_periodo)
        print("%d fragmentos" % len(hallados))
        for h in hallados:
            donde = "frag %d" % h["ubicacion"]["fragmento"]
            if h["ubicacion"]["pagina"]:
                donde += ", pag %d" % h["ubicacion"]["pagina"]
            print("")
            print("  [%.3f] %s (%s)" % (h["puntaje"], h["cita"], donde))
            print("    %s" % h["texto"][:300])
        return 0

    if args.accion == "respaldo":
        for d in respaldo_de(args.raiz, args.variable):
            print("  %-26s %s" % (",".join(d["respalda"]), d["cita"]))
        return 0

    if args.accion == "cargar-lote":
        if not args.lote or not args.carpeta:
            p.error("cargar-lote necesita --lote y --carpeta")
        nuevos = cargar_lote(args.raiz, args.lote, args.carpeta, avisar=decir)
        print("")
        print("# Pegar en `documentos:` de %s" % REGISTRO)
        print(yaml.safe_dump(nuevos, allow_unicode=True, sort_keys=False,
                             default_flow_style=False))
        return 0

    if args.accion == "verificar-no-publicado":
        verificar_no_publicado(args.raiz)
        print("nada del corpus esta en lo que se publica (RF29, RF30)")
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
