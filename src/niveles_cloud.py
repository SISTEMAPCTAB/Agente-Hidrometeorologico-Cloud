import json
import os
import re
import subprocess
import tempfile
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import requests

CARBONIO_BASE = os.getenv("CARBONIO_BASE", "https://correo.tabasco.gob.mx").rstrip("/")
SOAP_URL = f"{CARBONIO_BASE}/service/soap"
BASE = Path(os.getenv("NIVELES_BASE", "data/niveles"))
STATE_DIR = BASE / "Estado"
PROCESSED_FILE = STATE_DIR / "mensajes_procesados.txt"
STATUS_FILE = BASE / "Estado_Niveles_Cloud.json"
PROCESSOR = Path("src/procesar_niveles.js")
LOOKBACK_DAYS = int(os.getenv("NIVELES_LOOKBACK_DAYS", "7"))

ACCOUNTS = [
    {
        "label": "principal",
        "user": os.getenv("CARBONIO_USER", "").strip(),
        "password": os.getenv("CARBONIO_PASSWORD", ""),
    },
    {
        "label": "fuente1",
        "user": os.getenv("CARBONIO_USER_FUENTE1", "").strip(),
        "password": os.getenv("CARBONIO_PASSWORD_FUENTE1", ""),
    },
]


def norm(value: str) -> str:
    value = value or ""
    value = "".join(
        c for c in unicodedata.normalize("NFD", value)
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", value.lower()).strip()


def is_levels_subject(subject: str) -> bool:
    """Reconoce reportes de niveles de cualquier hora del día.

    CONAGUA/OCFS usa variantes como:
    - SE ENVÍA REPORTE DE NIVELES DE LAS 06:00 HORAS
    - REPORTE DE NIVELES DE LAS 12:00 HORAS
    - INFORME DE NIVELES ...
    No se restringe a las 18:00.
    """
    s = norm(subject)
    if "informe de niveles" in s or "niveles del" in s:
        return True
    return bool(re.search(r"(?:reporte\s+de\s+)?niveles\s+de\s+las\s+\d{1,2}(?::\d{2})?", s))


def soap_post(payload: dict) -> dict:
    r = requests.post(SOAP_URL, json=payload, timeout=45)
    r.raise_for_status()
    data = r.json()
    if "Fault" in json.dumps(data):
        raise RuntimeError(f"Carbonio devolvió Fault: {json.dumps(data)[:1000]}")
    return data


def extract_token(auth_response):
    token = auth_response.get("authToken")
    if isinstance(token, list):
        token = token[0] if token else None
    if isinstance(token, dict):
        token = token.get("_content")
    if not token:
        raise RuntimeError("Carbonio no devolvió authToken.")
    return str(token)


def authenticate(user: str, password: str) -> str:
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra"}},
        "Body": {
            "AuthRequest": {
                "_jsns": "urn:zimbraAccount",
                "csrfTokenSecured": True,
                "persistAuthTokenCookie": False,
                "generateDeviceId": True,
                "account": {"by": "name", "_content": user},
                "password": password,
            }
        },
        "_jsns": "urn:zimbraSoap",
    }
    data = soap_post(payload)
    return extract_token(data["Body"]["AuthResponse"])


def search_page(token: str, query: str, limit: int, offset: int):
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra", "authToken": token}},
        "Body": {
            "SearchRequest": {
                "_jsns": "urn:zimbraMail",
                "query": query,
                "types": "message",
                "sortBy": "dateDesc",
                "limit": limit,
                "offset": offset,
            }
        },
        "_jsns": "urn:zimbraSoap",
    }
    data = soap_post(payload)
    resp = data.get("Body", {}).get("SearchResponse", {})
    items = resp.get("m", [])
    if not items:
        return []
    return items if isinstance(items, list) else [items]


def msg_timestamp(item):
    try:
        return int(item.get("d", 0))
    except Exception:
        return 0


def is_recent(item):
    ts = msg_timestamp(item)
    if not ts:
        return True
    cutoff_ms = int((datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).timestamp() * 1000)
    return ts >= cutoff_ms


def collect_candidates(token: str):
    seen = set()
    out = []
    # Primero Inbox; si no encuentra reportes de niveles recientes, amplía a todo el buzón.
    for query in ("in:inbox", "in:anywhere"):
        for page in range(5):
            batch = search_page(token, query, 100, page * 100)
            if not batch:
                break
            page_has_recent = False
            for item in batch:
                mid = str(item.get("id", ""))
                subject = str(item.get("su", ""))
                if not mid or mid in seen:
                    continue
                seen.add(mid)
                if is_recent(item):
                    page_has_recent = True
                    if is_levels_subject(subject):
                        out.append(item)
            if len(batch) < 100 or not page_has_recent:
                break
        if out:
            break
    return out


def get_message(token: str, message_id: str):
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra", "authToken": token}},
        "Body": {
            "GetMsgRequest": {
                "_jsns": "urn:zimbraMail",
                "m": {"id": str(message_id), "read": 0, "html": 0},
            }
        },
        "_jsns": "urn:zimbraSoap",
    }
    data = soap_post(payload)
    msg = data.get("Body", {}).get("GetMsgResponse", {}).get("m", {})
    if isinstance(msg, list):
        return msg[0] if msg else {}
    return msg or {}


def walk_attachments(parts):
    out = []
    if not parts:
        return out
    if not isinstance(parts, list):
        parts = [parts]
    for part in parts:
        if not isinstance(part, dict):
            continue
        if part.get("filename") and part.get("part"):
            out.append(
                {
                    "filename": str(part.get("filename")),
                    "part": str(part.get("part")),
                    "content_type": str(part.get("ct", "")),
                }
            )
        if part.get("mp"):
            out.extend(walk_attachments(part.get("mp")))
    return out


def download_pdf(token: str, user: str, message_id: str, part: str) -> bytes:
    url = (
        f"{CARBONIO_BASE}/service/home/{quote(user, safe='')}/"
        f"?id={quote(str(message_id), safe='')}"
        f"&part={quote(str(part), safe='')}"
        f"&auth=qp&zauthtoken={quote(token, safe='')}"
    )
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    content = r.content
    if len(content) < 1000 or not content.startswith(b"%PDF"):
        raise RuntimeError(
            f"Adjunto {message_id}/{part} no parece PDF válido ({len(content)} bytes)."
        )
    return content


def load_processed():
    if not PROCESSED_FILE.exists():
        return set()
    return {
        line.strip()
        for line in PROCESSED_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


def save_processed(ids):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_FILE.write_text("\n".join(sorted(ids)) + ("\n" if ids else ""), encoding="utf-8")


def choose_account(results):
    viable = [r for r in results if r.get("ok") and r.get("candidates")]
    if not viable:
        return None
    viable.sort(
        key=lambda r: (
            max((msg_timestamp(x) for x in r["candidates"]), default=0),
            len(r["candidates"]),
        ),
        reverse=True,
    )
    return viable[0]


def run_processor(pdf_path: Path, subject: str, message_key: str):
    cmd = [
        "node",
        str(PROCESSOR),
        "--pdf",
        str(pdf_path),
        "--subject",
        subject,
        "--message-id",
        message_key,
        "--base",
        str(BASE),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"procesar_niveles.js terminó con código {proc.returncode}")


def is_nonfatal_format_error(exc: Exception) -> bool:
    """Errores de formato de un PDF aislado que no deben bloquear cortes posteriores.

    Se limita a fallas conocidas del extractor cuando un boletín intermedio
    cambia su geometría. El reporte queda auditado como omitido, nunca se
    fabrican datos y el agente continúa con mensajes posteriores válidos.
    """
    text = str(exc)
    known = (
        "No se pudo establecer la geometría de las 15 columnas hidrométricas",
        "No se pudo establecer la geometria de las 15 columnas hidrometricas",
    )
    return any(marker in text for marker in known)


def write_status(status):
    BASE.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def existing_summary_count():
    summary_file = BASE / "Ultimo_Corte" / "ultimo_resumen.json"
    if not summary_file.exists():
        return 0
    try:
        return len(json.loads(summary_file.read_text(encoding="utf-8")))
    except Exception:
        return 0


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not PROCESSOR.exists():
        raise RuntimeError(f"No existe {PROCESSOR}")

    account_results = []
    for account in ACCOUNTS:
        # Prueba reversible: Gmail prioriza Niveles; no consultar el buzón Carbonio
        # principal de niveles. La cuenta fuente1 (OCFS) permanece disponible.
        if account["label"] in {"principal", "fuente1"}:
            # Niveles horarios exclusivamente Gmail. Carbonio FUENTE1 sólo se
            # consulta en carbonio-cloud.yml para el boletín diario OCFS.
            account_results.append({"label": account["label"], "ok": False, "reason": "gmail_only_levels"})
            continue
        if not account["user"] or not account["password"]:
            account_results.append({"label": account["label"], "ok": False, "reason": "secret_missing"})
            continue
        try:
            token = authenticate(account["user"], account["password"])
            candidates = collect_candidates(token)
            account_results.append(
                {
                    "label": account["label"],
                    "ok": True,
                    "token": token,
                    "user": account["user"],
                    "candidates": candidates,
                }
            )
            print(f"Cuenta {account['label']}: {len(candidates)} candidatos recientes de niveles.")
        except Exception as exc:
            account_results.append(
                {
                    "label": account["label"],
                    "ok": False,
                    "reason": f"{type(exc).__name__}: {exc}",
                }
            )

    selected = choose_account(account_results)
    now = datetime.now(timezone.utc)
    if not selected:
        summary_count = existing_summary_count()
        status = {
            "agent": "Niveles Hidrométricos Cloud",
            "run_utc": now.isoformat(),
            "complete": summary_count == 15,
            "selected_account": None,
            "lookback_days": LOOKBACK_DAYS,
            "candidate_count": 0,
            "processed_now": 0,
            "processed_total": len(load_processed()),
            "stations_in_latest_summary": summary_count,
            "latest_subject": None,
            "latest_message_utc": None,
            "errors": [],
            "skipped_nonfatal": [],
            "accounts": [
                {k: v for k, v in r.items() if k not in {"token", "user", "candidates"}}
                | {"candidate_count": len(r.get("candidates", []))}
                for r in account_results
            ],
            "note": "No llegó un reporte nuevo de niveles en esta ejecución; se conserva el último corte válido y el postproceso actualiza comparaciones/gráficas sin inventar datos.",
            "rule_missing_data": "Si una fila horaria está incompleta o falta un valor, se conserva el último valor observado válido por estación y se marca como heredado; ausencia nunca equivale a cero.",
        }
        write_status(status)
        print(json.dumps(status, ensure_ascii=False, indent=2))
        if summary_count == 0:
            raise RuntimeError("No hay reporte nuevo ni resumen previo válido de niveles.")
        return

    label = selected["label"]
    token = selected["token"]
    user = selected["user"]
    candidates = sorted(selected["candidates"], key=msg_timestamp)
    processed = load_processed()
    processed_now = 0
    errors = []
    skipped_nonfatal = []
    latest_subject = None
    latest_message_time = None

    with tempfile.TemporaryDirectory(prefix="niveles_cloud_") as tmp:
        tmpdir = Path(tmp)
        for item in candidates:
            mid = str(item.get("id", ""))
            subject = str(item.get("su", ""))
            message_key = f"{label}-{mid}"
            latest_subject = subject
            if item.get("d"):
                try:
                    latest_message_time = datetime.fromtimestamp(int(item["d"]) / 1000, tz=timezone.utc).isoformat()
                except Exception:
                    pass
            if message_key in processed:
                continue
            try:
                detail = get_message(token, mid)
                pdfs = [
                    a for a in walk_attachments(detail.get("mp", []))
                    if a["content_type"] == "application/pdf" or a["filename"].lower().endswith(".pdf")
                ]
                if not pdfs:
                    processed.add(message_key)
                    continue
                for index, attachment in enumerate(pdfs, start=1):
                    content = download_pdf(token, user, mid, attachment["part"])
                    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', attachment["filename"]).strip("_") or f"reporte_{index}.pdf"
                    pdf_path = tmpdir / f"{message_key}_{index}_{safe_name}"
                    pdf_path.write_bytes(content)
                    run_processor(pdf_path, subject, message_key)
                processed.add(message_key)
                processed_now += 1
            except Exception as exc:
                if is_nonfatal_format_error(exc):
                    processed.add(message_key)
                    skipped_nonfatal.append(
                        {
                            "message_id": mid,
                            "subject": subject,
                            "reason": "PDF con geometría no compatible; omitido sin bloquear reportes posteriores.",
                        }
                    )
                    print(f"Reporte {mid} omitido por formato no compatible; se continúa con cortes posteriores.")
                    continue
                errors.append(
                    {
                        "message_id": mid,
                        "subject": subject,
                        "error": f"{type(exc).__name__}: {exc}",
                    }
                )

    save_processed(processed)
    summary_count = existing_summary_count()

    status = {
        "agent": "Niveles Hidrométricos Cloud",
        "run_utc": now.isoformat(),
        "complete": summary_count == 15 and len(errors) == 0,
        "selected_account": label,
        "lookback_days": LOOKBACK_DAYS,
        "candidate_count": len(candidates),
        "processed_now": processed_now,
        "processed_total": len(processed),
        "stations_in_latest_summary": summary_count,
        "latest_subject": latest_subject,
        "latest_message_utc": latest_message_time,
        "errors": errors,
        "skipped_nonfatal": skipped_nonfatal,
        "accounts": [
            {
                "label": r.get("label"),
                "ok": r.get("ok"),
                "candidate_count": len(r.get("candidates", [])),
                "reason": r.get("reason"),
            }
            for r in account_results
        ],
        "rule_missing_data": "Si una fila horaria está incompleta o falta un valor, se conserva el último valor observado válido por estación y se marca como heredado; ausencia nunca equivale a cero.",
    }
    write_status(status)
    print(json.dumps(status, ensure_ascii=False, indent=2))

    if summary_count == 0:
        raise RuntimeError("No se generó resumen de niveles.")


if __name__ == "__main__":
    main()
