import re
from pathlib import Path

ANALISIS = Path('data/analysis/latest.md')
FUENTE1 = Path('data/latest/FUENTE1.txt')
FUENTE2 = Path('data/latest/FUENTE2.txt')


def header(text, key):
    m = re.search(rf'^{re.escape(key)}:\s*(.+)$', text, re.M | re.I)
    return m.group(1).strip() if m else 's/d'


def first_line(text, pattern):
    rx = re.compile(pattern, re.I)
    for raw in text.splitlines():
        if rx.search(raw):
            return raw.strip()
    return None


def nums(line):
    if not line:
        return []
    return [float(x.replace(',', '')) for x in re.findall(r'(?<!\S)-?\d+(?:,\d{3})*(?:\.\d+)?(?!\S)', line)]


def lacantun_block(f1):
    line = first_line(f1, r'\bBHG21\s+Lacant[uú]n\b')
    if not line:
        return (
            '### Frontera Sur · Lacantún y cuencas altas\n'
            'El boletín de Frontera Sur fue consultado, pero no se identificó una fila numérica estructurada de Lacantún para este corte; se mantiene s/d y no se estima desde mapas.\n\n'
        )

    # Algunas páginas PDF extraídas colocan dos estaciones en la misma línea. Tomar únicamente
    # el segmento a partir de BHG21 Lacantún para no capturar valores de la estación precedente.
    m = re.search(r'\bBHG21\s+Lacant[uú]n\b(.*)$', line, re.I)
    segment = m.group(0) if m else line
    # Eliminar el identificador BHG21 para que el "21" no se interprete como dato numérico.
    segment = re.sub(r'^\s*BHG21\s+', '', segment, flags=re.I)
    n = nums(segment)

    # Formato observado FUENTE1:
    # Lacantún Ocosingo 142 138.33 274.45 138.33 274.45 0.0 34.0 22.5
    # NAMO, día anterior nivel/gasto, actual nivel/gasto, precipitación, Tmax, Tmin.
    nivel = n[3] if len(n) >= 8 else None
    gasto = n[4] if len(n) >= 8 else None
    lluvia = n[5] if len(n) >= 8 else None
    tmax = n[6] if len(n) >= 8 else None
    tmin = n[7] if len(n) >= 8 else None
    f = lambda v, d=2: 's/d' if v is None else f'{v:.{d}f}'
    return (
        '### Frontera Sur · Lacantún y cuencas altas\n'
        'El boletín del Organismo de Cuenca Frontera Sur se usa como complemento de la cuenca alta; sus datos no sustituyen el corte local de CONAGUA Tabasco.\n\n'
        '| Estación | Nivel actual | Gasto | Lluvia 24 h | Temp. máx. | Temp. mín. | Fuente |\n'
        '|---|---:|---:|---:|---:|---:|---|\n'
        f'| Lacantún (BHG21, Ocosingo) | {f(nivel)} m | {f(gasto)} m³/s | {f(lluvia,1)} mm | {f(tmax,1)} °C | {f(tmin,1)} °C | Frontera Sur / FUENTE1 |\n\n'
    )


def freshness_block(f1, f2):
    return (
        '## Control de fuentes y hora real de actualización\n'
        '| Producto | Fecha/hora del mensaje | Fecha/hora de recolección | Uso operativo |\n'
        '|---|---|---|---|\n'
        f"| CONAGUA Tabasco / FUENTE2 | {header(f2,'FECHA/HORA MENSAJE')} | {header(f2,'FECHA/HORA RECOLECCIÓN')} | Corte local de niveles, gasto, lluvia y temperatura. |\n"
        f"| Frontera Sur / FUENTE1 | {header(f1,'FECHA/HORA MENSAJE')} | {header(f1,'FECHA/HORA RECOLECCIÓN')} | Presas, Alto/Medio Grijalva y complemento Alto Usumacinta/Lacantún. |\n\n"
        'Regla de calidad: un vacío no equivale a cero; no se inventan valores. Cuando una variable no se publica en el corte más reciente, se conserva s/d o el último dato válido únicamente cuando el producto operativo lo admite y queda identificado como heredado.\n\n'
    )


def main():
    if not ANALISIS.exists():
        raise SystemExit('No existe data/analysis/latest.md')
    text = ANALISIS.read_text(encoding='utf-8-sig')
    f1 = FUENTE1.read_text(encoding='utf-8-sig') if FUENTE1.exists() else ''
    f2 = FUENTE2.read_text(encoding='utf-8-sig') if FUENTE2.exists() else ''

    text = re.sub(r'\n## Control de fuentes y hora real de actualización\n.*?(?=\n## |\Z)', '\n', text, flags=re.S)
    text = re.sub(r'\n### Frontera Sur · Lacantún y cuencas altas\n.*?(?=\n## |\n### |\Z)', '\n', text, flags=re.S)

    marker = '\n## 3. Ríos Serranos y Bajo Grijalva'
    block = lacantun_block(f1)
    if marker in text:
        text = text.replace(marker, '\n' + block + marker, 1)
    else:
        text = text.rstrip() + '\n\n' + block

    source_marker = '\n## Fuentes y calidad'
    fb = freshness_block(f1, f2)
    if source_marker in text:
        text = text.replace(source_marker, '\n' + fb + source_marker, 1)
    else:
        text = text.rstrip() + '\n\n' + fb

    ANALISIS.write_text(text.rstrip() + '\n', encoding='utf-8')
    print('Análisis complementado con FUENTE1/FUENTE2 sin alterar la estructura operativa existente.')


if __name__ == '__main__':
    main()
