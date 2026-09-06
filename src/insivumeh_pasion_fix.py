import json
import re
import unicodedata
from pathlib import Path

LATEST = Path('data/fuentes_publicas/latest.json')


def normalize_pdf_text(value):
    text = unicodedata.normalize('NFKD', str(value or ''))
    text = text.encode('ascii', 'ignore').decode('ascii')
    # El PDF de INSIVUMEH puede separar visualmente una palabra acentuada:
    # "Pasi´ on" -> "Pasi on". Compactamos sólo espacios internos de
    # palabras objetivo conocidas, sin modificar números ni otros campos.
    text = re.sub(r'\bPasi\s+on\b', 'Pasion', text, flags=re.I)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_station(fragment, station, river_pattern, location='Las Cruces, Petén'):
    flat = normalize_pdf_text(fragment)
    pattern = (
        rf'{re.escape(station)}\s+{river_pattern}\s+Las\s+Cruces[^\d-]*'
        r'(-?\d+(?:\.\d+)?)\s+'
        r'(-?\d+(?:\.\d+)?)\s+'
        r'(-?\d+(?:\.\d+)?)\s+'
        r'(-?\d+(?:\.\d+)?)\s+'
        r'(-?\d+(?:\.\d+)?)\s+'
        r'(-?\d+(?:\.\d+)?)'
    )
    m = re.search(pattern, flat, re.I)
    if not m:
        return None
    vals = [float(x) for x in m.groups()]
    return {
        'estacion': station,
        'rio': 'La Pasión' if station == 'El Porvenir' else 'Usumacinta',
        'ubicacion': location,
        'nivel_referencia_min_m': vals[0],
        'nivel_referencia_max_m': vals[1],
        'caudal_referencia_min_m3s': vals[2],
        'caudal_referencia_max_m3s': vals[3],
        'nivel_instantaneo_m': vals[4],
        'caudal_instantaneo_m3s': vals[5],
        'calidad': 'extraido_del_BHVGM',
        'nota_referencia': 'Máximos como referencia estadística; no son umbral de inundación.'
    }


def main():
    if not LATEST.exists():
        return
    doc = json.loads(LATEST.read_text(encoding='utf-8'))
    ins = doc.get('insivumeh') or {}
    stations = ins.setdefault('estaciones_estructuradas', [])
    existing = {str(x.get('estacion', '')).strip().lower() for x in stations}
    fragments = ins.get('fragmentos_relevantes') or []

    # Prioridad: El Porvenir / río La Pasión. Se aceptan las variantes que
    # produce la extracción del PDF: Pasión, Pasion, Pasi on, Pasi´ on.
    if 'el porvenir' not in existing:
        for frag in fragments:
            row = extract_station(frag, 'El Porvenir', r'La\s+Pasion')
            if row:
                stations.append(row)
                existing.add('el porvenir')
                break

    # Salvaguarda equivalente para El Tigre, sin alterar un dato ya extraído.
    if 'el tigre' not in existing:
        for frag in fragments:
            row = extract_station(frag, 'El Tigre', r'Usumacinta')
            if row:
                stations.append(row)
                break

    LATEST.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
