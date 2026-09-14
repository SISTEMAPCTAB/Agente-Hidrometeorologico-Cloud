"""Respaldo independiente por Gmail para el agente hidrometeorológico.

No sustituye Carbonio. Si Gmail está configurado en GitHub Actions, consulta
únicamente el buzón en la nube y usa los mismos procesadores existentes.
Si los secretos no existen, sale sin modificar datos.
"""
from __future__ import annotations

import email
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
STATUS_FILE = BASE / "Estado_Gmail_Backup.json"


def decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def message_time(msg) -> datetime:
    raw = msg.get("Date")
    try:
        dt = parsedate_to_datetime(raw)
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


def write_source(source: str, subject: str, filename: str, uid: str, dt: datetime, pdf: bytes):
    old = existing_source_time(source)
    if old and old > dt:
        return False
    text = carbonio.extract_text(pdf)
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


def run_cmd(args):
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"Falló: {' '.join(args)}")


def main():
    now = datetime.now(timezone.utc).astimezone(MX_TZ)
    status = {
        "agent": "Gmail Backup Cloud",
        "run_local": now.isoformat(),
        "configured": bool(GMAIL_USER and GMAIL_PASSWORD),
        "gmail_user": GMAIL_USER if GMAIL_USER else None,
        "messages_scanned": 0,
        "levels_processed_now": 0,
        "sources_updated": [],
        "errors": [],
    }
    BASE.mkdir(parents=True, exist_ok=True)
    if not GMAIL_USER or not GMAIL_PASSWORD:
        STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Gmail respaldo no configurado; no se modifica ningún dato.")
        return

    cutoff = now - timedelta(days=LOOKBACK_DAYS)
    processed = load_processed()
    messages = []
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    try:
        mail.login(GMAIL_USER, GMAIL_PASSWORD)
        mail.select("INBOX", readonly=True)
        since = cutoff.strftime("%d-%b-%Y")
        typ, data = mail.uid("search", None, f'(SINCE "{since}")')
        if typ != "OK":
            raise RuntimeError("Gmail IMAP no devolvió resultados de búsqueda.")
        uids = (data[0] or b"").split()
        # Los más recientes bastan; evita recorrer buzones grandes.
        for raw_uid in uids[-250:]:
            uid = raw_uid.decode("ascii", errors="ignore")
            typ, msg_data = mail.uid("fetch", raw_uid, "(RFC822)")
            if typ != "OK" or not msg_data:
                continue
            raw = None
            for item in msg_data:
                if isinstance(item, tuple) and len(item) > 1:
                    raw = item[1]
                    break
            if not raw:
                continue
            msg = email.message_from_bytes(raw)
            dt = message_time(msg)
            if dt < cutoff:
                continue
            subject = decode(msg.get("Subject"))
            parts = pdf_parts(msg)
            if not parts:
                continue
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
            uid = item["uid"]
            subject = item["subject"]
            dt = item["dt"]
            key = f"gmail-{uid}"
            for idx, (filename, payload) in enumerate(item["parts"], start=1):
                source = carbonio.classify(subject, filename)
                if source:
                    current = latest_sources.get(source)
                    if current is None or dt > current["dt"]:
                        latest_sources[source] = {"uid": uid, "dt": dt, "subject": subject, "filename": filename, "payload": payload}

                if not niveles.is_levels_subject(subject):
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
                    status["levels_processed_now"] += 1
                except Exception as exc:
                    status["errors"].append({"uid": uid, "subject": subject, "error": f"{type(exc).__name__}: {exc}"})

    for source, item in latest_sources.items():
        try:
            if write_source(source, item["subject"], item["filename"], item["uid"], item["dt"], item["payload"]):
                status["sources_updated"].append(source)
        except Exception as exc:
            status["errors"].append({"source": source, "error": f"{type(exc).__name__}: {exc}"})

    save_processed(processed)
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
