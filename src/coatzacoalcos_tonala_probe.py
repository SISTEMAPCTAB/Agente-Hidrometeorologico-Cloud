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
