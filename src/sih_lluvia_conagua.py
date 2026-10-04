from __future__ import annotations
import io,json,re
from datetime import datetime,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import requests
from pypdf import PdfReader

URL='https://sih.conagua.gob.mx/docs/precipitacion24horas.pdf'
OUT=Path('data/sih_lluvia'); OUT.mkdir(parents=True,exist_ok=True)
UA={'User-Agent':'Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0'}
MONTHS={'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12}

def source_date(text):
 m=re.search(r'Ciudad de M[eé]xico,?\s+a\s+(\d{1,2})\s+de\s+([A-Za-záéíóúñ]+)\s+del?\s+(\d{4})',text,re.I)
 if not m:return None
 return f"{int(m.group(3)):04d}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"

def source_period(text):
 # Conserva literalmente el periodo/umbral temporal impreso por CONAGUA.
 patterns=[
  r'(?:periodo|per[ií]odo)\s+(?:comprendido\s+)?(?:de|del)?\s*([^\n]{0,120}?\d{1,2}:\d{2}[^\n]{0,120}?\d{1,2}:\d{2}[^\n]*)',
  r'(?:de|del)\s+(\d{1,2}:\d{2}[^\n]{0,160}?(?:a|hasta)\s+(?:las\s+)?\d{1,2}:\d{2}[^\n]*)'
 ]
 for p in patterns:
  m=re.search(p,text,re.I)
  if m:return re.sub(r'\s+',' ',m.group(1)).strip(' .')
 return None

def clean_station(s):
 return re.sub(r'\s+',' ',s).strip(' ·,-')

CHIAPAS_INTERES=[
 'pichucalco','chapultenango','ixtacomitan','ixtacomitán','solosuchiapa','ixtapangajoya','juarez','juárez','reforma','ostuacan','ostuacán','amatan','amatán',
 'salto de agua','tila','yajalon','yajalón','sabanilla','tumbala','tumbalá','palenque','ocosingo','marques de comillas','marqués de comillas','benemerito de las americas','benemérito de las américas',
 'tulija','tulijá','lacantun','lacantún'
]
VERACRUZ_INTERES=[
 'las choapas','agua dulce','uxpanapa','moloacan','moloacán','minatitlan','minatitlán','hidalgotitlan','hidalgotitlán','jesus carranza','jesús carranza',
 'coatzacoalcos','tonala','tonalá','cuichapa','nanchital','ixhuatlan del sureste','ixhuatlán del sureste'
]

def state_rows(text,abbr,state,interest=None):
 rows=[]; seen=set()
 pat=re.compile(r'([^\n]{2,90}?,\s*'+re.escape(abbr)+r'\.\s*(?:SGT\*|SMN\*|INIFAP\*|CFE\*|SEMAR\*|PC\*)?)\s+(\d+(?:\.\d+)?)')
 low=text.lower()
 for m in pat.finditer(text):
  name=clean_station(m.group(1)); val=float(m.group(2))
  if '  ' in name:name=name.split('  ')[-1].strip()
  if interest:
   context=low[max(0,m.start()-40):min(len(low),m.end()+140)]
   if not any(k in context for k in interest):continue
  key=(name.lower(),val)
  if key not in seen:
   seen.add(key); rows.append({'estacion':name,'precipitacion_24h_mm':val,'estado':state})
 return sorted(rows,key=lambda x:x['precipitacion_24h_mm'],reverse=True)

def tabasco_rows(text):return state_rows(text,'Tab','Tabasco')
def chiapas_rows(text):return state_rows(text,'Chis','Chiapas',CHIAPAS_INTERES)
def veracruz_rows(text):return state_rows(text,'Ver','Veracruz',VERACRUZ_INTERES)

def fetch_freshest_pdf(now):
 stamp=str(int(now.timestamp()))
 browser_headers={
  **UA,
  'Accept':'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
  'Accept-Language':'es-MX,es;q=0.9,en;q=0.7',
  'Cache-Control':'no-cache, no-store, max-age=0',
  'Pragma':'no-cache',
  'Referer':'https://sih.conagua.gob.mx/',
 }
 candidates=[
  ('normal',f'{URL}?v={stamp}'),
  ('fecha',f'{URL}?fecha={stamp}'),
  ('download',f'{URL}?download=1&v={stamp}'),
  ('dotpath',f'https://sih.conagua.gob.mx/docs/./precipitacion24horas.pdf?v={stamp}'),
  ('doublepath',f'https://sih.conagua.gob.mx/docs//precipitacion24horas.pdf?v={stamp}'),
 ]
 valid=[]
 errors=[]
 for label,url in candidates:
  try:
   r=requests.get(url,headers=browser_headers,timeout=40,allow_redirects=True)
   r.raise_for_status()
   if not r.content.startswith(b'%PDF'):
    errors.append(f'{label}: respuesta no PDF')
    continue
   text='\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(r.content)).pages)
   fecha=source_date(text)
   if fecha:
    valid.append((fecha,label,text,r.content))
   else:
    errors.append(f'{label}: fecha no reconocida')
  except Exception as e:
   errors.append(f'{label}: {type(e).__name__}: {e}')
 if not valid:
  raise RuntimeError('SIH sin PDF válido en variantes: '+' | '.join(errors))
 valid.sort(key=lambda x:x[0],reverse=True)
 fecha,label,text,content=valid[0]
 return fecha,label,text,errors

def main():
 now=datetime.now(timezone.utc); local=now.astimezone(ZoneInfo('America/Mexico_City'))
 fecha,fetch_variant,text,fetch_errors=fetch_freshest_pdf(now)
 periodo_fuente=source_period(text)
 m=re.search(r'Tabasco\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+([^\n]+)',text)
 summary={'promedio_mm':float(m.group(1)),'numero_estaciones':int(m.group(2)),'maxima_mm':float(m.group(3)),'maxima_referencia':clean_station(m.group(4))} if m else {}
 rows_chiapas=chiapas_rows(text)
 rows=tabasco_rows(text)
 rows_veracruz=veracruz_rows(text)
 if not fecha:raise RuntimeError('SIH sin fecha real reconocible')
 if not rows:raise RuntimeError('SIH sin estaciones de Tabasco extraíbles')
 # Este producto oficial corresponde a las 24 h anteriores a las 08:00 h del día indicado por CONAGUA.
 hora_dato='08:00'
 fecha_hora_dato=f'{fecha}T08:00:00-06:00'
 candidate={'fuente':'CONAGUA · Sistema de Información Hidrológica (SIH)','producto':'Precipitaciones acumuladas últimas 24 h','url':URL,'fecha_fuente':fecha,'hora_dato':hora_dato,'fecha_hora_dato':fecha_hora_dato,'periodo_fuente':periodo_fuente or '24 h anteriores a las 08:00 h','consultado_utc':now.isoformat(),'consultado_local':local.isoformat(),'fetch_variant':fetch_variant,'resumen_tabasco':summary,'estaciones_chiapas_interes':rows_chiapas,'estaciones_tabasco':rows,'estaciones_veracruz_interes':rows_veracruz,'numero_extraido':len(rows),'numero_chiapas_interes':len(rows_chiapas),'numero_veracruz_interes':len(rows_veracruz),'calidad':'preliminar_sujeta_a_revision'}
 latest=OUT/'latest.json'
 old={}
 if latest.exists():
  try:old=json.loads(latest.read_text(encoding='utf-8'))
  except Exception:old={}
 # Nunca presentar una consulta como nueva publicación: sólo reemplaza por fecha fuente igual o posterior.
 if old.get('fecha_fuente') and fecha < old['fecha_fuente']:
  status={'run_local':local.isoformat(),'run_utc':now.isoformat(),'source_status':'source_older_than_last_valid_preserved','fecha_fuente_detectada':fecha,'fecha_vigente':old.get('fecha_fuente'),'errors':[]}
 else:
  latest.write_text(json.dumps(candidate,ensure_ascii=False,indent=2),encoding='utf-8')
  status={'run_local':local.isoformat(),'run_utc':now.isoformat(),'source_status':'new_publication' if fecha!=old.get('fecha_fuente') else 'source_without_new_publication','fecha_fuente_detectada':fecha,'fecha_vigente':fecha,'stations':len(rows),'stations_chiapas_interes':len(rows_chiapas),'stations_veracruz_interes':len(rows_veracruz),'fetch_variant':fetch_variant,'fetch_warnings':fetch_errors,'errors':[]}
 (OUT/'Estado_SIH_Lluvia.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(status,ensure_ascii=False))
if __name__=='__main__':main()
