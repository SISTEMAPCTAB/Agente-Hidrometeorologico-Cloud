#!/usr/bin/env python3
# Producto aislado del Agente de Pronostico. Lee FUENTE1 para hidrometría general
# y selecciona la fuente más reciente disponible para la extracción de Peñitas.
import json,re,unicodedata
from pathlib import Path
from datetime import datetime,timezone

SRC=Path("data/latest/FUENTE1.txt")
SRC2=Path("data/latest/FUENTE2.txt")
OUT=Path("data/pronostico_hidrologico/gastos_conagua.json")

ROWS={"Samaria":("Samaria","Samaria"),"Gonzalez":("González","Carrizal"),"Oxolotan":("Oxolotán","Tacotalpa"),"Tapijulapa":("Tapijulapa","La Sierra"),"Teapa":("Teapa","Teapa"),"Puyacatengo":("Puyacatengo","Puyacatengo"),"San Joaquin":("San Joaquín","Pichucalco"),"Pueblo Nuevo":("Pueblo Nuevo","La Sierra"),"Porvenir":("Porvenir","Grijalva"),"Platanar":("Platanar","Platanar")}

def norm(s): return "".join(c for c in unicodedata.normalize("NFD",s) if unicodedata.category(c)!="Mn").lower()
def nums(s): return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?",s)]
def item(est,rio): return {"estacion":est,"rio":rio,"h_anterior_m":None,"q_anterior_m3s":None,"h_actual_m":None,"q_actual_m3s":None,"delta_h_m":None,"delta_q_m3s":None,"fuente_fecha_hora":None,"validacion":"sin_q_validado"}

def source_iso(txt):
 m=re.search(r"FECHA/HORA MENSAJE:\s*([^\r\n]+)",txt,re.I)
 return m.group(1).strip() if m else None

def source_time(txt):
 s=source_iso(txt)
 if not s:return None
 try:return datetime.fromisoformat(s).timestamp()
 except Exception:return None

def penitas_fuente1(txt):
 m=re.search(r"Extracc\s+Promedio\s+O\.\s*T\.\s*\(m3/s\)\s+([^\r\n]+)",txt,re.I)
 if not m:return None
 a=nums(m.group(1))
 return a[4] if len(a)>=5 else None

def penitas_fuente2(txt):
 # En FUENTE2 el PDF extrae primero la fila y después el encabezado
 # "Ext. Prom. (m3/s) en 24:00 hrs". La extracción de Peñitas es la
 # octava columna numérica de esa fila una vez eliminados separadores de miles.
 if not re.search(r"Ext\.\s*Prom\.\s*\(m3/s\)",txt,re.I):return None
 line=next((x.strip() for x in txt.splitlines() if re.match(r"^Peñitas\s+",x.strip(),re.I)),None)
 if not line:return None
 clean=re.sub(r"(?<=\d),(?=\d)","",line)
 a=nums(clean)
 if len(a)<8:return None
 q=a[7]
 return q if 0<=q<=10000 else None

def main():
 t=SRC.read_text(encoding="utf-8",errors="replace")
 t2=SRC2.read_text(encoding="utf-8",errors="replace") if SRC2.exists() else ""
 lines=[x.strip() for x in t.splitlines() if x.strip()]
 out=[]

 # Resto de estaciones: comportamiento previo intacto (FUENTE1).
 for key,(est,rio) in ROWS.items():
  d=item(est,rio); seg=None
  for line in lines:
   for part in re.split(r"(?=AFT\d+\s+)",line):
    if re.match(r"AFT\d+\s+",part,re.I) and norm(key) in norm(part):
     seg=re.split(r"\s+ACNA\d+\s+",part,1,flags=re.I)[0]; break
   if seg: break
  if seg:
   a=nums(re.sub(r"^AFT\d+\s+","",seg,flags=re.I))
   if len(a)>=6:
    hp,qp,ha,qa=a[1:5]
    d.update(h_anterior_m=hp,q_anterior_m3s=qp,h_actual_m=ha,q_actual_m3s=qa,delta_h_m=round(ha-hp,3),delta_q_m3s=round(qa-qp,3),fuente_fecha_hora=source_iso(t),validacion="columnas_gasto_conagua_dia_anterior_actual")
  out.append(d)

 # Peñitas: elegir el boletín más reciente entre FUENTE1 y FUENTE2.
 d=item("Peñitas","Mezcalapa")
 candidates=[]
 q1=penitas_fuente1(t)
 if q1 is not None:candidates.append((source_time(t) or 0,q1,"extraccion_promedio_ot_penitas_fuente1",source_iso(t)))
 q2=penitas_fuente2(t2) if t2 else None
 if q2 is not None:candidates.append((source_time(t2) or 0,q2,"extraccion_promedio_24h_penitas_fuente2",source_iso(t2)))
 if candidates:
  _,q,validation,source_iso_value=max(candidates,key=lambda x:x[0])
  d.update(q_actual_m3s=q,fuente_fecha_hora=source_iso_value,validacion=validation)
 out.append(d)

 payload={
  "fuente":"CONAGUA OCFS / fuentes ya recolectadas",
  "producto":"Gastos para modelo hidrologico",
  "generado_utc":datetime.now(timezone.utc).isoformat(),
  "fuente1_fecha_hora":source_iso(t),
  "fuente2_fecha_hora":source_iso(t2) if t2 else None,
  "regla":"Q desde columnas Gasto; Peñitas desde la extracción promedio del boletín más reciente FUENTE1/FUENTE2; ausente=null",
  "estaciones":out
 }
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")

if __name__=="__main__": main()
