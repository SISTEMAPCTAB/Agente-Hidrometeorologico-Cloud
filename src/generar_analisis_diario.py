import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo('America/Mexico_City')
OUT = Path('data/analysis/latest.md')
LEVELS = Path('data/niveles/Ultimo_Corte/ultimo_resumen.json')
R12 = Path('data/niveles/Resumen_12h/resumen_12h.json')
PUBLIC = Path('data/fuentes_publicas/latest.json')
HIST = Path('data/fuentes_publicas/insivumeh_historico.json')
WL_STATE = Path('data/weatherlink/Estado_WeatherLink_Cloud.json')
WL = Path('data/weatherlink/latest.json')
CON_STATE = Path('data/niveles/Lluvia_CONAGUA/Estado_Lluvia_CONAGUA.json')
CON = Path('data/niveles/Lluvia_CONAGUA/ultimo_corte.json')
FUENTE2 = Path('data/latest/FUENTE2.txt')
DAM_HISTORY = Path('data/presas/historico_mensual.json')


def load(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def num(value):
    try:
        return float(value)
    except Exception:
        return None


def fmt(value, digits=2, suffix=''):
    v = num(value)
    return 's/d' if v is None else f'{v:.{digits}f}{suffix}'


def signed(value, digits=2, suffix=''):
    v = num(value)
    return 's/d' if v is None else f'{v:+.{digits}f}{suffix}'


def level(name, rows):
    q = name.lower()
    return next((r for r in rows if q in f"{r.get('estacion','')} {r.get('rio','')}".lower()), None)


def observed(rows):
    return [r for r in rows if r.get('estado_dato') == 'observado']


def smn_window_text(pub, basin):
    windows = ((pub.get('smn96') or {}).get('ventanas') or {})
    parts = []
    for w in ['0-24', '24-48', '48-72', '72-96']:
        q = (windows.get(w) or {}).get(basin)
        if q:
            parts.append(f"{w} h: {q.get('texto','s/d')} mm")
    return '; '.join(parts) if parts else 'sin rango estructurado vigente'


def rain_summary(wl_state, wl, con_state, con):
    rows = []
    mature = (wl_state.get('window_maturity') or {}).get('24h') is True
    if wl_state.get('complete') and mature:
        vals = []
        for s in wl.get('stations', []):
            q = str(s.get('quality') or '').lower()
            v = num((s.get('accumulations_mm') or {}).get('24'))
            age = num(s.get('age_seconds'))
            if v is not None and age is not None and age <= 7200 and 'rezagado' not in q and 'heredado' not in q:
                vals.append((v, s.get('nombre', 's/d')))
        vals.sort(reverse=True)
        rows.extend([f"WeatherLink: {name} {v:.1f} mm/24 h" for v, name in vals[:5]])
    if con_state.get('complete'):
        vals = []
        for x in con:
            v = num(x.get('lluvia_24h_precedentes_mm'))
            if x.get('estado_24h') == 'observado' and v is not None:
                vals.append((v, x.get('estacion', 's/d')))
        vals.sort(reverse=True)
        rows.extend([f"CONAGUA: {name} {v:.1f} mm/24 h" for v, name in vals[:5]])
    return rows


def insivumeh_latest(hist):
    regs = hist.get('registros') or []
    return regs[-1] if regs else {}


def insivumeh_station(last, name):
    return next((x for x in (last.get('estaciones') or []) if x.get('estacion') == name), None)


def presa_rows_from_fuente2():
    if not FUENTE2.exists():
        return []
    text = FUENTE2.read_text(encoding='utf-8-sig')
    names = ['Angostura', 'Chicoasen', 'Malpaso', 'Peñitas']
    out = []
    for name in names:
        line = next((ln for ln in text.splitlines() if ln.strip().lower().startswith(name.lower())), None)
        if line:
            out.append((name, line.strip()))
    return out


def main():
    now = datetime.now(TZ)
    cut = now.replace(hour=11, minute=0, second=0, microsecond=0) if 10 <= now.hour <= 12 else now.replace(second=0, microsecond=0)
    levels = load(LEVELS, [])
    pub = load(PUBLIC, {})
    hist = load(HIST, {})
    wl_state = load(WL_STATE, {})
    wl = load(WL, {})
    con_state = load(CON_STATE, {})
    con = load(CON, [])
    current = observed(levels)
    rains = rain_summary(wl_state, wl, con_state, con)
    ins = insivumeh_latest(hist)

    boca = level('Boca del Cerro', levels)
    samaria = level('Samaria', levels)
    gonzalez = level('González', levels) or level('Gonzalez', levels)
    oxolotan = level('Oxolotán', levels) or level('Oxolotan', levels)
    teapa = level('Teapa', levels)
    puyac = level('Puyacatengo', levels)
    tapij = level('Tapijulapa', levels)
    macuspana = level('Macuspana', levels)
    salto = level('Salto de Agua', levels)

    el_tigre = insivumeh_station(ins, 'El Tigre')
    el_porvenir = insivumeh_station(ins, 'El Porvenir')

    highest_rise = sorted(
        [(num(r.get('delta_24h')), r) for r in current if num(r.get('delta_24h')) is not None],
        key=lambda z: z[0], reverse=True
    )
    rise_text = 'sin ascensos comparables relevantes'
    if highest_rise:
        d, r = highest_rise[0]
        rise_text = f"{r.get('estacion','s/d')} {d:+.2f} m/24 h"

    lines = [
        f"CORTE: {cut:%Y-%m-%d %H:%M}",
        '# ANÁLISIS INTEGRAL HIDROMETEOROLÓGICO',
        'Grijalva–Usumacinta • Ríos Serranos • Sistema de Presas • Samaria–Carrizal y corrientes asociadas',
        f'Actualización: {cut.strftime("%d de %B de %Y").replace("September","septiembre")}',
        '',
        '## SÍNTESIS GENERAL',
        f"Al corte de las {cut:%H:%M} h, la lectura debe mantenerse integrada y no por cuencas aisladas. La señal hidrométrica más reciente tiene como referencia principal el corte vigente de niveles y la lluvia observada/prevista sobre Guatemala, Chiapas y Tabasco. El mayor cambio de 24 h entre estaciones observadas es {rise_text}. La prioridad operativa es confirmar cualquier cambio de escenario con coincidencia de lluvia, saturación, niveles, caudales y operación de presas; el pronóstico por sí solo no constituye una creciente confirmada.",
        '',
        '## 1. Situación meteorológica regional y bajas presiones en vigilancia',
        'Las bajas presiones, vaguadas, ondas tropicales y otros sistemas deben valorarse por ubicación, trayectoria, organización y capacidad de modificar el transporte de humedad hacia el sureste de México. Su sola presencia no implica amenaza hidrológica para Tabasco.',
        '',
        '| Elemento | Valoración para Tabasco | Criterio operativo |',
        '|---|---|---|',
        '| Bajas lejanas en Atlántico | Sin incidencia hidrológica directa inmediata mientras permanezcan lejanas. | Mantener vigilancia meteorológica; no escalar por su sola existencia. |',
        '| Caribe y Centroamérica | De interés si refuerzan humedad, convergencia u ondas tropicales. | Relacionar con lluvia prevista y observada en Guatemala, Chiapas y Tabasco. |',
        '| Sureste/Golfo | Mayor interés cuando coinciden con alto contenido de humedad y persistencia. | Confirmar con lluvia, saturación, niveles y caudales. |',
        '',
        '## 2. Cuenca del Usumacinta',
        f"Boca del Cerro registra {fmt(boca.get('ultimo_nivel') if boca else None)} m, con variación de 24 h {signed(boca.get('delta_24h') if boca else None,2,' m')}. En la cuenca alta de Guatemala, El Tigre reporta {fmt(el_tigre.get('nivel_instantaneo_m') if el_tigre else None)} m y {fmt(el_tigre.get('caudal_instantaneo_m3s') if el_tigre else None,1)} m³/s; El Porvenir/La Pasión {fmt(el_porvenir.get('nivel_instantaneo_m') if el_porvenir else None)} m y {fmt(el_porvenir.get('caudal_instantaneo_m3s') if el_porvenir else None,1)} m³/s. La secuencia de vigilancia se mantiene Guatemala → Boca del Cerro/Tenosique → Balancán → Emiliano Zapata → Jonuta → Centla.",
        f"Pronóstico SMN para Usumacinta: {smn_window_text(pub, 'Usumacinta')}.",
        '',
        '| Indicador | Dato | Interpretación |',
        '|---|---|---|',
        f"| El Tigre | {fmt(el_tigre.get('nivel_instantaneo_m') if el_tigre else None)} m; {fmt(el_tigre.get('caudal_instantaneo_m3s') if el_tigre else None,1)} m³/s | Señal de cuenca alta; valorar tendencia, no dato aislado. |",
        f"| Boca del Cerro | {fmt(boca.get('ultimo_nivel') if boca else None)} m; Δ24 h {signed(boca.get('delta_24h') if boca else None,2,' m')} | Punto clave de confirmación para Tabasco. |",
        '',
        '## 3. Ríos Serranos y Bajo Grijalva',
        f"Los Ríos Serranos tienen respuesta más rápida que el Usumacinta. Oxolotán {fmt(oxolotan.get('ultimo_nivel') if oxolotan else None)} m, Tapijulapa {fmt(tapij.get('ultimo_nivel') if tapij else None)} m, Teapa {fmt(teapa.get('ultimo_nivel') if teapa else None)} m y Puyacatengo {fmt(puyac.get('ultimo_nivel') if puyac else None)} m. Deben vigilarse primero lluvia horaria y estaciones aguas arriba antes de esperar una respuesta en el Grijalva de Villahermosa.",
        f"Pronóstico SMN Bajo Grijalva–Ríos de la Sierra: {smn_window_text(pub, 'Bajo Grijalva-Ríos de la Sierra')}.",
        '',
        '| Subcuenca/corriente | Respuesta esperada | Implicación |',
        '|---|---|---|',
        '| Oxolotán–Amatán–Tacotalpa | Rápida ante lluvia intensa de montaña | Vigilar crecidas súbitas y propagación hacia Tacotalpa/Jalapa. |',
        '| Puyacatengo–Teapa | Rápida a muy rápida | Atención a lluvia horaria y ascensos locales. |',
        '| Pichucalco | Aporte directo relevante al Grijalva bajo | Puede incrementar el gasto antes/entorno de Villahermosa. |',
        f"| Tulijá–Puxcatán | Salto de Agua {fmt(salto.get('ultimo_nivel') if salto else None)} m; Macuspana {fmt(macuspana.get('ultimo_nivel') if macuspana else None)} m | Vigilar lluvia futura y respuesta hacia el sistema Grijalva aguas abajo. |",
        '',
        '## 4. Sistema de presas del Grijalva y corrientes asociadas',
        'El análisis debe mantener la cascada La Angostura–Chicoasén–Malpaso–Peñitas como un sistema regulado. La lluvia en la cuenca alta no equivale a una descarga inmediata hacia Tabasco. Peñitas es el punto de mayor interés operativo porque su extracción ingresa al Mezcalapa y se combina aguas abajo con aportes de cuenca libre, especialmente Platanar.',
    ]

    presa_rows = presa_rows_from_fuente2()
    if presa_rows:
        lines += ['', '| Presa | Dato disponible en FUENTE2 |', '|---|---|']
        for name, raw in presa_rows:
            lines.append(f'| {name} | {raw} |')
    lines += [
        '',
        '## 5. Samaria, Carrizal y Mezcalapa',
        f"Samaria registra {fmt(samaria.get('ultimo_nivel') if samaria else None)} m y González/Carrizal {fmt(gonzalez.get('ultimo_nivel') if gonzalez else None)} m. El gasto de Peñitas no debe equipararse automáticamente con el gasto que llega a cada brazo: deben incorporarse Platanar y otras aportaciones de cuenca libre y considerar la distribución hidráulica posterior. Como referencia operativa se conserva aproximadamente 70 % hacia Samaria y 30 % hacia Carrizal, sujeta a condiciones hidráulicas y a la operación de El Macayo.",
        '',
        '| Sistema | Condición actual | Riesgo a vigilar |',
        '|---|---|---|',
        '| Mezcalapa | Sin interpretar la extracción de Peñitas como gasto final. | Aumento conjunto Peñitas + cuenca libre. |',
        f"| Samaria | {fmt(samaria.get('ultimo_nivel') if samaria else None)} m | Incremento sostenido hacia Nacajuca–Jalpa–Cunduacán. |",
        f"| Carrizal | González {fmt(gonzalez.get('ultimo_nivel') if gonzalez else None)} m | Mayor ingreso, operación de Macayo y posible remanso con Grijalva. |",
        '',
        '## 6. Integración hidrológica: qué podría cambiar el escenario',
        '- Lluvia persistente durante varios días sobre la cuenca alta/media del Usumacinta con ascenso posterior en Boca del Cerro.',
        '- Núcleos intensos sobre Ríos Serranos que generen respuestas rápidas en Tacotalpa, Teapa, Puyacatengo y Pichucalco.',
        '- Incremento de entradas al sistema de presas que derive en ajustes de extracción, especialmente en Peñitas.',
        '- Coincidencia de extracción de Peñitas con aportaciones importantes de Platanar y otras corrientes libres.',
        '- Coincidencia temporal de aportes de La Sierra/Pichucalco con Carrizal en el Grijalva bajo.',
        '- Organización o acercamiento de sistemas meteorológicos que modifiquen sustancialmente la lluvia prevista sobre Chiapas, Guatemala y Tabasco.',
        '',
        '## 7. Escenario por horizonte',
        '| Periodo | Usumacinta | Ríos Serranos / Grijalva | Presas–Samaria–Carrizal | Nivel operativo |',
        '|---|---|---|---|---|',
        '| 0–24 h | Confirmar tendencia en cuenca alta y Boca del Cerro. | Priorizar lluvia horaria y respuesta local. | Revisar Peñitas + cuenca libre. | Vigilancia ordinaria reforzada. |',
        '| 24–48 h | Vigilar ascenso progresivo si se verifican acumulados. | Mayor sensibilidad a núcleos intensos. | Verificar entradas y extracción. | Preventivo si los datos observados lo justifican. |',
        '| 48–96 h | Evaluar acumulación sucesiva y propagación. | Mantener vigilancia en subcuencas con mayor señal. | Mayor atención a coincidencia Peñitas + aportes libres. | Preventivo reforzado si hay tendencia confirmada. |',
        '',
        '## 8. Valoración de las bajas presiones',
        'Las bajas presiones y perturbaciones identificadas deben mantenerse en vigilancia meteorológica, pero no son por sí solas motivo para elevar la alerta hidrológica. El escalamiento debe apoyarse en modificación del pronóstico de lluvia, persistencia de acumulados, aumento de saturación y respuesta observada en niveles y caudales.',
        '',
        '## 9. Conclusión general',
        f"El diagnóstico integrado del corte de las {cut:%H:%M} h se mantiene condicionado por la evolución conjunta de Guatemala–Usumacinta–Boca del Cerro, Ríos Serranos–Pichucalco–Grijalva bajo, la cascada de presas y Peñitas/cuenca libre–Mezcalapa–Samaria–Carrizal. Ningún componente debe interpretarse de manera aislada. La señal operativa debe escalar únicamente cuando coincidan magnitud, persistencia y respuesta observada.",
        '',
        '## 10. Recomendaciones de monitoreo',
        '- Actualizar cada 6–12 horas lluvia observada y pronosticada en Guatemala, Chiapas y Tabasco cuando exista señal relevante.',
        '- Registrar tendencia de El Tigre y Boca del Cerro; no valorar únicamente el dato aislado.',
        '- Dar seguimiento específico a Tacotalpa, Teapa, Puyacatengo y Pichucalco durante episodios de lluvia intensa.',
        '- Mantener actualización diaria de elevación, llenado, aportación y extracción del sistema de presas, con atención prioritaria a Peñitas.',
        '- Cruzar extracción de Peñitas con aportes de Platanar y niveles en Mezcalapa/Samaria/Carrizal.',
        '- Mantener las bajas presiones en vigilancia meteorológica y escalar sólo si su evolución modifica la amenaza de lluvia regional.',
        '',
        '## Lluvia observada complementaria',
    ]
    if rains:
        lines.extend([f'- {x}' for x in rains])
    else:
        lines.append('- Sin lluvia observada válida/madura suficiente para priorización en este corte.')

    lines += [
        '',
        '## Fuentes y calidad',
        '- CONAGUA/OCFS: boletines hidrométricos, climatológicos, presas y lluvia.',
        '- FUENTE2 08:00: boletín diario de hidrometría, climatología y presas cuando esté disponible.',
        '- SMN: pronóstico especial por cuencas 96 h y productos de mayor horizonte cuando estén vigentes.',
        '- INSIVUMEH: BHVGM y contexto de cuenca alta del Usumacinta.',
        '- WeatherLink: observaciones cloud; datos inmaduros, heredados o rezagados no se presentan como actuales.',
        '- Ausencia de dato nunca equivale a cero; cuando una estación no contiene lectura nueva se conserva su último valor válido sólo para continuidad y se identifica como heredado.',
        '',
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'Generado {OUT} con {len(lines)} líneas; corte {cut:%Y-%m-%d %H:%M}')


if __name__ == '__main__':
    main()
