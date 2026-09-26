"""Prueba aislada: descubre PDF oficiales y extrae filas Tonalá sin alterar datos existentes."""
import datetime as dt
import io
import json
import pathlib
import re
import urllib.parse
import requests
import pdfplumber
from bs4 import BeautifulSoup

OUT = pathlib.Path("data/coatzacoalcos_tonala")
OUT.mkdir(parents=True, exist_ok=True)
PAGE = "https://www.gob.mx/conagua/acciones-y-programas/hidrometeorologia"
SEEDS = {
 "matutino": "https://www.gob.mx/cms/uploads/attachment/file/1105250/Informe_Matutino_25092026.pdf",
 "vespertino": "https://www.gob.mx/cms/uploads/attachment/file/1090562/Informe_vespertino_16072026.pdf"
}
UA={"User-Agent":"Mozilla/5.0 (compatible; IPCET-Hidromet/1.0; seguimiento de informes publicos)","Accept":"text/html,application/pdf,*/*"}
session=requests.Session()
session.headers.update(UA)
sources={key:[url] for key,url in SEEDS.items()}
result={"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"source_page":PAGE,"discovery":{},"reports":{}}
try:
 response=session.get(PAGE,timeout=25)
 result["discovery"]={"http":response.status_code,"url":response.url}
 if response.ok:
  soup=BeautifulSoup(response.text,"html.parser")
  for a in soup.find_all("a",href=True):
   href=urllib.parse.urljoin(response.url,a["href"])
   label=(a.get_text(" ",strip=True)+" "+href).lower()
   if not (".pdf" in href.lower() or "/attachment/" in href.lower()):continue
   for typ in sources:
    if typ in label and href not in sources[typ]:sources[typ].insert(0,href)
except Exception as exc:
 result["discovery"]={"error":type(exc).__name__+": "+str(exc)[:180]}
for typ,urls in sources.items():
 attempts=[]
 for url in urls[:8]:
  item={"url":url}
  try:
   r=session.get(url,timeout=35)
   item["http"]=r.status_code
   item["bytes"]=len(r.content)
   item["final_url"]=r.url
   if not(r.ok and r.content.startswith(b"%PDF")):
    item["error"]="No se recibió un PDF válido"
   else:
    with pdfplumber.open(io.BytesIO(r.content)) as doc:
     item["pages"]=len(doc.pages)
     lines=[]
     for page in doc.pages:
      lines.extend((page.extract_text(layout=False) or "").splitlines())
     hits=[{"row_text":line.strip(),"page_text_method":"pdfplumber"} for line in lines if re.search(r"san jos[eé] del carmen|agua dulce",line,re.I)]
     item["station_rows"]=hits[:12]
     item["extraction_status"]="Filas recuperadas; columnas numéricas pendientes de validación" if hits else "Sin filas identificadas"
     # No declarar pronóstico, nivel o fecha de hoy sin comprobar columnas y fecha del PDF.
   attempts.append(item)
   if item.get("station_rows"):break
  except Exception as exc:item["error"]=type(exc).__name__+": "+str(exc)[:180];attempts.append(item)
 result["reports"][typ]=attempts
(OUT/"prueba_extraccion.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,ensure_ascii=False,indent=2))

# Persistir exclusivamente informes nuevos cuya fila hidrométrica coincida con
# la estructura validada (NAMO, escala anterior, escala actual, gasto, distancia).
# El PDF vespertino de julio tiene otra estructura: jamás se interpreta como nivel.
latest_path=OUT/"latest.json"
if latest_path.exists():
 latest=json.loads(latest_path.read_text(encoding="utf-8"))
else:
 latest={"reports":{}}
latest.setdefault("reports",{})
latest.setdefault("history",{})
for item in result.get("reports",{}).get("matutino",[]):
 if not item.get("station_rows"):continue
 match=re.search(r"Informe[_-]Matutino[_-](\\d{2})(\\d{2})(\\d{4})\\.pdf",item.get("final_url",item.get("url","")),re.I)
 if not match:continue
 try:stamp=dt.date(int(match.group(3)),int(match.group(2)),int(match.group(1))).isoformat()
 except ValueError:continue
 records=[]
 for row in item["station_rows"]:
  line=row["row_text"]
  m=re.match(r"^(San Jos[eé] del Carmen|Agua Dulce)\\s+Ver\\.\\s+Tonal[aá]\\s+R[ií]o\\s+(Tonal[aá]|Aguadulcita)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(?:-|\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*$",line,re.I)
  if not m:continue
  namo,prev,cur,distance=map(float,m.groups()[2:])
  # Distancia de la fuente debe concordar con actual - NAMO.
  if not(0<=prev<100 and 0<=cur<100 and 0<namo<100 and abs((cur-namo)-distance)<.035):continue
  key="san-jose-del-carmen" if "jos" in m.group(1).lower() else "agua-dulce"
  records.append({"id":key,"name":m.group(1),"river":"Río "+m.group(2),"namo_m":namo,"previous_m":prev,"current_m":cur,"delta_m":round(cur-prev,3),"below_namo_m":round(namo-cur,3)})
 if not records:continue
 prior=latest["reports"].get("matutino",{}).get("date","")
 if stamp>=prior:
  latest["reports"]["matutino"]={"date":stamp,"url":item.get("final_url",item["url"]),"stations":records}
  latest["updated_at_utc"]=result["checked_at_utc"]
  latest["state"]="Último informe hidrométrico matutino validado, fecha real conservada"
 for record in records:
  h=latest["history"].setdefault(record["id"],[])
  if not any(x.get("date")==stamp and x.get("period")=="matutino" for x in h):
   h.append({"date":stamp,"period":"matutino","current_m":record["current_m"],"source_url":item.get("final_url",item["url"])})
  h.sort(key=lambda x:(x["date"],x["period"]))
  del h[:-120]
latest_path.write_text(json.dumps(latest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
