#!/usr/bin/env python3
# Producto aislado del Agente de Pronostico. Solo lee FUENTE1 y escribe su propio JSON.
import json,re,unicodedata
from pathlib import Path
from datetime import datetime,timezone
SRC=Path("data/latest/FUENTE1.txt"); OUT=Path("data/pronostico_hidrologico/gastos_conagua.json")
ROWS={"Samaria":("Samaria","Samaria"),"Gonzalez":("González","Carrizal"),"Oxolotan":("Oxolotán","Tacotalpa"),"Tapijulapa":("Tapijulapa","La Sierra"),"Teapa":("Teapa","Teapa"),"Puyacatengo":("Puyacatengo","Puyacatengo"),"San Joaquin":("San Joaquín","Pichucalco"),"Pueblo Nuevo":("Pueblo Nuevo","La Sierra"),"Porvenir":("Porvenir","Grijalva"),"Platanar":("Platanar","Platanar")}
def norm(s): return "".join(c for c in unicodedata.normalize("NFD",s) if unicodedata.category(c)!="Mn").lower()
def nums(s): return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?",s)]
def item(est,rio): return {"estacion":est,"rio":rio,"h_anterior_m":None,"q_anterior_m3s":None,"h_actual_m":None,"q_actual_m3s":None,"delta_h_m":None,"delta_q_m3s":None,"validacion":"sin_q_validado"}
def main():
 t=SRC.read_text(encoding="utf-8",errors="replace"); lines=[x.strip() for x in t.splitlines() if x.strip()]; out=[]
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
    hp,qp,ha,qa=a[1:5]; d.update(h_anterior_m=hp,q_anterior_m3s=qp,h_actual_m=ha,q_actual_m3s=qa,delta_h_m=round(ha-hp,3),delta_q_m3s=round(qa-qp,3),validacion="columnas_gasto_conagua_dia_anterior_actual")
  if key=="Platanar" and d["q_actual_m3s"] is None:
   line=next((x for x in lines if norm(x).startswith("platanar platanar ")),None)
   if line:
    a=nums(line)
    if len(a)>=2:d.update(h_actual_m=a[0],q_actual_m3s=a[1],validacion="columna_gasto_conagua_resumen")
  out.append(d)
 d=item("Peñitas","Mezcalapa"); m=re.search(r"Extracc\s+Promedio\s+O\.\s*T\.\s*\(m3/s\)\s+([^\r\n]+)",t,re.I)
 if m:
  a=nums(m.group(1))
  if len(a)>=5:d.update(q_actual_m3s=a[4],validacion="extraccion_promedio_ot_penitas_entrada_mezcalapa")
 out.append(d)
 payload={"fuente":"CONAGUA OCFS / FUENTE1 ya recolectada","producto":"Gastos para modelo hidrologico","generado_utc":datetime.now(timezone.utc).isoformat(),"regla":"Q desde columnas Gasto; Peñitas desde Extracc Promedio O.T.; ausente=null","estaciones":out}
 OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__": main()
