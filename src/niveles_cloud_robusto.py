"""Entrada robusta para el agente de niveles.

Refuerza la recolección sin modificar el procesador de datos:
- consulta Inbox y, cuando Carbonio lo permite, todo el buzón;
- deduplica mensajes entre consultas;
- reintenta autenticación, búsquedas, lectura de mensajes y descarga de PDF;
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
from urllib.parse import quote

import requests

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
import niveles_cloud as base

TRANSIENT_HTTP = {408, 425, 429, 500, 502, 503, 504}
MAX_ATTEMPTS = 4
CONNECT_TIMEOUT = 12
READ_TIMEOUT = 45


def _sleep(attempt: int) -> None:
    time.sleep(min(3 * attempt, 9))


def soap_post_robusto(payload: dict, attempts: int = MAX_ATTEMPTS) -> dict:
    """SOAP Carbonio con reintentos también en autenticación y GetMsg."""
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            r = requests.post(
                base.SOAP_URL,
                json=payload,
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                headers={"Connection": "close"},
            )
            r.raise_for_status()
            data = r.json()
            if "Fault" in __import__("json").dumps(data):
                raise RuntimeError(f"Carbonio devolvió Fault: {__import__('json').dumps(data)[:1000]}")
            return data
        except requests.HTTPError as exc:
            last_exc = exc
            code = exc.response.status_code if exc.response is not None else None
            if code == 422 or code not in TRANSIENT_HTTP or attempt >= attempts:
                raise
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            if attempt >= attempts:
                raise
        if attempt < attempts:
            print(f"Carbonio no respondió; reintento {attempt + 1}/{attempts}...")
            _sleep(attempt)
    if last_exc:
        raise last_exc
    raise RuntimeError("Carbonio no respondió.")


def search_page_retry(token: str, query: str, limit: int, offset: int, attempts: int = 3):
    """Consulta Carbonio con reintentos acotados para fallos transitorios."""
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            return base.search_page(token, query, limit, offset)
        except requests.HTTPError as exc:
            last_exc = exc
            code = exc.response.status_code if exc.response is not None else None
            if code == 422:
                raise
            if code not in TRANSIENT_HTTP or attempt >= attempts:
                raise
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            if attempt >= attempts:
                raise
        _sleep(attempt)
    if last_exc:
        raise last_exc
    return []


def download_pdf_robusto(token: str, user: str, message_id: str, part: str, attempts: int = MAX_ATTEMPTS) -> bytes:
    url = (
        f"{base.CARBONIO_BASE}/service/home/{quote(user, safe='')}/"
        f"?id={quote(str(message_id), safe='')}"
        f"&part={quote(str(part), safe='')}"
        f"&auth=qp&zauthtoken={quote(token, safe='')}"
    )
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            r = requests.get(url, timeout=(CONNECT_TIMEOUT, 60), headers={"Connection": "close"})
            r.raise_for_status()
            content = r.content
            if len(content) < 1000 or not content.startswith(b"%PDF"):
                raise RuntimeError(f"Adjunto {message_id}/{part} no parece PDF válido ({len(content)} bytes).")
            return content
        except requests.HTTPError as exc:
            last_exc = exc
            code = exc.response.status_code if exc.response is not None else None
            if code not in TRANSIENT_HTTP or attempt >= attempts:
                raise
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            if attempt >= attempts:
                raise
        if attempt < attempts:
            print(f"Descarga de PDF sin respuesta; reintento {attempt + 1}/{attempts}...")
            _sleep(attempt)
    if last_exc:
        raise last_exc
    raise RuntimeError("No fue posible descargar el PDF desde Carbonio.")


def collect_candidates_robusto(token: str):
    seen = set()
    out = []
    for query in ("in:inbox", "in:anywhere"):
        try:
            for page in range(5):
                try:
                    batch = search_page_retry(token, query, 100, page * 100)
                except requests.HTTPError as exc:
                    code = exc.response.status_code if exc.response is not None else None
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
                if len(batch) < 100 or not page_has_recent:
                    break
        except requests.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else None
            if query == "in:anywhere" and code == 422:
                continue
            raise
    return out


_original_is_levels_subject = base.is_levels_subject


def is_levels_subject_robusto(subject: str) -> bool:
    if _original_is_levels_subject(subject):
        return True
    s = base.norm(subject)
    if "nivel" not in s:
        return False
    return any(term in s for term in ("hidrometr", "reporte", "informe", "boletin"))


# Parche controlado: todas las llamadas del agente base pasan por las rutas
# robustas, incluidos AuthRequest, SearchRequest, GetMsgRequest y descarga PDF.
base.soap_post = soap_post_robusto
base.collect_candidates = collect_candidates_robusto
base.is_levels_subject = is_levels_subject_robusto
base.download_pdf = download_pdf_robusto

if __name__ == "__main__":
    base.main()
