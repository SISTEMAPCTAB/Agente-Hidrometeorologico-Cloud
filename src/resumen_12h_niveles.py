from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

SRC = Path('data/niveles/Historico/niveles_historicos.csv')
OUT = Path('data/niveles/Resumen_12h/resumen_12h.json')
WINDOW_HOURS = 12
EPS = 0.02

SYSTEMS = [
    ('presas', 'Presas–Mezcalapa–Samaria/Carrizal', ['Peñitas','Mezcalapa','Platanar','Samaria','Macayo','González','Carrizal']),
    ('serranos', 'Ríos Serranos–Grijalva', ['Oxolotán','Tapijulapa','Teapa','Puyacatengo','Pueblo Nuevo','Ríos de la Sierra','Pichucalco','Amatán']),
    ('tulija', 'Tulijá–Puxcatán–Chilapa', ['Salto de Agua','Tulijá','Puxcatán','Macuspana','Chilapa']),
    ('usumacinta', 'Usumacinta', ['Boca del Cerro','San Pedro','Balancán','Emiliano Zapata','Jonuta','Tres Brazos','Usumacinta']),
]

def norm(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()

def parse_dt(v: str):
    try:
        return datetime.fromisoformat(v)
    except Exception:
        return None

def matches(row, terms):
    text = norm(f"{row.get('estacion','')} {row.get('rio','')}")
    return any(norm(t) in text for t in terms)

def main():
    if not SRC.exists():
        raise SystemExit(f'No existe {SRC}')
    rows = []
    with SRC.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if norm(r.get('estado_dato')) != 'observado':
                continue
            dt = parse_dt(r.get('ultima_actualizacion_real') or r.get('fecha_hora'))
            try:
                nivel = float(r.get('nivel'))
            except Exception:
                continue
            if dt is None:
                continue
            rows.append({**r, '_dt': dt, '_nivel': nivel})
    if not rows:
        raise SystemExit('Sin observaciones históricas válidas')
    latest = max(r['_dt'] for r in rows)
    start = latest - timedelta(hours=WINDOW_HOURS)
    window = [r for r in rows if start <= r['_dt'] <= latest]
    systems = []
    for sid, name, terms in SYSTEMS:
        rr = [r for r in window if matches(r, terms)]
        by_station = defaultdict(list)
        for r in rr:
            by_station[r.get('estacion') or 's/d'].append(r)
        stations = []
        rising = falling = stable = 0
        for st, vals in sorted(by_station.items()):
            vals.sort(key=lambda x: x['_dt'])
            # deduplicar por hora real de observación
            uniq = []
            seen = set()
            for v in vals:
                k = v['_dt'].isoformat()
                if k in seen:
                    continue
                seen.add(k); uniq.append(v)
            if not uniq:
                continue
            first, last = uniq[0], uniq[-1]
            delta = last['_nivel'] - first['_nivel'] if len(uniq) >= 2 else None
            if delta is None:
                trend = 'sin comparación'
            elif delta > EPS:
                trend = 'ascendente'; rising += 1
            elif delta < -EPS:
                trend = 'descendente'; falling += 1
            else:
                trend = 'estable'; stable += 1
            stations.append({
                'estacion': st,
                'rio': last.get('rio') or 's/d',
                'inicio': first['_dt'].isoformat(),
                'fin': last['_dt'].isoformat(),
                'nivel_inicio_m': round(first['_nivel'], 3),
                'nivel_fin_m': round(last['_nivel'], 3),
                'delta_m': None if delta is None else round(delta, 3),
                'tendencia_12h': trend,
                'observaciones': len(uniq),
            })
        comparable = rising + falling + stable
        if comparable == 0:
            evolution = 'sin datos comparables'
        elif rising >= 2 and rising > falling:
            evolution = 'deteriorándose'
        elif falling >= 2 and falling > rising:
            evolution = 'mejorando'
        elif rising == 0 and falling == 0:
            evolution = 'estable'
        else:
            evolution = 'estable/mixta'
        systems.append({
            'id': sid,
            'sistema': name,
            'evolucion_operativa_12h': evolution,
            'hidrometria': {'ascendentes': rising, 'descendentes': falling, 'estables': stable, 'comparables': comparable},
            'estaciones': stations,
        })
    payload = {
        'generated_from_latest_observation': latest.isoformat(),
        'window_start': start.isoformat(),
        'window_hours': WINDOW_HOURS,
        'criterio': 'Sólo observaciones hidrométricas reales. Heredados excluidos. Cambio >0.02 m ascendente; <-0.02 m descendente; ±0.02 m estable. La etiqueta mejorando/deteriorándose describe la dirección agregada del nivel, no el riesgo por sí sola.',
        'systems': systems,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Escrito {OUT}')

if __name__ == '__main__':
    main()
