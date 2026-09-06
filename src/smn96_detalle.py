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

    smn['url']=URL
    if resumen: smn['resumen']=resumen
    smn['detalle_ventanas']=detail
    smn['detalle_completo']=all(
        w in detail and all(
            all(detail[w].get(b,{}).get(k) for k in ['precipitacion_mm','temperatura_max_c','temperatura_min_c','viento_sostenido_kmh','rachas_kmh'])
            for b in BASINS
        ) for w in WINDOWS
    )
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__': main()
