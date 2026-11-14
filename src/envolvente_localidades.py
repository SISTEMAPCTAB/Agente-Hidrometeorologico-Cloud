"""Envolvente de la temporada de "Localidades que pueden afectarse" (14-nov-2026, Gilberto: "adelante" con la envolvente acumulada).

El modelo (V111ca) publica en data/modelo_rubio/latest.json, por corrida, las localidades de Tabasco que el cruce nivel -> mancha -> localidad
(V111bj) marca en algún horizonte (ahora, 24, 48, 72 h; central y alto). Este script recorre el historial git de latest.json desde el inicio de
la temporada (1 de junio) y arma data/modelo_rubio/envolvente_localidades.json: cada localidad con la primera y la última corrida en que
apareció, cuántas corridas, el peor caso (más agua sobre la normal) con su horizonte, escenario, referencia y nivel, y si fue "dentro" o sólo
"cerca". Se rehace completo cada vez (no se pierde nada si una corrida falla). Lo lee el modelo (panel) y el Agente."""
import datetime as dt
import json
import subprocess
from pathlib import Path

LATEST = 'data/modelo_rubio/latest.json'
OUT = Path('data/modelo_rubio/envolvente_localidades.json')
TZ = dt.timezone(dt.timedelta(hours=-6))


def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True).stdout


def inicio_temporada(hoy):
    y = hoy.year if hoy.month >= 6 else hoy.year - 1
    return dt.date(y, 6, 1)


def main():
    hoy = dt.datetime.now(TZ).date()
    ini = inicio_temporada(hoy)
    env, corridas, vistas = {}, 0, set()
    for h in reversed(list(filter(None, git('log', f'--since={ini.isoformat()}', '--format=%h', '--', LATEST).split('\n')))):
        try:
            d = json.loads(git('show', f'{h}:{LATEST}'))
        except Exception:
            continue
        loc = d.get('localidades_v111bj')
        cal = d.get('calculado_utc')
        if not loc or not cal or cal in vistas:
            continue
        vistas.add(cal)
        corridas += 1
        for x in loc.get('lista', []):
            c = str(x.get('cve'))
            e = env.get(c)
            peor = {k: x.get(k) for k in ('t', 'esc', 'cerca', 'extra', 'ref', 'x', 'u', 'desde')}
            if e is None:
                env[c] = e = {'cve': c, 'n': x.get('n'), 'mun': x.get('mun'), 'pob': x.get('pob'), 'primera': cal, 'ultima': cal,
                              'corridas': 0, 'dentro': False, 'peor': peor}
            e['ultima'] = cal
            e['corridas'] += 1
            e['dentro'] = e['dentro'] or not x.get('cerca')
            p = e['peor']
            # peor caso: "dentro" gana a "cerca"; después, más agua sobre la normal
            if (p.get('cerca') and not x.get('cerca')) or (bool(p.get('cerca')) == bool(x.get('cerca')) and (x.get('extra') or 0) > (p.get('extra') or 0)):
                e['peor'] = peor
    lista = sorted(env.values(), key=lambda e: (not e['dentro'], -(e.get('pob') or 0)))
    doc = {'producto': 'Envolvente de la temporada: localidades de Tabasco que el modelo marcó como posiblemente afectadas (V111bj/V111ca)',
           'temporada_desde': ini.isoformat(), 'generado_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
           'corridas_con_localidades': corridas, 'n_dentro': sum(1 for e in lista if e['dentro']),
           'n_cerca': sum(1 for e in lista if not e['dentro']),
           'hab_dentro': sum(e.get('pob') or 0 for e in lista if e['dentro']),
           'nota': 'Dentro = la mancha del nivel pronosticado cubre >= 1 % más de la localidad que con el nivel normal; cerca = >= 5 % más agua en 1 km. '
                   'Incluye ahora y pronóstico 24-72 h (central y alto). No es un registro de afectaciones: es lo que el modelo anticipó.',
           'localidades': lista}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{corridas} corridas con localidades; {doc["n_dentro"]} dentro + {doc["n_cerca"]} cerca -> {OUT}')


if __name__ == '__main__':
    main()
