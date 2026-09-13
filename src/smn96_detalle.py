from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

import requests

URL='https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-96h'
OUT=Path('data/fuentes_publicas/latest.json')
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}
BASINS=['Peñitas','Malpaso','Chicoasén','La Angostura','Bajo Grijalva-Ríos de la Sierra','Usumacinta','Presa Juan Sabines']
WINDOWS=['0-24','24-48','48-72','72-96']

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None
    def handle_starttag(self,tag,attrs):
        tag=tag.lower()
        if tag=='tr': self.row=[]
        elif tag in ('td','th') and self.row is not None: self.cell=[]
    def handle_data(self,data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self,tag):
        tag=tag.lower()
        if tag in ('td','th') and self.cell is not None and self.row is not None:
            self.row.append(re.sub(r'\s+',' ',' '.join(self.cell)).strip()); self.cell=None
        elif tag=='tr' and self.row is not None:
            if any(self.row): self.rows.append(self.row)
            self.row=None

def clean_text(raw:str)->str:
    raw=re.sub(r'(?is)<script.*?</script>|<style.*?</style>',' ',raw)
    raw=re.sub(r'(?i)<br\s*/?>|</p>|</tr>|</li>|</h\d>|</div>','\n',raw)
    raw=re.sub(r'(?s)<[^>]+>',' ',raw)
    return '\n'.join(re.sub(r'[ \t]+',' ',x).strip() for x in html.unescape(raw).replace('\xa0',' ').splitlines() if x.strip())

def norm_range(v):
    if v is None: return None
    s=re.sub(r'\s+',' ',str(v)).strip()
    s=s.replace('–','a').replace('-','a')
    m=re.search(r'(\d+(?:\.\d+)?)\s*(?:a)\s*(\d+(?:\.\d+)?)',s,re.I)
    if m:
        return f'{m.group(1)} a {m.group(2)}'
    m=re.search(r'(\d+(?:\.\d+)?)',s)
    return m.group(1) if m else s

def main():
    if not OUT.exists():
        raise SystemExit('No existe data/fuentes_publicas/latest.json')
    payload=json.loads(OUT.read_text(encoding='utf-8'))
    smn=payload.setdefault('smn96',{})
    r=requests.get(URL,headers=UA,timeout=35); r.raise_for_status()
    raw=r.text; txt=clean_text(raw)

    resumen=None
    m=re.search(r'emite el siguiente aviso:\s*(.*?)\s*Pron[oó]stico\s*0-24\s*h',txt,re.I|re.S)
    if m: resumen=re.sub(r'\s+',' ',m.group(1)).strip()

    tp=TableParser(); tp.feed(raw)
    detail={}
    for w in WINDOWS:
        header_idx=None
        for i,row in enumerate(tp.rows):
            joined=' | '.join(row)
            if re.search(rf'Pron[oó]stico\s*{re.escape(w)}\s*h',joined,re.I):
                header_idx=i; break
        if header_idx is None: continue
        metrics={}
        for row in tp.rows[header_idx+1:header_idx+8]:
            if not row: continue
            label=row[0].strip()
            if re.search(r'Precipitaci[oó]n',label,re.I): key='precipitacion_mm'
            elif re.search(r'Temperatura\s*m[aá]xima',label,re.I): key='temperatura_max_c'
            elif re.search(r'Temperatura\s*m[ií]nima',label,re.I): key='temperatura_min_c'
            elif re.search(r'Viento\s*sostenido',label,re.I): key='viento_sostenido_kmh'
            elif re.search(r'Rachas\s*de\s*viento',label,re.I): key='rachas_kmh'
            else: continue
            metrics[key]={b:(row[j+1].strip() if j+1<len(row) else None) for j,b in enumerate(BASINS)}
        detail[w]={}
        for b in BASINS:
            detail[w][b]={k:v.get(b) for k,v in metrics.items()}

    # La extracción básica de fuentes_publicas_cloud.py ya separa correctamente
    # las cuatro ventanas de precipitación. La tabla detallada del SMN puede
    # desplazar visualmente una fila/periodo en su HTML; por eso la precipitación
    # mostrada en detalle se ancla SIEMPRE a smn96.ventanas del mismo periodo.
    # Así 0-24, 24-48, 48-72 y 72-96 no pueden quedar corridos entre sí.
    source_windows=smn.get('ventanas') or {}
    corrections=[]
    for w in WINDOWS:
        detail.setdefault(w,{})
        for b in BASINS:
            detail[w].setdefault(b,{})
            authoritative=((source_windows.get(w) or {}).get(b) or {}).get('texto')
            parsed=detail[w][b].get('precipitacion_mm')
            if authoritative:
                authoritative=norm_range(authoritative)
                if norm_range(parsed)!=authoritative:
                    corrections.append({'ventana':w,'cuenca':b,'extraido_detalle':parsed,'validado':authoritative})
                detail[w][b]['precipitacion_mm']=authoritative
                detail[w][b]['precipitacion_fuente']='smn96.ventanas_validada'

    # Validación dura: ninguna de las 28 celdas de precipitación puede diferir
    # entre el resumen estructurado y el detalle que consume la interfaz.
    mismatches=[]
    for w in WINDOWS:
        for b in BASINS:
            expected=norm_range((((source_windows.get(w) or {}).get(b) or {}).get('texto')))
            shown=norm_range(((detail.get(w) or {}).get(b) or {}).get('precipitacion_mm'))
            if not expected or expected!=shown:
                mismatches.append({'ventana':w,'cuenca':b,'esperado':expected,'detalle':shown})
    if mismatches:
        raise RuntimeError(f'Inconsistencia SMN96 de precipitación: {mismatches}')

    smn['url']=URL
    if resumen: smn['resumen']=resumen
    smn['detalle_ventanas']=detail
    smn['precipitacion_validada_96h']=True
    smn['precipitacion_correcciones']=corrections
    smn['detalle_completo']=all(
        w in detail and all(
            all(detail[w].get(b,{}).get(k) for k in ['precipitacion_mm','temperatura_max_c','temperatura_min_c','viento_sostenido_kmh','rachas_kmh'])
            for b in BASINS
        ) for w in WINDOWS
    )
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__': main()
