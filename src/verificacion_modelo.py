"""Verificación del Modelo Rubio/SegAMH contra lo observado (27-oct-2026).

Lee el historial git de data/modelo_rubio/latest.json (una corrida por hora que publica la PC) y los niveles observados
(data/niveles/Historico/niveles_historicos.json) y escribe data/modelo_rubio/verificacion.json con los pares
pronóstico–observado a H+24, H+36 y H+72 de los últimos 60 días. El modelo (V107o) lo lee para corregir su sesgo sólo
donde la corrección baja el error en días que no se usaron para calcularla.

Usa el nivel crudo (antes de la corrección V107o) cuando la corrida lo publica, para que la corrección no se mida contra sí
misma. 'h0' = último nivel observado al emitir (≤ 14 h antes), para comparar contra la persistencia."""
import datetime as dt
import json
import subprocess
from pathlib import Path

LATEST = 'data/modelo_rubio/latest.json'
OUT = Path('data/modelo_rubio/verificacion.json')
HIST = Path('data/niveles/Historico/niveles_historicos.json')
TZ = dt.timezone(dt.timedelta(hours=-6))
# etiqueta de la corrida -> estación observada
EST = {'Tapijulapa': 'Tapijulapa', 'Teapa · Teapa': 'Teapa', 'San Joaquín': 'San Joaquín', 'Puyacatengo · Puyacatengo': 'Puyacatengo',
       'Pueblo Nuevo': 'Pueblo Nuevo', 'Boca del Cerro': 'Boca del Cerro', 'Samaria · Samaria': 'Samaria', 'González': 'González',
       'Gaviotas': 'Gaviotas', 'El Muelle': 'El Muelle', 'Salto de Agua': 'Salto de Agua', 'Macuspana': 'Macuspana'}


def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True).stdout


def main():
    obs = {}
    for r in json.loads(HIST.read_text(encoding='utf-8')):
        if r.get('estado_dato') == 'observado' and r.get('nivel') is not None:
            obs[(r['estacion'], dt.datetime.fromisoformat(r['fecha_hora']).astimezone(dt.timezone.utc).replace(minute=0, second=0, microsecond=0))] = float(r['nivel'])
    desde = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=60)).date().isoformat()
    pares, vistos, corridas = [], set(), 0
    for h in filter(None, git('log', f'--since={desde}', '--format=%h', '--', LATEST).split('\n')):
        try:
            L = json.loads(git('show', f'{h}:{LATEST}'))
            run = dt.datetime.fromisoformat(L['calculado_utc'].replace('Z', '+00:00')).replace(minute=0, second=0, microsecond=0)
        except Exception:
            continue
        if run in vistos:
            continue
        vistos.add(run); corridas += 1
        for e in L.get('estaciones', []):
            est = next((v for k, v in EST.items() if k in e.get('estacion', '')), None)
            if not est:
                continue
            for H, k in ((24, 'h24'), (36, 'h36'), (72, 'h72')):
                c = e.get(k) or {}
                f = c.get('nivel_crudo_m', c.get('nivel_m'))
                obj = run + dt.timedelta(hours=H)
                o = obs.get((est, obj))
                if f is None or o is None:
                    continue
                h0 = next((obs[(est, run - dt.timedelta(hours=b))] for b in range(15) if (est, run - dt.timedelta(hours=b)) in obs), None)
                pares.append({'est': est, 'h': H, 'emitido': run.isoformat(), 'objetivo': obj.isoformat(), 'pron': f, 'obs': o,
                              'h0': h0, 'version': L.get('version')})
    pares.sort(key=lambda p: (p['est'], p['h'], p['objetivo'], p['emitido']))
    doc = {'producto': 'Verificación Modelo Rubio/SegAMH: pronóstico (crudo) vs nivel observado CONAGUA',
           'generado_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'corridas': corridas,
           'ventana_dias': 60, 'pares': pares}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{corridas} corridas, {len(pares)} pares -> {OUT}')


if __name__ == '__main__':
    main()
