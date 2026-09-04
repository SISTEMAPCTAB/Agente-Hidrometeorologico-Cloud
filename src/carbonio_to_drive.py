import os
import re
import io
import json
import hashlib
import logging
import unicodedata
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from urllib.parse import quote

import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload


LOG = logging.getLogger("carbonio-cloud")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

CARBONIO_BASE = os.getenv("CARBONIO_BASE", "https://correo.tabasco.gob.mx").rstrip("/")
SOAP_URL = f"{CARBONIO_BASE}/service/soap"
USER = os.environ["CARBONIO_USER"]
PASSWORD = os.environ["CARBONIO_PASSWORD"]
GDRIVE_ROOT_FOLDER_ID = os.environ["GDRIVE_CLOUD_FOLDER_ID"]
SA_JSON = os.environ["GDRIVE_SERVICE_ACCOUNT_JSON"]

SOURCE1_REGEX = os.getenv("SOURCE1_REGEX", "").strip()
SOURCE2_REGEX = os.getenv("SOURCE2_REGEX", "").strip()

MX_TZ = ZoneInfo("America/Mexico_City")
PDF_MIME = "application/pdf"
FOLDER_MIME = "application/vnd.google-apps.folder"


def strip_accents(value: str) -> str:
    value = value or ""
    return "".join(
        c for c in unicodedata.normalize("NFD", value)
        if unicodedata.category(c) != "Mn"
    )


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(value).lower()).strip()


def soap_post(payload: dict) -> dict:
    r = requests.post(SOAP_URL, json=payload, timeout=45)
    r.raise_for_status()
    data = r.json()
    if "Fault" in json.dumps(data):
        raise RuntimeError(f"Carbonio devolvió Fault: {json.dumps(data)[:1000]}")
    return data


def extract_token(auth_response):
    token = auth_response.get("authToken")
    if token is None:
        raise RuntimeError("Carbonio no devolvió authToken.")
    if isinstance(token, list):
        token = token[0] if token else None
    if isinstance(token, dict):
        token = token.get("_content")
    if not token:
        raise RuntimeError("authToken vacío.")
    return str(token)


def authenticate() -> str:
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra"}},
        "Body": {
            "AuthRequest": {
                "_jsns": "urn:zimbraAccount",
                "csrfTokenSecured": True,
                "persistAuthTokenCookie": False,
                "generateDeviceId": True,
                "account": {"by": "name", "_content": USER},
                "password": PASSWORD,
            }
        },
        "_jsns": "urn:zimbraSoap",
    }
    data = soap_post(payload)
    auth = data["Body"]["AuthResponse"]
    return extract_token(auth)


def search_messages(token: str, limit: int = 100):
    payload = {
        "Header": {"context": {"_jsns": "urn:zimbra", "authToken": token}},
        "Body": {
            "SearchRequest": {
                "_jsns": "urn:zimbraMail",
                "query": "in:inbox",
                "types": "message",
                "sortBy": "dateDesc",
                "limit": limit,
            }
        },
        "_jsns": "urn:zimbraSoap",
    }
    data = soap_post(payload)
    messages = data.get("Body", {}).get("SearchResponse", {}).get("m", [])
    if not messages:
        return []
    return messages if isinstance(messages, list) else [messages]


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
    message = data.get("Body", {}).get("GetMsgResponse", {}).get("m")
    if isinstance(message, list):
        return message[0] if message else {}
    return message or {}


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
                    "filename": str(part["filename"]),
                    "part": str(part["part"]),
                    "content_type": str(part.get("ct", "")),
                }
            )
        if part.get("mp"):
            out.extend(walk_attachments(part["mp"]))
    return out


def configured_match(pattern: str, text: str) -> bool:
    if not pattern:
        return False
    return bool(re.search(pattern, text, flags=re.IGNORECASE))


def classify(subject: str, filename: str):
    raw = f"{subject} {filename}"
    text = norm(raw)

    if SOURCE2_REGEX and configured_match(SOURCE2_REGEX, raw):
        return "FUENTE2"
    if SOURCE1_REGEX and configured_match(SOURCE1_REGEX, raw):
        return "FUENTE1"

    # Heurística basada en los nombres actuales observados.
    if re.search(r"\bboletin\s+del\b", text):
        return "FUENTE2"
    if "8 am" in text or "8am" in text:
        return "FUENTE2"
    if "hidrometria y climatologia" in text and "presas" not in text:
        return "FUENTE2"

    if re.search(r"\bboletin\s+\d{1,2}[-_/]\d{1,2}[-_/]\d{4}\b", text):
        return "FUENTE1"
    if "presas" in text and ("hidrometr" in text) and ("climat" in text):
        return "FUENTE1"

    return None


def sanitize_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]+', "_", name or "reporte.pdf").strip()
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def download_attachment(token: str, message_id: str, part: str) -> bytes:
    user_q = quote(USER, safe="")
    token_q = quote(token, safe="")
    url = (
        f"{CARBONIO_BASE}/service/home/{user_q}/"
        f"?id={quote(str(message_id), safe='')}"
        f"&part={quote(str(part), safe='')}"
        f"&auth=qp&zauthtoken={token_q}"
    )
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    content = r.content
    if len(content) < 1000 or not content.startswith(b"%PDF"):
        raise RuntimeError(
            f"Adjunto {message_id}/{part} no parece PDF válido ({len(content)} bytes)."
        )
    return content


def drive_service():
    info = json.loads(SA_JSON)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive"]
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def find_child(service, parent_id: str, name: str, mime_type: str | None = None):
    safe_name = name.replace("'", "\\'")
    clauses = [
        f"'{parent_id}' in parents",
        f"name = '{safe_name}'",
        "trashed = false",
    ]
    if mime_type:
        clauses.append(f"mimeType = '{mime_type}'")
    result = service.files().list(
        q=" and ".join(clauses),
        spaces="drive",
        fields="files(id,name,mimeType,md5Checksum,size,modifiedTime)",
        pageSize=20,
    ).execute()
    files = result.get("files", [])
    return files[0] if files else None


def ensure_date_folder(service, date_name: str):
    existing = find_child(service, GDRIVE_ROOT_FOLDER_ID, date_name, FOLDER_MIME)
    if existing:
        return existing["id"]
    metadata = {
        "name": date_name,
        "mimeType": FOLDER_MIME,
        "parents": [GDRIVE_ROOT_FOLDER_ID],
    }
    created = service.files().create(body=metadata, fields="id").execute()
    return created["id"]


def md5_bytes(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()


def upsert_binary(service, parent_id: str, name: str, content: bytes, mime_type: str):
    existing = find_child(service, parent_id, name)
    digest = md5_bytes(content)
    if existing and existing.get("md5Checksum") == digest:
        return {"action": "unchanged", "id": existing["id"], "name": name}

    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=False)
    if existing:
        updated = service.files().update(
            fileId=existing["id"],
            media_body=media,
            fields="id,name,md5Checksum,size,modifiedTime",
        ).execute()
        return {"action": "updated", **updated}

    created = service.files().create(
        body={"name": name, "parents": [parent_id]},
        media_body=media,
        fields="id,name,md5Checksum,size,modifiedTime",
    ).execute()
    return {"action": "created", **created}


def upsert_json(service, parent_id: str, name: str, obj: dict):
    content = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    return upsert_binary(service, parent_id, name, content, "application/json")


def main():
    now_utc = datetime.now(timezone.utc)
    now_mx = now_utc.astimezone(MX_TZ)
    date_name = now_mx.strftime("%Y-%m-%d")
    LOG.info("Inicio. Corte local: %s", now_mx.isoformat())

    token = authenticate()
    LOG.info("Autenticación Carbonio correcta.")

    messages = search_messages(token, limit=100)
    LOG.info("Mensajes revisables: %d", len(messages))

    selected = {}
    for summary in messages:
        if len(selected) == 2:
            break
        message_id = str(summary.get("id", ""))
        subject = str(summary.get("su", ""))
        if not message_id:
            continue

        detail = get_message(token, message_id)
        attachments = walk_attachments(detail.get("mp", []))
        for att in attachments:
            if att["content_type"] != PDF_MIME and not att["filename"].lower().endswith(".pdf"):
                continue
            source = classify(subject, att["filename"])
            if not source or source in selected:
                continue
            selected[source] = {
                "message_id": message_id,
                "subject": subject,
                **att,
            }
            LOG.info("%s localizado: %s | %s", source, subject, att["filename"])

    service = drive_service()
    day_folder_id = ensure_date_folder(service, date_name)

    results = {}
    for source in ("FUENTE1", "FUENTE2"):
        item = selected.get(source)
        if not item:
            results[source] = {"status": "not_found"}
            LOG.warning("%s no localizado en los últimos mensajes.", source)
            continue

        content = download_attachment(
            token, item["message_id"], item["part"]
        )
        out_name = f"{source}__{sanitize_filename(item['filename'])}"
        upload = upsert_binary(service, day_folder_id, out_name, content, PDF_MIME)
        results[source] = {
            "status": "ok",
            "subject": item["subject"],
            "message_id": item["message_id"],
            "original_filename": item["filename"],
            "drive_filename": out_name,
            "drive_file_id": upload.get("id"),
            "drive_action": upload.get("action"),
            "bytes": len(content),
        }
        LOG.info("%s: %s (%d bytes)", source, upload["action"], len(content))

    status = {
        "agent": "Agente-Hidrometeorologico-Cloud",
        "run_utc": now_utc.isoformat(),
        "run_local": now_mx.isoformat(),
        "date_folder": date_name,
        "date_folder_id": day_folder_id,
        "sources": results,
        "complete": all(results.get(s, {}).get("status") == "ok" for s in ("FUENTE1", "FUENTE2")),
    }
    status_result = upsert_json(service, GDRIVE_ROOT_FOLDER_ID, "Estado_Cloud.json", status)
    LOG.info("Estado_Cloud.json: %s", status_result["action"])

    print(json.dumps(status, ensure_ascii=False, indent=2))

    # No hacer fallar la ejecución si falta un boletín; puede no haber llegado aún.
    # Sí falla si no pudo autenticarse, descargar un PDF válido o escribir en Drive.


if __name__ == "__main__":
    main()
