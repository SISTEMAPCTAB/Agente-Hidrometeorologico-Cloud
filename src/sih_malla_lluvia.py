"""Malla de lluvia 24 h del SIH-CONAGUA (docs/precdia.asc) -> lluvia media por cuenca real y por recuadro · V110j (9-nov-2026).

El SIH publica cada día (≈10:40 h del centro) una malla nacional de lluvia acumulada en 24 h, 0.02° (~2 km), interpolada de sus
estaciones, y la SOBRESCRIBE: no hay histórico. Aquí se guarda a diario:
  data/sih_malla_lluvia/latest.json      lluvia media (y máxima) por cuenca INEGI de cada estación del modelo y por recuadro de pronóstico
  data/sih_malla_lluvia/historial.json   lo mismo, un registro por fecha
  data/sih_malla_lluvia/malla/AAAA-MM-DD.json.gz   recorte Tabasco–Chiapas–Guatemala de la malla (para recalcular con otras máscaras)
Máscaras: data/sih_malla_lluvia/mascaras.json (calibracion_sierra/mascaras_malla_sih_v110j.py del modelo, cuencas INEGI V110e).
Es lluvia OBSERVADA interpolada (no independiente de las estaciones). El modelo la muestra como contraste; no impulsa el pronóstico
hasta validarla. Si el SIH no responde o la malla no cambió, no hace nada.
"""
from __future__ import annotations
import gzip, hashlib, json, sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import requests

URL = 'https://sih.conagua.gob.mx/docs/precdia.asc'
D = Path('data/sih_malla_lluvia'); (D / 'malla').mkdir(parents=True, exist_ok=True)
MX = ZoneInfo('America/Mexico_City')
RECORTE = (-94.2, -89.0, 15.0, 19.0)      # oeste, este, sur, norte (incluye Guatemala para el Usumacinta)
HDR = {'User-Agent': 'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0', 'Referer': 'https://sih.conagua.gob.mx/',
       'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}


def leer(texto):
    lin = texto.splitlines(); h = {}
    for k in range(6):
        a, b = lin[k].split()[:2]; h[a.lower()] = float(b)
    nc, nr = int(h['ncols']), int(h['nrows'])
    return h, nc, nr, lin[6:6 + nr]


def main():
    now = datetime.now(timezone.utc)
    try:
        r = requests.get(f'{URL}?v={int(now.timestamp())}', headers=HDR, timeout=90); r.raise_for_status()
    except Exception as e:
        print('Malla SIH: sin respuesta (' + str(e)[:120] + ')'); return 0
    txt = r.content.decode('ascii', 'replace')
    try:
        h, nc, nr, filas = leer(txt)
    except Exception as e:
        print('Malla SIH: encabezado no reconocido (' + str(e)[:80] + ')'); return 0
    if (nc, nr, h['cellsize']) != (1601, 1001, 0.02) or len(filas) < nr:
        print('Malla SIH: dimensiones distintas a las esperadas', nc, nr, h.get('cellsize'), len(filas)); return 0
    sha = hashlib.sha1(r.content).hexdigest()[:16]
    lm = r.headers.get('Last-Modified')
    t = parsedate_to_datetime(lm).astimezone(MX) if lm else now.astimezone(MX)
    fecha = t.date().isoformat()
    prev = {}
    if (D / 'latest.json').exists():
        try: prev = json.loads((D / 'latest.json').read_text(encoding='utf-8'))
        except Exception: prev = {}
    if prev.get('sha1') == sha:
        print('Malla SIH: sin cambio desde', prev.get('fecha')); return 0
    nd = h['nodata_value']; top = h['yllcorner'] + nr * h['cellsize']; cs = h['cellsize']; x0 = h['xllcorner']
    w, e, s, n = RECORTE
    r0, r1 = int((top - n) / cs), int((top - s) / cs); c0, c1 = int((w - x0) / cs), int((e - x0) / cs)
    M = {}
    for i in range(r0, r1 + 1):
        v = filas[i].split()
        M[i] = [float(x) for x in v[c0:c1 + 1]]
    val = lambda i, j: M[i][j - c0] if (r0 <= i <= r1 and c0 <= j <= c1) else nd
    K = json.loads((D / 'mascaras.json').read_text(encoding='utf-8'))
    cuencas = {}
    for nom, m in K['cuencas'].items():
        sw = sv = 0.0; vmax = None; wtot = 0.0
        for i, j, p in m['celdas']:
            wtot += p; x = val(i, j)
            if x == nd or x < 0: continue
            sw += p; sv += p * x; vmax = x if vmax is None else max(vmax, x)
        cuencas[nom] = {'mm': round(sv / sw, 2) if sw else None, 'mm_max': vmax, 'frac_valida': round(sw / wtot, 3) if wtot else 0,
                        'area_km2': m['area_km2'], 'completa': m['completa']}
    recuadros = {}
    for nom, b in K['recuadros'].items():
        xs = [val(i, j) for i in range(b['filas'][0], b['filas'][1] + 1) for j in range(b['columnas'][0], b['columnas'][1] + 1)]
        ok = [x for x in xs if x != nd and x >= 0]
        recuadros[nom] = {'mm': round(sum(ok) / len(ok), 2) if ok else None, 'mm_max': max(ok) if ok else None,
                          'frac_valida': round(len(ok) / len(xs), 3) if xs else 0}
    sih = {}
    try: sih = json.loads(Path('data/sih_lluvia/latest.json').read_text(encoding='utf-8'))
    except Exception: pass
    reg = {'fecha': fecha, 'publicada_local': t.isoformat(timespec='minutes'), 'consultada_utc': now.isoformat(timespec='minutes'),
           'sha1': sha, 'fecha_fuente_pdf_24h': sih.get('fecha_fuente'),
           'periodo': 'lluvia acumulada en las 24 h previas al corte de la mañana (mismo producto que el reporte SIH de 24 h)',
           'cuencas': cuencas, 'recuadros': recuadros}
    doc = {'fuente': 'SIH-CONAGUA, docs/precdia.asc (malla nacional 0.02°, lluvia 24 h interpolada de estaciones)', 'version': 'V110j',
           'uso': 'contraste observado; no impulsa el pronóstico hasta validarse', **reg}
    (D / 'latest.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding='utf-8')
    H = {}
    if (D / 'historial.json').exists():
        try: H = json.loads((D / 'historial.json').read_text(encoding='utf-8'))
        except Exception: H = {}
    H.setdefault('registros', {})[fecha] = reg
    H['fuente'] = doc['fuente']; H['actualizado_utc'] = now.isoformat(timespec='minutes')
    (D / 'historial.json').write_text(json.dumps(H, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    rec = {'recorte': RECORTE, 'fila0': r0, 'col0': c0, 'cellsize': cs, 'nodata': nd, 'publicada_local': reg['publicada_local'],
           'valores': [M[i] for i in range(r0, r1 + 1)]}
    with gzip.open(D / 'malla' / f'{fecha}.json.gz', 'wt', encoding='utf-8') as fh: json.dump(rec, fh, separators=(',', ':'))
    print('Malla SIH', fecha, '·', ' · '.join(f"{k} {v['mm']}" for k, v in cuencas.items()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
