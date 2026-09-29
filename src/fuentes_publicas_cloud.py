from __future__ import annotations

import io,json,re,html,unicodedata
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
import requests
from pypdf import PdfReader

OUT=Path('data/fuentes_publicas'); OUT.mkdir(parents=True,exist_ok=True)
HIST=OUT/'insivumeh_historico.json'
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}; TIMEOUT=35
SMN96='https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-96h';SMN360='https://smn.conagua.gob.mx/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-especial-cuencas-360h'
INSI_DAILY='https://insivumeh.gob.gt/boletin-diario-hidrologia-aplicada/';INSI_BHVGM='https://insivumeh.gob.gt/hidrologia/hidro/niveles/BHVGM.pdf';INSI_TREND='https://insivumeh.gob.gt/boletin-de-tendencia-de-niveles-2/';INSI_SAT='https://insivumeh.gob.gt/porcentaje-de-saturacion-del-suelo-2/';INSI_RAIN='https://insivumeh.gob.gt/mapas-ultimas-24-horas/';INSI_RAIN_ROOT='https://insivumeh.gob.gt/img/MAPAS_24H/';INSI_RAIN_SEASON=INSI_RAIN_ROOT+'Resumen_Departamentos.html'
BASINS=['Peñitas','Malpaso','Chicoasén','La Angostura','Bajo Grijalva-Ríos de la Sierra','Usumacinta','Presa Juan Sabines'];UPPER_USU_TERMS=['peten','sayaxche','las cruces','alta verapaz','chixoy','chisec','cahabon','chahal','senahu','raxruha','quiche','ixcan','huehuetenango','barillas','la pasion','usumacinta']
RAIN_STATIONS=[('El Tigre','Usumacinta directo','INS171302AT','alta'),('El Porvenir','La Pasión','INS171001AT','alta'),('Bethel','Usumacinta/Lacantún-frontera','INS171301AT','media'),('Machaquilá','La Pasión–Machaquilá','INS171201AT','alta'),('Mactún','San Pedro','INS170401AT','alta'),('Chixoy Hidro','Chixoy/Salinas',None,'alta'),('Cobán','Chixoy/Salinas',None,'media'),('Santa María Cahabón','Chixoy/Salinas',None,'media'),('Panzos PHC Altaverapaz','Chixoy/Salinas',None,'media')]
class LinkParser(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self._href=None;self._txt=[]
 def handle_starttag(self,t,a):
  if t.lower()=='a':self._href=dict(a).get('href');self._txt=[]
 def handle_data(self,d):
  if self._href is not None:self._txt.append(d)
 def handle_endtag(self,t):
  if t.lower()=='a' and self._href is not None:self.links.append((self._href,' '.join(self._txt).strip()));self._href=None;self._txt=[]
class TableParser(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,t,a):
  t=t.lower()
  if t=='tr':self.row=[]
  elif t in ('td','th') and self.row is not None:self.cell=[]
 def handle_data(self,d):
  if self.cell is not None:self.cell.append(d)
 def handle_endtag(self,t):
  t=t.lower()
  if t in ('td','th') and self.cell is not None and self.row is not None:self.row.append(re.sub(r'\s+',' ',' '.join(self.cell)).strip());self.cell=None
  elif t=='tr' and self.row is not None:
   if any(self.row):self.rows.append(self.row)
   self.row=None
def fetch_text(u):
 r=requests.get(u,headers=UA,timeout=TIMEOUT);r.raise_for_status();return r.text,{'status_code':r.status_code,'etag':r.headers.get('ETag'),'last_modified':r.headers.get('Last-Modified')}
def clean_text(raw):raw=re.sub(r'(?is)<script.*?</script>|<style.*?</style>',' ',raw);raw=re.sub(r'(?i)<br\s*/?>|</p>|</tr>|</li>|</h\d>|</div>','\n',raw);raw=re.sub(r'(?s)<[^>]+>',' ',raw);return '\n'.join(re.sub(r'[ \t]+',' ',x).strip() for x in html.unescape(raw).replace('\xa0',' ').splitlines() if x.strip())
def pick(p,t,flags=re.I):m=re.search(p,t,flags);return m.group(1).strip() if m else None
def parse_range(s):
 if not s:return {'texto':None,'min_mm':None,'max_mm':None}
 s=re.sub(r'\s+',' ',s).strip();m=re.search(r'(\d+(?:\.\d+)?)\s*(?:a|-|–)\s*(\d+(?:\.\d+)?)',s)
 if m:return {'texto':f'{m.group(1)} a {m.group(2)}','min_mm':float(m.group(1)),'max_mm':float(m.group(2))}
 m=re.search(r'(\d+(?:\.\d+)?)',s);return {'texto':s,'min_mm':float(m.group(1)) if m else None,'max_mm':float(m.group(1)) if m else None}
def meta_fields(t):return {'aviso':pick(r'No\.\s*Aviso:\s*(\d+)',t),'fecha':pick(r'Ciudad de México\s*a\s*([^\n]+)',t),'emision':pick(r'Emisión:\s*([0-9]{1,2}:[0-9]{2}h?)',t)}
def parse_smn96(raw):
 txt=clean_text(raw);tp=TableParser();tp.feed(raw);v={w:{b:parse_range(None) for b in BASINS} for w in ['0-24','24-48','48-72','72-96']}
 for i,row in enumerate(tp.rows):
  m=re.search(r'Pronóstico\s*(0-24|24-48|48-72|72-96)\s*h',' | '.join(row),re.I)
  if m:
   for rr in tp.rows[i+1:i+5]:
    if rr and re.search(r'Precipitación',rr[0],re.I):
     for k,b in enumerate(BASINS):v[m.group(1)][b]=parse_range(rr[k+1] if k+1<len(rr) else None)
     break
 return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 96 h','url':SMN96,**meta_fields(txt),'ventanas':v,'completo':all(all(x['texto'] for x in v[w].values()) for w in v)}
def basin_ranges_from_sentence(s):
 out={};aliases={'Peñitas':['Peñitas'],'Malpaso':['Malpaso'],'Chicoasén':['Chicoasén'],'La Angostura':['La Angostura'],'Bajo Grijalva-Ríos de la Sierra':['Bajo Grijalva'],'Usumacinta':['Usumacinta'],'Presa Juan Sabines':['Juan Sabines']}
 for c in re.split(r';|\.(?:\s|$)',s):
  r=parse_range(c)
  if r['min_mm'] is not None:
   for b,n in aliases.items():
    if any(x.lower() in c.lower() for x in n):out[b]=r.copy()
 return out
def parse_smn360(raw):
 txt=clean_text(raw);markers=list(re.finditer(r'Período de validez\s*([^\n]+)',txt,re.I));ps=[]
 for i,m in enumerate(markers[:2]):
  block=txt[m.end():(markers[i+1].start() if i+1<len(markers) else len(txt))];lines=[]
  for line in block.splitlines():
   if re.search(r'Mapa de lluvia acumulada|Gráficas|PRONÓSTICO DIARIO|corrida de las|Nota de cautela',line,re.I):break
   if line.strip():lines.append(line.strip())
  d=' '.join(lines);ps.append({'ventana':'96-168 h' if i==0 else '168-360 h','validez':m.group(1).strip(),'descripcion':d,'rangos_por_cuenca':basin_ranges_from_sentence(d)})
 return {'fuente':'SMN','producto':'Pronóstico especial por cuencas 360 h','url':SMN360,**meta_fields(txt),'periodos':ps,'completo':len(ps)>=2}
def extract_pdf_text(u):r=requests.get(u,headers=UA,timeout=TIMEOUT);r.raise_for_status();return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(r.content)).pages),len(r.content)
def ascii_text(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode('ascii')).strip()
def find_context(text,terms,radius=2):
 lines=[re.sub(r'\s+',' ',x).strip() for x in text.splitlines() if x.strip()];out=[]
 for i,line in enumerate(lines):
  if any(t.lower() in line.lower() for t in terms):
   x=' | '.join(lines[max(0,i-radius):i+radius+1]);out.append(x) if x not in out else None
 return out[:20]
def parse_insivumeh_header(text):flat=ascii_text(text);return {'boletin':pick(r'BOLETIN\s*(?:No\.?|N[oº°]\.?)\s*(\d+)',flat),'fecha':pick(r'Fecha\s*:\s*(\d{1,2}/\d{1,2}/\d{4})',flat),'hora':pick(r'Hora\s*:\s*(\d{1,2}:\d{2})',flat),'hora_fuente':'encabezado_BHVGM'}
def parse_insivumeh_stations(text):
 flat=ascii_text(text);targets=[('El Tigre','Usumacinta','Las Cruces, Petén','El Tigre Usumacinta Las Cruces'),('El Porvenir','La Pasión','Las Cruces, Petén','El Porvenir La Pasion Las Cruces'),('San Agustín Chixoy','Chixoy','Chisec, Alta Verapaz','San Agustin Chixoy Chixoy Chisec'),('Puente Chocox','Chixoy','Canillá, Quiché','Puente Chocox Chixoy Canilla'),('Machaquilá','Machaquilá','Poptún, Petén','Machaquila Machaquila Poptun')];out=[]
 for station,river,loc,alias in targets:
  m=re.search(re.escape(alias),flat,re.I)
  if m:
   nums=[float(x) for x in re.findall(r'(?<!\w)-?\d+(?:\.\d+)?',flat[m.start():m.start()+360])]
   if len(nums)>=6:out.append({'estacion':station,'rio':river,'ubicacion':loc,'nivel_referencia_min_m':nums[0],'nivel_referencia_max_m':nums[1],'caudal_referencia_min_m3s':nums[2],'caudal_referencia_max_m3s':nums[3],'nivel_instantaneo_m':nums[4],'caudal_instantaneo_m3s':nums[5],'calidad':'extraido_del_BHVGM','nota_referencia':'Máximos como referencia estadística; no son umbral de inundación.'})
 return out
def parse_insivumeh():
 raw,meta=fetch_text(INSI_DAILY);p=LinkParser();p.feed(raw);c=[urljoin(INSI_DAILY,h) for h,t in p.links if '.pdf' in urljoin(INSI_DAILY,h).lower() and ('bhvgm' in (h+' '+t).lower() or 'golfo de mexico' in t.lower())];pdf=c[-1] if c else INSI_BHVGM;r={'fuente':'INSIVUMEH','producto':'BHVGM','url_pagina':INSI_DAILY,'url_pdf':pdf,'http':meta,'estaciones_estructuradas':[],'fragmentos_relevantes':[],'completo':False}
 if pdf:
  txt,n=extract_pdf_text(pdf);r['pdf_bytes']=n;r.update(parse_insivumeh_header(txt));r['fragmentos_relevantes']=find_context(txt,['Chixoy','La Pasión','El Porvenir','El Tigre','Usumacinta','Machaquilá'],3);r['estaciones_estructuradas']=parse_insivumeh_stations(txt);r['completo']=bool(r['fecha'] and r['hora'] and r['estaciones_estructuradas']);r['validacion_fecha']='encabezado_pdf'
 return r
def parse_bhvgm_datetime(obj):
 try:
  return datetime.strptime(f"{obj.get('fecha')} {obj.get('hora')}",'%d/%m/%Y %H:%M').replace(tzinfo=timezone.utc)
 except Exception:return None
def update_insivumeh_history(current):
 try:hist=json.loads(HIST.read_text(encoding='utf-8')) if HIST.exists() else {'fuente':'INSIVUMEH','producto':'Histórico BHVGM estructurado','registros':[]}
 except Exception:hist={'fuente':'INSIVUMEH','producto':'Histórico BHVGM estructurado','registros':[]}
 regs=hist.get('registros',[]);key=f"{current.get('fecha','')}|{current.get('hora','')}|{current.get('boletin','')}"
 if current.get('fecha') and current.get('hora') and current.get('estaciones_estructuradas') and not any(r.get('clave')==key for r in regs):
  regs.append({'clave':key,'boletin':current.get('boletin'),'fecha':current.get('fecha'),'hora':current.get('hora'),'url_pdf':current.get('url_pdf'),'estaciones':current.get('estaciones_estructuradas')})
 def dt(r):return parse_bhvgm_datetime(r) or datetime.min.replace(tzinfo=timezone.utc)
 regs=sorted(regs,key=dt)[-400:];hist['registros']=regs;hist['actualizado_utc']=datetime.now(timezone.utc).isoformat();HIST.write_text(json.dumps(hist,ensure_ascii=False,indent=2),encoding='utf-8')
 comparable=[]
 if len(regs)>=2:
  a,b=regs[-2],regs[-1];ta,tb=dt(a),dt(b);hours=(tb-ta).total_seconds()/3600
  if hours>0:
   amap={x.get('estacion'):x for x in a.get('estaciones',[])}
   for x in b.get('estaciones',[]):
    old=amap.get(x.get('estacion'))
    if not old:continue
    dn=x.get('nivel_instantaneo_m')-old.get('nivel_instantaneo_m') if x.get('nivel_instantaneo_m') is not None and old.get('nivel_instantaneo_m') is not None else None
    dq=x.get('caudal_instantaneo_m3s')-old.get('caudal_instantaneo_m3s') if x.get('caudal_instantaneo_m3s') is not None and old.get('caudal_instantaneo_m3s') is not None else None
    comparable.append({'estacion':x.get('estacion'),'rio':x.get('rio'),'desde':f"{a.get('fecha')} {a.get('hora')}",'hasta':f"{b.get('fecha')} {b.get('hora')}",'horas_transcurridas':round(hours,2),'delta_nivel_m':round(dn,3) if dn is not None else None,'delta_caudal_m3s':round(dq,2) if dq is not None else None,'tendencia_calculada':'incrementando' if dn is not None and dn>0.02 else 'disminuyendo' if dn is not None and dn<-0.02 else 'estable' if dn is not None else 'sin_dato'})
 hist['ultima_evolucion_real']=comparable;HIST.write_text(json.dumps(hist,ensure_ascii=False,indent=2),encoding='utf-8');return comparable
def parse_accumulated_page(url,period):
 try:
  raw,meta=fetch_text(url);txt=clean_text(raw);stations=[]
  for name,branch,code,confidence in RAIN_STATIONS:
   m=re.search(re.escape(name)+r'.{0,300}?(?:(INS\d+[A-Z]{2}).{0,120}?)?(\d+(?:\.\d+)?)\s*mm\s*acumulados',txt,re.I|re.S)
   if m:stations.append({'estacion':name,'codigo':m.group(1) or code,'rama_aportante':branch,'acumulado_mm':float(m.group(2)),'periodo':period,'confianza_influencia':confidence,'uso':'contexto_antecedente','gobierna_semaforo':False})
  return {'periodo':period,'url':url,'rango':pick(r'(?:Época lluviosa|[A-Za-z]+\s+\d{4})\s*:?\s*([^\n]+)',txt),'estaciones_relevantes':stations,'http':meta,'nota':'Acumulados puntuales por estación y periodo; no son promedio areal, no se suman y no gobiernan semáforo por sí solos.'}
 except Exception as e:return {'periodo':period,'url':url,'error':str(e),'estaciones_relevantes':[]}
def parse_guatemala_rain():
 raw,meta=fetch_text(INSI_RAIN);p=LinkParser();p.feed(raw);links={}
 for href,txt in p.links:
  label=(txt+' '+href).lower();u=urljoin(INSI_RAIN,href)
  if 'diario' in label and 'lluv' in label:links['24h']=u
  elif 'semanal' in label and 'lluv' in label:links['semanal']=u
  elif 'mensual' in label and 'lluv' in label:links['mensual']=u
 products=[]
 for k,u in links.items():
  pinfo={'periodo':k,'url':u,'tipo':'mapa_oficial','extraccion_areal':False,'estaciones_relevantes':[]}
  if u.lower().endswith(('.html','.htm')):pinfo.update(parse_accumulated_page(u,k))
  products.append(pinfo)
 season=parse_accumulated_page(INSI_RAIN_SEASON,'epoca_lluviosa')
 return {'fuente':'INSIVUMEH','producto':'Acumulados multitemporales Guatemala','pagina':INSI_RAIN,'http':meta,'mapas':products,'epoca_lluviosa':season,'estaciones_objetivo':[{'estacion':n,'rama':b,'codigo':c,'confianza':q} for n,b,c,q in RAIN_STATIONS],'ambito_operativo':'ramas aportantes verificadas de la cuenca alta del Usumacinta; no Petén completo','regla':'No convertir colores del mapa a mm exactos sin extracción geoespacial validada; no sumar estaciones ni tratarlas como promedio de cuenca.','completo':bool(products)}
def relevant_saturation_text(txt):
 flat=ascii_text(txt).lower();return [s[:1200] for s in re.split(r'(?<=[.!?])\s+',flat) if ('saturacion' in s or '90%' in s or '90 %' in s) and any(t in s for t in UPPER_USU_TERMS)][:12]
def parse_saturation_pdf(url):
 txt,n=extract_pdf_text(url);flat=ascii_text(txt);ctx=relevant_saturation_text(txt);upper=[];lower=[]
 for c in ctx:(lower if ('capa inferior' in c or '30 centimetros hasta' in c) else upper).append(c)
 return {'url_pdf':url,'fecha':pick(r'(\d{1,2}\s+de\s+[A-Za-z]+\s+de\s+\d{4})',flat),'hora':pick(r'(\d{1,2}:\d{2})\s*hrs',flat),'pdf_bytes':n,'capa_superior_contexto':upper,'capa_inferior_contexto':lower,'umbral_destacado_pct':90,'modelo':'Sacramento / CAFFG','nota':'Contexto espacial textual oficial; sin porcentaje de cuenca fabricado.'}
def parse_guatemala_saturation():
 raw,meta=fetch_text(INSI_SAT);p=LinkParser();p.feed(raw);c=[urljoin(INSI_SAT,h) for h,t in p.links if '.pdf' in urljoin(INSI_SAT,h).lower() and ('satur' in (t+' '+h).lower() or 'bess' in (t+' '+h).lower())];r={'fuente':'INSIVUMEH','producto':'Saturación del suelo','pagina':INSI_SAT,'http':meta,'modelo':'Sacramento / CAFFG','capas':{'superior':'0-30 cm','inferior':'30 cm a 1-3 m'},'ambito_operativo':'zonas aportantes verificadas de la cuenca alta del Usumacinta','ultimo_boletin':None,'completo':False}
 if c:
  try:r['ultimo_boletin']=parse_saturation_pdf(c[-1]);r['completo']=True
  except Exception as e:r['error_pdf']=str(e)
 return r
def main():
 now=datetime.now(timezone.utc).isoformat();status={'generated_utc':now,'complete':False,'errors':[]};payload={'generated_utc':now,'smn96':None,'smn360':None,'insivumeh':None,'insivumeh_evolucion_real':[],'guatemala_acumulados':None,'guatemala_saturacion':None,'links':{'insivumeh_tendencia':INSI_TREND,'insivumeh_saturacion':INSI_SAT,'insivumeh_acumulados':INSI_RAIN}}
 for key,url,parser in [('smn96',SMN96,parse_smn96),('smn360',SMN360,parse_smn360)]:
  try:raw,meta=fetch_text(url);obj=parser(raw);obj['http']=meta;payload[key]=obj
  except Exception as e:status['errors'].append(f'{key}: {e}')
 for key,parser in [('insivumeh',parse_insivumeh),('guatemala_acumulados',parse_guatemala_rain),('guatemala_saturacion',parse_guatemala_saturation)]:
  try:payload[key]=parser()
  except Exception as e:status['errors'].append(f'{key}: {e}')
 if payload.get('insivumeh'):
  try:
   prior=json.loads((OUT/'latest.json').read_text(encoding='utf-8')).get('insivumeh') or {}
   new_dt=parse_bhvgm_datetime(payload['insivumeh']);old_dt=parse_bhvgm_datetime(prior)
   if not new_dt or (old_dt and new_dt<old_dt) or not payload['insivumeh'].get('completo'):
    status['errors'].append('BHVGM sin fecha válida, incompleto o anterior: se conserva último corte verificado')
    payload['insivumeh']=prior
  except (OSError,ValueError,TypeError):pass
  try:payload['insivumeh_evolucion_real']=update_insivumeh_history(payload['insivumeh'])
  except Exception as e:status['errors'].append(f'insivumeh_historico: {e}')
 keys=('smn96','smn360','insivumeh','guatemala_acumulados','guatemala_saturacion');status['complete']=all(payload.get(k) for k in keys) and not status['errors'];status['products']={k:{'available':bool(payload.get(k)),'complete':bool(payload.get(k,{}).get('completo')) if isinstance(payload.get(k),dict) else False} for k in keys};status['historico_insivumeh']=str(HIST);(OUT/'latest.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8');(OUT/'Estado_Fuentes_Publicas.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
