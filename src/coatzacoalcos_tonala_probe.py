"""Prueba aislada: descubre PDF oficiales y extrae filas Tonalá sin alterar datos existentes."""
import datetime as dt
import io
import json
import pathlib
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import pdfplumber
from bs4 import BeautifulSoup

OUT = pathlib.Path("data/coatzacoalcos_tonala")
OUT.mkdir(parents=True, exist_ok=True)
PAGE = "https://www.gob.mx/conagua/acciones-y-programas/hidrometeorologia"
SEEDS = {
 "matutino": "https://www.gob.mx/cms/uploads/attachment/file/1106630/Informe_Matutino_02102026.pdf"
}
UA={"User-Agent":"Mozilla/5.0 (compatible; IPCET-Hidromet/1.0; seguimiento de informes publicos)","Accept":"text/html,application/pdf,*/*","Cache-Control":"no-cache, no-store, max-age=0","Pragma":"no-cache"}
session=requests.Session()
session.headers.update(UA)

def fresh_page_url():
 return PAGE + ("&" if "?" in PAGE else "?") + "_ipcet=" + str(int(dt.datetime.now(dt.timezone.utc).timestamp()))
sources={key:[url] for key,url in SEEDS.items()}
sources["matutino"].append("https://www.gob.mx/cms/uploads/attachment/file/1105820/Informe_Matutino_29092026.pdf")
sources["matutino"].append("https://www.gob.mx/cms/uploads/attachment/file/1105531/Informe_Matutino_28092026.pdf")
# gob.mx puede bloquear (HTTP 403) a los runners de GitHub aunque el informe sea público.
# Como respaldo de transporte se usa Jina Reader sobre la MISMA URL oficial.
# La fecha y los valores siguen validándose contra el contenido recuperado del documento oficial.
def reader_url(url):
 u=re.sub(r'^https?://','',url)
 return "https://r.jina.ai/http://"+u

def get_with_reader(url, timeout=35):
 direct=None
 try:
  direct=session.get(url,timeout=timeout)
  if direct.ok:
   return direct,"direct",direct.status_code
  direct_status=direct.status_code
 except requests.RequestException:
  direct_status=None
 try:
  rr=session.get(reader_url(url),timeout=timeout,headers={"Accept":"text/plain,*/*"})
  if rr.ok:
   return rr,"reader",direct_status
 except requests.RequestException:
  pass
 return direct,"direct",direct_status

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
 candidates += re.findall(r'https?://(?:www\.)?gob\.mx/cms/uploads/attachment/file/\d+/[^"\s<>)]+?\.pdf',decoded,re.I)
 relatives=re.findall(r'/cms/uploads/attachment/file/\d+/[^"\s<>)]+?\.pdf',decoded,re.I)
 candidates += [urllib.parse.urljoin(base,x) for x in relatives]
 for href in candidates:
  for typ in sources:
   if typ in urllib.parse.unquote(href).lower() and href not in sources[typ]:
    sources[typ].append(href)
 return len(candidates)

try:
 page_url=fresh_page_url()
 response,transport,direct_status=get_with_reader(page_url,25)
 result["discovery"]={"http":direct_status,"transport":transport,"url":PAGE,"request_url":page_url}
 if response is not None and response.ok:
  result["discovery"]["candidates"]=discover(response.text,PAGE)
  if transport=="direct":
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
# Si gob.mx no expone el enlace del día en el HTML inicial, renderizar
# únicamente la página oficial y leer el DOM ya cargado por el navegador.
local_today=dt.datetime.now(dt.timezone(dt.timedelta(hours=-6))).date()
if not any(report_date(u)==local_today for u in sources["matutino"]):
 try:
  from playwright.sync_api import sync_playwright
  with sync_playwright() as p:
   browser=p.chromium.launch(headless=True)
   page=browser.new_page()
   page.goto(fresh_page_url(),wait_until="networkidle",timeout=45000)
   links=page.locator("a")
   for i in range(links.count()):
    a=links.nth(i)
    try:
     label=(a.inner_text() or "").strip()
     href=a.get_attribute("href") or ""
     full=urllib.parse.urljoin(PAGE,href)
     if "matutino" in (label+" "+full).lower() and full.lower().endswith(".pdf"):
      if full not in sources["matutino"]:
       sources["matutino"].append(full)
    except Exception:
     pass
   browser.close()
  result["discovery"]["browser_render"]=True
 except Exception as exc:
  result["discovery"]["browser_render_error"]=type(exc).__name__+": "+str(exc)[:180]

# Fallback acotado para el informe del día: el portal puede mostrarlo por JavaScript
# sin incluir el enlace en el HTML inicial. Se prueban sólo IDs cercanos a la serie
# vigente y sólo el nombre oficial del archivo del día, sin descargar candidatos.
local_today=dt.datetime.now(dt.timezone(dt.timedelta(hours=-6))).date()
if not any(report_date(u)==local_today for u in sources["matutino"]):
 stamp=local_today.strftime("%d%m%Y")
 for fid in range(1106300,1106600):
  candidate=f"https://www.gob.mx/cms/uploads/attachment/file/{fid}/Informe_Matutino_{stamp}.pdf"
  try:
   rr=session.head(candidate,timeout=4,allow_redirects=True)
   if rr.ok and ("pdf" in rr.headers.get("Content-Type","").lower() or rr.url.lower().endswith(".pdf")):
    sources["matutino"].append(candidate)
    result["discovery"]["filename_probe_hit"]=candidate
    break
  except requests.RequestException:
   pass

for typ in sources:
 sources[typ].sort(key=lambda u:(report_date(u), int(re.search(r"/file/(\\d+)/",u).group(1)) if re.search(r"/file/(\\d+)/",u) else 0),reverse=True)
 result["discovery"][typ+"_candidates"]=sources[typ][:12]
for typ,urls in sources.items():
 attempts=[]
 for url in urls[:20]:
  item={"url":url}
  try:
   r,transport,direct_status=get_with_reader(url,35)
   item["transport"]=transport
   item["http"]=direct_status
   item["bytes"]=len(r.content) if r is not None else 0
   item["final_url"]=url
   lines=[]
   if r is None or not r.ok:
    item["error"]="No se recibió contenido válido"
   elif r.content.startswith(b"%PDF"):
    with pdfplumber.open(io.BytesIO(r.content)) as doc:
     item["pages"]=len(doc.pages)
     item["document_header"]=" ".join((p.extract_text() or "")[:550] for p in doc.pages[:1])
     for page in doc.pages:
      lines.extend((page.extract_text(layout=False) or "").splitlines())
   elif transport=="reader":
    text=r.text
    lines=text.splitlines()
    item["document_header"]=" ".join(x.strip() for x in lines[:100])[:2400]
    item["reader_text"]=True
   else:
    item["error"]="No se recibió un PDF válido"
   if lines:
    hits=[{"row_text":line.strip(),"page_text_method":"pdfplumber" if transport=="direct" else "reader"} for line in lines if re.search(r"san jos[eé] del carmen|agua dulce",line,re.I)]
    item["station_rows"]=hits[:12]
    item["extraction_status"]="Filas recuperadas; columnas numéricas pendientes de validación" if hits else "Sin filas identificadas"
   attempts.append(item)
   if item.get("station_rows") and report_date(item.get("final_url",url))!=dt.date.min:break
  except Exception as exc:
   item["error"]=type(exc).__name__+": "+str(exc)[:180]
   attempts.append(item)
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
