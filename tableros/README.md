# Pivotal · tableros

Plataforma de inteligencia de datos agro/económicos de Santiago del Estero (beta). De los Excels de Juan Carlos a los tableros en Vercel.

Esta carpeta vive dentro del repo del sitio institucional (`pivotal-landing-front`): los tableros se publican con el sitio, bajo `/plataforma`. La historia anterior a septiembre de 2026 está en `franb89/pivotal`.

## Cómo trabajamos

**Acá no se programa a mano: se opera con agentes de Claude Code.** El código lo escriben los agentes del repo siguiendo `CLAUDE.md`. Vos (Facu/Fran) hacés tres cosas: traés los inputs, invocás al agente correcto, y validás el resultado.

### Setup (una sola vez)

```bash
git clone <repo del sitio> && cd pivotal-landing-front
npm ci               # el sitio (Next.js); necesita Node 20 o más
cd tableros
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
claude   # Claude Code, que lee CLAUDE.md solo
```

### Los 3 flujos de trabajo

**1. Llegó una entrega de bases (Excels de JC):**
```
cp <archivos> raw/entrega-NN/
claude> usa el agente ingestor-bases para procesar raw/entrega-NN
claude> usa el agente qa-datos para validar la entrega NN
# leer validations/reportes/entrega-NN.md → pegar preguntas a JC en WhatsApp
claude> usa el agente constructor-dashboards para actualizar el sitio
```

**2. Llegó un "Bases para Beta - N.xlsx" nuevo (índice de JC):**
```
cp <archivo> raw/indice/
claude> usa el agente indexador-contexto con el índice nuevo
```

**3. Nueva regla de negocio o pregunta para el dashboard** (mensaje de JC, hoja "Modelo Análisis", idea de Fran):
```
# anotarla en specs/preguntas/backlog.md (una línea alcanza)
claude> usa el agente constructor-reglas con la pregunta X
claude> usa el agente constructor-dashboards
```

### Ramas y deploy

- Trabajamos SIEMPRE en `dev`. Commits chicos, en español.
- `main` es lo que ve JC: auto-deploya a Vercel el sitio entero, tableros incluidos.
- Para pasar a `main`: `make build` y `make web` verdes + reporte de anomalías de la entrega generado + ok de Fran o Facu. Merge sin rebase creativo: `git checkout main && git merge dev && git push`.
- Después del deploy, link al grupo de WhatsApp "Pivotal".

### Comandos

```bash
make build      # pipeline completo: staging + marts + validaciones + sitio
make site       # solo regenerar el contenido de los tableros
make check      # validaciones solamente
make web        # build y lint del sitio completo
make dev        # el sitio en modo desarrollo en :3000 (tableros en /plataforma/tableros)
make serve      # compilar y servir el sitio en :3000
```

## Estructura

Ver `CLAUDE.md` (la referencia completa) y `docs/arquitectura.md`. Resumen: `raw/` (Excels inmutables) → `configs/` + `pipeline/adapters/` → `staging/` → `marts/` → `specs/` (reglas de negocio) → el sitio (`../src/tableros`, `../public/plataforma`).

## Reglas de oro

1. `raw/` nunca se edita. Jamás.
2. Ninguna anomalía de datos se arregla en silencio: todo pasa por el reporte a JC.
3. Si se puede resolver editando un YAML, no se toca código.
4. Lo que `make site` genera en el sitio se commitea (Vercel compila el sitio pero no corre Python).
5. Es "Pivotal", no "El Pivotal".
