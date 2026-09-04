import os
import re
import io
import json
import logging
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests
from pypdf import PdfReader

LOG = logging.getLogger("carbonio-cloud")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

CARBONIO_BASE = os.getenv("CARBONIO_BASE", "https://correo.tabasco.gob.mx").rstrip("/")
SOAP_URL = f"{CARBONIO_BASE}/service/soap"
USER = os.environ["CARBONIO_USER"]
PASSWORD = os.environ["CARBONIO_PASSWORD"]
SOURCE1_REGEX = os.getenv("SOURCE1_REGEX", "").strip()
SOURCE2_REGEX = os.getenv("SOURCE2_REGEX", "").strip()

MX_TZ = ZoneInfo("America/Mexico_City")
OUT = Path(os.getenv("OUTPUT_DIR", "out"))


def strip_accents(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value or "") if unicodedata.category(c) != "Mn")


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(value).lower()).strip()


def soap_post(payload: dict) -> dict:
    r = requests.post(SOAP_URL, json=payload, timeout=45)
    r.raise_for_status()
    data = r.json()
    if "Fault" in json.dumps(data):
        raise RuntimeError(f"Carbonio devolvió Fault: {json.dumps(data)[:800]}")
    return data


def token_from(auth_response):
    t = auth_response.get("authToken")
    if isinstance(t, list):
        t = t[0] if t else None
    if isinstance(t, dict):
        t = t.get("_content")
    if not t:
        raise RuntimeError("Carbonio no devolvió authToken.")
    return str(t)


def authenticate() -> str:
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra"}},
        "Body": {"AuthRequest": {
            "_jsns": "urn:zimbraAccount",
            "csrfTokenSecured": True,
            "persistAuthTokenCookie": False,
            "generateDeviceId": True,
            "account": {"by": "name", "_content": USER},
            "password": PASSWORD,
        }},
        "_jsns": "urn:zimbraSoap",
    }
    return token_from(soap_post(payload)["Body"]["AuthResponse"])


def search_messages(token: str, limit=100):
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra", "authToken": token}},
        "Body": {"SearchRequest": {
            "_jsns": "urn:zimbraMail",
            "query": "in:inbox",
            "types": "message",
            "sortBy": "dateDesc",
            "limit": limit,
        }},
        "_jsns": "urn:zimbraSoap",
    }
    m = soap_post(payload).get("Body", {}).get("SearchResponse", {}).get("m", [])
    if not m:
        return []
    return m if isinstance(m, list) else [m]


def get_message(token: str, message_id: str):
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra", "authToken": token}},
        "Body": {"GetMsgRequest": {
            "_jsns": "urn:zimbraMail",
            "m": {"id": str(message_id), "read": 0, "html": 0},
        }},
        "_jsns": "urn:zimbraSoap",
    }
    m = soap_post(payload).get("Body", {}).get("GetMsgResponse", {}).get("m", {})
    return m[0] if isinstance(m, list) and m else (m or {})


def walk_attachments(parts):
    out = []
    if not parts:
        return out
    if not isinstance(parts, list):
        parts = [parts]
    for p in parts:
        if not isinstance(p, dict):
            continue
        if p.get("filename") and p.get("part"):
            out.append({"filename": str(p["filename"]), "part": str(p["part"]), "content_type": str(p.get("ct", ""))})
        if p.get("mp"):
            out.extend(walk_attachments(p["mp"]))
    return out


def classify(subject: str, filename: str):
    raw = f"{subject} {filename}"
    text = norm(raw)
    if SOURCE2_REGEX and re.search(SOURCE2_REGEX, raw, re.I):
        return "FUENTE2"
    if SOURCE1_REGEX and re.search(SOURCE1_REGEX, raw, re.I):
        return "FUENTE1"
    if re.search(r"\bboletin\s+del\b", text) or "8 am" in text or "8am" in text:
        return "FUENTE2"
    if "hidrometria y climatologia" in text and "presas" not in text:
        return "FUENTE2"
    if re.search(r"\bboletin\s+\d{1,2}[-_/]\d{1,2}[-_/]\d{4}\b", text):
        return "FUENTE1"
    if "presas" in text and "hidrometr" in text and "climat" in text:
        return "FUENTE1"
    return None


def download_pdf(token: str, message_id: str, part: str) -> bytes:
    url = (f"{CARBONIO_BASE}/service/home/{quote(USER, safe='')}/"
           f"?id={quote(str(message_id), safe='')}&part={quote(str(part), safe='')}"
           f"&auth=qp&zauthtoken={quote(token, safe='')}")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    content = r.content
    if len(content) < 1000 or not content.startswith(b"%PDF"):
        raise RuntimeError(f"Adjunto {message_id}/{part} no parece PDF válido ({len(content)} bytes).")
    return content


def extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            text = f"[No fue posible extraer texto de la página {i}: {exc}]"
        pages.append(f"\n===== PÁGINA {i} =====\n{text.strip()}\n")
    return "".join(pages).strip() + "\n"


def message_local_time(summary: dict):
    raw = summary.get("d")
    try:
        ts = int(raw) / 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(MX_TZ)
    except Exception:
        return None


def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_bytes(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def main():
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(MX_TZ)
    OUT.mkdir(parents=True, exist_ok=True)

    token = authenticate()
    LOG.info("Autenticación Carbonio correcta.")
    messages = search_messages(token, 100)
    LOG.info("Mensajes revisados: %d", len(messages))

    selected = {}
    for summary in messages:
        if len(selected) == 2:
            break
        mid = str(summary.get("id", ""))
        subject = str(summary.get("su", ""))
        if not mid:
            continue
        detail = get_message(token, mid)
        for att in walk_attachments(detail.get("mp", [])):
            if att["content_type"] != "application/pdf" and not att["filename"].lower().endswith(".pdf"):
                continue
            source = classify(subject, att["filename"])
            if source and source not in selected:
                selected[source] = {
                    "message_id": mid,
                    "subject": subject,
                    "message_time": message_local_time(summary),
                    **att,
                }
                LOG.info("%s localizado: %s | %s", source, subject, att["filename"])

    status = {
        "agent": "Agente-Hidrometeorologico-Cloud",
        "run_utc": now_utc.isoformat(),
        "run_local": now_local.isoformat(),
        "sources": {},
        "complete": False,
    }

    for source in ("FUENTE1", "FUENTE2"):
        item = selected.get(source)
        if not item:
            status["sources"][source] = {"status": "not_found"}
            continue

        pdf = download_pdf(token, item["message_id"], item["part"])
        text = extract_text(pdf)
        msg_time = item["message_time"] or now_local
        bulletin_date = msg_time.strftime("%Y-%m-%d")

        header = (
            f"FUENTE: {source}\n"
            f"ASUNTO: {item['subject']}\n"
            f"ARCHIVO ORIGINAL: {item['filename']}\n"
            f"ID MENSAJE: {item['message_id']}\n"
            f"FECHA/HORA MENSAJE: {msg_time.isoformat()}\n"
            f"FECHA/HORA RECOLECCIÓN: {now_local.isoformat()}\n\n"
        )
        full_text = header + text

        write_text(OUT / "data" / "latest" / f"{source}.txt", full_text)
        write_text(OUT / "data" / "archive" / bulletin_date / f"{source}.txt", full_text)
        write_bytes(OUT / "artifacts" / f"{source}.pdf", pdf)

        status["sources"][source] = {
            "status": "ok",
            "subject": item["subject"],
            "message_id": item["message_id"],
            "original_filename": item["filename"],
            "message_time": msg_time.isoformat(),
            "bulletin_date": bulletin_date,
            "bytes": len(pdf),
            "text_chars": len(text),
        }

    status["complete"] = all(status["sources"].get(s, {}).get("status") == "ok" for s in ("FUENTE1", "FUENTE2"))
    write_text(OUT / "data" / "Estado_Cloud.json", json.dumps(status, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(status, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
