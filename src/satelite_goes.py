#!/usr/bin/env python3
"""Lluvia y temperatura de superficie por satélite GOES-19 (GOES-Este) para las isoyetas e isotermas del modelo (13-nov-2026).

Gilberto (13-nov-2026): apoyar las isoyetas (y también la temperatura) con satélite donde no hay estaciones. Fuente: NOAA GOES-19 ABI,
datos abiertos en AWS (s3://noaa-goes19, sin cuenta):
  - ABI-L2-RRQPEF: tasa de lluvia (mm/h), disco completo, cada 10 min, ~2 km (algoritmo infrarrojo; NO ve bien la lluvia de nortes,
    tesis IMTA 2011: el modelo la usa sólo como FORMA y la ajusta con las estaciones).
  - ABI-L2-LSTF: temperatura de la SUPERFICIE (K), disco completo, cada hora, ~10 km, sólo cielo despejado (no es la del aire).
Se recorta a [-94.2, 16.0, -90.0, 19.0] en una malla de 0.05°. La lluvia se acumula por hora (cada archivo de 10 min = tasa × 1/6 h) y
se guardan 72 h en un estado (caché de Actions, no se sube al repositorio). Salida: goes_latest.json con acumulados de 1, 3, 6, 24 y 72 h
y la última temperatura de superficie (°C), en enteros base64 (lluvia ×10, temperatura ×10, -9999 sin dato).
Uso: python src/satelite_goes.py <carpeta de estado> <archivo de salida>
"""
import base64, datetime as dt, io, json, os, re, sys, time
from pathlib import Path
import numpy as np
import requests
import h5py

BUCKET = 'https://noaa-goes19.s3.amazonaws.com'
MARCO = [-94.2, 16.0, -90.0, 19.0]
PASO = 0.05
HORAS_ESTADO = 72
RELLENO_MAX_H = 6          # la primera vez (sin estado) sólo se bajan 6 h hacia atrás
UTC = dt.timezone.utc


def malla():
    W, S, E, N = MARCO
    nx, ny = int(round((E - W) / PASO)), int(round((N - S) / PASO))
    lon = W + (np.arange(nx) + .5) * PASO; lat = N - (np.arange(ny) + .5) * PASO
    return np.meshgrid(lon, lat)


def listar(prod, t):
    pref = f"{prod}/{t:%Y}/{t.timetuple().tm_yday:03d}/{t:%H}/"
    r = requests.get(f'{BUCKET}/?list-type=2&prefix={pref}', timeout=60); r.raise_for_status()
    return sorted(re.findall(r'<Key>([^<]+\.nc)</Key>', r.text))


def inicio(key):
    m = re.search(r'_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})', key)
    y, j, H, M, S = map(int, m.groups())
    return dt.datetime(y, 1, 1, H, M, S, tzinfo=UTC) + dt.timedelta(days=j - 1)


def leer(key, var):
    r = requests.get(f'{BUCKET}/{key}', timeout=300); r.raise_for_status()
    f = h5py.File(io.BytesIO(r.content), 'r')
    p = f['goes_imager_projection'].attrs
    H = float(p['perspective_point_height'][0]) + float(p['semi_major_axis'][0])
    req, rpol = float(p['semi_major_axis'][0]), float(p['semi_minor_axis'][0]); lon0 = float(p['longitude_of_projection_origin'][0])

    def eje(n):
        d = f[n]; a = d.attrs
        return d[:].astype(float) * float(a.get('scale_factor', [1])[0]) + float(a.get('add_offset', [0])[0])
    x, y = eje('x'), eje('y')
    LO, LA = malla()
    # lat/lon -> ángulos de exploración (ecuaciones del GOES-R PUG, vol. 4, 5.1.2.8.1)
    lat = np.radians(LA); lon = np.radians(LO); l0 = np.radians(lon0)
    e2 = 1 - (rpol / req) ** 2
    phic = np.arctan((rpol / req) ** 2 * np.tan(lat))
    rc = rpol / np.sqrt(1 - e2 * np.cos(phic) ** 2)
    sx = H - rc * np.cos(phic) * np.cos(lon - l0); sy = -rc * np.cos(phic) * np.sin(lon - l0); sz = rc * np.sin(phic)
    xs = np.arcsin(-sy / np.sqrt(sx ** 2 + sy ** 2 + sz ** 2)); ys = np.arctan(sz / sx)
    ix = np.clip(np.round((xs - x[0]) / (x[1] - x[0])).astype(int), 0, len(x) - 1)
    iy = np.clip(np.round((ys - y[0]) / (y[1] - y[0])).astype(int), 0, len(y) - 1)
    i0, i1, j0, j1 = iy.min(), iy.max() + 1, ix.min(), ix.max() + 1
    d = f[var]; a = d.attrs
    raw = d[i0:i1, j0:j1]
    if str(a.get('_Unsigned', b'false')).lower().find('true') >= 0: raw = raw.astype(np.int16).view(np.uint16)
    fill = a.get('_FillValue', [None])[0]
    val = raw.astype(float) * float(a.get('scale_factor', [1])[0]) + float(a.get('add_offset', [0])[0])
    if fill is not None: val[raw == fill] = np.nan
    if 'DQF' in f:
        q = f['DQF'][i0:i1, j0:j1]; val[q != 0] = np.nan
    out = val[iy - i0, ix - j0]
    f.close()
    return out


def b64(a, k):
    v = np.where(np.isfinite(a), np.round(a * k), -9999).astype('<i2')
    return base64.b64encode(v.tobytes()).decode()


def main():
    est_dir, salida = Path(sys.argv[1]), Path(sys.argv[2])
    est_dir.mkdir(parents=True, exist_ok=True); estf = est_dir / 'goes_estado.npz'
    ahora = dt.datetime.now(UTC)
    horas, hechos = {}, set()
    if estf.exists():
        z = np.load(estf, allow_pickle=True)
        horas = {k: v for k, v in z['horas'].item().items()}; hechos = set(z['hechos'].tolist())
    corte = ahora - dt.timedelta(hours=HORAS_ESTADO)
    horas = {k: v for k, v in horas.items() if dt.datetime.fromisoformat(k.split('#')[0]) >= corte}
    desde = ahora - dt.timedelta(hours=RELLENO_MAX_H if not horas else HORAS_ESTADO)
    t = desde.replace(minute=0, second=0, microsecond=0); nuevos = 0; t0 = time.time()
    while t <= ahora and time.time() - t0 < 900:
        try: keys = listar('ABI-L2-RRQPEF', t)
        except Exception as e: print('lista', t, e); keys = []
        print(f'RRQPEF {t:%Y-%m-%d %H} UTC: {len(keys)} archivos')
        for k in keys:
            if k in hechos: continue
            s = inicio(k)
            if s < desde: hechos.add(k); continue
            try: r = leer(k, 'RRQPE')
            except Exception as e: print('lectura', k, str(e)[:120]); continue
            hk = s.replace(minute=0, second=0, microsecond=0).isoformat()
            a = horas.get(hk); a = np.zeros_like(r) if a is None else a
            horas[hk] = a + np.nan_to_num(r) / 6.0
            cnt = horas.get(hk + '#n', np.zeros(1)); horas[hk + '#n'] = cnt + 1
            hechos.add(k); nuevos += 1
        t += dt.timedelta(hours=1)
    if nuevos == 0 and not horas:     # diagnóstico: qué productos ABI-L2 hay en el depósito
        for b in ('noaa-goes19', 'noaa-goes18', 'noaa-goes16'):
            try:
                r = requests.get(f'https://{b}.s3.amazonaws.com/?list-type=2&delimiter=/&prefix=ABI-L2-R', timeout=60)
                print(b, re.findall(r'<Prefix>([^<]+)</Prefix>', r.text)[:20])
                r = requests.get(f'https://{b}.s3.amazonaws.com/?list-type=2&prefix=ABI-L2-RRQPEF/{ahora:%Y}/{ahora.timetuple().tm_yday:03d}/&max-keys=3', timeout=60)
                print(b, 'RRQPEF hoy:', re.findall(r'<Key>([^<]+)</Key>', r.text)[:3])
                pre = 'ABI-L2-RRQPEF/'
                for _ in range(3):
                    r = requests.get(f'https://{b}.s3.amazonaws.com/?list-type=2&delimiter=/&prefix={pre}', timeout=60)
                    ps = re.findall(r'<Prefix>([^<]+)</Prefix>', r.text)[1:]
                    if not ps: break
                    print(b, pre, '->', ps[-3:]); pre = ps[-1]
            except Exception as e: print(b, e)
    hechos = {k for k in hechos if inicio(k) >= corte}
    np.savez_compressed(estf, horas=np.array(horas, dtype=object), hechos=np.array(sorted(hechos)))
    hs = sorted(k for k in horas if '#' not in k)
    ult = dt.datetime.fromisoformat(hs[-1]) if hs else ahora
    acum, cobertura = {}, {}
    for h in (1, 3, 6, 24, 72):
        ks = [k for k in hs if dt.datetime.fromisoformat(k) > ult - dt.timedelta(hours=h)]
        n = sum(int(horas[k + '#n'][0]) for k in ks if k + '#n' in horas)
        if not ks: continue
        acum[str(h)] = b64(sum(horas[k] for k in ks), 10); cobertura[str(h)] = round(n / (6 * h), 2)
    lst, lst_t = None, None
    for back in range(0, 4):
        tt = ahora - dt.timedelta(hours=back)
        try: keys = listar('ABI-L2-LSTF', tt)
        except Exception: keys = []
        if keys:
            try: lst = leer(keys[-1], 'LST') - 273.15; lst_t = inicio(keys[-1]); break
            except Exception as e: print('LST', str(e)[:120])
    LO, _ = malla()
    out = {'fuente': 'NOAA GOES-19 ABI L2 (AWS noaa-goes19): RRQPEF tasa de lluvia 10 min y LSTF temperatura de superficie horaria',
           'generado_utc': ahora.isoformat(), 'marco': MARCO, 'paso': PASO, 'nx': LO.shape[1], 'ny': LO.shape[0], 'orden': 'filas de norte a sur',
           'lluvia': {'ultima_hora_utc': ult.isoformat() if hs else None, 'escala': 10, 'sin_dato': -9999, 'acumulados_mm_b64': acum,
                      'cobertura_archivos': cobertura, 'nota': 'infrarrojo: subestima la lluvia de nortes; usar como forma, ajustada con estaciones'},
           'lst': {'fecha_utc': lst_t.isoformat() if lst_t else None, 'escala': 10, 'sin_dato': -9999, 'c_b64': b64(lst, 10) if lst is not None else None,
                   'nota': 'temperatura de la superficie con cielo despejado, no la del aire; sin dato bajo nubes'}}
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    print(f"archivos nuevos {nuevos}; horas en estado {len(hs)}; cobertura {cobertura}; LST {lst_t}; "
          f"lluvia 24 h máx {max((np.frombuffer(base64.b64decode(acum['24']), '<i2').max() / 10) if '24' in acum else 0, 0):.1f} mm")


if __name__ == '__main__':
    main()
