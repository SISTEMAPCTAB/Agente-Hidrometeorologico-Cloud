"""Vigía de Gmail para niveles (23-oct-2026).

Problema: la revisión de Gmail corre cada 2 h (Worker despachador-hidro), así que un informe que llega a las 08:49 esperaba
hasta las 10:45. Este vigía se queda conectado a Gmail y cada INTERVALO_S segundos busca, SÓLO POR ASUNTO, los correos de
CONAGUA (informe de niveles, boletín de hidrometría y climatología 06/08 h, boletín hidrométrico, climatológico y de presas).
Cuando aparece uno nuevo (UID mayor que el último revisado) lanza gmail-backup-cloud.yml, que lo procesa como siempre.
No descarga correos ni escribe datos: sólo lee encabezados y lanza el workflow.

28-oct-2026: también vigila la lluvia SIH de 24 h. De 11:30 a 18:00 (hora de Tabasco), cada SIH_CADA_MIN minutos y sólo
mientras data/sih_lluvia/latest.json no tenga la fecha de hoy, lanza sih-lluvia-conagua.yml. El cron de GitHub del
sih-watchdog se estaba perdiendo y el dato del día esperaba a la revisión de las 14:00 del Worker (SIH lo publica desde ~12:00).

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
    """27-oct-2026: en vez de confiar en la búsqueda por asunto de Gmail (no encontró "Boletín de Hidrometría y
    Climatologia de 6 am" por acentos/mayúsculas), se leen los encabezados de TODOS los correos nuevos (UID mayor que el
    último revisado) y el asunto se compara aquí sin acentos ni mayúsculas."""
    desde = max(DESDE_ACTUAL[0], VISTO[0])
    typ, data = m.uid("search", None, f"UID {desde + 1}:*")
    uids = sorted(int(x) for x in (data[0] or b"").split() if int(x) > desde) if typ == "OK" else []
    out = {}
    if not uids:
        return out
    VISTO[0] = max(uids)
    typ, resp = m.uid("fetch", ",".join(str(u) for u in uids[-200:]), "(BODY.PEEK[HEADER.FIELDS (SUBJECT)])")
    for item in resp or []:
        if not isinstance(item, tuple):
            continue
        mu = re.search(rb"UID (\d+)", item[0])
        if not mu:
            continue
        s = asunto(item[1])
        if ASUNTO_RE.search(norm(s)) and not re.search(r"FUNCIONAMIENTO\s+DE\s+VASOS", s, re.I):
            out[int(mu.group(1))] = s
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


SIH_CADA_MIN = int(os.getenv("VIGIA_SIH_CADA_MIN", "20"))
SIH_ULTIMO = [0.0]
TZ_TAB = timezone(timedelta(hours=-6))


def sih_fecha() -> str | None:
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/contents/data/sih_lluvia/latest.json?ref=main",
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github.raw+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8")).get("fecha_fuente")
    except Exception as exc:
        print("No se pudo leer la fecha SIH:", exc)
        return None


def vigilar_sih() -> None:
    ahora = datetime.now(TZ_TAB)
    if not ((ahora.hour, ahora.minute) >= (11, 30) and ahora.hour < 18):
        return
    if time.time() - SIH_ULTIMO[0] < SIH_CADA_MIN * 60:
        return
    SIH_ULTIMO[0] = time.time()
    f = sih_fecha()
    if f is None or f == ahora.date().isoformat():
        return
    if lanzar("sih-lluvia-conagua.yml"):
        print(f"{ahora:%H:%M} lluvia SIH guardada es del {f}: lanzado sih-lluvia-conagua.yml")


DESDE_ACTUAL = [DESDE]
VISTO = [0]  # último UID cuyo encabezado ya se revisó (coincida o no)
CFE_BASE = [None]


def max_cfe(m) -> int:
    """26-oct-2026: también se vigila el reporte CFE "FUNCIONAMIENTO DE VASOS" (extracción de Peñitas que usa el modelo).
    Su referencia es el último UID existente al iniciar el vigía (lo procesa cfe_vasos.py dentro de gmail-backup-cloud)."""
    since = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%d-%b-%Y")
    try:
        typ, data = m.uid("search", None, f'(SINCE "{since}" SUBJECT "FUNCIONAMIENTO DE VASOS")')
        return max((int(x) for x in (data[0] or b"").split()), default=0) if typ == "OK" else 0
    except imaplib.IMAP4.error as exc:
        print("búsqueda CFE falló:", exc)
        return 0


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
            cfe = max_cfe(m)
            if CFE_BASE[0] is None:
                CFE_BASE[0] = cfe
                print("Base CFE: UID", cfe)
            elif cfe > CFE_BASE[0]:
                print(f"{datetime.now(timezone(timedelta(hours=-6))):%H:%M} nuevo reporte CFE funcionamiento de vasos UID {cfe}")
                if not nuevos and lanzar("gmail-backup-cloud.yml"):
                    print("Lanzado gmail-backup-cloud.yml (CFE)")
                CFE_BASE[0] = cfe
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
        try:
            vigilar_sih()
        except Exception as exc:
            print("SIH:", exc)
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
