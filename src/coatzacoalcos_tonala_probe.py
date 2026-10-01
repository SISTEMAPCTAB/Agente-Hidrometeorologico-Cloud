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
 "matutino": "https://www.gob.mx/cms/uploads/attachment/file/1105820/Informe_Matutino_29092026.pdf"
}
UA={"User-Agent":"Mozilla/5.0 (compatible; IPCET-Hidromet/1.0; seguimiento de informes publicos)","Accept":"text/html,application/pdf,*/*"}
session=requests.Session()
session.headers.update(UA)
sources={key:[url] for key,url in SEEDS.items()}
sources["matutino"].append("https://www.gob.mx/cms/uploads/attachment/file/1105531/Informe_Matutino_28092026.pdf")
# Los enlaces descubiertos tienen prioridad sobre las semillas históricas.
result={"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"source_page":PAGE,"discovery":{},"reports":{}}
def report_date(url):
 m=re.search(r"(\d{2})(\d{2})(\d{4})\.pdf",urllib.parse.unquote(url),re.I)
 if not m:return dt.date.min
 try:return dt.date(int(m[3]),int(m[2]),int(m[1]))
 except ValueError:return dt.date.min

def discover(html,base):
 # gob.mx alterna entre href directos, enlaces de descarga y URL incrustadas
 # en HTML/JSON escapado. No inferir identificadores consecutivos de adjuntos.
 soup=BeautifulSoup(html,"html.parser")
 candidates=[]
 for a in soup.find_all("a",href=True):
  href=urllib.parse.urljoin(base,a["href"])
  label=a.get_text(" ",strip=True).lower()
  if "matutino" in (href+" "+label).lower():
   candidates.append(href)
 decoded=html.replace("\\/","/").replace("&amp;","&")
 candidates += re.findall(r'https?://(?:www\.)?gob\.mx/cms/uploads/attachment/file/\d+/[^"\s<>]+?\.pdf',decoded,re.I)
 for href in candidates:
  for typ in sources:
   if typ in urllib.parse.unquote(href).lower() and href not in sources[typ]:
    sources[typ].append(href)
 return len(candidates)

try:
 response=session.get(PAGE,timeout=25,headers={"Cache-Control":"no-cache"})
 result["discovery"]={"http":response.status_code,"url":response.url}
 if response.ok:
  result["discovery"]["candidates"]=discover(response.text,response.url)
  # Seguir enlaces de sección de hidrometeorología si el portal muestra
  # documentos dentro de páginas intermedias, sin explorar otros dominios.
  soup=BeautifulSoup(response.text,"html.parser")
  for a in soup.find_all("a",href=True):
   label=a.get_text(" ",strip=True).lower()
   href=urllib.parse.urljoin(response.url,a["href"])
   if ("informe" not in label and "hidrol" not in label):continue
   if urllib.parse.urlparse(href).netloc not in ("www.gob.mx","gob.mx"):continue
   if href.lower().endswith(".pdf"):continue
   try:
    sub=session.get(href,timeout=15)
    if sub.ok and "html" in sub.headers.get("Content-Type","").lower():discover(sub.text,sub.url)
   except requests.RequestException:pass
except Exception as exc:
 result["discovery"]={"error":type(exc).__name__+": "+str(exc)[:180]}
for typ in sources:
 sources[typ].sort(key=report_date,reverse=True)
 result["discovery"][typ+"_candidates"]=sources[typ][:12]
for typ,urls in sources.items():
 attempts=[]
 for url in urls[:12]:
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
     item["document_header"]=" ".join((p.extract_text() or "")[:550] for p in doc.pages[:1])
     lines=[]
     for page in doc.pages:
      lines.extend((page.extract_text(layout=False) or "").splitlines())
     hits=[{"row_text":line.strip(),"page_text_method":"pdfplumber"} for line in lines if re.search(r"san jos[eé] del carmen|agua dulce",line,re.I)]
     item["station_rows"]=hits[:12]
     item["extraction_status"]="Filas recuperadas; columnas numéricas pendientes de validación" if hits else "Sin filas identificadas"
     # No declarar pronóstico, nivel o fecha de hoy sin comprobar columnas y fecha del PDF.
   attempts.append(item)
   if item.get("station_rows") and report_date(item.get("final_url",url))!=dt.date.min:break
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
# OCGC no mantiene un vespertino vigente; no conservar un documento histórico como producto operativo.
latest["reports"].pop("vespertino", None)
latest.setdefault("history",{})
for item in result.get("reports",{}).get("matutino",[]):
 if not item.get("station_rows"):continue
 # La fecha del archivo debe coincidir con el encabezado del PDF.
 file_date=report_date(item.get("final_url",item["url"]))
 header=item.get("document_header","").lower()
 months=("enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre")
 if file_date==dt.date.min or not re.search(r"\b"+str(file_date.day)+r"\s+de\s+"+months[file_date.month-1]+r"\s+de\s+"+str(file_date.year)+r"\b",header):
  item["validation_error"]="Fecha de nombre de archivo no confirmada en encabezado del PDF"
  continue
 match=re.search(r"Informe[_-]Matutino[_-](\d{2})(\d{2})(\d{4})\.pdf",item.get("final_url",item.get("url","")),re.I)
 if not match:continue
 try:stamp=dt.date(int(match.group(3)),int(match.group(2)),int(match.group(1))).isoformat()
 except ValueError:continue
 records=[]
 for row in item["station_rows"]:
  line=row["row_text"]
  m=re.match(r"^(San Jos[eé] del Carmen|Agua Dulce)\s+Ver\.\s+Tonal[aá]\s+R[ií]o\s+(Tonal[aá]|Aguadulcita)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(?:-|\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$",line,re.I)
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
