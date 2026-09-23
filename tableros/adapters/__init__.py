"""Adapters por FAMILIA de schema (no por base).

Cada familia expone `parse(config, path, entrega) -> polars.DataFrame` en formato tidy
largo, con las columnas canonicas del pipeline. Todo lo especifico de una base vive en
su YAML de configs/bases/, nunca aca.

Familias previstas (CLAUDE.md): tidy, dtv, dte, wide-mes, cuadro-indec, registro,
clima-diario, clima-normal, stock, mas `precios`, que aparecio al ingerir la base 8 y
todavia no esta en la lista de CLAUDE.md. Implementadas hasta ahora: tidy, dte, dtv,
stock, precios.

Ojo con `precios`: es la unica familia cuya medida NO SE SUMA (un precio se promedia).
Sus filas llevan `agregable=false`, `agregacion` y `ponderacion`; leer el encabezado de
adapters/precios.py antes de escribir cualquier vista que la use.
"""
