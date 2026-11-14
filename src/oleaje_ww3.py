"""Oleaje frente a la costa de Tabasco: pronóstico y análisis del modelo WAVEWATCH III global (NOAA; implementación de la Universidad de
Hawái/PacIOOS, 0.5°, horario, 5 días), servido por los ERDDAP de NOAA (dataset NWW3_Global_Best, archivo desde 2017).

Por qué (Gilberto, 13-nov-2026): las afectaciones en la franja costera (Paraíso, Centla, Cárdenas, Huimanguillo) son sobre todo por oleaje en
barras y desembocaduras (corte IPCET del Frente Frío No. 2, 19-oct-2026); el radar no ve el daño por oleaje y durante el norte ni siquiera ve
las lagunas. El modelo hidrológico no tenía ningún indicador de oleaje.

Salidas (las lee el modelo, bloque V111bq):
  data/oleaje/latest.json      serie horaria (análisis de ayer + pronóstico) de altura significante (Hs), periodo pico (Tp), dirección y
                               altura del oleaje local (viento) en la celda de mar más cercana a cada tramo de costa; máximo de las próximas 72 h.
  data/oleaje/referencias.json máximos de Hs en eventos de referencia (Frente Frío No. 2, 15-22 oct 2026) para comparar el pronóstico.
  data/oleaje/historico.json   máximo diario por tramo (crece con cada corrida; hasta 400 días).
"""
import csv, datetime as dt, io, json, math, sys, time
from pathlib import Path
import urllib.request

OUT = Path('data/oleaje')
SERVIDORES = ['https://coastwatch.pfeg.noaa.gov/erddap', 'https://upwell.pfeg.noaa.gov/erddap', 'https://pae-paha.pacioos.hawaii.edu/erddap']
DS = 'NWW3_Global_Best'
VARS = ['Thgt', 'Tper', 'Tdir', 'whgt']
CAJA = (17.5, 19.5, 265.0, 268.5)      # lat0, lat1, lon0, lon1 (0-360) = -95.0 a -91.5
TRAMOS = {   # punto de costa de referencia (lat, lon)
    'Tonalá–Aquiles Serdán (Huimanguillo)': (18.21, -94.13),
    'Sánchez Magallanes–El Alacrán (Cárdenas)': (18.30, -93.86),
    'Barra de Tupilco–El Mingo (Paraíso/Cárdenas)': (18.42, -93.44),
    'Chiltepec–El Bellote (Paraíso)': (18.43, -93.10),
    'Frontera–Barra de San Pedro (Centla)': (18.60, -92.65),
}
REFERENCIAS = {'Frente Frío No. 2 (IPCET, corte 19-oct-2026)': ('2026-10-15T00:00:00Z', '2026-10-22T23:00:00Z')}
UA = {'User-Agent': 'IPCET-Hidromet/1.0 (Agente Hidrometeorologico; oleaje)'}


def pedir(consulta):
    ult = None
    for base in SERVIDORES:
        url = f'{base}/griddap/{DS}.csv?{consulta}'
        for i in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                    return r.read().decode('utf-8'), base
            except Exception as e:
                ult = f'{base}: {e}'; time.sleep(5 * (i + 1))
    raise RuntimeError(f'ERDDAP sin respuesta ({ult})')


def rango_tiempo():
    """Última hora disponible del dataset (fin del pronóstico)."""
    txt, _ = pedir('time[last]')
    filas = list(csv.reader(io.StringIO(txt)))
    return filas[2][0]


def bajar(t0, t1):
    la0, la1, lo0, lo1 = CAJA
    sel = f'[({t0}):1:({t1})][(0.0)][({la0}):1:({la1})][({lo0}):1:({lo1})]'
    txt, base = pedir(','.join(v + sel for v in VARS))
    filas = list(csv.reader(io.StringIO(txt)))
    hd = filas[0]; datos = []
    for r in filas[2:]:
        d = dict(zip(hd, r))
        try: h = float(d['Thgt'])
        except (ValueError, KeyError): continue
        if math.isnan(h): continue
        f = lambda k: (round(float(d[k]), 2) if d.get(k) not in (None, '', 'NaN') and not math.isnan(float(d[k])) else None)
        datos.append({'t': d['time'], 'lat': float(d['latitude']), 'lon': float(d['longitude']) - 360, 'Hs': round(h, 2),
                      'Tp': f('Tper'), 'Dir': f('Tdir'), 'Hw': f('whgt')})
    return datos, base


def celdas(datos):
    """Para cada tramo, la celda de mar con dato más cercana a su punto de costa."""
    cs = {(x['lat'], x['lon']) for x in datos}
    out = {}
    for n, (la, lo) in TRAMOS.items():
        out[n] = min(cs, key=lambda c: (c[0] - la) ** 2 + ((c[1] - lo) * math.cos(math.radians(la))) ** 2)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ahora = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    fin = rango_tiempo()
    t0 = (ahora - dt.timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
    datos, base = bajar(t0, fin)
    if not datos: sys.exit('WW3 sin datos en la caja')
    C = celdas(datos)
    puntos = {}
    for n, c in C.items():
        serie = sorted((x for x in datos if (x['lat'], x['lon']) == c), key=lambda x: x['t'])
        fut = [x for x in serie if ahora.strftime('%Y-%m-%dT%H') <= x['t'][:13] <= (ahora + dt.timedelta(hours=72)).strftime('%Y-%m-%dT%H')]
        mx = max(fut, key=lambda x: x['Hs']) if fut else None
        act = min(serie, key=lambda x: abs(dt.datetime.fromisoformat(x['t'].replace('Z', '+00:00')) - ahora)) if serie else None
        puntos[n] = {'costa': TRAMOS[n], 'celda': [c[0], round(c[1], 2)], 'actual': act, 'max72': mx,
                     'serie': [[x['t'], x['Hs'], x['Tp'], x['Dir'], x['Hw']] for x in serie]}
    doc = {'generado_utc': ahora.isoformat(), 'fuente': f'NOAA WAVEWATCH III global 0.5° (PacIOOS/Universidad de Hawái), ERDDAP {base}, dataset {DS}',
           'fin_pronostico': fin, 'campos_serie': ['tiempo_utc', 'Hs_m', 'Tp_s', 'dir_grados_desde', 'Hs_viento_m'], 'tramos': puntos}
    (OUT / 'latest.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    # referencias (una vez)
    rf = OUT / 'referencias.json'
    R = json.loads(rf.read_text(encoding='utf-8')) if rf.exists() else {}
    for nom, (a, b) in REFERENCIAS.items():
        if nom in R: continue
        try:
            d2, _ = bajar(a, b); C2 = celdas(d2); R[nom] = {}
            for n, c in C2.items():
                s = [x for x in d2 if (x['lat'], x['lon']) == c]
                if s:
                    m = max(s, key=lambda x: x['Hs'])
                    R[nom][n] = {'Hs_max': m['Hs'], 't': m['t'], 'Tp': m['Tp'], 'Dir': m['Dir'], 'celda': [c[0], round(c[1], 2)]}
        except Exception as e:
            print('referencia', nom, e)
    rf.write_text(json.dumps(R, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    # histórico de máximos diarios (análisis: horas ya pasadas)
    hf = OUT / 'historico.json'
    Hh = json.loads(hf.read_text(encoding='utf-8')) if hf.exists() else {}
    for n, p in puntos.items():
        dia = {}
        for t, hs, *_ in p['serie']:
            if t[:13] <= ahora.strftime('%Y-%m-%dT%H'): dia[t[:10]] = max(dia.get(t[:10], 0), hs)
        h = Hh.setdefault(n, {}); h.update({k: v for k, v in dia.items() if v >= h.get(k, 0)})
        for k in sorted(h)[:-400]: h.pop(k)
    hf.write_text(json.dumps(Hh, ensure_ascii=False) + '\n', encoding='utf-8')
    for n, p in puntos.items():
        m = p['max72']; print(n, p['celda'], 'actual', p['actual'] and p['actual']['Hs'], 'max72', m and (m['Hs'], m['t']))
    print('referencias:', json.dumps(R, ensure_ascii=False)[:400])


if __name__ == '__main__':
    main()
