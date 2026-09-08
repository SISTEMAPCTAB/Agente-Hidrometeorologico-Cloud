"""Entrada robusta para el agente de niveles.

Mantiene intacto `niveles_cloud.py` y sólo hace tolerante la búsqueda en la
cuenta secundaria de Carbonio. Algunas cuentas aceptan `in:inbox` pero
rechazan con HTTP 422 la ampliación `in:anywhere`; ese rechazo no significa
que la autenticación haya fallado.
"""
from __future__ import annotations

import sys
from pathlib import Path

import requests

# Al ejecutarse como `python src/niveles_cloud_robusto.py`, Python añade
# `src/` (no la raíz del repositorio) a sys.path. Importamos el módulo hermano
# directamente para que funcione igual en GitHub Actions y en ejecución local.
SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
import niveles_cloud as base


def collect_candidates_robusto(token: str):
    seen = set()
    out = []

    # La consulta de Inbox es la ruta ya validada por carbonio_to_repo.py.
    # Se pagina mientras Carbonio lo permita.
    for page in range(5):
        try:
            batch = base.search_page(token, "in:inbox", 100, page * 100)
        except requests.HTTPError as exc:
            # Si Carbonio rechaza una página posterior, se conservan los
            # candidatos ya encontrados en lugar de declarar caída la cuenta.
            if page > 0 and exc.response is not None and exc.response.status_code == 422:
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
        if len(batch) < 100 or not page_has_recent:
            break

    if out:
        return out

    # Sólo si Inbox no contiene reportes de niveles se intenta ampliar la
    # búsqueda. Un 422 en `in:anywhere` se interpreta como característica de
    # esa cuenta/servidor, no como fallo de autenticación.
    try:
        for page in range(5):
            batch = base.search_page(token, "in:anywhere", 100, page * 100)
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
            if len(batch) < 100 or not page_has_recent:
                break
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 422:
            raise

    return out


base.collect_candidates = collect_candidates_robusto

if __name__ == "__main__":
    base.main()
