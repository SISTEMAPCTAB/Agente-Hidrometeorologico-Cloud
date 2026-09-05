from __future__ import annotations

import io
import json
import re
import html
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

import requests
from pypdf import PdfReader

OUT = Path('data/fuentes_publicas')
OUT.mkdir(parents=True, exist_ok=True)

UA = {'User-Agent': 'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}
TIMEOUT = 35

SMN96 = 'https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-96h'
SMN360 = 'https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-360h'
INSI_DAILY = 'https://insivumeh.gob.gt/boletin-diario-hidrologia-aplicada/'
INSI_TREND = 'https://insivumeh.gob.gt/boletin-de-tendencia-de-niveles-2/'
INSI_SAT = 'https://insivumeh.gob.gt/porcentaje-de-saturacion-del-suelo-2/'

BASINS = ['Peñitas','Malpaso','Chicoasén','La Angostura','Bajo Grijalva-Ríos de la Sierra','Usumacinta','Presa Juan Sabines']

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self._href=None; self._txt=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower()=='a':
            self._href=dict(attrs).get('href'); self._txt=[]
    def handle_data(self, data):
        if self._href is not None: self._txt.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=='a' and self._href is not None:
            self.links.append((self._href, ' '.join(self._txt).strip()))
            self._href=None; self._txt=[]

def fetch_text(url: str) -> tuple[str, dict]:
    r=requests.get(url,headers=UA,timeout=TIMEOUT)
    r.raise_for_status()
    return r.text, {'status_code':r.status_code,'etag':r.headers.get('ETag'),'last_modified':r.headers.get('Last-Modified')}

def clean_text(raw: str) -> str:
    raw=re.sub(r'(?is)<script.*?</script>|<style.*?</style>', ' ', raw)
    raw=re.sub(r'(?i)<br\s*/?>|</p>|</tr>|</li>|</h\d>', '\n', raw)
    raw=re.sub(r'(?s)<[^>]+>', ' ', raw)
    raw=html.unescape(raw).replace('\xa0',' ')
    lines=[]
    for line in raw.splitlines():
        line=re.sub(r'[ \t]+',' ',line).strip()
        if line: lines.append(line)
    return '\n'.join(lines)

def pick(pattern: str, text: str, flags=re.I):
    m=re.search(pattern,text,flags)
    return m.group(1).strip() if m else None

def parse_range(s: str | None):
    if not s: return {'texto':None,'min_mm':None,'max_mm':None}
    m=re.search(r'(\d+(?:\.\d+)?)\s*(?:a|-|–)\s*(\d+(?:\.\d+)?)',s)
    if m: return {'texto':s.strip(),'min_mm':float(m.group(1)),'max_mm':float(m.group(2))}
    m=re.search(r'(\d+(?:\.\d+)?)',s)
    return {'texto':s.strip(),'min_mm':float(m.group(1)) if m else None,'max_mm':float(m.group(1)) if m else None}

def parse_smn96(raw: str):
    txt=clean_text(raw)
    aviso=pick(r'No\.\s*Aviso:\s*(\d+)',txt)
    fecha=pick(r'Ciudad de México\s*a\s*([^\n]+)',txt)
    emision=pick(r'Emisión:\s*([^\n]+)',txt)
    ventanas={}
    for win in ['0-24','24-48','48-72','72-96']:
        pat=rf'Pronóstico\s*{re.escape(win)}\s*h\s*\|\s*Peñitas\s*\|\s*Malpaso\s*\|\s*Chicoasén\s*\|\s*La Angostura\s*\|\s*Bajo Grijalva-Ríos de la Sierra\s*\|\s*Usumacinta\s*\|\s*Presa Juan Sabines\s*\nPrecipitación \(mm\)\s*\|\s*([^\n]+)'
        row=pick(pat,txt)
        vals=[x.strip() for x in row.split('|')] if row else []
        ventanas[win]={b:parse_range(vals[i] if i<len(vals) else None) for i,b in enumerate(BASINS)}
    resumen=pick(r'emite el siguiente aviso:\s*([^\n]+)',txt)
    return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 96 h','url':SMN96,'aviso':aviso,'fecha':fecha,'emision':emision,'resumen':resumen,'ventanas':ventanas,'completo':all(any(v['texto'] for v in w.values()) for w in ventanas.values())}

def basin_ranges_from_sentence(sentence: str):
    result={}
    for basin in BASINS:
        aliases=[basin]
        if basin=='Bajo Grijalva-Ríos de la Sierra': aliases += ['Bajo Grijalva','Bajo Grijalva-Ríos de la Sierra']
        for alias in aliases:
            m=re.search(rf'(\d+(?:\.\d+)?)\s*a\s*(\d+(?:\.\d+)?)\s*mm[^.\n]{{0,180}}(?:cuenca(?:s)?\s+de\s+[^.\n]*?\b{re.escape(alias)}\b)',sentence,re.I)
            if m:
                result[basin]={'texto':f'{m.group(1)} a {m.group(2)}','min_mm':float(m.group(1)),'max_mm':float(m.group(2))}; break
    return result

def parse_smn360(raw: str):
    txt=clean_text(raw)
    aviso=pick(r'No\.\s*Aviso:\s*(\d+)',txt)
    fecha=pick(r'Ciudad de México\s*a\s*([^\n]+)',txt)
    emision=pick(r'Emisión:\s*([^\n]+)',txt)
    p1=pick(r'Período de validez\s*([^\n]+)\n([^\n]+)\nMapa de lluvia acumulada de 96 a 168 horas',txt)
    # capture periods and descriptive lines separately to avoid fragile table assumptions
    matches=re.findall(r'Período de validez\s*([^\n]+)\n([^\n]+)',txt,re.I)
    periods=[]
    for i,(valid,desc) in enumerate(matches[:2]):
        periods.append({'ventana':'96-168 h' if i==0 else '168-360 h','validez':valid.strip(),'descripcion':desc.strip(),'rangos_por_cuenca':basin_ranges_from_sentence(desc)})
    corrida=pick(r'corrida de las\s*([^\n.]+)',txt)
    return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 360 h','url':SMN360,'aviso':aviso,'fecha':fecha,'emision':emision,'corrida_modelo':corrida,'periodos':periods,'completo':len(periods)>=2}

def extract_pdf_text(url: str):
    r=requests.get(url,headers=UA,timeout=TIMEOUT); r.raise_for_status()
    reader=PdfReader(io.BytesIO(r.content))
    return '\n'.join((p.extract_text() or '') for p in reader.pages), len(r.content)

def find_context(text: str, terms: list[str], radius=2):
    lines=[re.sub(r'\s+',' ',x).strip() for x in text.splitlines() if x.strip()]
    out=[]; seen=set()
    for i,line in enumerate(lines):
        low=line.lower()
        if any(t.lower() in low for t in terms):
            a=max(0,i-radius); b=min(len(lines),i+radius+1)
            snippet=' | '.join(lines[a:b])
            if snippet not in seen:
                seen.add(snippet); out.append(snippet)
    return out[:20]

def parse_insivumeh():
    raw,meta=fetch_text(INSI_DAILY)
    p=LinkParser(); p.feed(raw)
    candidates=[]
    for href,txt in p.links:
        u=urljoin(INSI_DAILY,href)
        label=(txt+' '+href).lower()
        if 'pdf' in label and ('golfo' in label or 'mexico' in label or 'méxico' in label): candidates.append((u,txt))
    if not candidates:
        for href,txt in p.links:
            u=urljoin(INSI_DAILY,href)
            if '.pdf' in u.lower(): candidates.append((u,txt))
    pdf_url=candidates[-1][0] if candidates else None
    result={'fuente':'INSIVUMEH','producto':'Boletín diario hidrología aplicada - Vertiente Golfo de México','url_pagina':INSI_DAILY,'url_pdf':pdf_url,'http':meta,'estaciones_objetivo':['Chixoy/Salinas','La Pasión/El Porvenir','Usumacinta/El Tigre','Machaquilá'],'fragmentos_relevantes':[],'pdf_bytes':None,'completo':False}
    if pdf_url:
        try:
            txt,n=extract_pdf_text(pdf_url)
            result['pdf_bytes']=n
            result['fragmentos_relevantes']=find_context(txt,['Chixoy','Salinas','La Pasión','La Pasion','El Porvenir','El Tigre','Usumacinta','Machaquilá','Machaquila'],3)
            result['completo']=bool(result['fragmentos_relevantes'])
        except Exception as e:
            result['error_pdf']=str(e)
    return result

def main():
    now=datetime.now(timezone.utc).isoformat()
    status={'generated_utc':now,'complete':False,'errors':[]}
    payload={'generated_utc':now,'smn96':None,'smn360':None,'insivumeh':None,'links':{'insivumeh_tendencia':INSI_TREND,'insivumeh_saturacion':INSI_SAT}}
    for key,url,parser in [('smn96',SMN96,parse_smn96),('smn360',SMN360,parse_smn360)]:
        try:
            raw,meta=fetch_text(url); obj=parser(raw); obj['http']=meta; payload[key]=obj
        except Exception as e: status['errors'].append(f'{key}: {e}')
    try: payload['insivumeh']=parse_insivumeh()
    except Exception as e: status['errors'].append(f'insivumeh: {e}')
    status['complete']=all(payload.get(k) for k in ('smn96','smn360','insivumeh')) and not status['errors']
    status['products']={k:{'available':bool(payload.get(k)),'complete':bool(payload.get(k,{}).get('completo')) if isinstance(payload.get(k),dict) else False} for k in ('smn96','smn360','insivumeh')}
    (OUT/'latest.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'Estado_Fuentes_Publicas.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(status,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
