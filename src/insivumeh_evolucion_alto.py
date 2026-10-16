"""Evolución real El Tigre / El Porvenir desde el histórico Alto Usumacinta (fresco).

Aditivo y tolerante a fallas: lo llama alto-usumacinta-hidro.yml después de actualizar
latest.json. Solo reescribe los campos de evolución (insivumeh_evolucion_real,
senal_usumacinta_alta) en latest.json y ultima_evolucion_real en insivumeh_historico.json,
que estaban congelados desde el 07/10 porque ese histórico ya no se publica.
No toca registros, semáforos ni ningún otro campo. Cualquier error -> no escribe nada.
"""
import json
from datetime import datetime
from pathlib import Path

BASE = Path('data/fuentes_publicas')


def instant(r):
    try:
        return datetime.strptime(f"{r['fecha']} {r['hora']}", '%d/%m/%Y %H:%M')
    except (KeyError, TypeError, ValueError):
        return None


def observed(r):
    return {x.get('estacion'): x for x in r.get('estaciones', [])
            if x.get('estado_dato', 'observado') == 'observado' and x.get('nivel_instantaneo_m') is not None}


def evolution():
    regs = json.loads((BASE / 'insivumeh_alto_hidro_historico.json').read_text(encoding='utf-8')).get('registros', [])
    regs = sorted([r for r in regs if instant(r)], key=instant)
    if len(regs) < 2:
        return []
    a, b = regs[-2], regs[-1]
    hours = (instant(b) - instant(a)).total_seconds() / 3600
    if hours <= 0 or hours > 48:
        return []
    old, new = observed(a), observed(b)
    ev = []
    for name, x in new.items():
        o = old.get(name)
        if not o:
            continue
        dn = x['nivel_instantaneo_m'] - o['nivel_instantaneo_m']
        q1, q0 = x.get('caudal_instantaneo_m3s'), o.get('caudal_instantaneo_m3s')
        dq = round(q1 - q0, 2) if q1 is not None and q0 is not None else None
        ev.append({'estacion': name, 'rio': x.get('rio'), 'desde': f"{a['fecha']} {a['hora']}",
                   'hasta': f"{b['fecha']} {b['hora']}", 'horas_transcurridas': round(hours, 2),
                   'delta_nivel_m': round(dn, 3), 'delta_caudal_m3s': dq,
                   'tendencia_calculada': 'incrementando' if dn > 0.02 else 'disminuyendo' if dn < -0.02 else 'estable',
                   'fuente_evolucion': 'insivumeh_alto_hidro_historico'})
    return ev


def signal(ev):
    e = next((x for x in ev if x.get('estacion') == 'El Tigre'), None)
    if not e:
        return 'Sin tendencia comparable aguas arriba'
    return {'incrementando': 'Señal aguas arriba en aumento', 'estable': 'Señal aguas arriba estable',
            'disminuyendo': 'Señal aguas arriba disminuyendo'}[e['tendencia_calculada']]


def main():
    try:
        ev = evolution()
    except Exception as exc:  # nunca rompe la publicación
        print('Evolución INSIVUMEH no calculada:', exc)
        return
    if not ev:
        print('Evolución INSIVUMEH: sin dos cortes comparables; se conservan los campos.')
        return
    for name, fields in (('latest.json', {'insivumeh_evolucion_real': ev, 'senal_usumacinta_alta': signal(ev)}),
                         ('insivumeh_historico.json', {'ultima_evolucion_real': ev, 'senal_usumacinta_alta': signal(ev)})):
        p = BASE / name
        try:
            d = json.loads(p.read_text(encoding='utf-8'))
            if all(d.get(k) == v for k, v in fields.items()):
                continue
            d.update(fields)
            p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print('Evolución actualizada en', name, ev[0]['desde'], '→', ev[0]['hasta'])
        except Exception as exc:
            print('No se actualizó', name, exc)


if __name__ == '__main__':
    main()
