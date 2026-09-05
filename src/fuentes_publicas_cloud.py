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
        if tag.lower()=='a': self._href=dict(attrs).get('href'); self._txt=[]
    def handle_data(self, data):
        if self._href is not None: self._txt.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=='a' and self._href is not None:
            self.links.append((self._href,' '.join(self._txt).strip())); self._href=None; self._txt=[]

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None
    def handle_starttag(self, tag, attrs):
        t=tag.lower()
        if t=='tr': self.row=[]
        elif t in ('td','th') and self.row is not None: self.cell=[]
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        t=tag.lower()
        if t in ('td','th') and self.cell is not None and self.row is not None:
            self.row.append(re.sub(r'\s+',' ',' '.join(self.cell)).strip()); self.cell=None
        elif t=='tr' and self.row is not None:
            if any(self.row): self.rows.append(self.row)
            self.row=None

def fetch_text(url):
    r=requests.get(url,headers=UA,timeout=TIMEOUT); r.raise_for_status()
    return r.text, {'status_code':r.status_code,'etag':r.headers.get('ETag'),'last_modified':r.headers.get('Last-Modified')}

def clean_text(raw):
    raw=re.sub(r'(?is)<script.*?</script>|<style.*?</style>',' ',raw)
    raw=re.sub(r'(?i)<br\s*/?>|</p>|</tr>|</li>|</h\d>|</div>','\n',raw)
    raw=re.sub(r'(?s)<[^>]+>',' ',raw)
    raw=html.unescape(raw).replace('\xa0',' ')
    return '\n'.join(re.sub(r'[ \t]+',' ',x).strip() for x in raw.splitlines() if re.sub(r'[ \t]+',' ',x).strip())

def pick(pattern,text,flags=re.I):
    m=re.search(pattern,text,flags); return m.group(1).strip() if m else None

def parse_range(s):
    if not s: return {'texto':None,'min_mm':None,'max_mm':None}
    s=re.sub(r'\s+',' ',s).strip()
    m=re.search(r'(\d+(?:\.\d+)?)\s*(?:a|-|–)\s*(\d+(?:\.\d+)?)',s)
    if m: return {'texto':f'{m.group(1)} a {m.group(2)}','min_mm':float(m.group(1)),'max_mm':float(m.group(2))}
    m=re.search(r'(\d+(?:\.\d+)?)',s)
    return {'texto':s,'min_mm':float(m.group(1)) if m else None,'max_mm':float(m.group(1)) if m else None}

def meta_fields(txt):
    return {
        'aviso': pick(r'No\.\s*Aviso:\s*(\d+)',txt),
        'fecha': pick(r'Ciudad de México\s*a\s*([0-9]{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+del?\s+[0-9]{4}\.?|[0-9]{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+de\s+[0-9]{4}\.?)',txt),
        'emision': pick(r'Emisión:\s*([0-9]{1,2}:[0-9]{2}h?)',txt)
    }

def parse_smn96(raw):
    txt=clean_text(raw); meta=meta_fields(txt)
    tp=TableParser(); tp.feed(raw)
    ventanas={w:{b:parse_range(None) for b in BASINS} for w in ['0-24','24-48','48-72','72-96']}
    for i,row in enumerate(tp.rows):
        joined=' | '.join(row)
        m=re.search(r'Pronóstico\s*(0-24|24-48|48-72|72-96)\s*h',joined,re.I)
        if not m: continue
        win=m.group(1)
        headers=row[1:8] if len(row)>=8 else BASINS
        for j in range(i+1,min(i+5,len(tp.rows))):
            rr=tp.rows[j]
            if rr and re.search(r'Precipitación',rr[0],re.I):
                vals=rr[1:8]
                for k,b in enumerate(BASINS):
                    val=vals[k] if k<len(vals) else None
                    ventanas[win][b]=parse_range(val)
                break
    resumen=pick(r'emite el siguiente aviso:\s*([^\n]+)',txt)
    complete=all(all(v['texto'] for v in ventanas[w].values()) for w in ventanas)
    return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 96 h','url':SMN96,**meta,'resumen':resumen,'ventanas':ventanas,'completo':complete}

def basin_ranges_from_sentence(sentence):
    result={}
    aliases={
        'Peñitas':['Peñitas'], 'Malpaso':['Malpaso'], 'Chicoasén':['Chicoasén'], 'La Angostura':['La Angostura'],
        'Bajo Grijalva-Ríos de la Sierra':['Bajo Grijalva','Bajo Grijalva-Ríos de la Sierra'],
        'Usumacinta':['Usumacinta'], 'Presa Juan Sabines':['Juan Sabines','Presa Juan Sabines']
    }
    clauses=re.split(r';|\.(?:\s|$)',sentence)
    for clause in clauses:
        rng=parse_range(clause)
        if not rng['texto'] or rng['min_mm'] is None: continue
        low=clause.lower()
        for basin,names in aliases.items():
            if any(n.lower() in low for n in names): result[basin]=rng.copy()
    return result

def parse_smn360(raw):
    txt=clean_text(raw); meta=meta_fields(txt)
    markers=list(re.finditer(r'Período de validez\s*([^\n]+)',txt,re.I))
    periods=[]
    for i,m in enumerate(markers[:2]):
        start=m.end(); end=markers[i+1].start() if i+1<len(markers) else len(txt)
        block=txt[start:end]
        desc_lines=[]
        for line in block.splitlines():
            if re.search(r'Mapa de lluvia acumulada|Gráficas|PRONÓSTICO DIARIO|PRONÓSTICO HORARIO|corrida de las|Nota de cautela|Próximo Pronóstico',line,re.I): break
            if line.strip(): desc_lines.append(line.strip())
        desc=' '.join(desc_lines).strip()
        periods.append({'ventana':'96-168 h' if i==0 else '168-360 h','validez':m.group(1).strip(),'descripcion':desc,'rangos_por_cuenca':basin_ranges_from_sentence(desc)})
    corrida=pick(r'corrida de las\s*([^\n.]+)',txt)
    return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 360 h','url':SMN360,**meta,'corrida_modelo':corrida,'periodos':periods,'completo':len(periods)>=2 and all(p['descripcion'] for p in periods)}

def extract_pdf_text(url):
    r=requests.get(url,headers=UA,timeout=TIMEOUT); r.raise_for_status()
    reader=PdfReader(io.BytesIO(r.content))
    return '\n'.join((p.extract_text() or '') for p in reader.pages),len(r.content)

def find_context(text,terms,radius=2):
    lines=[re.sub(r'\s+',' ',x).strip() for x in text.splitlines() if x.strip()]
    out=[]; seen=set()
    for i,line in enumerate(lines):
        if any(t.lower() in line.lower() for t in terms):
            snippet=' | '.join(lines[max(0,i-radius):min(len(lines),i+radius+1)])
            if snippet not in seen: seen.add(snippet); out.append(snippet)
    return out[:20]

def parse_insivumeh():
    raw,meta=fetch_text(INSI_DAILY); p=LinkParser(); p.feed(raw)
    candidates=[]
    for href,txt in p.links:
        u=urljoin(INSI_DAILY,href); label=(txt+' '+href).lower()
        if 'pdf' in label and ('golfo' in label or 'mexico' in label or 'méxico' in label): candidates.append((u,txt))
    if not candidates:
        candidates=[(urljoin(INSI_DAILY,h),t) for h,t in p.links if '.pdf' in urljoin(INSI_DAILY,h).lower()]
    pdf_url=candidates[-1][0] if candidates else None
    result={'fuente':'INSIVUMEH','producto':'Boletín diario hidrología aplicada - Vertiente Golfo de México','url_pagina':INSI_DAILY,'url_pdf':pdf_url,'http':meta,'estaciones_objetivo':['Chixoy/Salinas','La Pasión/El Porvenir','Usumacinta/El Tigre','Machaquilá'],'fragmentos_relevantes':[],'pdf_bytes':None,'completo':False}
    if pdf_url:
        try:
            txt,n=extract_pdf_text(pdf_url); result['pdf_bytes']=n
            result['fragmentos_relevantes']=find_context(txt,['Chixoy','Salinas','La Pasión','La Pasion','El Porvenir','El Tigre','Usumacinta','Machaquilá','Machaquila'],3)
            result['completo']=bool(result['fragmentos_relevantes'])
        except Exception as e: result['error_pdf']=str(e)
    return result

def main():
    now=datetime.now(timezone.utc).isoformat(); status={'generated_utc':now,'complete':False,'errors':[]}
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
