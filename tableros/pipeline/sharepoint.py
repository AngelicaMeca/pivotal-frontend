"""Los Excels de SharePoint (OneDrive de AUTOScraping): bajarlos y saber si cambiaron.

Dos usos:

    # En la compilacion de Vercel (scripts/tableros.mjs): baja todo con la forma de raw/
    # (entrega-NN/, indice/) y escribe la huella de lo que bajo.
    python -m pipeline.sharepoint --destino <carpeta> --huella <archivo.json>

    # En la tarea de GitHub (.github/workflows/tableros-datos.yml): compara SharePoint con la
    # huella que publico el sitio. No baja nada. Deja `cambios=true|false` para GitHub Actions.
    python -m pipeline.sharepoint --comparar-con https://<sitio>/plataforma/estado-origen.json

La HUELLA es la lista de Excels con nombre, tamaño y hash, por carpeta. Si SharePoint coincide
con la huella publicada, los tableros ya muestran esos Excels.

Credenciales, por variables de entorno (secretos en Vercel y en GitHub):
    MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
Que Excels bajar: configs/origen-sharepoint.yaml. Ver docs/actualizacion-automatica.md.

raw/ sigue siendo de solo lectura: este archivo no escribe NADA en SharePoint.
Sin dependencias nuevas: urllib de la biblioteca estandar.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_ORIGEN = os.path.join(RAIZ, "configs", "origen-sharepoint.yaml")
# Las direcciones de Microsoft se pueden cambiar por variables solo para probar contra una
# simulacion local; en uso normal no se definen.
GRAPH = os.environ.get("PIVOTAL_GRAPH_URL", "https://graph.microsoft.com/v1.0")
LOGIN = os.environ.get("PIVOTAL_LOGIN_URL", "https://login.microsoftonline.com")
EXTENSIONES = (".xlsx", ".xls", ".csv")


def falla(mensaje):
    sys.exit("[sharepoint] " + mensaje)


# ------------------------------------------------------------------ http

def pedir(url, token=None, datos=None, intentos=4):
    """GET (o POST con `datos`) que devuelve bytes, con reintentos ante limites de Graph."""
    cuerpo = urllib.parse.urlencode(datos).encode() if datos is not None else None
    for intento in range(intentos):
        pedido = urllib.request.Request(url, data=cuerpo)
        if token:
            pedido.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(pedido, timeout=120) as respuesta:
                return respuesta.read()
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503, 504) and intento < intentos - 1:
                espera = int(error.headers.get("Retry-After") or 2 ** (intento + 1))
                time.sleep(min(espera, 60))
                continue
            detalle = error.read().decode("utf-8", "replace")[:500]
            falla("%s respondio %s\n%s" % (url.split("?")[0], error.code, detalle))
    return None


def pedir_json(url, token):
    return json.loads(pedir(url, token))


def obtener_token():
    faltan = [v for v in ("MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET")
              if not os.environ.get(v)]
    if faltan:
        falla("Faltan las credenciales %s (ver docs/actualizacion-automatica.md)"
              % ", ".join(faltan))
    url = "%s/%s/oauth2/v2.0/token" % (LOGIN, urllib.parse.quote(os.environ["MS_TENANT_ID"]))
    respuesta = json.loads(pedir(url, datos={
        "client_id": os.environ["MS_CLIENT_ID"],
        "client_secret": os.environ["MS_CLIENT_SECRET"],
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }))
    return respuesta["access_token"]


# ------------------------------------------------------------------ listado

def ruta_graph(ruta):
    return "/".join(urllib.parse.quote(parte) for parte in ruta.split("/"))


def id_del_drive(token, sitio):
    # sitio = "<host>:/personal/<usuario>"
    host, _, camino = sitio.partition(":")
    datos = pedir_json("%s/sites/%s:%s?$select=id" % (GRAPH, host, ruta_graph(camino)), token)
    return pedir_json("%s/sites/%s/drive?$select=id" % (GRAPH, datos["id"]), token)["id"]


def hijos(token, drive, carpeta):
    url = "%s/drives/%s/root:/%s:/children?$top=200" % (GRAPH, drive, ruta_graph(carpeta))
    items = []
    while url:
        pagina = pedir_json(url, token)
        items.extend(pagina.get("value", []))
        url = pagina.get("@odata.nextLink")
    return items


def listar_excels(token, drive, carpeta):
    """[item] de los Excels de una carpeta (sin subcarpetas), ordenados por nombre."""
    excels = [i for i in hijos(token, drive, carpeta)
              if "file" in i and i["name"].lower().endswith(EXTENSIONES)
              and not i["name"].startswith(("~$", "."))]
    return sorted(excels, key=lambda i: i["name"])


def huella_de(item):
    hashes = (item.get("file") or {}).get("hashes") or {}
    return {"archivo": item["name"], "bytes": item["size"],
            "hash": hashes.get("quickXorHash") or hashes.get("sha256Hash") or item.get("eTag")}


def relevar():
    """(token, drive, {carpeta_pipeline: (ruta_sharepoint, [items])}) segun el origen."""
    with open(RUTA_ORIGEN, encoding="utf-8") as f:
        origen = yaml.safe_load(f)
    token = obtener_token()
    drive = id_del_drive(token, origen["sitio"])
    base = origen["carpeta"].strip("/")

    # entrega-NN -> carpeta: las declaradas + las que ya se llamen entrega-NN
    carpetas = dict(origen.get("entregas") or {})
    for item in hijos(token, drive, base):
        nombre = item["name"]
        if "folder" in item and nombre.startswith("entrega-") and nombre not in carpetas:
            carpetas[nombre] = nombre
    rutas = {entrega: "%s/%s" % (base, carpeta) for entrega, carpeta in carpetas.items()}
    if origen.get("indice"):
        rutas["indice"] = "%s/%s" % (base, origen["indice"])

    relevamiento = {}
    for nombre, ruta in sorted(rutas.items()):
        items = listar_excels(token, drive, ruta)
        if not items:
            falla("La carpeta %r (%s) no tiene Excels." % (ruta, nombre))
        relevamiento[nombre] = (ruta, items)
    return token, drive, relevamiento


def huella(relevamiento):
    return {nombre: [huella_de(i) for i in items]
            for nombre, (_, items) in relevamiento.items()}


# ------------------------------------------------------------------ usos

def bajar(destino, ruta_huella):
    token, drive, relevamiento = relevar()
    for nombre, (ruta, items) in relevamiento.items():
        carpeta = os.path.join(destino, nombre)
        os.makedirs(carpeta, exist_ok=True)
        for item in items:
            url = item.get("@microsoft.graph.downloadUrl")
            contenido = (pedir(url) if url else
                         pedir("%s/drives/%s/items/%s/content" % (GRAPH, drive, item["id"]), token))
            with open(os.path.join(carpeta, item["name"]), "wb") as f:
                f.write(contenido)
        print("[sharepoint] %s: %d archivos desde %s" % (nombre, len(items), ruta))
    if ruta_huella:
        os.makedirs(os.path.dirname(os.path.abspath(ruta_huella)), exist_ok=True)
        with open(ruta_huella, "w", encoding="utf-8") as f:
            json.dump({"carpetas": huella(relevamiento)}, f, ensure_ascii=False, sort_keys=True,
                      indent=1)
            f.write("\n")


def comparar(url_publicada):
    _, _, relevamiento = relevar()
    actual = huella(relevamiento)
    try:
        publicada = json.loads(pedir(url_publicada)).get("carpetas")
    except SystemExit:
        publicada = None   # el sitio todavia no publico ninguna huella
    cambios = publicada != actual
    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as f:
            f.write("cambios=%s\n" % ("true" if cambios else "false"))
    print("[sharepoint] %s" % ("hay Excels nuevos o cambiados: hay que volver a publicar"
                               if cambios else "los tableros publicados ya usan estos Excels"))
    return cambios


def main(args=None):
    parser = argparse.ArgumentParser(prog="pipeline.sharepoint")
    parser.add_argument("--destino", help="bajar los Excels a esta carpeta, con la forma de raw/")
    parser.add_argument("--huella", help="con --destino: donde escribir la huella (JSON)")
    parser.add_argument("--comparar-con", metavar="URL",
                        help="comparar SharePoint con la huella publicada en esta URL")
    ns = parser.parse_args(args)
    if bool(ns.destino) == bool(ns.comparar_con):
        parser.error("usar --destino o --comparar-con (uno de los dos)")
    if ns.destino:
        bajar(ns.destino, ns.huella)
    else:
        comparar(ns.comparar_con)


if __name__ == "__main__":
    main(sys.argv[1:])
