# -*- coding: utf-8 -*-
"""Valida el catalogo de fuentes geoespaciales y publica su estado de avance.

Es la implementacion de los RF1 a RF15 y RF22 a RF23 del ERS "Mapas y Contexto IA" v1.1
(11-nov-2026) en la forma que el propio ERS prescribe en su seccion 5.1:

    "Los RF1 a RF15 estan redactados como altas, bajas, modificaciones, cambios de estado y
    asignacion de responsables. La plataforma actual no tiene servidor de aplicacion,
    autenticacion ni base transaccional: es un pipeline de especificaciones YAML versionadas
    sobre DuckDB que genera un sitio estatico. En consecuencia, se implementan como registro
    declarativo versionado... Los bloqueos de publicacion de los RF6, RF15.1, RF15.2 y RF17.3
    se implementan como validaciones del pipeline que interrumpen la construccion del sitio, no
    como controles de interfaz."

Asi que esto NO es una aplicacion de administracion: es un lector de
`configs/fuentes-geoespaciales.yaml` que corta `make build` cuando el catalogo no cierra.

QUE CORTA LA CORRIDA, y por que requisito:

  Vocabulario (RF1, RF11.1, RF13, RF14, RF15)
    - un `estado`, `tipo_contenido`, `alcance`, `modo_acceso`, `modo_visualizacion.resuelto`,
      `indicaciones` o `publicado_como` que no este en la lista del ERS
    - un id repetido

  Campos obligatorios por estado
    - toda fuente: id, nombre, organismo, url, tipo_contenido, alcance, estado, responsable,
      fecha_estado                                                                      (RF1)
    - `descartada` y `caida`: `motivo`                                            (RF3, RF23.1)
    - de `aprobada` en adelante: `modo_acceso`, `modo_visualizacion` con su `criterio`,
      y `licencia`                                                      (RF13, RF14, RF15, RF5)
    - `a-evaluar` y `en-evaluacion` con una indicacion de evaluar: `consulta_tecnica`    (RF4)

  BLOQUEOS DE PUBLICACION (los cuatro que el ERS nombra)
    - RF15.1  una fuente que exige cita y no tiene `licencia.atribucion` escrita NO se publica
    - RF15.2  una fuente cuya licencia no permite redistribuir NO se publica como descarga
              (`publicado_como: descarga`); si puede publicarse como visor, capa propia o
              enlace al visor del organismo
    - RF6     una capa con `normalizacion.aplicada: true` necesita `validada_por` y
              `fecha_validacion`: sin la validacion explicita del analista no se publica
    - RF17.3  una fuente publicada como dato por departamento (`publicado_como: capa` con
              `normalizacion.aplicada: true`) no se publica sin esa validacion
    - JC      una fuente publicada NO puede resolverse como `visor-del-organismo`: eso es un
              enlace que saca al visitante del sitio (JC, 18-nov-2026, doctrina 1). Se publica
              con nuestro visor, con el del organismo EMBEBIDO o como imagen en nuestra
              galeria; si ninguna de las tres se puede, no se publica

  Coherencia con el repo
    - `publicado_en` solo en estado `publicada` o con `publicado_como: ninguno`
    - cada archivo de `publicado_en` tiene que existir: si un spec se renombra o se saca, el
      catalogo deja de apuntar a ningun lado y eso se avisa cortando

QUE NO CORTA Y SE AVISA (son decisiones de negocio, no errores):
    - una fuente `aprobada` sin publicar y sin motivo escrito
    - una licencia `a-confirmar`, que es una cuestion abierta real (los geoservicios del INTA y
      las condiciones de uso del SEPA)

Uso:
    python -m pipeline.fuentes_geo            # el catalogo (RF11) y el avance (RF10)
    python -m pipeline.fuentes_geo --json     # lo mismo, para pegarlo en un reporte
"""

import json
import os
import sys

import yaml

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOGO = os.path.join(RAIZ, "configs", "fuentes-geoespaciales.yaml")

# Los vocabularios, textuales del ERS. Un valor fuera de estas listas corta la corrida: si el
# ERS agrega uno, se agrega aca y queda a la vista en el diff.
ESTADOS = ("a-evaluar", "en-evaluacion", "aprobada", "en-ingesta", "normalizada", "publicada",
           "descartada", "caida")
TIPOS_CONTENIDO = ("visor-web", "capa-descargable", "servicio-ogc", "repositorio")
ALCANCES = ("nacional", "provincial", "regional", "departamental")
MODOS_ACCESO = ("visor-embebible", "descarga-directa", "catalogo-con-descarga", "ogc-wms",
                "ogc-wfs", "exportacion-desde-app")
MODOS_VISUALIZACION = ("visor-del-organismo", "visor-del-organismo-embebido",
                       "visor-propio", "imagen-en-nuestra-galeria")
# JC, 18-nov-2026: "JAMAS DIJE QUE PONGAMOS LINKS EXTERNOS AL RESTO DE LOS MAPAS... la idea es
# QUE ESTEN DENTRO DE AGRIFOOD!!!! Nunca pusimos links externos a nada". `visor-del-organismo`
# -mandar al visitante al sitio del organismo- es el unico modo que NO se puede publicar: queda
# en el vocabulario porque describe el estado de una fuente mientras se evalua, pero ninguna
# fuente publicada puede resolverse asi (bloqueo de abajo). Los tres que si: nuestro visor, el
# del organismo EMBEBIDO adentro del sitio, y la imagen de la fuente en nuestra galeria.
AFUERA = "visor-del-organismo"
# RF24.2: el visor del organismo incrustado en el sitio. Es un modo aparte y no un detalle
# de presentacion, porque no todos los visores se dejan embeber y declararlo mal deja un
# iframe EN BLANCO en produccion, que es peor que el enlace que habia.
EMBEBIDO = "visor-del-organismo-embebido"
INDICACIONES = ("cruzar-con-limites-departamentales", "exportar-capa",
                "evaluar-utilidad-analitica", "evaluar-modo-de-acceso", "cruzar-con-otra-capa")
CRITERIOS_NORMALIZACION = ("interseccion-por-superficie", "asignacion-por-centroide",
                           "asignacion-por-superficie-predominante")
# Como se publica el material de la fuente. `ninguno` es una fuente aprobada cuyo material esta
# construido pero no publicado (las dos de riesgo, que JC mando sacar).
FORMAS_DE_PUBLICAR = ("visor", "capa", "enlace", "imagen", "descarga", "ninguno")
REDISTRIBUCION = ("permitida", "no-permitida", "a-confirmar")

# De `aprobada` en adelante la fuente ya paso por la evaluacion tecnica: tiene que tener
# resuelto como se accede, como se muestra y con que licencia.
RESUELTAS = ("aprobada", "en-ingesta", "normalizada", "publicada")
OBLIGATORIOS = ("id", "nombre", "organismo", "url", "tipo_contenido", "alcance", "estado",
                "responsable", "fecha_estado")


class ErrorDeCatalogo(Exception):
    pass


def cargar(ruta=CATALOGO):
    with open(ruta, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _uno_de(fuente, campo, valor, permitidos, fallos):
    if valor not in permitidos:
        fallos.append("%s: %s = %r no esta en el vocabulario del ERS (%s)."
                      % (fuente.get("id", "?"), campo, valor, ", ".join(permitidos)))


def verificar(catalogo, raiz=RAIZ):
    """[errores], [avisos]. Los errores cortan la corrida; los avisos se imprimen."""
    fallos, avisos = [], []
    fuentes = catalogo.get("fuentes") or []
    if not fuentes:
        return ["El catalogo de fuentes geoespaciales no tiene ninguna fuente."], []

    vistos = set()
    for fuente in fuentes:
        fid = fuente.get("id", "?")
        if fid in vistos:
            fallos.append("%s: el id esta dos veces en el catalogo." % fid)
        vistos.add(fid)

        faltan = [c for c in OBLIGATORIOS if not fuente.get(c)]
        if faltan:
            fallos.append("%s: le faltan campos obligatorios (RF1): %s."
                          % (fid, ", ".join(faltan)))
            continue

        estado = fuente["estado"]
        _uno_de(fuente, "estado", estado, ESTADOS, fallos)
        _uno_de(fuente, "tipo_contenido", fuente["tipo_contenido"], TIPOS_CONTENIDO, fallos)
        _uno_de(fuente, "alcance", fuente["alcance"], ALCANCES, fallos)
        for ind in fuente.get("indicaciones") or ():
            _uno_de(fuente, "indicaciones", ind, INDICACIONES, fallos)

        # RF3 y RF23.1: una baja o una caida sin motivo escrito no sirve de registro.
        if estado in ("descartada", "caida") and not fuente.get("motivo"):
            fallos.append("%s: estado %s sin `motivo` (RF3 / RF23.1): una fuente descartada o "
                          "caida registra obligatoriamente por que." % (fid, estado))

        # RF4: lo que esta a evaluar tiene que decir QUE se esta evaluando.
        indicaciones = set(fuente.get("indicaciones") or ())
        if estado in ("a-evaluar", "en-evaluacion"):
            evaluar = indicaciones & {"evaluar-modo-de-acceso", "evaluar-utilidad-analitica"}
            if evaluar and not (fuente.get("consulta_tecnica") or {}).get("pregunta"):
                fallos.append("%s: esta en %s con la indicacion %s y no declara "
                              "`consulta_tecnica.pregunta` (RF4): la consulta concreta a "
                              "resolver se registra." % (fid, estado, ", ".join(sorted(evaluar))))

        licencia = fuente.get("licencia") or {}
        if estado in RESUELTAS:
            if not fuente.get("modo_acceso"):
                fallos.append("%s: estado %s sin `modo_acceso` (RF13)." % (fid, estado))
            else:
                _uno_de(fuente, "modo_acceso", fuente["modo_acceso"], MODOS_ACCESO, fallos)
            mv = fuente.get("modo_visualizacion") or {}
            if not mv.get("resuelto"):
                fallos.append("%s: estado %s sin `modo_visualizacion.resuelto` (RF14)."
                              % (fid, estado))
            else:
                _uno_de(fuente, "modo_visualizacion.resuelto", mv["resuelto"],
                        MODOS_VISUALIZACION, fallos)
                if not mv.get("criterio"):
                    fallos.append("%s: `modo_visualizacion` sin `criterio` (RF14): el ERS pide "
                                  "registrar que fundamento la decision." % fid)
                # RF24.2 y RF22.4: un visor que se incrusta necesita su encuadre y, sobre
                # todo, la MEDICION de que el organismo lo deja embeber. Los visores del
                # INTA y el de la ORA mandan `X-Frame-Options: SAMEORIGIN` y adentro de un
                # iframe salen en blanco: sin este bloqueo, declarar uno embebible de oido
                # publica una pantalla vacia y nadie se entera hasta que un visitante la ve.
                if mv["resuelto"] == EMBEBIDO:
                    ve = fuente.get("visualizacion_embebida") or {}
                    if not ve:
                        fallos.append(
                            "%s: dice visualizarse con el visor del organismo EMBEBIDO y no "
                            "trae `visualizacion_embebida` (RF24.2)." % fid)
                    else:
                        if not ve.get("encuadre"):
                            fallos.append("%s: visor embebido sin `encuadre` (RF22.4)." % fid)
                        if not (ve.get("embebible") or {}).get("verificado"):
                            fallos.append(
                                "%s: visor embebido sin `embebible.verificado`. Hay que MEDIR "
                                "que el organismo no manda X-Frame-Options ni frame-ancestors "
                                "antes de incrustarlo: si los manda, el iframe sale en blanco."
                                % fid)
                        if not (ve.get("embebible") or {}).get("medicion"):
                            fallos.append("%s: visor embebido sin `embebible.medicion`, o sea "
                                          "sin decir COMO se verifico." % fid)
            if not licencia:
                fallos.append("%s: estado %s sin `licencia` (RF15)." % (fid, estado))

        if licencia:
            redis = licencia.get("redistribucion")
            _uno_de(fuente, "licencia.redistribucion", redis, REDISTRIBUCION, fallos)

        forma = fuente.get("publicado_como")
        if forma is not None:
            _uno_de(fuente, "publicado_como", forma, FORMAS_DE_PUBLICAR, fallos)
        publica = bool(forma) and forma != "ninguno"

        # ---- BLOQUEOS DE PUBLICACION -----------------------------------------------------
        if publica:
            if estado != "publicada":
                fallos.append("%s: se publica como %s y su estado es %r. El material publicado "
                              "sale de una fuente en estado `publicada`." % (fid, forma, estado))
            # RF15.1
            if licencia.get("exige_cita") and not licencia.get("atribucion"):
                fallos.append("%s: la licencia exige cita de fuente y no tiene `atribucion` "
                              "escrita (RF15.1): no se publica." % fid)
            # La regla de JC del 18-nov-2026 (doctrina 1): nada se publica mandando al
            # visitante afuera. Si la capa no se puede bajar ni el visor se deja embeber, la
            # fuente no se publica -se queda en `aprobada` con su motivo- y la decision de que
            # hacer con ella va al backlog. El ERS no lo pedia; JC si, dos veces y en
            # mayusculas, y el catalogo es el unico lugar donde eso se puede hacer cumplir
            # antes de que la pagina exista.
            if (fuente.get("modo_visualizacion") or {}).get("resuelto") == AFUERA:
                fallos.append(
                    "%s: se publica como %s y su `modo_visualizacion.resuelto` es %r, o sea un "
                    "enlace que saca al visitante del sitio. JC, 18-nov-2026: \"Nunca pusimos "
                    "links externos a nada... la idea es QUE ESTEN DENTRO DE AGRIFOOD\". Las "
                    "opciones son visor-propio, visor-del-organismo-embebido o "
                    "imagen-en-nuestra-galeria; si ninguna se puede, la fuente no se publica."
                    % (fid, forma, AFUERA))
            # RF15.2
            if forma == "descarga" and licencia.get("redistribucion") != "permitida":
                fallos.append("%s: se publica como DESCARGA y su licencia dice "
                              "`redistribucion: %s` (RF15.2). Sin permiso de redistribucion solo "
                              "se admite consumo por servicio, capa propia o incrustacion del "
                              "visor del organismo." % (fid, licencia.get("redistribucion")))

        norm = fuente.get("normalizacion") or {}
        if norm.get("aplicada"):
            if norm.get("criterio"):
                _uno_de(fuente, "normalizacion.criterio", norm["criterio"],
                        CRITERIOS_NORMALIZACION, fallos)
            # RF6 y RF17.3
            if not (norm.get("validada_por") and norm.get("fecha_validacion")):
                fallos.append("%s: cruzo con los limites departamentales y no tiene la "
                              "validacion del analista (`validada_por` + `fecha_validacion`, "
                              "RF6). Sin esa validacion el RF17.3 no habilita su publicacion."
                              % fid)
        elif norm and not norm.get("motivo"):
            fallos.append("%s: `normalizacion.aplicada: false` sin `motivo`: por que esta capa "
                          "no se agrega por departamento se escribe." % fid)

        # ---- coherencia con el repo ------------------------------------------------------
        publicado_en = fuente.get("publicado_en") or []
        if publicado_en and estado != "publicada" and forma != "ninguno":
            fallos.append("%s: declara `publicado_en` y su estado es %r." % (fid, estado))
        for relativa in publicado_en:
            if not os.path.exists(os.path.join(raiz, relativa)):
                fallos.append("%s: `publicado_en` nombra %s, que no existe. Si el archivo se "
                              "renombro o se saco, el catalogo tiene que seguirlo."
                              % (fid, relativa))
        # Una fuente `publicada` SIN `publicado_como` se colaba: `publica` queda en falso y
        # con eso se saltean todos los bloqueos de publicacion (la cita obligatoria, el permiso
        # de redistribucion). Paso de verdad el 17-nov-2026, al insertar una fuente nueva entre
        # el `publicado_en` de otra y su `publicado_como`: la de arriba se quedo sin forma y
        # nadie aviso.
        if estado == "publicada" and forma is None:
            fallos.append("%s: esta en estado `publicada` y no dice COMO se publica "
                          "(`publicado_como`). Sin eso no se le controla ni la cita de fuente "
                          "ni el permiso de redistribucion." % fid)
        if estado == "publicada" and not publicado_en:
            fallos.append("%s: esta en estado `publicada` y no dice en que archivo del repo se "
                          "publica (`publicado_en`)." % fid)

        if estado == "aprobada" and not fuente.get("observaciones"):
            avisos.append("%s: esta aprobada y sin publicar, y no explica por que." % fid)

    # Las licencias a confirmar van en UN renglon y no en catorce: son una cuestion abierta
    # conocida (los geoservicios del INTA y las condiciones de uso del SEPA), y catorce avisos
    # iguales en cada corrida tapan los que si son nuevos.
    a_confirmar = sorted(f["id"] for f in fuentes
                         if (f.get("licencia") or {}).get("redistribucion") == "a-confirmar")
    if a_confirmar:
        avisos.append("%d fuentes con la licencia `a-confirmar` (cuestion abierta, no un "
                      "error): %s" % (len(a_confirmar), ", ".join(a_confirmar)))
    return fallos, avisos


def avance(catalogo):
    """El estado de avance del RF10: cuantas fuentes hay en cada estado y que falta."""
    fuentes = catalogo.get("fuentes") or []
    por_estado = {}
    for f in fuentes:
        por_estado.setdefault(f.get("estado", "?"), []).append(f.get("id"))
    pendientes_acceso, pendientes_utilidad = [], []
    for f in fuentes:
        if f.get("estado") not in ("a-evaluar", "en-evaluacion"):
            continue
        ind = set(f.get("indicaciones") or ())
        if "evaluar-modo-de-acceso" in ind:
            pendientes_acceso.append(f["id"])
        if "evaluar-utilidad-analitica" in ind:
            pendientes_utilidad.append(f["id"])
    return {
        "total": len(fuentes),
        "por_estado": {e: sorted(ids) for e, ids in sorted(por_estado.items())},
        # RF11.3: las pendientes, diferenciando que es lo que falta determinar.
        "pendientes_modo_de_acceso": sorted(pendientes_acceso),
        "pendientes_utilidad_analitica": sorted(pendientes_utilidad),
        "con_licencia_a_confirmar": sorted(
            f["id"] for f in fuentes
            if (f.get("licencia") or {}).get("redistribucion") == "a-confirmar"),
        "asistencia_especializada": sorted(
            f["id"] for f in fuentes
            if (f.get("consulta_tecnica") or {}).get("asistencia_especializada")),
    }


def verificar_o_cortar(ruta=CATALOGO, raiz=RAIZ, avisar=None):
    """Lo que llama el build. Devuelve el catalogo; si algo no cierra, levanta."""
    catalogo = cargar(ruta)
    fallos, avisos = verificar(catalogo, raiz)
    for aviso in avisos:
        if avisar:
            avisar(aviso)
    if fallos:
        raise ErrorDeCatalogo(
            "El catalogo de fuentes geoespaciales (configs/fuentes-geoespaciales.yaml) no "
            "cierra:\n  - " + "\n  - ".join(fallos))
    return catalogo


def main(argv=()):
    catalogo = cargar()
    fallos, avisos = verificar(catalogo)
    resumen = avance(catalogo)
    if "--json" in argv:
        print(json.dumps({"avance": resumen, "errores": fallos, "avisos": avisos},
                         ensure_ascii=False, indent=2))
        return 1 if fallos else 0

    print("CATALOGO DE FUENTES GEOESPACIALES  (%d fuentes, actualizado %s)"
          % (resumen["total"], catalogo.get("actualizado")))
    print()
    print("Avance por estado (RF10):")
    for estado in ESTADOS:
        ids = resumen["por_estado"].get(estado)
        if not ids:
            continue
        print("  %-14s %2d   %s" % (estado, len(ids), ", ".join(ids)))
    print()
    # RF11: el catalogo completo, que es lo que el ERS pide mostrar de cada fuente.
    print("Catalogo (RF11):")
    print("  %-26s %-13s %-22s %-11s %s"
          % ("id", "estado", "organismo", "acceso", "licencia"))
    for f in catalogo["fuentes"]:
        lic = (f.get("licencia") or {}).get("nombre", "-")
        print("  %-26s %-13s %-22s %-11s %s"
              % (f["id"], f["estado"], f["organismo"][:22], f.get("modo_acceso") or "-", lic))
    print()
    if resumen["pendientes_modo_de_acceso"]:
        print("Pendientes de determinar su MODO DE ACCESO (RF11.3): %s"
              % ", ".join(resumen["pendientes_modo_de_acceso"]))
    if resumen["pendientes_utilidad_analitica"]:
        print("Pendientes de determinar su UTILIDAD ANALITICA (RF11.3): %s"
              % ", ".join(resumen["pendientes_utilidad_analitica"]))
    if resumen["asistencia_especializada"]:
        print("Requieren asistencia tecnica especializada (RF4.1): %s"
              % ", ".join(resumen["asistencia_especializada"]))
    if resumen["con_licencia_a_confirmar"]:
        print("Con licencia a confirmar (RF15): %s"
              % ", ".join(resumen["con_licencia_a_confirmar"]))
    print()
    for aviso in avisos:
        print("AVISO  %s" % aviso)
    for fallo in fallos:
        print("ERROR  %s" % fallo)
    print()
    print("%d errores, %d avisos." % (len(fallos), len(avisos)))
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main(tuple(sys.argv[1:])))
