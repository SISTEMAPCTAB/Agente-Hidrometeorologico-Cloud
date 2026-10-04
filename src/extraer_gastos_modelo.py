#!/usr/bin/env python3
# Producto aditivo para el Agente de Pronóstico Hidrológico.
# Lee únicamente FUENTE1 ya recolectada. No modifica niveles ni recolectores.
import json,re
from pathlib import Path
from datetime import datetime, timezone
SRC=Path("data/latest/FUENTE1.txt")
OUT=Path("data/pronostico_hidrologico/gastos_conagua.json")
ROWS={
"Samaria":("Samaria","Samaria"),"Gonzalez":("González","Carrizal"),
"Oxolotan":("Oxolotán","Tacotalpa"),"Tapijulapa":("Tapijulapa","La Sierra"),
"Teapa":("Teapa","Teapa"),"Puyacatengo":("Puyacatengo","Puyacatengo"),
"San Joaquin":("San Joaquín","Pichucalco"),"Pueblo Nuevo":("Pueblo Nuevo","La Sierra"),
"Porvenir":("Porvenir","Grijalva"),"Platanar":("Platanar","Platanar")
}
def nums(s): return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?",s)]
def main():
 t=SRC.read_text(encoding="utf-8",errors="replace"); lines=[x.strip() for x in t.splitlines() if x.strip()]
 mdate=re.search(r"TUXTLA GUTIÉRREZ A (\d+) DE ([A-ZÁÉÍÓÚ]+) DE (\d{4})",t,re.I)
 out=[]
 for key,(est,rio) in ROWS.items():
  # Prefer page-4 AFT row: NAMO,Hprev,Qprev,Hnow,Qnow,...
  line=next((x for x in lines if re.match(r"AFT\d+\s+",x,re.I) and re.search(r"\b"+re.escape(key)+r"\b",x,re.I)),None)
  item={"estacion":est,"rio":rio,"h_anterior_m":None,"q_anterior_m3s":None,"h_actual_m":None,"q_actual_m3s":None,"delta_h_m":None,"delta_q_m3s":None,"validacion":"sin_q_validado"}
  if line:
   clean=re.sub(r"^AFT\d+\s+","",line,flags=re.I); a=nums(clean)
   # These modeled AFT rows contain NAMO then Hprev,Qprev,Hnow,Qnow.
   if len(a)>=6:
    hp,qp,ha,qa=a[1:5]
    if qp>=0 and qa>=0:
     item.update(h_anterior_m=hp,q_anterior_m3s=qp,h_actual_m=ha,q_actual_m3s=qa,
       delta_h_m=round(ha-hp,3),delta_q_m3s=round(qa-qp,3),validacion="columnas_gasto_conagua_dia_anterior_actual")
  if key=="Platanar" and item["q_actual_m3s"] is None:
   line=next((x for x in lines if re.match(r"Platanar\s+Platanar\s+",x,re.I)),None)
   if line:
    a=nums(line)
    if len(a)>=2:
     item.update(h_actual_m=a[0],q_actual_m3s=a[1],validacion="columna_gasto_conagua_resumen")
  out.append(item)
 payload={"fuente":"CONAGUA OCFS / FUENTE1 ya recolectada","producto":"Gastos para modelo hidrologico",
 "generado_utc":datetime.now(timezone.utc).isoformat(),"regla":"Q solo desde columnas Gasto (m3/s); ausente=null",
 "estaciones":out}
 OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__": main()
