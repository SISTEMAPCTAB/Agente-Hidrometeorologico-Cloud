"""Respaldo independiente por Gmail para el agente hidrometeorológico.

No sustituye Carbonio. Si Gmail está configurado en GitHub Actions, consulta
únicamente el buzón en la nube y usa los mismos procesadores existentes.
Si los secretos no existen, sale sin modificar datos.
"""
from __future__ import annotations

import email
import hashlib
import imaplib
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import carbonio_to_repo as carbonio
import niveles_cloud as niveles
import niveles_horas_cloud as niveles_horas

MX_TZ = ZoneInfo("America/Mexico_City")
GMAIL_USER = os.getenv("GMAIL_BACKUP_USER", "").strip()
GMAIL_PASSWORD = os.getenv("GMAIL_BACKUP_APP_PASSWORD", "").strip()
LOOKBACK_DAYS = int(os.getenv("GMAIL_BACKUP_LOOKBACK_DAYS", "3"))
BASE = Path(os.getenv("NIVELES_BASE", "data/niveles"))
STATE_DIR = BASE / "Estado"
PROCESSED_FILE = STATE_DIR / "mensajes_gmail_procesados.txt"
HASH_FILE = STATE_DIR / "pdf_gmail_procesados_sha256.txt"
STATUS_FILE = BASE / "Estado_Gmail_Backup.json"


def decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def message_time(msg) -> datetime:
    try:
        dt = parsedate_to_datetime(msg.get("Date"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(MX_TZ)
    except Exception:
        return datetime.now(timezone.utc).astimezone(MX_TZ)


def pdf_parts(msg):
    out = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        filename = decode(part.get_filename())
        ctype = (part.get_content_type() or "").lower()
        if not filename and ctype != "application/pdf":
            continue
        if ctype == "application/pdf" or filename.lower().endswith(".pdf"):
            payload = part.get_payload(decode=True) or b""
            if payload.startswith(b"%PDF") and len(payload) > 1000:
                out.append((filename or "adjunto.pdf", payload))
    return out


def load_processed():
    if not PROCESSED_FILE.exists():
        return set()
    return {x.strip() for x in PROCESSED_FILE.read_text(encoding="utf-8").splitlines() if x.strip()}


def save_processed(values):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_FILE.write_text("\n".join(sorted(values)) + ("\n" if values else ""), encoding="utf-8")


def load_hashes():
    if not HASH_FILE.exists():
        return set()
    return {x.strip() for x in HASH_FILE.read_text(encoding="utf-8").splitlines() if x.strip()}


def save_hashes(values):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    HASH_FILE.write_text("\n".join(sorted(values)) + ("\n" if values else ""), encoding="utf-8")


def pdf_hash(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def current_latest_level_time():
    path = BASE / "Estado_Niveles_Cloud.json"
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        value = raw.get("latest_message_utc")
        if not value:
            return None
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(MX_TZ)
    except Exception:
        return None


def existing_source_time(source: str):
    path = Path("data/latest") / f"{source}.txt"
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")[:2000]
        m = re.search(r"FECHA/HORA MENSAJE:\s*([^\n]+)", text)
        if not m:
            return None
        dt = datetime.fromisoformat(m.group(1).strip())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=MX_TZ)
        return dt.astimezone(MX_TZ)
    except Exception:
        return None


def existing_source_body(source: str) -> str:
    path = Path("data/latest") / f"{source}.txt"
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        parts = text.split("\n\n", 1)
        return (parts[1] if len(parts) == 2 else text).strip()
    except Exception:
        return ""


def write_source(source: str, subject: str, filename: str, uid: str, dt: datetime, pdf: bytes):
    old = existing_source_time(source)
    if old and old >= dt:
        return False
    text = carbonio.extract_text(pdf)
    if existing_source_body(source) == text.strip():
        return False
    header = (
        f"FUENTE: {source}\nCUENTA: gmail-respaldo\nASUNTO: {subject}\n"
        f"ARCHIVO ORIGINAL: {filename}\nID MENSAJE: gmail-{uid}\n"
        f"FECHA/HORA MENSAJE: {dt.isoformat()}\n"
        f"FECHA/HORA RECOLECCIÓN: {datetime.now(timezone.utc).astimezone(MX_TZ).isoformat()}\n\n"
    )
    full = header + text
    latest = Path("data/latest") / f"{source}.txt"
    archive = Path("data/archive") / dt.strftime("%Y-%m-%d") / f"{source}.txt"
    latest.parent.mkdir(parents=True, exist_ok=True)
    archive.parent.mkdir(parents=True, exist_ok=True)
    latest.write_text(full, encoding="utf-8")
    archive.write_text(full, encoding="utf-8")
    return True


def main():
    now = datetime.now(timezone.utc).astimezone(MX_TZ)
    current_level_time = current_latest_level_time()
    status = {
        "agent": "Gmail Backup Cloud",
        "run_local": now.isoformat(),
        "configured": bool(GMAIL_USER and GMAIL_PASSWORD),
        "gmail_user": GMAIL_USER if GMAIL_USER else None,
        "current_level_time_before_run": current_level_time.isoformat() if current_level_time else None,
        "messages_scanned": 0,
        "levels_processed_now": 0,
        "levels_skipped_not_newer": 0,
        "pdfs_skipped_duplicate_content": 0,
        "sources_updated": [],
        "errors": [],
    }
    BASE.mkdir(parents=True, exist_ok=True)
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print("Gmail respaldo no configurado; no se modifica ningún dato.")
        return

    cutoff = now - timedelta(days=LOOKBACK_DAYS)
    processed = load_processed()
    hashes = load_hashes()
    messages = []
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    try:
        mail.login(GMAIL_USER, GMAIL_PASSWORD)
        mail.select("INBOX", readonly=True)
        since = cutoff.strftime("%d-%b-%Y")
        typ, data = mail.uid("search", None, f'(SINCE "{since}")')
        if typ != "OK":
            raise RuntimeError("Gmail IMAP no devolvió resultados de búsqueda.")
        for raw_uid in (data[0] or b"").split()[-250:]:
            uid = raw_uid.decode("ascii", errors="ignore")
            typ, msg_data = mail.uid("fetch", raw_uid, "(RFC822)")
            if typ != "OK" or not msg_data:
                continue
            raw = next((x[1] for x in msg_data if isinstance(x, tuple) and len(x) > 1), None)
            if not raw:
                continue
            msg = email.message_from_bytes(raw)
            dt = message_time(msg)
            if dt < cutoff:
                continue
            subject = decode(msg.get("Subject"))
            parts = pdf_parts(msg)
            if parts:
                messages.append({"uid": uid, "dt": dt, "subject": subject, "parts": parts})
    finally:
        try:
            mail.logout()
        except Exception:
            pass

    status["messages_scanned"] = len(messages)
    messages.sort(key=lambda x: x["dt"])
    latest_sources = {}

    with tempfile.TemporaryDirectory(prefix="gmail_backup_") as tmp:
        tmpdir = Path(tmp)
        for item in messages:
            uid, subject, dt = item["uid"], item["subject"], item["dt"]
            key = f"gmail-{uid}"
            for idx, (filename, payload) in enumerate(item["parts"], start=1):
                digest = pdf_hash(payload)
                if digest in hashes:
                    status["pdfs_skipped_duplicate_content"] += 1
                    continue

                source = carbonio.classify(subject, filename)
                if source:
                    current = latest_sources.get(source)
                    if current is None or dt > current["dt"]:
                        latest_sources[source] = {
                            "uid": uid,
                            "dt": dt,
                            "subject": subject,
                            "filename": filename,
                            "payload": payload,
                            "digest": digest,
                        }

                if not niveles.is_levels_subject(subject):
                    continue
                if current_level_time and dt <= current_level_time:
                    status["levels_skipped_not_newer"] += 1
                    continue
                processed_key = f"{key}-{idx}"
                if processed_key in processed:
                    continue
                safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("_") or f"niveles_{idx}.pdf"
                path = tmpdir / f"{processed_key}_{safe}"
                path.write_bytes(payload)
                try:
                    niveles.run_processor(path, subject, key)
                    niveles_horas.run_processor(path, subject, key)
                    processed.add(processed_key)
                    hashes.add(digest)
                    status["levels_processed_now"] += 1
                except Exception as exc:
                    status["errors"].append({"uid": uid, "subject": subject, "error": f"{type(exc).__name__}: {exc}"})

    for source, item in latest_sources.items():
        try:
            if write_source(source, item["subject"], item["filename"], item["uid"], item["dt"], item["payload"]):
                status["sources_updated"].append(source)
                hashes.add(item["digest"])
        except Exception as exc:
            status["errors"].append({"source": source, "error": f"{type(exc).__name__}: {exc}"})

    save_processed(processed)
    save_hashes(hashes)
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
