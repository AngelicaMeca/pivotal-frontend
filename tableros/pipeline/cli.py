"""CLI del pipeline Pivotal.

Etapas: ingest -> staging -> marts -> check -> site.
Los agentes del repo implementan cada modulo (ver .claude/agents/ y CLAUDE.md).
Este archivo define el contrato de la linea de comandos; los modulos que no
existen todavia fallan con un mensaje que dice que agente los construye.
"""
import argparse
import importlib
import sys

ETAPAS = {
    "indice": ("pipeline.indice", "indexador-contexto"),
    "ingest": ("pipeline.ingest", "ingestor-bases"),
    "marts": ("pipeline.marts", "ingestor-bases"),
    "check": ("pipeline.validations", "qa-datos"),
    "site": ("pipeline.site_build", "constructor-dashboards"),
}


def correr(etapa: str, args: list[str]) -> None:
    modulo, agente = ETAPAS[etapa]
    try:
        mod = importlib.import_module(modulo)
    except ModuleNotFoundError:
        sys.exit(
            f"[pivotal] El modulo {modulo} no existe todavia. "
            f"Lo construye el agente '{agente}' (ver .claude/agents/{agente}.md)."
        )
    mod.main(args)


def main() -> None:
    parser = argparse.ArgumentParser(prog="pivotal")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="staging + marts + check + site")
    sub.add_parser("indice", help="releer el indice de JC y regenerar el manifiesto")
    p_ing = sub.add_parser("ingest", help="procesar una entrega de raw/")
    p_ing.add_argument("entrega", help="ej. entrega-01")
    sub.add_parser("check", help="solo validaciones")
    sub.add_parser("site", help="solo regenerar sitio")
    ns, resto = parser.parse_known_args()

    if ns.cmd == "build":
        for etapa in ("ingest", "marts", "check", "site"):
            correr(etapa, ["--todas"] if etapa == "ingest" else [])
    elif ns.cmd == "ingest":
        correr("ingest", [ns.entrega, *resto])
    else:
        correr(ns.cmd, resto)


if __name__ == "__main__":
    main()
