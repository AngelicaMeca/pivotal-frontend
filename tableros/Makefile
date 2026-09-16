.PHONY: build ingest check site web dev serve clean

PY := .venv/bin/python
ENTREGA ?=

build:            ## pipeline completo: staging + marts + validaciones + sitio
	$(PY) -m pipeline.cli build

ingest:           ## procesar una entrega: make ingest ENTREGA=entrega-01
	$(PY) -m pipeline.cli ingest $(ENTREGA)

check:            ## solo validaciones
	$(PY) -m pipeline.cli check

site:             ## solo regenerar el contenido de los tableros (../src/tableros, ../public/plataforma)
	$(PY) -m pipeline.cli site

# Los tableros son parte del sitio institucional: estos comandos corren en la raiz del repo.
web:              ## compilar y revisar el sitio completo (lo mismo que hace Vercel, mas el lint)
	cd .. && npm run build && npm run lint

dev:              ## el sitio en modo desarrollo en :3000 (tableros en /plataforma/tableros)
	cd .. && npm run dev

serve: web        ## servir el sitio compilado en :3000
	cd .. && npm run start

clean:            ## borrar derivados regenerables
	rm -rf staging/* marts/*
