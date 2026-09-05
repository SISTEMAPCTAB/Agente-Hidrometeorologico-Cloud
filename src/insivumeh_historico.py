from __future__ import annotations
import io,json,re,unicodedata
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import requests
from pypdf import PdfReader

OUT=Path('data/fuentes_publicas'); OUT.mkdir(parents=True,exist_ok=True)
HIST=OUT/'insivumeh_historico.json'
LATEST=OUT/'latest.json'
PAGE='https://insivumeh.gob.gt/sistema-de-monitoreo-hidrologico-2/'
DAILY='https://insivumeh.gob.gt/boletin-diario-hidrologia-aplicada/'
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}

class Links(HTMLParser):
 def __init__(self):super().__init__();self.items=[];self.href=None;self.txt=[]
 def handle_starttag(self,t,a):
  if t.lower()=='a':self.href=dict(a).get('href');self.txt=[]
 def handle_data(self,d):
  if self.href is not None:self.txt.append(d)
 def handle_endtag(self,t):
  if t.lower()=='a' and self.href is not None:self.items.append((self.href,' '.join(self.txt)));self.href=None;self.txt=[]

def asc(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode()).strip()
def pdftext(u):
 r=requests.get(u,headers=UA,timeout=35);r.raise_for_status();return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(r.content)).pages)
def candidates(page):
 r=requests.get(page,headers=UA,timeout=35);r.raise_for_status();p=Links();p.feed(r.text);out=[]
 for h,t in p.items:
  u=urljoin(page,h);lab=asc(t+' '+h).lower()
  if '.pdf' in u.lower() and ('bhvgm' in lab or 'golfo de mexico' in lab):out.append((u,lab))
 return out

def choose_bhvgm():
 for page in (PAGE,DAILY):
  try:
   cs=candidates(page)
   if cs:return cs[-1][0]
  except Exception:pass
 return 'https://insivumeh.gob.gt/hidrologia/hidro/niveles/BHVGM.pdf'

def header(txt):
 f=asc(txt)
 def g(p):
  m=re.search(p,f,re.I);return m.group(1).strip() if m else None
 return {'boletin':g(r'BOLETIN\s*(?:No\.?|N[oº°]\.?)\s*(\d+)'),'fecha':g(r'Fecha\s*:\s*(\d{1,2}/\d{1,2}/\d{4})'),'hora':g(r'Hora\s*:\s*(\d{1,2}:\d{2})')}

def stations(txt):
 f=asc(txt);targets=[('El Tigre','Usumacinta','El Tigre Usumacinta Las Cruces'),('El Porvenir','La Pasión','El Porvenir La Pasion Las Cruces'),('San Agustín Chixoy','Chixoy','San Agustin Chixoy Chixoy Chisec'),('Puente Chocox','Chixoy','Puente Chocox Chixoy Canilla')];out=[]
 for name,river,alias in targets:
  m=re.search(re.escape(alias),f,re.I)
  if not m:continue
  nums=[float(x) for x in re.findall(r'(?<!\w)-?\d+(?:\.\d+)?',f[m.start():m.start()+360])]
  if len(nums)>=6:out.append({'estacion':name,'rio':river,'nivel_instantaneo_m':nums[4],'caudal_instantaneo_m3s':nums[5]})
 return out

def dt(r):
 try:return datetime.strptime(f"{r['fecha']} {r['hora']}",'%d/%m/%Y %H:%M')
 except:return datetime.min

def main():
 u=choose_bhvgm();txt=pdftext(u);h=header(txt);sts=stations(txt)
 try:hist=json.loads(HIST.read_text(encoding='utf-8'))
 except:hist={'fuente':'INSIVUMEH','producto':'Histórico BHVGM estructurado','registros':[]}
 regs=hist.get('registros',[]);key=f"{h.get('fecha','')}|{h.get('hora','')}|{h.get('boletin','')}"
 if h.get('fecha') and h.get('hora') and sts and not any(x.get('clave')==key for x in regs):regs.append({'clave':key,**h,'url_pdf':u,'estaciones':sts})
 regs=sorted(regs,key=dt)[-400:];hist['registros']=regs;ev=[]
 if len(regs)>=2:
  a,b=regs[-2],regs[-1];hours=(dt(b)-dt(a)).total_seconds()/3600
  if hours>0:
   old={x['estacion']:x for x in a.get('estaciones',[])}
   for x in b.get('estaciones',[]):
    o=old.get(x['estacion']);
    if not o:continue
    dn=x['nivel_instantaneo_m']-o['nivel_instantaneo_m'];dq=x['caudal_instantaneo_m3s']-o['caudal_instantaneo_m3s']
    ev.append({'estacion':x['estacion'],'rio':x['rio'],'desde':f"{a['fecha']} {a['hora']}",'hasta':f"{b['fecha']} {b['hora']}",'horas_transcurridas':round(hours,2),'delta_nivel_m':round(dn,3),'delta_caudal_m3s':round(dq,2),'tendencia_calculada':'incrementando' if dn>0.02 else 'disminuyendo' if dn<-0.02 else 'estable'})
 hist['ultima_evolucion_real']=ev;hist['ultimo_pdf_bhvgm']=u;hist['actualizado_utc']=datetime.utcnow().isoformat()+'Z';HIST.write_text(json.dumps(hist,ensure_ascii=False,indent=2),encoding='utf-8')
 if LATEST.exists():
  d=json.loads(LATEST.read_text(encoding='utf-8'));d['insivumeh_evolucion_real']=ev;LATEST.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
