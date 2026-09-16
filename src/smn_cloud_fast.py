from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

from fuentes_publicas_cloud import SMN96, SMN360, parse_smn96, parse_smn360

OUT = Path('data/fuentes_publicas')
LATEST = OUT / 'latest.json'
STATUS = OUT / 'Estado_SMN_Cloud.json'
TIMEOUT = 30
HEADERS = {
    'User-Agent': 'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/SMN-fast-1.0',
    'Cache-Control': 'no-cache, no-store, max-age=0',
    'Pragma': 'no-cache',
}
MONTHS = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10,
    'noviembre': 11, 'diciembre': 12,
}


def fetch_fresh(url: str) -> tuple[str, dict]:
    # Query único + cabeceras no-cache para evitar una copia anterior del CDN/proxy.
    stamp = int(datetime.now(timezone.utc).timestamp())
    sep = '&' if '?' in url else '?'
    r = requests.get(f'{url}{sep}_ipcet={stamp}', headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text, {
        'status_code': r.status_code,
        'etag': r.headers.get('ETag'),
        'last_modified': r.headers.get('Last-Modified'),
        'cache_control': r.headers.get('Cache-Control'),
    }


def source_key(obj: dict | None) -> tuple:
    if not isinstance(obj, dict):
        return (0, 0, 0)
    aviso = 0
    try:
        aviso = int(re.sub(r'\D', '', str(obj.get('aviso') or '')) or 0)
    except Exception:
        aviso = 0
    date_num = 0
    m = re.search(r'(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(?:del?\s+)?(20\d{2})', str(obj.get('fecha') or ''), re.I)
    if m:
        month = MONTHS.get(m.group(2).lower().replace('é', 'e'))
        if month:
            date_num = int(m.group(3)) * 10000 + month * 100 + int(m.group(1))
    hm = re.search(r'(\d{1,2}):(\d{2})', str(obj.get('emision') or ''))
    time_num = int(hm.group(1)) * 60 + int(hm.group(2)) if hm else 0
    return (date_num, time_num, aviso)


def keep_newest(old: dict | None, new: dict | None) -> tuple[dict | None, str]:
    if not new:
        return old, 'sin_candidato'
    if not old:
        return new, 'nuevo'
    if source_key(new) >= source_key(old):
        return new, 'nuevo_o_igual'
    return old, 'rechazado_por_ser_mas_antiguo'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    try:
        payload = json.loads(LATEST.read_text(encoding='utf-8')) if LATEST.exists() else {}
    except Exception:
        payload = {}

    old96 = payload.get('smn96')
    old360 = payload.get('smn360')
    status = {
        'agent': 'SMN Cloud Fast',
        'run_utc': now,
        'complete': False,
        'errors': [],
        'before': {
            'smn96': {k: (old96 or {}).get(k) for k in ('aviso', 'fecha', 'emision')},
            'smn360': {k: (old360 or {}).get(k) for k in ('aviso', 'fecha', 'emision')},
        },
    }

    candidates = {}
    for key, url, parser in (
        ('smn96', SMN96, parse_smn96),
        ('smn360', SMN360, parse_smn360),
    ):
        try:
            raw, http = fetch_fresh(url)
            obj = parser(raw)
            obj['http'] = http
            if not obj.get('aviso') or not obj.get('fecha') or not obj.get('emision'):
                raise RuntimeError('SMN respondió, pero faltan aviso/fecha/emisión; no se sustituye el último válido.')
            candidates[key] = obj
        except Exception as exc:
            status['errors'].append(f'{key}: {type(exc).__name__}: {exc}')

    selected96, decision96 = keep_newest(old96, candidates.get('smn96'))
    selected360, decision360 = keep_newest(old360, candidates.get('smn360'))
    if selected96 is not None:
        payload['smn96'] = selected96
    if selected360 is not None:
        payload['smn360'] = selected360
    payload['generated_utc'] = now

    status['detected'] = {
        'smn96': {k: (candidates.get('smn96') or {}).get(k) for k in ('aviso', 'fecha', 'emision')},
        'smn360': {k: (candidates.get('smn360') or {}).get(k) for k in ('aviso', 'fecha', 'emision')},
    }
    status['decision'] = {'smn96': decision96, 'smn360': decision360}
    status['published'] = {
        'smn96': {k: (selected96 or {}).get(k) for k in ('aviso', 'fecha', 'emision')},
        'smn360': {k: (selected360 or {}).get(k) for k in ('aviso', 'fecha', 'emision')},
    }
    status['complete'] = bool(selected96 and selected360) and not status['errors']

    LATEST.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(status, ensure_ascii=False, indent=2))

    # Si una fuente falla, conservar lo último válido pero hacer visible la falla en Actions.
    if status['errors']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
