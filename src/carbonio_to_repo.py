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
PRIMARY_USER = os.environ["CARBONIO_USER"]
PRIMARY_PASSWORD = os.environ["CARBONIO_PASSWORD"]
FUENTE1_USER = os.getenv("CARBONIO_USER_FUENTE1", "").strip()
FUENTE1_PASSWORD = os.getenv("CARBONIO_PASSWORD_FUENTE1", "").strip()
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


def authenticate(user: str, password: str) -> str:
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra"}},
        "Body": {"AuthRequest": {
            "_jsns": "urn:zimbraAccount",
            "csrfTokenSecured": True,
            "persistAuthTokenCookie": False,
            "generateDeviceId": True,
            "account": {"by": "name", "_content": user},
            "password": password,
        }},
        "_jsns": "urn:zimbraSoap",
    }
    return token_from(soap_post(payload)["Body"]["AuthResponse"])


def search_messages(token: str, limit=150):
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
    if "boletin hidrometrico" in text or "boletin hidrometeorologico" in text:
        return "FUENTE1"
    return None


def message_local_time(summary: dict):
    try:
        return datetime.fromtimestamp(int(summary.get("d")) / 1000.0, tz=timezone.utc).astimezone(MX_TZ)
    except Exception:
        return None


def scan_account(label: str, user: str, password: str, desired=None):
    token = authenticate(user, password)
    LOG.info("Autenticación Carbonio correcta para %s.", label)
    messages = search_messages(token, 150)
    LOG.info("Mensajes revisados en %s: %d", label, len(messages))
    found = {}
    desired = set(desired or ("FUENTE1", "FUENTE2"))
    for summary in messages:
        mid = str(summary.get("id", ""))
        subject = str(summary.get("su", ""))
        if not mid:
            continue
        detail = get_message(token, mid)
        for att in walk_attachments(detail.get("mp", [])):
            if att["content_type"] != "application/pdf" and not att["filename"].lower().endswith(".pdf"):
                continue
            source = classify(subject, att["filename"])
            if source not in desired:
                continue
            candidate = {
                "account_label": label,
                "message_id": mid,
                "subject": subject,
                "message_time": message_local_time(summary),
                "user": user,
                "token": token,
                **att,
            }
            current = found.get(source)
            cur_time = current.get("message_time") if current else None
            new_time = candidate.get("message_time")
            if current is None or (new_time and (cur_time is None or new_time > cur_time)):
                found[source] = candidate
                LOG.info("%s localizado en %s: %s | %s", source, label, subject, att["filename"])
    return found, len(messages)


def choose_newer(a, b):
    if not a:
        return b
    if not b:
        return a
    ta, tb = a.get("message_time"), b.get("message_time")
    if ta and tb:
        return b if tb > ta else a
    return b if tb else a


def download_pdf(user: str, token: str, message_id: str, part: str) -> bytes:
    url = (f"{CARBONIO_BASE}/service/home/{quote(user, safe='')}/"
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

    account_scans = []
    selected = {}

    accounts = [("principal", PRIMARY_USER, PRIMARY_PASSWORD)]
    if FUENTE1_USER and FUENTE1_PASSWORD:
        accounts.append(("fuente1", FUENTE1_USER, FUENTE1_PASSWORD))

    for label, user, password in accounts:
        try:
            found, scanned = scan_account(label, user, password)
            account_scans.append({"label": label, "ok": True, "messages_scanned": scanned})
            for source, item in found.items():
                selected[source] = choose_newer(selected.get(source), item)
        except Exception as exc:
            account_scans.append({"label": label, "ok": False, "messages_scanned": 0, "error": f"{type(exc).__name__}: {exc}"})
            LOG.warning("Cuenta %s no disponible: %s", label, exc)

    status = {
        "agent": "Agente-Hidrometeorologico-Cloud",
        "run_utc": now_utc.isoformat(),
        "run_local": now_local.isoformat(),
        "accounts": account_scans,
        "fuente1_secondary_account_configured": bool(FUENTE1_USER and FUENTE1_PASSWORD),
        "collection_policy": {
            "FUENTE1": "boletín diario: conservar el más reciente disponible del día, sin duplicar entre cuentas",
            "FUENTE2": "boletín diario de 08:00: conservar el más reciente disponible del día, sin duplicar entre cuentas",
        },
        "sources": {},
        "complete": False,
    }

    for source in ("FUENTE1", "FUENTE2"):
        item = selected.get(source)
        if not item:
            status["sources"][source] = {"status": "not_found"}
            continue

        pdf = download_pdf(item["user"], item["token"], item["message_id"], item["part"])
        text = extract_text(pdf)
        msg_time = item["message_time"] or now_local
        bulletin_date = msg_time.strftime("%Y-%m-%d")
        header = (
            f"FUENTE: {source}\nCUENTA: {item['account_label']}\nASUNTO: {item['subject']}\nARCHIVO ORIGINAL: {item['filename']}\n"
            f"ID MENSAJE: {item['message_id']}\nFECHA/HORA MENSAJE: {msg_time.isoformat()}\n"
            f"FECHA/HORA RECOLECCIÓN: {now_local.isoformat()}\n\n"
        )
        full_text = header + text
        write_text(OUT / "data" / "latest" / f"{source}.txt", full_text)
        write_text(OUT / "data" / "archive" / bulletin_date / f"{source}.txt", full_text)
        write_bytes(OUT / "artifacts" / f"{source}.pdf", pdf)
        status["sources"][source] = {
            "status": "ok",
            "account": item["account_label"],
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
