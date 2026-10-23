"""Vigía de Gmail para niveles (23-oct-2026).

Problema: la revisión de Gmail corre cada 2 h (Worker despachador-hidro), así que un informe que llega a las 08:49 esperaba
hasta las 10:45. Este vigía se queda conectado a Gmail y cada INTERVALO_S segundos busca, SÓLO POR ASUNTO, los correos de
CONAGUA (informe de niveles, boletín de hidrometría y climatología 06/08 h, boletín hidrométrico, climatológico y de presas).
Cuando aparece uno nuevo (UID mayor que el último revisado) lanza gmail-backup-cloud.yml, que lo procesa como siempre.
No descarga correos ni escribe datos: sólo lee encabezados y lanza el workflow.

Al terminar su ventana se relanza a sí mismo (cadena continua). Para pausarlo: crear data/control/gmail-vigia-pausa.txt.
"""
from __future__ import annotations

import email
import imaplib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header

USER = os.getenv("GMAIL_USER", "").strip()
PASSWORD = os.getenv("GMAIL_PASSWORD", "").strip()
TOKEN = os.getenv("GH_TOKEN", "").strip()
REPO = os.getenv("GITHUB_REPOSITORY", "SISTEMAPCTAB/Agente-Hidrometeorologico-Cloud")
DURACION_MIN = float(os.getenv("VIGIA_DURACION_MIN", "110"))
INTERVALO_S = int(os.getenv("VIGIA_INTERVALO_S", "90"))
DESDE = int(os.getenv("VIGIA_DESDE_UID", "0") or 0)
SALIDA = os.getenv("GITHUB_OUTPUT")

ASUNTO_RE = re.compile(r"niveles|hidrometr|climatolog|presas", re.I)
RAW = "newer_than:2d subject:(niveles OR hidrometria OR hidrometrico OR climatologia OR climatologico OR presas)"


def norm(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")


def asunto(raw: bytes) -> str:
    try:
        return str(make_header(decode_header(email.message_from_bytes(raw).get("Subject") or "")))
    except Exception:
        return ""


def conectar():
    m = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
    m.login(USER, PASSWORD)
    m.select("INBOX", readonly=True)
    return m


def buscar(m) -> dict[int, str]:
    since = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%d-%b-%Y")
    uids = set()
    for crit in (("X-GM-RAW", f'"{RAW}"'),) + tuple((f'(SINCE "{since}" SUBJECT "{t}")',) for t in ("NIVELES", "HIDROMETRIA", "PRESAS")):
        try:
            typ, data = m.uid("search", None, *crit)
            if typ == "OK":
                uids |= {int(x) for x in (data[0] or b"").split()}
        except imaplib.IMAP4.error as exc:
            print("búsqueda falló:", crit[0][:30], exc)
    out = {}
    for u in sorted(uids):
        if u <= DESDE_ACTUAL[0]:
            continue
        typ, hdr = m.uid("fetch", str(u), "(BODY.PEEK[HEADER.FIELDS (SUBJECT)])")
        if typ == "OK" and hdr and isinstance(hdr[0], tuple):
            s = asunto(hdr[0][1])
            if ASUNTO_RE.search(norm(s)) and not re.search(r"FUNCIONAMIENTO\s+DE\s+VASOS", s, re.I):
                out[u] = s
    return out


def lanzar(workflow: str, inputs: dict | None = None) -> bool:
    body = {"ref": "main"}
    if inputs:
        body["inputs"] = inputs
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/dispatches",
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return 200 <= r.status < 300
    except Exception as exc:
        print("No se pudo lanzar", workflow, exc)
        return False


DESDE_ACTUAL = [DESDE]


def main():
    if not USER or not PASSWORD:
        print("Gmail no configurado"); return
    fin = time.time() + DURACION_MIN * 60
    m = None
    primera = True
    while time.time() < fin:
        try:
            if m is None:
                m = conectar()
            else:
                m.noop()
            if DESDE_ACTUAL[0] == 0 and primera:
                # Sin referencia: se toma el estado actual como base (no se relanza lo ya existente).
                typ, data = m.uid("search", None, "ALL")
                DESDE_ACTUAL[0] = max((int(x) for x in (data[0] or b"").split()), default=0)
                print("Base sin referencia: UID", DESDE_ACTUAL[0])
            nuevos = buscar(m)
            primera = False
            if nuevos:
                for u, s in nuevos.items():
                    print(f"{datetime.now(timezone(timedelta(hours=-6))):%H:%M} nuevo UID {u}: {s}")
                if lanzar("gmail-backup-cloud.yml"):
                    print("Lanzado gmail-backup-cloud.yml")
                    DESDE_ACTUAL[0] = max(nuevos)
        except (OSError, imaplib.IMAP4.abort, imaplib.IMAP4.error) as exc:
            print("IMAP:", exc, "; reconectando")
            try:
                m and m.logout()
            except Exception:
                pass
            m = None
        time.sleep(INTERVALO_S)
    try:
        m and m.logout()
    except Exception:
        pass
    if SALIDA:
        with open(SALIDA, "a") as f:
            f.write(f"desde_uid={DESDE_ACTUAL[0]}\n")
    print("Fin de ventana; último UID revisado", DESDE_ACTUAL[0])


if __name__ == "__main__":
    main()
