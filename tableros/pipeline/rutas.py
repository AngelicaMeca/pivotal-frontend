"""Donde estan los Excels crudos (lo que CLAUDE.md llama raw/).

Los Excels viven en una carpeta de OneDrive sincronizada, no en el repo. Cada maquina dice
donde tiene esa carpeta, en este orden:

  1. la variable de entorno PIVOTAL_RAW;
  2. el archivo tableros/raw.local.txt (gitignoreado), con la ruta en la primera linea;
  3. si no hay ninguna de las dos, tableros/raw/ (la ubicacion de siempre).

La carpeta tiene la forma de siempre: entrega-NN/ con los Excels de cada entrega e indice/ con
las versiones del indice de JC. Sigue siendo de SOLO LECTURA: el pipeline nunca escribe
adentro, y lo que llego queda registrado (nombre, tamaño y sha256) en configs/entregas/.
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCHIVO_LOCAL = os.path.join(RAIZ, "raw.local.txt")


def _configurada():
    ruta = os.environ.get("PIVOTAL_RAW", "").strip()
    if ruta:
        return ruta, "la variable PIVOTAL_RAW"
    if os.path.exists(ARCHIVO_LOCAL):
        with open(ARCHIVO_LOCAL, encoding="utf-8") as f:
            ruta = f.readline().strip().strip('"')
        if ruta:
            return ruta, "tableros/raw.local.txt"
    return None, None


def _resolver():
    ruta, origen = _configurada()
    if ruta is None:
        return os.path.join(RAIZ, "raw")
    ruta = os.path.expandvars(os.path.expanduser(ruta))
    if not os.path.isdir(ruta):
        sys.exit(
            "[pivotal] La carpeta de Excels que indica %s no existe: %s\n"
            "          Revisá que OneDrive esté sincronizado en esta máquina y que la ruta "
            "sea la correcta." % (origen, ruta))
    return ruta


DIR_RAW = _resolver()
DIR_INDICE = os.path.join(DIR_RAW, "indice")
