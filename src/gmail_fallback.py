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
import socket
import time
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
    """Usar hora del último mensaje cuando exista; si no, corte observado real.

    El estado del recolector puede tener latest_message_utc=null cuando no
    encuentra correos nuevos, aunque Ultimo_Corte conserve observaciones.
    """
    timestamps = []
    status = BASE / "Estado_Niveles_Cloud.json"
    try:
        raw = json.loads(status.read_text(encoding="utf-8"))
        value = raw.get("latest_message_utc")
        if value:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            timestamps.append(dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    summary = BASE / "Ultimo_Corte" / "ultimo_resumen.json"
    try:
        rows = json.loads(summary.read_text(encoding="utf-8"))
        for row in rows if isinstance(rows, list) else []:
            # Nunca usar fecha de ejecución ni de revisión como corte observado.
            value = row.get("ultima_actualizacion_real") or row.get("fecha_hora")
            if row.get("estado_dato") not in (None, "observado"):
                continue
            if value:
                dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                timestamps.append(dt if dt.tzinfo else dt.replace(tzinfo=MX_TZ))
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return max(timestamps).astimezone(MX_TZ) if timestamps else None


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
    if source == "FUENTE2":
        # La extracción estándar pierde la columna Actual/Gasto al final del PDF.
        # Adjuntar la representación en renglones, sin cambiar el texto de niveles.
        from pypdf import PdfReader
        import io
        layout = "\n".join(
            page.extract_text(extraction_mode="layout") or ""
            for page in PdfReader(io.BytesIO(pdf)).pages
        )
        full += "\n\n===== GASTOS_LAYOUT_FUENTE2 =====\n" + layout
    latest = Path("data/latest") / f"{source}.txt"
    archive = Path("data/archive") / dt.strftime("%Y-%m-%d") / f"{source}.txt"
    latest.parent.mkdir(parents=True, exist_ok=True)
    archive.parent.mkdir(parents=True, exist_ok=True)
    latest.write_text(full, encoding="utf-8")
    archive.write_text(full, encoding="utf-8")
    return True


RAIN_DIR = BASE / "Lluvia_CONAGUA"
RAIN_FILES = ("ultimo_corte.json", "ultimo_corte.csv", "historico.json", "Estado_Lluvia_CONAGUA.json")
RAIN_EXTRACTOR = Path("src/extraer_lluvia_conagua.js")


def is_levels_subject_extra(subject: str) -> bool:
    """Variantes de asunto que no reconoce niveles_cloud.is_levels_subject.

    Ej.: "SE ENVIA NIVELES DE 2 AM DEL 19 DE OCTUBRE" (sin "de las"). Exige la marca de hora
    (AM/PM/HRS/HORAS o :MM) para no confundir con fechas.
    """
    s = niveles.norm(subject)
    return bool(re.search(r"niveles\s+de\s+\d{1,2}(?::\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|hrs?\b|horas?\b)|niveles\s+de\s+\d{1,2}:\d{2}", s))


def _cut_time(rows):
    """Corte más reciente (fecha_hora) de una lista de filas, o None."""
    best = None
    for r in rows if isinstance(rows, list) else []:
        try:
            t = datetime.fromisoformat(str(r.get("fecha_hora")))
        except (TypeError, ValueError, AttributeError):
            continue
        best = t if best is None or t > best else best
    return best


def _rain_rows_ok(rows):
    """Mismas reglas que auditar_productos_operativos.audit_rain, para no bloquear la publicación de niveles."""
    if not isinstance(rows, list) or len(rows) < 60:
        return f"sólo {len(rows) if isinstance(rows, list) else 0} filas"
    cuts = {r.get("fecha_hora") for r in rows if isinstance(r, dict)}
    if len(cuts) != 1:
        return "mezcla de cortes"
    for r in rows:
        for field, st_field in (("lluvia_24h_precedentes_mm", "estado_24h"), ("lluvia_hoy_desde_08_mm", "estado_hoy"),
                                ("lluvia_48h_precedentes_mm", "estado_48h")):
            v, st = r.get(field), r.get(st_field)
            if st == "observado":
                if not isinstance(v, (int, float)) or not 0 <= float(v) <= 500:
                    return f"{r.get('estacion')}: {field}={v!r}"
            elif st == "sin_dato":
                if v is not None:
                    return f"{r.get('estacion')}: {field} con valor y sin_dato"
            elif st is not None:
                return f"{r.get('estacion')}: estado {st!r}"
        v24, v48 = r.get("lluvia_24h_precedentes_mm"), r.get("lluvia_48h_precedentes_mm")
        if r.get("estado_48h") == "observado" and isinstance(v24, (int, float)) and isinstance(v48, (int, float)) and v48 + 0.001 < v24:
            return f"{r.get('estacion')}: 48 h menor que 24 h"
    return None


def extraer_lluvia_respaldo(level, tmpdir: Path) -> dict:
    """Extrae la lluvia CONAGUA del PDF de niveles recuperado por Gmail.

    Trabaja en una copia temporal y sólo reemplaza Lluvia_CONAGUA si el resultado
    es válido, corresponde al mismo corte que los niveles y es más nuevo que la
    lluvia publicada. Nunca lanza excepciones.
    """
    info = {"intentado": True, "actualizada": False}
    try:
        hist = json.loads((BASE / "Historico" / "niveles_historicos.json").read_text(encoding="utf-8"))
        cut = _cut_time([r for r in hist if isinstance(r, dict) and r.get("message_id") == level["key"]])
        if cut is None:
            info["motivo"] = "no se encontró el corte de niveles de este mensaje"
            return info
        info["corte_niveles"] = cut.isoformat()
        try:
            current = _cut_time(json.loads((RAIN_DIR / "ultimo_corte.json").read_text(encoding="utf-8")))
        except (OSError, ValueError):
            current = None
        if current is not None and cut <= current:
            info["motivo"] = f"la lluvia publicada ({current.isoformat()}) ya es igual o más reciente"
            return info
        work = tmpdir / "lluvia_base"
        (work / "Lluvia_CONAGUA").mkdir(parents=True, exist_ok=True)
        for name in RAIN_FILES:
            src = RAIN_DIR / name
            if src.exists():
                (work / "Lluvia_CONAGUA" / name).write_bytes(src.read_bytes())
        # La hora del corte va primero para que el extractor no la tome de otra parte del asunto.
        subject = f"INFORME DE NIVELES DE LAS {cut.hour:02d}:00 HORAS · {level['subject']}"
        proc = subprocess.run(["node", str(RAIN_EXTRACTOR), "--pdf", str(level["path"]), "--subject", subject,
                               "--message-id", level["key"], "--base", str(work)],
                              capture_output=True, text=True, timeout=180)
        print(proc.stdout.strip())
        if proc.returncode != 0:
            info["motivo"] = f"extractor terminó con código {proc.returncode}: {proc.stderr.strip()[:200]}"
            return info
        rows = json.loads((work / "Lluvia_CONAGUA" / "ultimo_corte.json").read_text(encoding="utf-8"))
        got = _cut_time(rows)
        if got is None or got != cut:
            info["motivo"] = f"el corte extraído ({got}) no coincide con el de niveles ({cut.isoformat()})"
            return info
        problem = _rain_rows_ok(rows)
        if problem:
            info["motivo"] = "validación: " + problem
            return info
        RAIN_DIR.mkdir(parents=True, exist_ok=True)
        for name in RAIN_FILES:
            src = work / "Lluvia_CONAGUA" / name
            if src.exists():
                (RAIN_DIR / name).write_bytes(src.read_bytes())
        info.update({"actualizada": True, "corte": cut.isoformat(), "estaciones": len(rows),
                     "observadas_24h": sum(1 for r in rows if r.get("estado_24h") == "observado")})
    except Exception as exc:  # nunca bloquear niveles
        info["motivo"] = f"{type(exc).__name__}: {exc}"
    return info


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
        "mensajes_con_error": [],
    }
    BASE.mkdir(parents=True, exist_ok=True)
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print("Gmail respaldo no configurado; no se modifica ningún dato.")
        return

    cutoff = now - timedelta(days=LOOKBACK_DAYS)
    processed = load_processed()
    hashes = load_hashes()
    messages = []
    mail = None
    for attempt in range(1, 4):
        try:
            mail = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
            mail.login(GMAIL_USER, GMAIL_PASSWORD)
            typ, _ = mail.select("INBOX", readonly=True)
            if typ != "OK":
                raise RuntimeError("Gmail no permitió abrir INBOX")
            break
        except (OSError, imaplib.IMAP4.abort, imaplib.IMAP4.error) as exc:
            if mail is not None:
                try: mail.logout()
                except Exception: pass
            mail = None
            if attempt == 3:
                raise
            print(f"IMAP intento {attempt}/3 falló: {exc}; reintentando")
            time.sleep(attempt * 5)
    try:
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
        if mail is not None:
            try:
                mail.logout()
            except Exception:
                pass

    status["messages_scanned"] = len(messages)
    messages.sort(key=lambda x: x["dt"])
    latest_sources = {}

    newest_level = None
    with tempfile.TemporaryDirectory(prefix="gmail_backup_") as tmp:
        tmpdir = Path(tmp)
        for item in messages:
            uid, subject, dt = item["uid"], item["subject"], item["dt"]
            key = f"gmail-{uid}"
            for idx, (filename, payload) in enumerate(item["parts"], start=1):
                digest = pdf_hash(payload)
                is_level = niveles.is_levels_subject(subject) or is_levels_subject_extra(subject)
                # Un hash histórico no debe bloquear la recuperación de un corte
                # más reciente; el procesador valida fecha y evita duplicados.
                source = carbonio.classify(subject, filename)
                # El hash de un PDF procesado antes no impide actualizar FUENTE2:
                # comparar fecha del mensaje contra la fuente publicada.
                source_newer = bool(source and (existing_source_time(source) is None or dt > existing_source_time(source)))
                if digest in hashes and not source_newer and not (is_level and (current_level_time is None or dt > current_level_time)):
                    status["pdfs_skipped_duplicate_content"] += 1
                    continue

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

                if not is_level:
                    continue
                # No comparar la fecha de recepción del correo con el corte
                # hidrométrico: un PDF tardío puede completar horas anteriores.
                # La clave de mensaje y el hash mantienen la deduplicación;
                # los procesadores validan fecha y hora dentro del propio PDF.
                processed_key = f"{key}-{idx}"
                if processed_key in processed:
                    continue
                safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("_") or f"niveles_{idx}.pdf"
                path = tmpdir / f"{processed_key}_{safe}"
                path.write_bytes(payload)
                try:
                    niveles.run_processor(path, subject, key)
                    niveles_horas.run_processor(path, subject, key)
                    # Aditivo y no bloqueante (nunca lanza): niveles horarios Peñitas-Samaria en Horario_Bifurcacion.
                    niveles_horas.run_bifurcacion_horario(path, subject, key)
                    processed.add(processed_key)
                    hashes.add(digest)
                    status["levels_processed_now"] += 1
                    # Conservar el PDF de niveles más reciente para extraer la lluvia al final.
                    if newest_level is None or dt > newest_level["dt"]:
                        keep = tmpdir / f"lluvia_{processed_key}.pdf"
                        keep.write_bytes(payload)
                        newest_level = {"dt": dt, "path": keep, "subject": subject, "key": key}
                except Exception as exc:
                    # Un PDF que no se puede procesar no debe bloquear los demás cortes ni la publicación:
                    # queda registrado aquí (no en "errors") y se reintenta en la siguiente revisión.
                    status.setdefault("mensajes_con_error", []).append(
                        {"uid": uid, "subject": subject, "error": f"{type(exc).__name__}: {exc}"[:1500]})

        # Aditivo y no bloqueante: lluvia CONAGUA del mismo PDF de niveles.
        # Nunca agrega a status["errors"]; cualquier problema sólo queda en status["lluvia_conagua"].
        if newest_level is not None:
            status["lluvia_conagua"] = extraer_lluvia_respaldo(newest_level, tmpdir)

    for source, item in latest_sources.items():
        try:
            if write_source(source, item["subject"], item["filename"], item["uid"], item["dt"], item["payload"]):
                status["sources_updated"].append(source)
                hashes.add(item["digest"])
        except Exception as exc:
            # No bloquea niveles: queda registrado y se reintenta en la siguiente revisión.
            status.setdefault("mensajes_con_error", []).append({"source": source, "error": f"{type(exc).__name__}: {exc}"[:1500]})

    save_processed(processed)
    save_hashes(hashes)
    STATUS_FILE.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
