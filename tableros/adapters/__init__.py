"""Adapters por FAMILIA de schema (no por base).

Cada familia expone `parse(config, path, entrega) -> polars.DataFrame` en formato tidy
largo, con las columnas canonicas del pipeline. Todo lo especifico de una base vive en
su YAML de configs/bases/, nunca aca.

Familias previstas (CLAUDE.md): tidy, dtv, dte, wide-mes, cuadro-indec, registro,
clima-diario, clima-normal. Implementadas hasta ahora: tidy.
"""
