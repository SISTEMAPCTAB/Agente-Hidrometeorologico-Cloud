from __future__ import annotations

import io
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import requests
from pypdf import PdfReader

BASE = Path('data/fuentes_publicas')
LATEST = BASE / 'latest.json'
LEGACY_HIST = BASE / 'insivumeh_historico.json'
OUT = BASE / 'insivumeh_alto_hidro.json'
HIST = BASE / 'insivumeh_alto_hidro_historico.json'
UA = {'User-Agent': 'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}

TARGETS = [
    ('El Tigre', 'Usumacinta', 'Las Cruces, Petén', ['El Tigre', 'El Tigre Usumacinta']),
    ('El Porvenir', 'La Pasión', 'Las Cruces, Petén', ['El Porvenir', 'El Porvenir La Pasion']),
    ('Machaquilá', 'Machaquilá', 'Poptún, Petén', ['Machaquila', 'Machaquila Machaquila']),
    ('San Pedro Mactún', 'San Pedro', 'San Andrés, Petén', ['San Pedro Mactun']),
    ('San Agustín Chixoy', 'Chixoy', 'Chisec, Alta Verapaz', ['San Agustin Chixoy']),
    ('Playa Grande', 'Chixoy', 'Ixcán, Quiché', ['Playa Grande Chixoy']),
    ('San Luis Ixcán', 'Xaclbal', 'Ixcán, Quiché', ['San Luis Ixcan']),
    ('Puente Chocox', 'Chixoy', 'Canillá, Quiché', ['Puente Chocox']),
]


def limpiar_acentos_pdf(s: str) -> str:
    """23-oct-2026: el PDF del BHVGM (LaTeX) separa los acentos: 'San Agust ´ ın', 'Machaquil´ a', 'Ixc´ an'. Sin esto no se
    reconocían San Agustín Chixoy, San Luis Ixcán, Machaquilá ni San Pedro Mactún (quedaban 'sin dato')."""
    s = re.sub(r'\s*[\u00b4`\u00a8\u02dc\u02c6]\s*', '', s or '')
    return s.replace('\u0131', 'i')


def asc(s: str) -> str:
    s = limpiar_acentos_pdf(s)
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')).strip()


def extract_text(url: str) -> str:
    sep = '&' if '?' in url else '?'
    fresh = f"{url}{sep}_ts={int(datetime.now(timezone.utc).timestamp())}"
    headers = {**UA, 'Cache-Control': 'no-cache, no-store, max-age=0', 'Pragma': 'no-cache'}
    r = requests.get(fresh, headers=headers, timeout=40)
    r.raise_for_status()
    return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(r.content)).pages)


def parse_station(flat: str, station: str, river: str, location: str, aliases: list[str]):
    for alias in aliases:
        m = re.search(re.escape(asc(alias)), flat, re.I)
        if not m:
            continue
        block = flat[m.start():m.start()+360]
        nums = [float(x) for x in re.findall(r'(?<!\w)-?\d+(?:\.\d+)?', block)]
        if len(nums) < 6:
            continue
        return {
            'estacion': station,
            'rio': river,
            'ubicacion': location,
            'nivel_referencia_min_m': nums[0],
            'nivel_referencia_max_m': nums[1],
            'caudal_referencia_min_m3s': nums[2],
            'caudal_referencia_max_m3s': nums[3],
            'nivel_instantaneo_m': nums[4],
            'caudal_instantaneo_m3s': nums[5],
            'estado_dato': 'observado',
            'calidad': 'extraido_del_BHVGM',
        }
    return None


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default
    except Exception:
        return default


def norm_name(s):
    return asc(str(s or '')).lower()


def aliases_for_target(name):
    n = norm_name(name)
    if n == 'san pedro mactun': return {'san pedro mactun', 'mactun'}
    if n == 'san agustin chixoy': return {'san agustin chixoy', 'chixoy hidro'}
    return {n}


def structured_from_latest(latest, station):
    rows = ((latest.get('insivumeh') or {}).get('estaciones_estructuradas') or [])
    wanted = aliases_for_target(station)
    for x in rows:
        if norm_name(x.get('estacion')) in wanted and x.get('nivel_instantaneo_m') is not None:
            y = dict(x)
            y['estado_dato'] = 'observado'
            y['calidad'] = y.get('calidad') or 'estructurado_BHVGM'
            return y
    return None


def latest_legacy_valid(station):
    hist = load_json(LEGACY_HIST, {'registros': []})
    wanted = aliases_for_target(station)
    for rec in reversed(hist.get('registros', [])):
        for x in rec.get('estaciones', []):
            if norm_name(x.get('estacion')) in wanted and x.get('nivel_instantaneo_m') is not None:
                y = dict(x)
                y['estado_dato'] = 'heredado'
                y['ultima_observacion_fuente'] = f"{rec.get('fecha','')} {rec.get('hora','')}".strip()
                y['boletin_origen'] = rec.get('boletin')
                return y
    return None


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    latest = load_json(LATEST, {})
    ins = latest.get('insivumeh') or {}
    url_pdf = ins.get('url_pdf')
    now = datetime.now(timezone.utc).isoformat()
    result = {
        'fuente': 'INSIVUMEH',
        'producto': 'BHVGM · estaciones Alto Usumacinta',
        'consultado_utc': now,
        'url_pdf': url_pdf,
        'fecha': ins.get('fecha'),
        'hora': ins.get('hora'),
        'boletin': ins.get('boletin'),
        'estaciones': [],
        'errors': [],
        'nota': 'Se prioriza dato estructurado del BHVGM; si falta una lectura, se conserva el último valor válido y se marca heredado. Ausencia nunca equivale a cero.'
    }

    previous = load_json(OUT, {})
    prev_by = {norm_name(x.get('estacion')): x for x in previous.get('estaciones', [])}

    parsed_by = {}
    if url_pdf:
        try:
            # El PDF se descarga siempre con cache-busting. Su encabezado y sus
            # lecturas frescas tienen prioridad sobre latest.json, que puede
            # quedar rezagado si otro flujo de GitHub no se ejecutó.
            flat = asc(extract_text(url_pdf))
            m_fecha = re.search(r'Fecha:\s*(\d{1,2}/\d{1,2}/\d{4})', flat, re.I)
            m_hora = re.search(r'Hora:\s*(\d{1,2}:\d{2})', flat, re.I)
            m_boletin = re.search(r'BOLETIN\s+(?:No\.?\s*)?(\d+)\s+ano\s+(\d{4})', flat, re.I)
            if m_fecha:
                result['fecha'] = m_fecha.group(1)
            if m_hora:
                result['hora'] = m_hora.group(1)
            if m_boletin:
                result['boletin'] = f"{m_boletin.group(1)}-{m_boletin.group(2)}"
            for args in TARGETS:
                row = parse_station(flat, *args)
                if row:
                    parsed_by[norm_name(row['estacion'])] = row
        except Exception as exc:
            result['errors'].append(str(exc))
    else:
        result['errors'].append('latest.json no contiene url_pdf BHVGM')

    for station, river, location, _aliases in TARGETS:
        key = norm_name(station)
        # Prioridad: PDF fresco > estructura heredada de latest.json.
        row = parsed_by.get(key) or structured_from_latest(latest, station)
        if row:
            row = dict(row)
            row['estacion'] = station
            row['rio'] = row.get('rio') or river
            row['ubicacion'] = row.get('ubicacion') or location
            row['estado_dato'] = 'observado'
            row['ultima_observacion_fuente'] = f"{result.get('fecha') or ''} {result.get('hora') or ''}".strip()
            result['estaciones'].append(row)
            continue

        prev = prev_by.get(key)
        if prev and prev.get('nivel_instantaneo_m') is not None:
            keep = dict(prev)
            keep['estado_dato'] = 'heredado'
            keep['heredado_en_utc'] = now
            result['estaciones'].append(keep)
            continue

        legacy = latest_legacy_valid(station)
        if legacy:
            legacy['estacion'] = station
            legacy['rio'] = legacy.get('rio') or river
            legacy['ubicacion'] = legacy.get('ubicacion') or location
            legacy['heredado_en_utc'] = now
            result['estaciones'].append(legacy)
            continue

        result['estaciones'].append({
            'estacion': station,
            'rio': river,
            'ubicacion': location,
            'nivel_instantaneo_m': None,
            'caudal_instantaneo_m3s': None,
            'estado_dato': 'sin_dato',
        })

    result['observadas'] = sum(1 for x in result['estaciones'] if x.get('estado_dato') == 'observado')
    result['heredadas'] = sum(1 for x in result['estaciones'] if x.get('estado_dato') == 'heredado')
    result['sin_dato'] = sum(1 for x in result['estaciones'] if x.get('estado_dato') == 'sin_dato')
    result['estado'] = 'ok' if result['observadas'] else ('parcial' if result['heredadas'] else 'sin_datos')
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

    hist = load_json(HIST, {'registros': []})
    key = f"{result.get('fecha')}|{result.get('hora')}|{result.get('boletin')}"
    observed = [x for x in result['estaciones'] if x.get('estado_dato') == 'observado']
    if observed and not any(x.get('clave') == key for x in hist.get('registros', [])):
        hist.setdefault('registros', []).append({
            'clave': key,
            'fecha': result.get('fecha'),
            'hora': result.get('hora'),
            'boletin': result.get('boletin'),
            'url_pdf': url_pdf,
            'estaciones': observed,
        })
        hist['registros'] = hist['registros'][-500:]
    hist['actualizado_utc'] = now
    HIST.write_text(json.dumps(hist, ensure_ascii=False, indent=2), encoding='utf-8')

    print(json.dumps({
        'estado': result['estado'],
        'observadas': result['observadas'],
        'heredadas': result['heredadas'],
        'sin_dato': result['sin_dato'],
        'corte': f"{result.get('fecha')} {result.get('hora')}",
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
