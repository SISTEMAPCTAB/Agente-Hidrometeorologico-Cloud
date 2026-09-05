from __future__ import annotations
import json,re,html
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import requests

OUT=Path('data/fuentes_publicas');LATEST=OUT/'latest.json'
RAIN='https://insivumeh.gob.gt/mapas-ultimas-24-horas/'
SAT='https://insivumeh.gob.gt/porcentaje-de-saturacion-del-suelo-2/'
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}

class Assets(HTMLParser):
 def __init__(self):super().__init__();self.items=[]
 def handle_starttag(self,t,a):
  d=dict(a);t=t.lower()
  if t=='a' and d.get('href'):self.items.append(('a',d['href'],d.get('title','')))
  if t=='img' and d.get('src'):self.items.append(('img',d['src'],d.get('alt','')+' '+d.get('title','')))

def fetch(u):
 r=requests.get(u,headers=UA,timeout=35);r.raise_for_status();return r.text

def discover_rain():
 raw=fetch(RAIN);p=Assets();p.feed(raw);out={}
 for typ,ref,label in p.items:
  u=urljoin(RAIN,html.unescape(ref));lab=(label+' '+ref).lower()
  if not re.search(r'\.(?:png|jpe?g|webp|html?)($|\?)',u,re.I):continue
  if ('24' in lab or 'diari' in lab) and ('lluv' in lab or 'precip' in lab or 'mapas_24h' in lab):out.setdefault('24h',u)
  elif ('seman' in lab or '7_dias' in lab or '7dias' in lab) and ('lluv' in lab or 'precip' in lab):out.setdefault('semanal',u)
  elif ('mens' in lab or re.search(r'/20\d{2}/?\d{2}',u)) and ('lluv' in lab or 'precip' in lab):out.setdefault('mensual',u)
 return {'pagina':RAIN,'descubrimiento':'anclas+imagenes','mapas':[{'periodo':k,'url':v,'tipo':'mapa_oficial','extraccion_areal':False} for k,v in out.items()],'regla':'Los mapas no se convierten a milímetros exactos ni a promedio de cuenca sin extracción geoespacial validada.'}

def candidate_score(u,label):
 s=(u+' '+label).lower();score=0
 m=re.search(r'bess[-_ ]?(?:2026[-_ ]?)?(\d{1,3})',s)
 if m:score+=10000+int(m.group(1))
 if 'satur' in s:score+=100
 if 'bess' in s:score+=200
 return score

def discover_saturation():
 raw=fetch(SAT);p=Assets();p.feed(raw);c=[]
 for typ,ref,label in p.items:
  u=urljoin(SAT,html.unescape(ref));lab=label+' '+ref
  if '.pdf' in u.lower() and ('satur' in lab.lower() or 'bess' in lab.lower()):c.append((candidate_score(u,lab),u,label.strip()))
 c.sort(reverse=True)
 return {'pagina':SAT,'seleccion':'mayor identificador BESS localizado; no depende del orden HTML','ultimo_pdf_candidato':c[0][1] if c else None,'etiqueta':c[0][2] if c else None,'candidatos_localizados':len(c),'nota':'La existencia del PDF no implica porcentaje específico para la cuenca; sólo se estructura contenido espacial cuando puede verificarse.'}

def main():
 if not LATEST.exists():return
 d=json.loads(LATEST.read_text(encoding='utf-8'));diag={'actualizado_utc':datetime.now(timezone.utc).isoformat(),'errores':[]}
 try:
  r=discover_rain();diag['lluvia']=r
  if d.get('guatemala_acumulados') is None:d['guatemala_acumulados']={}
  d['guatemala_acumulados']['descubrimiento_robusto']=r
 except Exception as e:diag['errores'].append('lluvia: '+str(e))
 try:
  s=discover_saturation();diag['saturacion']=s
  if d.get('guatemala_saturacion') is None:d['guatemala_saturacion']={}
  d['guatemala_saturacion']['descubrimiento_robusto']=s
 except Exception as e:diag['errores'].append('saturacion: '+str(e))
 d['insivumeh_contexto_diagnostico']=diag;LATEST.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
