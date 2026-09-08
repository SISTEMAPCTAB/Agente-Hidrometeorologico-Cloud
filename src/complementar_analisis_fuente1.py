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


def lacantun_values(f1):
    line = first_line(f1, r'\bBHG21\s+Lacant[uú]n\b')
    if not line:
        return None

    # Algunas extracciones PDF colocan dos estaciones en la misma línea.
    # Se toma únicamente el segmento que comienza en BHG21 Lacantún.
    m = re.search(r'\bBHG21\s+Lacant[uú]n\b(.*)$', line, re.I)
    segment = m.group(0) if m else line
    segment = re.sub(r'^\s*BHG21\s+', '', segment, flags=re.I)
    n = nums(segment)

    # Formato comprobado en FUENTE1:
    # Lacantún Ocosingo 142 138.33 274.45 138.33 274.45 0.0 34.0 22.5
    # NAMO, día anterior nivel/gasto, actual nivel/gasto, precipitación, Tmax, Tmin.
    if len(n) < 8:
        return None
    return {
        'nivel': n[3],
        'gasto': n[4],
        'lluvia': n[5],
        'tmax': n[6],
        'tmin': n[7],
    }


def integrate_lacantun_usumacinta(text, f1):
    """Coloca Lacantún dentro del apartado Usumacinta, antes de Boca del Cerro.

    Sólo usa la fila estructurada BHG21 de FUENTE1. Si no existe o no conserva
    la estructura comprobada, no inventa ni inserta valores.
    """
    v = lacantun_values(f1)
    if not v:
        return text

    # Eliminar una fila Lacantún previamente integrada para que la operación sea idempotente.
    text = re.sub(r'^\| Lacantún \(BHG21, Ocosingo\) \|.*\n', '', text, flags=re.M)

    row = (
        f"| Lacantún (BHG21, Ocosingo) | {v['nivel']:.2f} m; {v['gasto']:.2f} m³/s; "
        f"lluvia 24 h {v['lluvia']:.1f} mm | Aporte de cuenca alta antes de Boca del Cerro; "
        "valorar su tendencia junto con Guatemala y la respuesta posterior en Tenosique. |\n"
    )
    boca_row = re.compile(r'^(\| Boca del Cerro \|.*)$', re.M)
    if boca_row.search(text):
        text = boca_row.sub(row + r'\1', text, count=1)

    # Actualizar sólo la secuencia de vigilancia del apartado Usumacinta.
    text = text.replace(
        'La secuencia de vigilancia se mantiene Guatemala → Boca del Cerro/Tenosique → Balancán → Emiliano Zapata → Jonuta → Centla.',
        'La secuencia de vigilancia se mantiene Guatemala → Lacantún → Boca del Cerro/Tenosique → Balancán → Emiliano Zapata → Jonuta → Centla.',
        1,
    )
    return text


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
    # Retirar el antiguo subapartado separado: Lacantún queda integrado directamente
    # en el apartado 2 de Usumacinta, antes de Boca del Cerro.
    text = re.sub(r'\n### Frontera Sur · Lacantún y cuencas altas\n.*?(?=\n## |\n### |\Z)', '\n', text, flags=re.S)
    text = integrate_lacantun_usumacinta(text, f1)

    source_marker = '\n## Fuentes y calidad'
    fb = freshness_block(f1, f2)
    if source_marker in text:
        text = text.replace(source_marker, '\n' + fb + source_marker, 1)
    else:
        text = text.rstrip() + '\n\n' + fb

    ANALISIS.write_text(text.rstrip() + '\n', encoding='utf-8')
    print('Análisis complementado con Lacantún integrado en Usumacinta y control de fuentes.')


if __name__ == '__main__':
    main()
