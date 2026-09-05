from __future__ import annotations

import io,json,re,html,unicodedata
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import requests
from pypdf import PdfReader

OUT=Path('data/fuentes_publicas'); OUT.mkdir(parents=True,exist_ok=True)
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}; TIMEOUT=35
SMN96='https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-96h'
SMN360='https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-360h'
INSI_DAILY='https://insivumeh.gob.gt/boletin-diario-hidrologia-aplicada/'
INSI_TREND='https://insivumeh.gob.gt/boletin-de-tendencia-de-niveles-2/'
INSI_SAT='https://insivumeh.gob.gt/porcentaje-de-saturacion-del-suelo-2/'
INSI_RAIN='https://insivumeh.gob.gt/mapas-ultimas-24-horas/'
INSI_RAIN_ROOT='https://insivumeh.gob.gt/img/MAPAS_24H/'
INSI_RAIN_SEASON=INSI_RAIN_ROOT+'Resumen_Departamentos.html'
BASINS=['Peñitas','Malpaso','Chicoasén','La Angostura','Bajo Grijalva-Ríos de la Sierra','Usumacinta','Presa Juan Sabines']
UPPER_USU_TERMS=['peten','sayaxche','las cruces','alta verapaz','chixoy','chisec','cahabon','chahal','senahu','raxruha','quiche','ixcan','huehuetenango','barillas','la pasion','usumacinta']

class LinkParser(HTMLParser):
 def __init__(self): super().__init__(); self.links=[]; self._href=None; self._txt=[]
 def handle_starttag(self,tag,attrs):
  if tag.lower()=='a': self._href=dict(attrs).get('href'); self._txt=[]
 def handle_data(self,data):
  if self._href is not None:self._txt.append(data)
 def handle_endtag(self,tag):
  if tag.lower()=='a' and self._href is not None:self.links.append((self._href,' '.join(self._txt).strip()));self._href=None;self._txt=[]
class TableParser(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  t=tag.lower()
  if t=='tr':self.row=[]
  elif t in ('td','th') and self.row is not None:self.cell=[]
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  t=tag.lower()
  if t in ('td','th') and self.cell is not None and self.row is not None:self.row.append(re.sub(r'\s+',' ',' '.join(self.cell)).strip());self.cell=None
  elif t=='tr' and self.row is not None:
   if any(self.row):self.rows.append(self.row)
   self.row=None

def fetch_text(url):
 r=requests.get(url,headers=UA,timeout=TIMEOUT);r.raise_for_status();return r.text,{'status_code':r.status_code,'etag':r.headers.get('ETag'),'last_modified':r.headers.get('Last-Modified')}
def clean_text(raw):
 raw=re.sub(r'(?is)<script.*?</script>|<style.*?</style>',' ',raw);raw=re.sub(r'(?i)<br\s*/?>|</p>|</tr>|</li>|</h\d>|</div>','\n',raw);raw=re.sub(r'(?s)<[^>]+>',' ',raw);raw=html.unescape(raw).replace('\xa0',' ');return '\n'.join(re.sub(r'[ \t]+',' ',x).strip() for x in raw.splitlines() if re.sub(r'[ \t]+',' ',x).strip())
def pick(pattern,text,flags=re.I):
 m=re.search(pattern,text,flags);return m.group(1).strip() if m else None
def parse_range(s):
 if not s:return {'texto':None,'min_mm':None,'max_mm':None}
 s=re.sub(r'\s+',' ',s).strip();m=re.search(r'(\d+(?:\.\d+)?)\s*(?:a|-|–)\s*(\d+(?:\.\d+)?)',s)
 if m:return {'texto':f'{m.group(1)} a {m.group(2)}','min_mm':float(m.group(1)),'max_mm':float(m.group(2))}
 m=re.search(r'(\d+(?:\.\d+)?)',s);return {'texto':s,'min_mm':float(m.group(1)) if m else None,'max_mm':float(m.group(1)) if m else None}
def meta_fields(txt):return {'aviso':pick(r'No\.\s*Aviso:\s*(\d+)',txt),'fecha':pick(r'Ciudad de México\s*a\s*([^\n]+)',txt),'emision':pick(r'Emisión:\s*([0-9]{1,2}:[0-9]{2}h?)',txt)}
def parse_smn96(raw):
 txt=clean_text(raw);meta=meta_fields(txt);tp=TableParser();tp.feed(raw);ventanas={w:{b:parse_range(None) for b in BASINS} for w in ['0-24','24-48','48-72','72-96']}
 for i,row in enumerate(tp.rows):
  m=re.search(r'Pronóstico\s*(0-24|24-48|48-72|72-96)\s*h',' | '.join(row),re.I)
  if not m:continue
  for rr in tp.rows[i+1:i+5]:
   if rr and re.search(r'Precipitación',rr[0],re.I):
    for k,b in enumerate(BASINS):ventanas[m.group(1)][b]=parse_range(rr[k+1] if k+1<len(rr) else None)
    break
 return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 96 h','url':SMN96,**meta,'ventanas':ventanas,'completo':all(all(v['texto'] for v in ventanas[w].values()) for w in ventanas)}
def basin_ranges_from_sentence(sentence):
 result={};aliases={'Peñitas':['Peñitas'],'Malpaso':['Malpaso'],'Chicoasén':['Chicoasén'],'La Angostura':['La Angostura'],'Bajo Grijalva-Ríos de la Sierra':['Bajo Grijalva'],'Usumacinta':['Usumacinta'],'Presa Juan Sabines':['Juan Sabines']}
 for clause in re.split(r';|\.(?:\s|$)',sentence):
  rng=parse_range(clause);low=clause.lower()
  if rng['min_mm'] is not None:
   for basin,names in aliases.items():
    if any(n.lower() in low for n in names):result[basin]=rng.copy()
 return result
def parse_smn360(raw):
 txt=clean_text(raw);meta=meta_fields(txt);markers=list(re.finditer(r'Período de validez\s*([^\n]+)',txt,re.I));periods=[]
 for i,m in enumerate(markers[:2]):
  block=txt[m.end():(markers[i+1].start() if i+1<len(markers) else len(txt))];lines=[]
  for line in block.splitlines():
   if re.search(r'Mapa de lluvia acumulada|Gráficas|PRONÓSTICO DIARIO|corrida de las|Nota de cautela',line,re.I):break
   if line.strip():lines.append(line.strip())
  desc=' '.join(lines);periods.append({'ventana':'96-168 h' if i==0 else '168-360 h','validez':m.group(1).strip(),'descripcion':desc,'rangos_por_cuenca':basin_ranges_from_sentence(desc)})
 return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 360 h','url':SMN360,**meta,'periodos':periods,'completo':len(periods)>=2}
def extract_pdf_text(url):
 r=requests.get(url,headers=UA,timeout=TIMEOUT);r.raise_for_status();reader=PdfReader(io.BytesIO(r.content));return '\n'.join((p.extract_text() or '') for p in reader.pages),len(r.content)
def ascii_text(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode('ascii')).strip()
def find_context(text,terms,radius=2):
 lines=[re.sub(r'\s+',' ',x).strip() for x in text.splitlines() if x.strip()];out=[]
 for i,line in enumerate(lines):
  if any(t.lower() in line.lower() for t in terms):
   x=' | '.join(lines[max(0,i-radius):i+radius+1])
   if x not in out:out.append(x)
 return out[:20]
def parse_insivumeh_header(text):
 flat=ascii_text(text);return {'boletin':pick(r'BOLETIN\s*(?:No\.?|N[oº°]\.?)\s*(\d+)',flat),'fecha':pick(r'Fecha\s*:\s*(\d{1,2}/\d{1,2}/\d{4})',flat),'hora':pick(r'Hora\s*:\s*(\d{1,2}:\d{2})',flat),'hora_fuente':'encabezado_BHVGM'}
def parse_insivumeh_stations(text):
 flat=ascii_text(text);targets=[('El Tigre','Usumacinta','Las Cruces, Petén','El Tigre Usumacinta Las Cruces'),('El Porvenir','La Pasión','Las Cruces, Petén','El Porvenir La Pasion Las Cruces'),('San Agustín Chixoy','Chixoy','Chisec, Alta Verapaz','San Agustin Chixoy Chixoy Chisec'),('Puente Chocox','Chixoy','Canillá, Quiché','Puente Chocox Chixoy Canilla'),('Machaquilá','Machaquilá','Poptún, Petén','Machaquila Machaquila Poptun')];out=[]
 for station,river,location,alias in targets:
  m=re.search(re.escape(alias),flat,re.I)
  if not m:continue
  nums=[float(x) for x in re.findall(r'(?<!\w)-?\d+(?:\.\d+)?',flat[m.start():m.start()+360])]
  if len(nums)>=6:out.append({'estacion':station,'rio':river,'ubicacion':location,'nivel_referencia_min_m':nums[0],'nivel_referencia_max_m':nums[1],'caudal_referencia_min_m3s':nums[2],'caudal_referencia_max_m3s':nums[3],'nivel_instantaneo_m':nums[4],'caudal_instantaneo_m3s':nums[5],'calidad':'extraido_del_BHVGM','nota_referencia':'Máximos como referencia estadística; no son umbral de inundación.'})
 return out
def parse_insivumeh():
 raw,meta=fetch_text(INSI_DAILY);p=LinkParser();p.feed(raw);c=[(urljoin(INSI_DAILY,h),t) for h,t in p.links if '.pdf' in urljoin(INSI_DAILY,h).lower()];pdf=c[-1][0] if c else None;result={'fuente':'INSIVUMEH','producto':'BHVGM','url_pagina':INSI_DAILY,'url_pdf':pdf,'http':meta,'estaciones_estructuradas':[],'fragmentos_relevantes':[],'completo':False}
 if pdf:
  txt,n=extract_pdf_text(pdf);result['pdf_bytes']=n;result.update(parse_insivumeh_header(txt));result['fragmentos_relevantes']=find_context(txt,['Chixoy','La Pasión','El Porvenir','El Tigre','Usumacinta','Machaquilá'],3);result['estaciones_estructuradas']=parse_insivumeh_stations(txt);result['completo']=bool(result['fragmentos_relevantes'])
 return result

def parse_accumulated_page(url,period):
 try:
  raw,meta=fetch_text(url);txt=clean_text(raw);date_range=pick(r'(?:Época lluviosa|[A-Za-z]+\s+\d{4})\s*:\s*([^\n]+)',txt);stations=[]
  for name,branch in [('Chixoy Hidro','Chixoy/Salinas'),('Cobán','Chixoy/Salinas'),('Santa María Cahabón','Chixoy/Salinas'),('Panzos PHC Altaverapaz','Chixoy/Salinas')]:
   m=re.search(re.escape(name)+r'.{0,220}?(\d+(?:\.\d+)?)\s*mm\s*acumulados',txt,re.I|re.S)
   if m:stations.append({'estacion':name,'rama_aportante':branch,'acumulado_mm':float(m.group(1)),'uso':'contexto_antecedente','gobierna_semaforo':False})
  return {'periodo':period,'url':url,'rango':date_range,'estaciones_relevantes':stations,'http':meta,'nota':'Datos puntuales; no representan promedio areal de la cuenca y no se suman.'}
 except Exception as e:return {'periodo':period,'url':url,'error':str(e),'estaciones_relevantes':[]}
def parse_guatemala_rain():
 raw,meta=fetch_text(INSI_RAIN);p=LinkParser();p.feed(raw);links={}
 for href,txt in p.links:
  label=(txt+' '+href).lower();u=urljoin(INSI_RAIN,href)
  if 'diario' in label and 'lluv' in label:links['24h']=u
  elif 'semanal' in label and 'lluv' in label:links['semanal']=u
  elif 'mensual' in label and 'lluv' in label:links['mensual']=u
 products=[{'periodo':k,'url':v,'tipo':'mapa_oficial','extraccion_areal':False} for k,v in links.items()]
 season=parse_accumulated_page(INSI_RAIN_SEASON,'epoca_lluviosa')
 return {'fuente':'INSIVUMEH','producto':'Acumulados multitemporales Guatemala','pagina':INSI_RAIN,'http':meta,'mapas':products,'epoca_lluviosa':season,'ambito_operativo':'cuenca alta Usumacinta: Chixoy/Salinas, La Pasión, Petén y áreas aportantes verificadas','regla':'No convertir colores del mapa a mm exactos sin extracción geoespacial validada; no sumar estaciones ni tratarlas como promedio de cuenca.','completo':bool(products)}

def relevant_saturation_text(txt):
 flat=ascii_text(txt).lower();hits=[]
 for sentence in re.split(r'(?<=[.!?])\s+',flat):
  if ('saturacion' in sentence or '90%' in sentence or '90 %' in sentence) and any(t in sentence for t in UPPER_USU_TERMS):hits.append(sentence[:1200])
 return hits[:12]
def parse_saturation_pdf(url):
 txt,n=extract_pdf_text(url);flat=ascii_text(txt);date=pick(r'(\d{1,2}\s+de\s+[A-Za-z]+\s+de\s+\d{4})',flat);hour=pick(r'(\d{1,2}:\d{2})\s*hrs',flat);contexts=relevant_saturation_text(txt)
 upper=[];lower=[]
 for c in contexts:
  target=lower if ('capa inferior' in c or '30 centimetros hasta' in c) else upper
  target.append(c)
 return {'url_pdf':url,'fecha':date,'hora':hour,'pdf_bytes':n,'capa_superior_contexto':upper,'capa_inferior_contexto':lower,'umbral_destacado_pct':90,'modelo':'Sacramento / CAFFG','nota':'Contexto espacial textual oficial. No se asigna porcentaje puntual a la cuenca si el mapa no ofrece extracción geoespacial validada.'}
def parse_guatemala_saturation():
 raw,meta=fetch_text(INSI_SAT);p=LinkParser();p.feed(raw);candidates=[]
 for href,txt in p.links:
  u=urljoin(INSI_SAT,href);label=(txt+' '+href).lower()
  if '.pdf' in u.lower() and ('satur' in label or 'bess' in label):candidates.append(u)
 result={'fuente':'INSIVUMEH','producto':'Saturación del suelo','pagina':INSI_SAT,'http':meta,'modelo':'Sacramento / CAFFG','capas':{'superior':'0-30 cm','inferior':'30 cm a 1-3 m'},'ambito_operativo':'zonas aportantes verificadas de la cuenca alta del Usumacinta','ultimo_boletin':None,'completo':False,'regla':'La coincidencia espacial con la cuenca alta es contexto antecedente; no implica por sí sola una creciente ni se transforma en porcentaje de cuenca.'}
 if candidates:
  try:result['ultimo_boletin']=parse_saturation_pdf(candidates[-1]);result['completo']=True
  except Exception as e:result['error_pdf']=str(e)
 return result

def main():
 now=datetime.now(timezone.utc).isoformat();status={'generated_utc':now,'complete':False,'errors':[]};payload={'generated_utc':now,'smn96':None,'smn360':None,'insivumeh':None,'guatemala_acumulados':None,'guatemala_saturacion':None,'links':{'insivumeh_tendencia':INSI_TREND,'insivumeh_saturacion':INSI_SAT,'insivumeh_acumulados':INSI_RAIN}}
 for key,url,parser in [('smn96',SMN96,parse_smn96),('smn360',SMN360,parse_smn360)]:
  try:raw,meta=fetch_text(url);obj=parser(raw);obj['http']=meta;payload[key]=obj
  except Exception as e:status['errors'].append(f'{key}: {e}')
 for key,parser in [('insivumeh',parse_insivumeh),('guatemala_acumulados',parse_guatemala_rain),('guatemala_saturacion',parse_guatemala_saturation)]:
  try:payload[key]=parser()
  except Exception as e:status['errors'].append(f'{key}: {e}')
 keys=('smn96','smn360','insivumeh','guatemala_acumulados','guatemala_saturacion');status['complete']=all(payload.get(k) for k in keys) and not status['errors'];status['products']={k:{'available':bool(payload.get(k)),'complete':bool(payload.get(k,{}).get('completo')) if isinstance(payload.get(k),dict) else False} for k in keys};(OUT/'latest.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8');(OUT/'Estado_Fuentes_Publicas.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
