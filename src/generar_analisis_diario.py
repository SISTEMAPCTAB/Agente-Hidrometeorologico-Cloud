import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ=ZoneInfo('America/Mexico_City')
OUT=Path('data/analysis/latest.md')
LEVELS=Path('data/niveles/Ultimo_Corte/ultimo_resumen.json')
R12=Path('data/niveles/Resumen_12h/resumen_12h.json')
PUBLIC=Path('data/fuentes_publicas/latest.json')
HIST=Path('data/fuentes_publicas/insivumeh_historico.json')
WL_STATE=Path('data/weatherlink/Estado_WeatherLink_Cloud.json')
WL=Path('data/weatherlink/latest.json')
TEMP=Path('data/weatherlink/temperature_summary.json')
CON_STATE=Path('data/niveles/Lluvia_CONAGUA/Estado_Lluvia_CONAGUA.json')
CON=Path('data/niveles/Lluvia_CONAGUA/ultimo_corte.json')

def load(p,d):
    try:return json.loads(p.read_text(encoding='utf-8'))
    except:return d

def num(v):
    try:return float(v)
    except:return None

def fmt(v,d=2):
    x=num(v);return 's/d' if x is None else f'{x:.{d}f}'

def system_for(x):
    s=f"{x.get('rio','')} {x.get('estacion','')}".lower()
    if any(k in s for k in ['samaria','carrizal','gonzález','gonzalez','mezcalapa','platanar','macayo']):return 'Presas–Mezcalapa–Samaria y Carrizal'
    if any(k in s for k in ['oxolot','tapijul','teapa','puyacat','pichucal','san joaqu','la sierra','pueblo nuevo','grijalva','gaviotas','muelle','porvenir']):return 'Ríos Serranos–Grijalva'
    if any(k in s for k in ['tulij','puxcat','salto de agua','macuspana','chilapa']):return 'Tulijá–Puxcatán–Chilapa'
    if any(k in s for k in ['usumacinta','boca del cerro','san pedro','balanc','emiliano','jonuta','tres brazos']):return 'Usumacinta'
    return None

def evo_for(s,s12):
    f=next((v for k,v in s12.items() if (s.startswith('Presas') and str(k).startswith('Presas')) or (s.startswith('Ríos') and str(k).startswith('Ríos')) or (s.startswith('Tulijá') and str(k).startswith('Tulijá')) or (s=='Usumacinta' and k=='Usumacinta')),None)
    return f.get('evolucion_operativa_12h','sin comparación válida') if f else 'sin comparación válida'

def smn_text(windows,basin):
    best=[]
    for w in ['0-24','24-48','48-72','72-96']:
        q=(windows.get(w) or {}).get(basin)
        if q: best.append(f"{w} h {q.get('texto','s/d')} mm")
    return '; '.join(best) if best else 'sin rango estructurado'

def sub_analysis(s,levels,evo,windows,hist):
    xs=[x for x in levels if x.get('estado_dato')=='observado' and system_for(x)==s]
    rises=sorted([(num(x.get('delta_24h')),x) for x in xs if num(x.get('delta_24h')) is not None and num(x.get('delta_24h'))>0],reverse=True,key=lambda z:z[0])
    falls=sorted([(num(x.get('delta_24h')),x) for x in xs if num(x.get('delta_24h')) is not None and num(x.get('delta_24h'))<0],key=lambda z:z[0])
    near=sorted([(abs(num(x.get('distancia_namo'))),x) for x in xs if num(x.get('distancia_namo')) is not None],key=lambda z:z[0])
    hydro=[]
    if rises: hydro.append(f"mayor ascenso 24 h: {rises[0][1].get('estacion','s/d')} +{rises[0][0]:.2f} m")
    elif xs: hydro.append('sin ascensos positivos de 24 h entre los datos comparables')
    else: hydro.append('sin observaciones actuales comparables')
    if falls: hydro.append(f"mayor descenso: {falls[0][1].get('estacion','s/d')} {falls[0][0]:.2f} m")
    if near: hydro.append(f"referencia más próxima al NAMO: {near[0][1].get('estacion','s/d')} a {near[0][0]:.2f} m")
    basin='Peñitas' if s.startswith('Presas') else ('Bajo Grijalva-Ríos de la Sierra' if s.startswith('Ríos') or s.startswith('Tulijá') else 'Usumacinta')
    forecast=smn_text(windows,basin)
    extra=''
    if s=='Usumacinta':
        regs=hist.get('registros') or []; last=regs[-1] if regs else {}; sts=last.get('estaciones') or []
        up=[]
        for n in ['El Porvenir','El Tigre','San Agustín Chixoy']:
            x=next((z for z in sts if z.get('estacion')==n),None)
            if x:up.append(f"{n} {fmt(x.get('nivel_instantaneo_m'))} m/{fmt(x.get('caudal_instantaneo_m3s'),1)} m³/s")
        if up: extra=' Cuenca alta Guatemala: '+', '.join(up)+'.'
    return f"Evolución 12 h {evo}. {'; '.join(hydro)}. SMN: {forecast}.{extra} La lectura operativa debe confirmarse en los cortes siguientes; el pronóstico incrementa vigilancia, pero no implica por sí solo una creciente."

def main():
    now=datetime.now(TZ); cut=now.replace(hour=11,minute=0,second=0,microsecond=0) if 10<=now.hour<=12 else now.replace(second=0,microsecond=0)
    levels=load(LEVELS,[]); r12=load(R12,{}); pub=load(PUBLIC,{}); hist=load(HIST,{})
    wlstate=load(WL_STATE,{}); wl=load(WL,{}); temp=load(TEMP,{}); cstate=load(CON_STATE,{}); con=load(CON,[])
    smn=pub.get('smn96') or {}; windows=smn.get('ventanas') or {}
    systems=['Presas–Mezcalapa–Samaria y Carrizal','Ríos Serranos–Grijalva','Tulijá–Puxcatán–Chilapa','Usumacinta']
    s12={x.get('sistema'):x for x in r12.get('systems',[])}
    lines=[f"CORTE: {cut:%Y-%m-%d %H:%M}","# Análisis operativo hidrometeorológico · Grijalva–Usumacinta","","Documento automático de apoyo operativo. Sólo usa datos disponibles en el repositorio; sin dato no equivale a cero y los datos heredados o rezagados se identifican como tales.",'','## Resumen operativo']
    for s in systems: lines.append(f"- **{s}:** evolución 12 h {evo_for(s,s12)}.")
    lines += ['','## Análisis breve por subcuenca']
    for s in systems:
        lines += ['',f'### {s}',sub_analysis(s,levels,evo_for(s,s12),windows,hist)]
    lines += ['','## Hidrometría observada, NAMO y NAMINO','El NAMO y el NAMINO son referencias fijas oficiales cuando están publicados para la estación. El NAMINO cobra especial relevancia operativa en condiciones de niveles bajos; no se inventan valores faltantes.','| Sistema | Estación | Nivel m | Δ24 h m | Tendencia | Distancia a NAMO m | Calidad |','|---|---|---:|---:|---|---:|---|']
    ranked=[]
    for x in levels:
        if x.get('estado_dato')!='observado':continue
        sys=system_for(x)
        if sys: ranked.append((num(x.get('delta_24h')) if num(x.get('delta_24h')) is not None else -999,x,sys))
    ranked.sort(key=lambda z:z[0],reverse=True)
    for _,x,sys in ranked:lines.append(f"| {sys} | {x.get('estacion','s/d')} | {fmt(x.get('ultimo_nivel'))} | {fmt(x.get('delta_24h'))} | {x.get('tendencia','s/d')} | {fmt(x.get('distancia_namo'))} | observado |")
    inherited=[x for x in levels if x.get('estado_dato')!='observado']
    if inherited:lines += ['',f"Datos hidrométricos no actuales/heredados excluidos de la priorización: {len(inherited)} estación(es)."]
    lines += ['','## Lluvia observada']
    mature=(wlstate.get('window_maturity') or {}).get('24h') is True
    if wlstate.get('complete') and mature:
        vals=[]
        for s in wl.get('stations',[]):
            q=str(s.get('quality') or '').lower();v=num((s.get('accumulations_mm') or {}).get('24'));age=num(s.get('age_seconds'))
            if v is not None and 'rezagado' not in q and 'heredado' not in q and age is not None and age<=7200:vals.append((v,s))
        vals.sort(key=lambda z:z[0],reverse=True);lines.append('WeatherLink 24 h maduro; mayores acumulados válidos:')
        for v,s in vals[:5]:lines.append(f"- {s.get('nombre')}: {v:.1f} mm · {s.get('ubicacion','s/d')}.")
    else:lines.append('- WeatherLink: ventana 24 h no madura/actual para uso operativo; no se usa valor heredado como lluvia vigente.')
    if cstate.get('complete') and str(cstate.get('modo','')).startswith('precipitacion_conagua_validada'):
        vals=[(num(x.get('lluvia_24h_precedentes_mm')),x) for x in con if x.get('estado_24h')=='observado' and num(x.get('lluvia_24h_precedentes_mm')) is not None];vals.sort(key=lambda z:z[0],reverse=True)
        lines.append(f"CONAGUA, corte {cstate.get('fecha_reporte','s/d')}: mayores registros 24 h publicados:")
        for v,x in vals[:5]:lines.append(f"- {x.get('estacion')}: {v:.1f} mm.")
    else:lines.append('- CONAGUA: precipitación no validada para este corte; no gobierna la lectura operativa.')
    lines += ['','## Pronóstico SMN 96 h']
    for w in ['0-24','24-48','48-72','72-96']:
        q=windows.get(w) or {};parts=[]
        for basin in ['Peñitas','Bajo Grijalva-Ríos de la Sierra','Usumacinta']:
            if basin in q:parts.append(f"{basin}: {q[basin].get('texto','s/d')} mm")
        lines.append(f"- {w} h: "+('; '.join(parts) if parts else 'sin rango estructurado')+'.')
    lines += ['','## Cuenca alta del Usumacinta · Guatemala']
    regs=hist.get('registros') or [];last=regs[-1] if regs else {};sts=last.get('estaciones') or []
    for name in ['San Agustín Chixoy','Playa Grande','Puente Chocox','El Porvenir','El Tigre']:
        x=next((z for z in sts if z.get('estacion')==name),None)
        if x:lines.append(f"- {name}–{x.get('rio','s/d')}: nivel {fmt(x.get('nivel_instantaneo_m'))} m · caudal {fmt(x.get('caudal_instantaneo_m3s'))} m³/s · BHVGM {last.get('boletin','s/d')} {last.get('fecha','s/d')} {last.get('hora','s/d')} h.")
        elif name=='El Tigre':lines.append('- El Tigre–Usumacinta: sin dato estructurado actual; no se sustituye con un dato anterior.')
    lines += ['- Cadena operativa: Chixoy/Salinas + La Pasión/El Porvenir + Usumacinta/El Tigre → Lacantún → Boca del Cerro → Balancán → Emiliano Zapata → Jonuta → Centla.','- Los máximos BHVGM son referencias estadísticas, no umbrales de inundación. El desfase entre cortes no se interpreta como tiempo de tránsito.','','## Temperatura e índice de calor']
    tab=next((x for x in temp.get('territories',[]) if x.get('territorio')=='Tabasco'),None)
    lines.append(f"- Tabasco: máxima válida {fmt(tab.get('max_temp_c'),1)} °C; índice de calor máximo {fmt(tab.get('max_heat_index_c'),1)} °C en {tab.get('estacion_mas_caliente','s/d')} · {tab.get('nivel_riesgo','s/d')}." if tab else '- Sin resumen térmico válido para Tabasco en el corte.')
    lines += ['','## Perspectiva y evaluación operativa','- **24–48 h:** contrastar la lluvia observada y el primer tramo del pronóstico con la evolución real de niveles; reforzar vigilancia sólo donde coincidan lluvia relevante, ascenso o persistencia.','- **48–96 h:** vigilar especialmente las subcuencas con rangos SMN más altos y verificar en cada nuevo corte si aparece respuesta hidrométrica.','- **7–15 días:** usar únicamente productos oficiales vigentes como escenario de planeación; la incertidumbre es mayor y no debe presentarse como lluvia observada ni como creciente confirmada.','','## Conclusiones operativas','- Priorizar lluvia observada válida, ascensos reales, persistencia y pronóstico oficial. NAMO y NAMINO se conservan como referencias hidrométricas; el NAMINO adquiere prioridad cuando los niveles descienden hacia mínimos.','- No sumar estaciones puntuales para fabricar acumulados de cuenca.','- En Usumacinta, mantener lectura conjunta de La Pasión/El Porvenir, Chixoy/Salinas, El Tigre, Boca del Cerro y estaciones aguas abajo, sin afirmar causalidad automática.','','## Fuentes y calidad','- CONAGUA/OCFS: boletines hidrométricos, climatológicos, presas y lluvia.','- SMN: pronóstico especial por cuencas.','- INSIVUMEH: BHVGM y contexto de cuenca alta.','- WeatherLink: observaciones cloud; datos inmaduros, heredados o rezagados no se presentan como actuales.','']
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text('\n'.join(lines),encoding='utf-8');print(f'Generado {OUT} con {len(lines)} líneas; corte {cut:%Y-%m-%d %H:%M}')

if __name__=='__main__':main()
