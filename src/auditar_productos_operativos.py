import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path

BASE = Path('data/niveles')
OUT_DIR = BASE / 'Auditoria'
OUT = OUT_DIR / 'ultimo_resultado.json'

LEVELS = BASE / 'Ultimo_Corte' / 'ultimo_resumen.json'
RAIN = BASE / 'Lluvia_CONAGUA' / 'ultimo_corte.json'
CLIMATE = BASE / 'Clima_CONAGUA' / 'ultimo_corte.json'

EXPECTED_STATIONS = {
    'Samaria': (-2, 25),
    'González': (-5, 15),
    'Oxolotán': (15, 55),
    'Tapijulapa': (-2, 35),
    'Teapa': (15, 50),
    'Puyacatengo': (5, 40),
    'San Joaquín': (0, 35),
    'Pueblo Nuevo': (-5, 15),
    'Gaviotas': (-5, 15),
    'El Muelle': (-5, 15),
    'Porvenir': (-5, 15),
    'Salto de Agua': (-5, 20),
    'Macuspana': (-5, 20),
    'San Pedro': (-2, 15),
    'Boca del Cerro': (-2, 25),
}

CODE_RE = re.compile(r'\b(?:BHG\d+|AFT\d+|AF\d+|OB\d+|PIAE|ACNA\d+|ACFE\d+|APC\d+|ATUX\d+|CLIM-?\d+)\b', re.I)


def load(path):
    if not path.exists():
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding='utf-8-sig'))


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v))


def iso(v):
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        return datetime.fromisoformat(v.replace('Z', '+00:00'))
    except Exception:
        return None


def audit_levels(errors, warnings, stats):
    rows = load(LEVELS)
    if not isinstance(rows, list):
        errors.append('Niveles: ultimo_resumen.json no es una lista.')
        return

    stats['niveles_filas'] = len(rows)
    by_name = {str(r.get('estacion')): r for r in rows if isinstance(r, dict)}
    missing = sorted(set(EXPECTED_STATIONS) - set(by_name))
    extras = sorted(set(by_name) - set(EXPECTED_STATIONS))
    if missing:
        errors.append('Niveles: faltan estaciones críticas: ' + ', '.join(missing))
    if extras:
        warnings.append('Niveles: estaciones adicionales no previstas: ' + ', '.join(extras))

    cuts = set()
    inherited = 0
    for name, (lo, hi) in EXPECTED_STATIONS.items():
        r = by_name.get(name)
        if not r:
            continue
        level = r.get('ultimo_nivel')
        if not num(level):
            errors.append(f'Niveles/{name}: último nivel no numérico.')
            continue
        if not lo <= float(level) <= hi:
            errors.append(f'Niveles/{name}: {level} m fuera del rango estructural de control [{lo}, {hi}] m.')

        cut = iso(r.get('fecha_hora'))
        if not cut:
            errors.append(f'Niveles/{name}: fecha_hora inválida o ausente.')
        else:
            cuts.add(cut.isoformat())

        state = r.get('estado_dato')
        real = iso(r.get('ultima_actualizacion_real'))
        if state not in ('observado', 'heredado'):
            errors.append(f'Niveles/{name}: estado_dato inválido: {state!r}.')
        elif state == 'observado':
            if not real or not cut or real != cut:
                errors.append(f'Niveles/{name}: marcado observado pero última actualización real no coincide con el corte.')
        else:
            inherited += 1
            if not real or not cut or real >= cut:
                errors.append(f'Niveles/{name}: marcado heredado sin una lectura real anterior al corte.')

        base = r.get('nivel_base_06')
        delta = r.get('delta_vs_06')
        if num(base) and num(delta):
            calc = float(level) - float(base)
            if abs(calc - float(delta)) > 0.011:
                errors.append(f'Niveles/{name}: delta_vs_06={delta} no coincide con nivel-base ({calc:.3f}).')

    if len(cuts) > 1:
        errors.append('Niveles: el resumen mezcla más de un corte horario: ' + ', '.join(sorted(cuts)))
    stats['niveles_cortes'] = sorted(cuts)
    stats['niveles_heredados'] = inherited


def audit_rain(errors, warnings, stats):
    rows = load(RAIN)
    if not isinstance(rows, list):
        errors.append('Lluvia CONAGUA: ultimo_corte.json no es una lista.')
        return
    stats['lluvia_filas'] = len(rows)
    if len(rows) < 20:
        errors.append(f'Lluvia CONAGUA: sólo {len(rows)} filas; extracción estructural posiblemente incompleta.')

    for r in rows:
        if not isinstance(r, dict):
            continue
        name = str(r.get('estacion') or '?')
        for field, state_field in (
            ('lluvia_24h_precedentes_mm', 'estado_24h'),
            ('lluvia_hoy_desde_08_mm', 'estado_hoy'),
            ('lluvia_48h_precedentes_mm', 'estado_48h'),
        ):
            v = r.get(field)
            st = r.get(state_field)
            if st == 'observado':
                if not num(v):
                    errors.append(f'Lluvia/{name}: {field} está observado pero no tiene valor numérico.')
                elif not 0 <= float(v) <= 500:
                    errors.append(f'Lluvia/{name}: {field}={v} mm fuera de rango físico de control.')
            elif st == 'sin_dato':
                if v is not None:
                    errors.append(f'Lluvia/{name}: {field} tiene valor {v} pero está marcado sin_dato.')
            elif st is not None:
                errors.append(f'Lluvia/{name}: estado inválido {state_field}={st!r}.')

        v24 = r.get('lluvia_24h_precedentes_mm')
        v48 = r.get('lluvia_48h_precedentes_mm')
        if r.get('estado_24h') == 'observado' and r.get('estado_48h') == 'observado' and num(v24) and num(v48):
            if float(v48) + 0.001 < float(v24):
                errors.append(f'Lluvia/{name}: acumulado 48 h ({v48}) es menor que 24 h ({v24}).')
            if not r.get('fecha_referencia_48h'):
                errors.append(f'Lluvia/{name}: 48 h observado sin fecha_referencia_48h.')


def audit_climate(errors, warnings, stats):
    data = load(CLIMATE)
    if not isinstance(data, dict):
        errors.append('Clima CONAGUA/Frontera Sur: ultimo_corte.json no es un objeto.')
        return

    local = data.get('conagua_tabasco') or []
    fs = data.get('frontera_sur') or []
    stats['clima_conagua_filas'] = len(local)
    stats['clima_frontera_sur_filas'] = len(fs)
    if len(local) < 10:
        errors.append(f'Clima CONAGUA Tabasco: sólo {len(local)} estaciones válidas; extracción posiblemente incompleta.')
    if len(fs) < 20:
        errors.append(f'Clima Frontera Sur: sólo {len(fs)} estaciones válidas; extracción posiblemente incompleta.')

    def check_row(r, prefix, has_code=False):
        name = str(r.get('estacion') or '?')
        rain = r.get('lluvia_24h_mm')
        tmax = r.get('temp_max_c')
        tmin = r.get('temp_min_c')
        if not num(rain) or not 0 <= float(rain) <= 500:
            errors.append(f'{prefix}/{name}: lluvia_24h_mm inválida: {rain!r}.')
        if not num(tmax) or not 10 <= float(tmax) <= 55:
            errors.append(f'{prefix}/{name}: temperatura máxima inválida: {tmax!r}.')
        if not num(tmin) or not -5 <= float(tmin) <= 40:
            errors.append(f'{prefix}/{name}: temperatura mínima inválida: {tmin!r}.')
        if num(tmax) and num(tmin) and float(tmax) < float(tmin):
            errors.append(f'{prefix}/{name}: Tmax {tmax} < Tmin {tmin}.')
        if has_code:
            code = str(r.get('codigo') or '')
            if not code:
                errors.append(f'{prefix}/{name}: falta código de estación.')
            # Un nombre que todavía contiene otro código indica que el PDF de doble columna
            # no fue separado correctamente (ej. "Aquespala ... BHG18 ...").
            other_codes = [m.group(0).upper() for m in CODE_RE.finditer(name) if m.group(0).upper() != code.upper()]
            if other_codes:
                errors.append(f'{prefix}/{code}: nombre contaminado por otro código de columna: {", ".join(other_codes)}.')

    for r in local:
        if isinstance(r, dict):
            check_row(r, 'Clima CONAGUA')
    for r in fs:
        if isinstance(r, dict):
            check_row(r, 'Clima Frontera Sur', True)


def main():
    errors = []
    warnings = []
    stats = {}
    try:
        audit_levels(errors, warnings, stats)
        audit_rain(errors, warnings, stats)
        audit_climate(errors, warnings, stats)
    except Exception as exc:
        errors.append(f'Fallo de auditoría: {type(exc).__name__}: {exc}')

    result = {
        'ok': not errors,
        'errores': errors,
        'advertencias': warnings,
        'estadisticas': stats,
        'regla': (
            'La publicación se bloquea sólo ante inconsistencias estructurales demostrables: '
            'estaciones críticas ausentes, rangos físicamente imposibles, estados observado/heredado incoherentes, '
            'acumulados 48 h incompatibles, temperaturas inválidas o mezcla de columnas/códigos. '
            'Cambios hidrometeorológicos reales no se rechazan sólo por ser inusuales.'
        ),
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if errors:
        sys.exit(2)


if __name__ == '__main__':
    main()
