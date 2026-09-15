import json
import re
from pathlib import Path

F1 = Path('data/latest/FUENTE1.txt')
F2 = Path('data/latest/FUENTE2.txt')
OUT_DIR = Path('data/niveles/Clima_CONAGUA')
OUT = OUT_DIR / 'ultimo_corte.json'
STATE = OUT_DIR / 'Estado_Clima_CONAGUA.json'


def header(text, key):
    m = re.search(rf'^{re.escape(key)}:\s*(.+)$', text, re.M | re.I)
    return m.group(1).strip() if m else None


def nums(text):
    # No capturar dígitos incrustados en códigos de estación (p. ej. ACNA17,
    # BHG3, AFT10). En las tablas de FUENTE1 dos columnas pueden quedar
    # concatenadas en una misma línea durante la extracción del PDF; tomar el
    # sufijo numérico de un código como si fuera lluvia desplazaba lluvia/Tmax/Tmin.
    return [
        float(x.replace(',', ''))
        for x in re.findall(
            r'(?<![A-Za-z0-9])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?![A-Za-z0-9])',
            text,
        )
    ]


def plausible_temp(tmax, tmin):
    return 10 <= tmax <= 55 and -5 <= tmin <= 40 and tmax >= tmin


def local_name(line):
    names = [
        'Samaria','Oxolotán','Puyacatengo','Tapijulapa','San Joaquín','Teapa','González',
        'Pueblo Nuevo','Gaviotas','Muelle','Porvenir','Observatorio de Villahermosa (OBS-TB)',
        'Salto de Agua','Macuspana','Boca del Cerro','San Pedro'
    ]
    low = line.lower().lstrip('* ').strip()
    for name in names:
        if low.startswith(name.lower()):
            return 'El Muelle' if name == 'Muelle' else name
    return None


def parse_fuente2(text):
    rows = []
    msg = header(text, 'FECHA/HORA MENSAJE')
    rec = header(text, 'FECHA/HORA RECOLECCIÓN')
    for raw in text.splitlines():
        line = raw.strip()
        name = local_name(line)
        if not name:
            continue
        n = nums(line)
        # Formato local: ... precip, Tmax, Tmin, diferencia 24h, diferencia NAMO.
        # Sólo se acepta cuando Tmax/Tmin son físicamente plausibles; de lo contrario queda s/d.
        rain = tmax = tmin = None
        if len(n) >= 5:
            cand_rain, cand_tmax, cand_tmin = n[-5], n[-4], n[-3]
            if 0 <= cand_rain <= 500 and plausible_temp(cand_tmax, cand_tmin):
                rain, tmax, tmin = cand_rain, cand_tmax, cand_tmin
        if rain is None and tmax is None and tmin is None:
            continue
        rows.append({
            'estacion': name,
            'lluvia_24h_mm': rain,
            'temp_max_c': tmax,
            'temp_min_c': tmin,
            'fecha_hora_mensaje': msg,
            'fecha_hora_recoleccion': rec,
            'fuente': 'CONAGUA Tabasco / FUENTE2',
            'estado_dato': 'observado'
        })
    return rows


def parse_fuente1(text):
    rows = []
    msg = header(text, 'FECHA/HORA MENSAJE')
    rec = header(text, 'FECHA/HORA RECOLECCIÓN')
    code_rx = re.compile(r'^(BHG\d+|AFT\d+|AF\d+|OB\d+|PIAE|ACNA\d+|ACFE\d+|APC\d+|ATUX\d+|CLIM-?\d+)\s+(.+)$', re.I)
    for raw in text.splitlines():
        line = raw.strip()
        m = code_rx.match(line)
        if not m:
            continue
        code, rest = m.group(1), m.group(2)
        n = nums(rest)
        if len(n) < 3:
            continue
        cand_rain, cand_tmax, cand_tmin = n[-3], n[-2], n[-1]
        if not (0 <= cand_rain <= 500 and plausible_temp(cand_tmax, cand_tmin)):
            continue
        first_num = re.search(r'(?<![A-Za-z0-9])[-+]?\d', rest)
        label = rest[:first_num.start()].strip() if first_num else rest.strip()
        label = re.sub(r'\s+', ' ', label).strip(' -')
        if not label:
            label = code
        rows.append({
            'codigo': code,
            'estacion': label,
            'lluvia_24h_mm': cand_rain,
            'temp_max_c': cand_tmax,
            'temp_min_c': cand_tmin,
            'fecha_hora_mensaje': msg,
            'fecha_hora_recoleccion': rec,
            'fuente': 'OCFS Frontera Sur / FUENTE1',
            'estado_dato': 'observado'
        })
    # Deduplicar por código conservando la última fila válida del boletín.
    d = {}
    for r in rows:
        d[r.get('codigo') or r['estacion']] = r
    return list(d.values())


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    t1 = F1.read_text(encoding='utf-8-sig') if F1.exists() else ''
    t2 = F2.read_text(encoding='utf-8-sig') if F2.exists() else ''
    r2 = parse_fuente2(t2)
    r1 = parse_fuente1(t1)
    payload = {'conagua_tabasco': r2, 'frontera_sur': r1}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    state = {
        'complete': bool(r1 or r2),
        'conagua_tabasco_estaciones_con_clima': len(r2),
        'frontera_sur_estaciones_con_clima': len(r1),
        'regla': 'Sólo se publican lluvia y temperaturas cuando la fila contiene valores numéricos estructurados y físicamente plausibles. Ausencia = s/d; nunca se inventa ni se convierte a cero.'
    }
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(state, ensure_ascii=False))


if __name__ == '__main__':
    main()
