"""Pluviómetros WeatherLink detenidos · V110m (9-nov-2026).

Caso: SALTO DE AGUA y REFORMA (PCIVILCHIAPAS) siguen enviando temperatura y hora, pero su lluvia del año no cambia desde el
24-oct-2026; en el norte del 7-9 nov marcaron 0.0 mm mientras el SIH registró 53.9 mm en Salto de Agua. Un cero así no es "no llovió".
Regla: una estación está DETENIDA si su acumulado del año no cambia en >= DIAS_MIN días mientras >= 2 vecinas a <= RADIO_KM km
acumularon >= MM_VECINAS mm en esos mismos días. Se agrega item['pluviometro_detenido'] = {desde, dias, vecinas}; los valores NO se
cambian (el modelo decide excluirla). Historial diario del acumulado del año en state[...]['hist_year'] (30 días); si falta, se
reconstruye una vez del historial git de Tabla_WeatherLink_Cloud.csv.
Evidencias (basta una): a) vecinas: >= 2 vecinas a <= RADIO_KM km con >= MM_VECINAS mm Y la más cercana con >= la mitad (evita marcar
una estación de la llanura seca porque llovió en la sierra, p. ej. Centro vs ASUR Villahermosa); b) malla SIH de 24 h (V110j) en el
punto de la estación suma >= MM_VECINAS mm en los días detenida; c) lista manual config/weatherlink_pluviometros_detenidos.json
(observación verificada; se anula sola en cuanto el acumulado del año vuelve a cambiar).
"""
from __future__ import annotations
import csv, gzip, io, json, math, subprocess
from pathlib import Path
from datetime import timedelta

DIAS_MIN, RADIO_KM, MM_VECINAS, GUARDA = 5, 60.0, 20.0, 30
TABLA = 'data/weatherlink/Tabla_WeatherLink_Cloud.csv'


def _f(x):
    try: return float(x)
    except (TypeError, ValueError): return None


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _reconstruir(dias=GUARDA):
    """{nombre: {fecha: año_mm}} con la última versión de la tabla de cada día (git)."""
    out = {}
    try:
        log = subprocess.run(['git', 'log', f'--since={dias} days ago', '--format=%H %ad', '--date=short', '--', TABLA],
                             capture_output=True, text=True, timeout=60).stdout.split('\n')
        vistos = set()
        for l in log:
            if not l.strip(): continue
            h, d = l.split()
            if d in vistos: continue
            vistos.add(d)
            txt = subprocess.run(['git', 'show', f'{h}:{TABLA}'], capture_output=True, text=True, timeout=60).stdout
            for r in csv.DictReader(io.StringIO(txt.lstrip('﻿'))):
                v = _f(r.get('Año mm'))
                if v is not None and r.get('Estado') == 'OK': out.setdefault(r['Estacion'], {})[d] = v
    except Exception as e:
        print('pluviómetros: sin historial git (' + str(e)[:80] + ')')
    return out


def _cerca(h, d):
    """Valor del historial en la fecha d o la anterior más próxima."""
    ks = [k for k in h if k <= d]
    return h[max(ks)] if ks else None


try: MANUAL = json.loads(Path('config/weatherlink_pluviometros_detenidos.json').read_text(encoding='utf-8'))
except Exception: MANUAL = {}


def _malla(p, desde, hoy):
    """Suma de la malla SIH 24 h (data/sih_malla_lluvia/malla/*.json.gz) en la celda de la estación, días desde 'desde'."""
    tot, n = 0.0, 0
    for f in sorted(Path('data/sih_malla_lluvia/malla').glob('*.json.gz')):
        if not (desde < f.name[:10] <= hoy.isoformat()): continue
        try:
            m = json.load(gzip.open(f, 'rt', encoding='utf-8'))
            top = 14.0 + 1001 * m['cellsize']; i = int((top - p[0]) / m['cellsize']) - m['fila0']; j = int((p[1] + 118.0) / m['cellsize']) - m['col0']
            v = m['valores'][i][j]
            if v is not None and v >= 0: tot += v; n += 1
        except Exception: continue
    return round(tot, 1) if n else None


def revisar(raw, state, now_local):
    hoy = now_local.date()
    por_nombre = {s.get('nombre'): s for s in state.get('stations', {}).values()}
    if sum(1 for s in por_nombre.values() if len(s.get('hist_year') or {}) >= DIAS_MIN) < 3:
        for nom, h in _reconstruir().items():
            st = por_nombre.get(nom)
            if st is not None: st['hist_year'] = {**h, **(st.get('hist_year') or {})}
    lim = (hoy - timedelta(days=GUARDA)).isoformat()
    for st in por_nombre.values():
        if st.get('year_mm') is not None:
            st.setdefault('hist_year', {})[hoy.isoformat()] = st['year_mm']
        st['hist_year'] = {d: v for d, v in sorted((st.get('hist_year') or {}).items()) if d >= lim}
    pos = {it['nombre']: (it.get('latitude'), it.get('longitude')) for it in raw if it.get('latitude') is not None and it.get('longitude') is not None}
    detenidas = []
    for it in raw:
        nom = it.get('nombre'); st = por_nombre.get(nom) or {}; h = st.get('hist_year') or {}
        if nom not in pos or len(h) < DIAS_MIN + 1 or (it.get('age_seconds') or 0) > 7200: continue
        fechas = sorted(h); v_hoy = h[fechas[-1]]
        desde = fechas[-1]
        for d in reversed(fechas[:-1]):
            if abs(h[d] - v_hoy) < 0.05: desde = d
            else: break
        dias = (hoy - __import__('datetime').date.fromisoformat(desde)).days
        if dias < DIAS_MIN: continue
        vec = {}
        for o, p in pos.items():
            if o == nom or _km(pos[nom], p) > RADIO_KM: continue
            ho = (por_nombre.get(o) or {}).get('hist_year') or {}
            a = _cerca(ho, desde); b = ho.get(max(ho)) if ho else None
            if a is not None and b is not None and b >= a: vec[o] = (round(b - a, 1), round(_km(pos[nom], p), 1))
        llovio = {o: v for o, (v, d) in vec.items() if v >= MM_VECINAS}
        cercana = min(vec.items(), key=lambda x: x[1][1]) if vec else None
        ev = []
        if len(llovio) >= 2 and cercana and cercana[1][0] >= MM_VECINAS / 2:
            ev.append({'vecinas_mm': llovio, 'mas_cercana': {cercana[0]: cercana[1][0]}})
        mm_malla = _malla(pos[nom], desde, hoy)
        if mm_malla is not None and mm_malla >= MM_VECINAS: ev.append({'malla_sih_mm': mm_malla})
        man = MANUAL.get(nom)
        if man and desde <= man.get('desde', '9999'): ev.append({'manual': man})
        if ev:
            it['pluviometro_detenido'] = {'desde': desde, 'dias': dias, 'evidencia': ev,
                                          'regla': f'acumulado del año sin cambio >= {DIAS_MIN} días mientras llovió alrededor (V110m)'}
            detenidas.append(nom)
    return detenidas
