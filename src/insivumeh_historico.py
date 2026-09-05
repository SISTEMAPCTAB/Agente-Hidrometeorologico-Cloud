from __future__ import annotations
import io,json,re,subprocess,tempfile,unicodedata
from datetime import datetime,timezone
from pathlib import Path
import requests
from pypdf import PdfReader

OUT=Path('data/fuentes_publicas'); OUT.mkdir(parents=True,exist_ok=True)
HIST=OUT/'insivumeh_historico.json'; LATEST=OUT/'latest.json'
BHVGM='https://insivumeh.gob.gt/hidrologia/hidro/niveles/BHVGM.pdf'
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}
TARGETS=[('El Tigre','Usumacinta'),('El Porvenir','La Pasión'),('San Agustín Chixoy','Chixoy'),('Playa Grande','Chixoy'),('Puente Chocox','Chixoy')]

def norm(s): return unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode()
def asc(s): return re.sub(r'\s+',' ',norm(s)).strip()
def words_pattern(s):
 # pdftotext puede insertar espacios entre letras/palabras por la geometría del PDF.
 # Se busca cada palabra permitiendo cualquier cantidad de espacios internos.
 words=asc(s).split()
 return r'\b'+r'\s+'.join(re.escape(w) for w in words)+r'\b'
def compact(s): return re.sub(r'[^a-z0-9]','',asc(s).lower())
def pdftext(u):
 r=requests.get(u,headers=UA,timeout=35);r.raise_for_status();raw=r.content
 try:
  with tempfile.NamedTemporaryFile(suffix='.pdf') as f:
   f.write(raw);f.flush();p=subprocess.run(['pdftotext','-layout',f.name,'-'],capture_output=True,text=True,timeout=25,check=True)
   if p.stdout.strip():return p.stdout
 except Exception:pass
 reader=PdfReader(io.BytesIO(raw));return '\n'.join((p.extract_text() or '') for p in reader.pages)
def one(p,t):
 m=re.search(p,t,re.I);return m.group(1).strip() if m else None
def header(txt):
 f=asc(txt);return {'boletin':one(r'BOLETIN\s*(?:No\.?|N[oº°]\.?)?\s*(\d+)',f) or one(r'BHVGM\s*[- ]?(\d+)[- ]?2026',f),'fecha':one(r'Fecha\s*:\s*(?:[A-Za-z]+\s+)?(\d{1,2}/\d{1,2}/\d{4})',f),'hora':one(r'Hora\s*:\s*(\d{1,2}:\d{2})',f)}
def station_record(segment,name,river):
 clean=re.split(r'\bHora\s*:',segment,1,flags=re.I)[0]
 nums=[float(x) for x in re.findall(r'(?<![A-Za-z0-9])-?\d+(?:\.\d+)?',clean)]
 if len(nums)<6:return None
 vals=nums[-6:]
 return {'estacion':name,'rio':river,'nivel_referencia_min_m':vals[0],'nivel_referencia_max_m':vals[1],'caudal_referencia_min_m3s':vals[2],'caudal_referencia_max_m3s':vals[3],'nivel_instantaneo_m':vals[4],'caudal_instantaneo_m3s':vals[5],'calidad':'extraido_del_BHVGM','nota_referencia':'Máximos como referencia estadística; no son umbral de inundación.'}
def stations(txt):
 raw_lines=txt.splitlines();lines=[asc(x) for x in raw_lines if x.strip()]
 out=[];seen=set()
 for name,river in TARGETS:
  np,rp=words_pattern(name),words_pattern(river);nc,rc=compact(name),compact(river);candidates=[]
  for i,line in enumerate(lines):
   lc=compact(line)
   direct=(re.search(np,line,re.I) and re.search(rp,line,re.I)) or (nc in lc and rc in lc)
   if direct:candidates.append(line)
   if not candidates:
    for width in (2,3):
     joined=asc(' '.join(lines[i:i+width]));jc=compact(joined)
     if (re.search(np,joined,re.I) and re.search(rp,joined,re.I)) or (nc in jc and rc in jc): candidates.append(joined);break
  for seg in candidates:
   rec=station_record(seg,name,river)
   if rec and name not in seen: out.append(rec);seen.add(name);break
 return out
def dt(r):
 try:return datetime.strptime(f"{r['fecha']} {r['hora']}",'%d/%m/%Y %H:%M')
 except:return datetime.min
def signal(ev):
 e=next((x for x in ev if x.get('estacion')=='El Tigre'),None)
 if not e:return 'Sin tendencia comparable aguas arriba'
 return {'incrementando':'Señal aguas arriba en aumento','estable':'Señal aguas arriba estable','disminuyendo':'Señal aguas arriba disminuyendo'}.get(e.get('tendencia_calculada'),'Sin tendencia comparable aguas arriba')
def main():
 txt=pdftext(BHVGM);h=header(txt);sts=stations(txt)
 try:hist=json.loads(HIST.read_text(encoding='utf-8'))
 except:hist={'fuente':'INSIVUMEH','producto':'Histórico BHVGM estructurado','registros':[]}
 regs=hist.get('registros',[]);cut=f"{h.get('fecha','')}|{h.get('hora','')}";regs=[r for r in regs if f"{r.get('fecha','')}|{r.get('hora','')}"!=cut]
 if h.get('fecha') and h.get('hora') and sts:regs.append({'clave':f"{cut}|{h.get('boletin') or 's/d'}",**h,'url_pdf':BHVGM,'estaciones':sts})
 regs=sorted(regs,key=dt)[-400:];hist['registros']=regs;ev=[]
 if len(regs)>=2:
  a,b=regs[-2],regs[-1];hours=(dt(b)-dt(a)).total_seconds()/3600
  if hours>0:
   old={x['estacion']:x for x in a.get('estaciones',[])}
   for x in b.get('estaciones',[]):
    o=old.get(x['estacion'])
    if not o:continue
    dn=x['nivel_instantaneo_m']-o['nivel_instantaneo_m'];dq=x['caudal_instantaneo_m3s']-o['caudal_instantaneo_m3s']
    ev.append({'estacion':x['estacion'],'rio':x['rio'],'desde':f"{a['fecha']} {a['hora']}",'hasta':f"{b['fecha']} {b['hora']}",'horas_transcurridas':round(hours,2),'delta_nivel_m':round(dn,3),'delta_caudal_m3s':round(dq,2),'tendencia_calculada':'incrementando' if dn>0.02 else 'disminuyendo' if dn<-0.02 else 'estable'})
 hist['ultima_evolucion_real']=ev;hist['senal_usumacinta_alta']=signal(ev);hist['ultimo_pdf_bhvgm']=BHVGM;hist['actualizado_utc']=datetime.now(timezone.utc).isoformat()
 if not any(x.get('estacion')=='El Tigre' for x in sts):hist['diagnostico_el_tigre']='El Tigre no fue estructurado aun; no se publica valor fabricado.'
 else:hist.pop('diagnostico_el_tigre',None)
 HIST.write_text(json.dumps(hist,ensure_ascii=False,indent=2),encoding='utf-8')
 if LATEST.exists():
  d=json.loads(LATEST.read_text(encoding='utf-8'));d['insivumeh_evolucion_real']=ev;d['senal_usumacinta_alta']=hist['senal_usumacinta_alta'];d['insivumeh_bhvgm_actual']={'boletin':h.get('boletin'),'fecha':h.get('fecha'),'hora':h.get('hora'),'url_pdf':BHVGM,'estaciones':sts};LATEST.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
