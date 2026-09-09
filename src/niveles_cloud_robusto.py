"""Entrada robusta para el agente de niveles.

Refuerza la recolección sin modificar el procesador de datos:
- consulta Inbox y, cuando Carbonio lo permite, todo el buzón;
- deduplica mensajes entre consultas;
- reintenta fallos transitorios de red/HTTP;
- conserva los candidatos ya encontrados si Carbonio devuelve 422 en
  ``in:anywhere`` o en una página posterior.

La ausencia de un dato nuevo nunca fabrica un nivel: ``niveles_cloud.py``
conserva el último corte válido y el postproceso mantiene el último valor
observado por estación cuando una fila viene incompleta.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import requests

# Al ejecutarse como `python src/niveles_cloud_robusto.py`, Python añade
# `src/` (no la raíz del repositorio) a sys.path. Importamos el módulo hermano
# directamente para que funcione igual en GitHub Actions y en ejecución local.
SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
import niveles_cloud as base


TRANSIENT_HTTP = {408, 425, 429, 500, 502, 503, 504}


def search_page_retry(token: str, query: str, limit: int, offset: int, attempts: int = 3):
    """Consulta Carbonio con reintentos acotados para fallos transitorios."""
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            return base.search_page(token, query, limit, offset)
        except requests.HTTPError as exc:
            last_exc = exc
            code = exc.response.status_code if exc.response is not None else None
            # 422 es una limitación conocida de algunas cuentas/consultas;
            # se deja al llamador decidir si debe ignorarse.
            if code == 422:
                raise
            if code not in TRANSIENT_HTTP or attempt >= attempts:
                raise
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            if attempt >= attempts:
                raise
        time.sleep(2 ** (attempt - 1))
    if last_exc:
        raise last_exc
    return []


def collect_candidates_robusto(token: str):
    seen = set()
    out = []

    # Importante: no detenerse sólo porque Inbox ya contiene reportes viejos.
    # También se intenta `in:anywhere`, pues un reporte nuevo puede haber sido
    # movido/archivado automáticamente y de otro modo quedaría invisible.
    for query in ("in:inbox", "in:anywhere"):
        try:
            for page in range(5):
                try:
                    batch = search_page_retry(token, query, 100, page * 100)
                except requests.HTTPError as exc:
                    code = exc.response.status_code if exc.response is not None else None
                    # Algunas cuentas rechazan `in:anywhere` o páginas altas.
                    # Conservamos todo lo recuperado por las rutas válidas.
                    if code == 422 and (query == "in:anywhere" or page > 0):
                        break
                    raise

                if not batch:
                    break

                page_has_recent = False
                for item in batch:
                    mid = str(item.get("id", ""))
                    subject = str(item.get("su", ""))
                    if not mid or mid in seen:
                        continue
                    seen.add(mid)
                    if base.is_recent(item):
                        page_has_recent = True
                        if base.is_levels_subject(subject):
                            out.append(item)

                # sortBy=dateDesc: al llegar a una página sin mensajes dentro
                # de la ventana ya no vale la pena seguir paginando.
                if len(batch) < 100 or not page_has_recent:
                    break
        except requests.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else None
            if query == "in:anywhere" and code == 422:
                continue
            raise

    return out


# Ampliamos prudentemente el reconocimiento de asuntos. Se conserva la lógica
# original y sólo se aceptan variantes claramente hidrométricas.
_original_is_levels_subject = base.is_levels_subject


def is_levels_subject_robusto(subject: str) -> bool:
    if _original_is_levels_subject(subject):
        return True
    s = base.norm(subject)
    if "nivel" not in s:
        return False
    hydrometric_terms = ("hidrometr", "reporte", "informe", "boletin")
    return any(term in s for term in hydrometric_terms)


base.collect_candidates = collect_candidates_robusto
base.is_levels_subject = is_levels_subject_robusto

if __name__ == "__main__":
    base.main()
