# -*- coding: utf-8 -*-
"""Vigencia de las fuentes geoespaciales (ERS de Mapas, RF23 y RF23.1).

RF23 pide verificar periodicamente que sigan en pie las URL de los visores que se enlazan y los
servicios OGC de los que se bajan las capas. RF23.1 pide que una fuente que no responde quede en
estado "caida" y que eso se le avise al visitante.

Dos reglas que mandan sobre el diseno de esto:

1. **Esto NO corre en la publicacion horaria.** La regla de la casa es que el sitio no le pide
   nada a un servidor de terceros: las capas estan commiteadas justamente porque el IGN se cae
   seguido. Un chequeo adentro del build convertiria la caida del IGN en una publicacion
   fallida, que es lo contrario de lo que se quiso. Se corre a mano o por tarea programada, y
   escribe un archivo que SI se commitea.

2. **El chequeo no le cambia el estado al catalogo.** `configs/fuentes-geoespaciales.yaml` lo
   escriben personas; aca se escribe lo OBSERVADO, aparte. Si lo observado y lo declarado no
   coinciden, se avisa y decide una persona. Un servidor que tarda 30 segundos una tarde no
   tiene que reescribir el catalogo solo.

Un servicio OGC no se da por vivo porque el host conteste: se le pide el GetCapabilities y se
controla que la capa SIGA ANUNCIADA con su nombre. Un geoserver que levanta pero ya no publica
`ign:vial_terciaria` esta tan roto como uno apagado, y el modo en que se rompe es justamente
ese: le cambian el nombre a la capa.

    python -m pipeline.vigencia_geo              # verifica todo y escribe el resultado
    python -m pipeline.vigencia_geo --solo ign   # solo las fuentes cuyo id contenga eso
    python -m pipeline.vigencia_geo --estado     # imprime el ultimo resultado, sin pedir nada
"""

import io
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request

import yaml

from pipeline import fuentes_geo as fg

RESULTADO = os.path.join("configs", "dims", "vigencia-fuentes-geo.yaml")
ESPERA = 25
# Un cliente generico. NO va ni el nombre del proyecto ni ningun dato de la usuaria: son
# servidores de terceros y no tienen por que saber quien los consulta.
AGENTE = "Mozilla/5.0 (compatible; verificador-de-enlaces/1.0)"

# Lo que puede decir un chequeo. `ok` y `cambio` no frenan nada; `caida` es la de RF23.1.
VEREDICTOS = ("ok", "cambio", "caida", "sin-verificar")


class ErrorDeVigencia(Exception):
    pass


def _pedir(url, metodo="GET", limite=400000):
    """(codigo, cuerpo, motivo). El cuerpo viene recortado: solo se lee para buscar la capa."""
    pedido = urllib.request.Request(url, method=metodo, headers={
        "User-Agent": AGENTE,
        "Accept": "*/*",
    })
    try:
        with urllib.request.urlopen(pedido, timeout=ESPERA) as r:
            return r.getcode(), r.read(limite), None
    except urllib.error.HTTPError as e:
        # Un 405 a un HEAD no es una caida: hay servidores que no lo aceptan.
        return e.code, b"", "HTTP %s %s" % (e.code, e.reason)
    except urllib.error.URLError as e:
        return None, b"", "no responde: %s" % (e.reason,)
    except (socket.timeout, TimeoutError):
        return None, b"", "no contesto en %d segundos" % ESPERA
    except ssl.SSLError as e:
        return None, b"", "error de TLS: %s" % e
    except Exception as e:                                   # noqa: BLE001
        return None, b"", "%s: %s" % (type(e).__name__, e)


def verificar_ogc(decl):
    """GetCapabilities y la capa todavia anunciada. Devuelve (veredicto, detalle)."""
    endpoint = decl["endpoint"]
    capa = decl["capa"]
    sep = "&" if "?" in endpoint else "?"
    url = ("%s%sservice=WFS&version=1.1.0&request=GetCapabilities" % (endpoint, sep))
    codigo, cuerpo, motivo = _pedir(url)
    if codigo is None or codigo >= 400:
        return "caida", motivo or ("HTTP %s" % codigo)
    nombre = ("<Name>%s</Name>" % capa).encode("utf-8")
    if nombre in cuerpo:
        return "ok", "GetCapabilities HTTP %d y la capa sigue anunciada" % codigo
    if b"<Name>" not in cuerpo:
        return "cambio", ("HTTP %d pero la respuesta no parece un GetCapabilities (no trae ni "
                          "un <Name>); puede ser una pagina de error" % codigo)
    return "cambio", ("HTTP %d pero %s YA NO esta anunciada en el GetCapabilities: puede que le "
                      "hayan cambiado el nombre" % (codigo, capa))


def verificar_url(url):
    """Que la URL conteste. Devuelve (veredicto, detalle)."""
    # Primero HEAD, que no baja el cuerpo; si el servidor no lo acepta, GET.
    codigo, _cuerpo, motivo = _pedir(url, "HEAD", limite=1)
    if codigo in (405, 403, 501) or codigo is None:
        codigo, _cuerpo, motivo = _pedir(url, "GET", limite=2000)
    if codigo is None:
        return "caida", motivo
    if codigo >= 500:
        return "caida", "HTTP %d (error del servidor)" % codigo
    if codigo == 404 or codigo == 410:
        return "caida", "HTTP %d: la direccion ya no existe" % codigo
    if codigo >= 400:
        # Un 401/403 no es una caida: el recurso esta, pide credenciales o bloquea al robot.
        return "cambio", "HTTP %d: contesta pero no deja ver (puede bloquear automatas)" % codigo
    return "ok", "HTTP %d" % codigo


def que_verificar(fuente):
    """Que hay que probarle a esta fuente, o None si no hay nada que probar."""
    decl = fuente.get("verificacion")
    if decl is not None and decl.get("tipo") == "no-verificable":
        return None
    if decl and decl.get("tipo") == "ogc":
        faltan = [c for c in ("endpoint", "capa") if not decl.get(c)]
        if faltan:
            raise ErrorDeVigencia(
                "%s: `verificacion.tipo: ogc` sin %s. Un servicio OGC se verifica pidiendole el "
                "GetCapabilities y mirando que la capa siga anunciada, asi que hacen falta el "
                "endpoint y el nombre de la capa." % (fuente["id"], " ni ".join(faltan)))
        return ("ogc", decl)
    if fuente.get("url"):
        return ("url", fuente["url"])
    return None


def verificar_todo(solo=None, avisar=None):
    catalogo = fg.cargar()
    filas = []
    for fuente in catalogo["fuentes"]:
        fid = fuente["id"]
        if solo and solo not in fid:
            continue
        tarea = que_verificar(fuente)
        if tarea is None:
            filas.append({"id": fid, "veredicto": "sin-verificar",
                          "detalle": "la fuente no declara nada verificable"})
            continue
        tipo, dato = tarea
        if tipo == "ogc":
            veredicto, detalle = verificar_ogc(dato)
            probado = "%s (capa %s)" % (dato["endpoint"], dato["capa"])
        else:
            veredicto, detalle = verificar_url(dato)
            probado = dato
        filas.append({"id": fid, "veredicto": veredicto, "detalle": detalle,
                      "probado": probado, "estado_en_el_catalogo": fuente["estado"]})
        if avisar:
            avisar("%-30s %-6s %s" % (fid, veredicto, detalle))
    return catalogo, filas


def escribir(filas, raiz=fg.RAIZ, avisar=None):
    """Guarda el resultado, CONSERVANDO lo que esta corrida no verifico.

    Una corrida con `--solo` chequea unas pocas fuentes, y pisar el archivo con esas pocas
    borraria el estado de las otras 27: el dia que se mire el archivo pareceria que nunca se
    verificaron. Lo que no se toco esta vez queda con su resultado anterior y su fecha.
    """
    import datetime

    anterior = (leer(raiz) or {}).get("fuentes") or {}
    hoy = datetime.date.today().isoformat()
    for f in filas:
        f["verificado"] = hoy
    ahora = {f["id"] for f in filas}
    for fid, previo in anterior.items():
        if fid not in ahora:
            fila = dict(previo)
            fila["id"] = fid
            filas.append(fila)
    filas.sort(key=lambda f: f["id"])

    por_veredicto = {v: [f["id"] for f in filas if f["veredicto"] == v] for v in VEREDICTOS}
    # RF23.1: lo que el sitio tiene que poder señalar.
    caidas = por_veredicto["caida"]
    doc = {
        "generado_por": "python -m pipeline.vigencia_geo",
        # Cada fuente lleva SU fecha de chequeo: con `--solo` no se verifican todas el mismo dia.
        "fecha": hoy,
        "verificadas": len(filas),
        "verificadas_en_esta_corrida": len(ahora),
        "resumen": {v: len(ids) for v, ids in por_veredicto.items()},
        "caidas": caidas,
        "con_cambios": por_veredicto["cambio"],
        "fuentes": {f["id"]: {k: v for k, v in f.items() if k != "id"} for f in filas},
    }
    ruta = os.path.join(raiz, RESULTADO)
    with io.open(ruta, "w", encoding="utf-8", newline="") as f:
        f.write(u"# Generado por `python -m pipeline.vigencia_geo`. No editar a mano.\n")
        f.write(u"# RF23: ultimo chequeo de que las URL y los servicios OGC siguen en pie.\n")
        f.write(u"# RF23.1: `caidas` es lo que el sitio marca como no disponible.\n")
        f.write(u"#\n")
        f.write(u"# Esto NO lo lee la publicacion horaria para decidir si publica: las capas\n")
        f.write(u"# estan commiteadas y el sitio no depende de ningun servidor de terceros.\n")
        f.write(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False,
                               default_flow_style=False))
    if avisar:
        avisar("escrito %s" % RESULTADO)
    return doc


def leer(raiz=fg.RAIZ):
    """El ultimo chequeo. Es lo que lee el build para marcar una fuente caida (RF23.1)."""
    ruta = os.path.join(raiz, RESULTADO)
    if not os.path.exists(ruta):
        return {}
    with io.open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def fuentes_caidas(raiz=fg.RAIZ):
    """Los ids que el ultimo chequeo encontro caidos. Vacio si no hay chequeo."""
    return set((leer(raiz) or {}).get("caidas") or [])


def desacuerdos(catalogo, filas):
    """Donde lo observado no coincide con lo declarado. Decide una persona, no el script."""
    declarado = {f["id"]: f["estado"] for f in catalogo["fuentes"]}
    fuera = []
    for f in filas:
        est = declarado.get(f["id"])
        if f["veredicto"] == "caida" and est != "caida":
            fuera.append("%s: no responde y en el catalogo esta como %r. Si se confirma, hay "
                         "que ponerle `estado: caida` y sacarla de donde se publique."
                         % (f["id"], est))
        if f["veredicto"] == "ok" and est == "caida":
            fuera.append("%s: volvio a responder y en el catalogo sigue como `caida`."
                         % f["id"])
    return fuera


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(
        description="Vigencia de las fuentes geoespaciales (RF23).")
    ap.add_argument("--solo", default=None, help="solo las fuentes cuyo id contenga esto")
    ap.add_argument("--estado", action="store_true",
                    help="imprime el ultimo resultado sin pedirle nada a nadie")
    args = ap.parse_args(argv)

    def avisar(t):
        print("[vigencia] %s" % t)

    if args.estado:
        doc = leer()
        if not doc:
            print("No hay ningun chequeo todavia. Corra `python -m pipeline.vigencia_geo`.")
            return 0
        print("Ultimo chequeo: %s  (%d fuentes)" % (doc["fecha"], doc["verificadas"]))
        for v, n in doc["resumen"].items():
            print("  %-14s %d" % (v, n))
        for fid in doc.get("caidas") or []:
            print("  CAIDA: %s - %s" % (fid, doc["fuentes"][fid]["detalle"]))
        return 0

    try:
        catalogo, filas = verificar_todo(args.solo, avisar)
    except ErrorDeVigencia as e:
        sys.exit("[vigencia] %s" % e)
    doc = escribir(filas, avisar=avisar)

    print("")
    print("RESUMEN: " + ", ".join("%s %d" % (v, n) for v, n in doc["resumen"].items() if n))
    for linea in desacuerdos(catalogo, filas):
        print("  REVISAR: %s" % linea)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
