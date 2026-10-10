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

def fuente2_gastos(txt):
 # El bloque layout proviene del mismo PDF; no desplazar columnas por el texto aplanado.
 marker="===== GASTOS_LAYOUT_FUENTE2 ====="
 if marker not in txt:return {}
 rows={}
 for line in txt.split(marker,1)[1].splitlines():
  m=re.match(r"^\s*([*]?\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+?)\s{2,}(.+)$",line)
  if not m:continue
  key=norm(m.group(1).strip("* "))
  tokens=re.findall(r"(?<!\S)-?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?!\S)|(?<!\S)-?\d+(?:\.\d+)?(?!\S)",m.group(2))
  a=[float(x.replace(",","")) for x in tokens]
  if key in {"samaria","oxolotan","puyacatengo","tapijulapa","san joaquin","teapa","gonzalez","pueblo nuevo","salto de agua","macuspana","boca del cerro"} and len(a)>=8:
   hp,qp,ha,qa=a[4:8]
  elif key=="porvenir" and len(a)>=7:
   hp,qp,ha,qa=a[3:7]
  elif key=="penitas" and len(a)>=12:
   # Fila de presa: Ext. Prom. (m3/s) en 24:00 horas, columna 9.
   if 0<=a[8]<=10000:rows["penitas"]={"q":a[8]}
   continue
  else:continue
  if not (0<=qp<=20000 and 0<=qa<=20000 and -5<=hp<=60 and -5<=ha<=60):continue
  rows[key]={"hp":hp,"qp":qp,"ha":ha,"qa":qa}
 return rows

def conservar_lecturas_recientes(rows):
 # La llegada tardía de FUENTE1 o de un PDF sin tabla no puede borrar el Q vigente.
 try:
  prev=json.loads(OUT.read_text(encoding="utf-8"))
  antiguos={x["estacion"]:x for x in prev.get("estaciones",[]) if isinstance(x,dict)}
 except (OSError,ValueError,KeyError,TypeError):
  return rows
 for i,candidato in enumerate(rows):
  anterior=antiguos.get(candidato["estacion"])
  if not anterior or anterior.get("q_actual_m3s") is None:continue
  viejo=source_time_from_iso(anterior.get("fuente_fecha_hora"))
  nuevo=source_time_from_iso(candidato.get("fuente_fecha_hora"))
  if nuevo is None or (viejo is not None and nuevo<viejo):
   rows[i]=anterior
 return rows

def source_time_from_iso(s):
 try:return datetime.fromisoformat(s).timestamp() if s else None
 except (ValueError,TypeError):return None

def main():
 t=SRC.read_text(encoding="utf-8",errors="replace")
 t2=SRC2.read_text(encoding="utf-8",errors="replace") if SRC2.exists() else ""
 lines=[x.strip() for x in t.splitlines() if x.strip()]
 tab2=fuente2_gastos(t2)
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
  newer=tab2.get(norm(key))
  if newer and (source_time(t2) or 0) > (source_time(t) or 0):
   hp,qp,ha,qa=(newer[x] for x in ("hp","qp","ha","qa"))
   d.update(h_anterior_m=hp,q_anterior_m3s=qp,h_actual_m=ha,q_actual_m3s=qa,delta_h_m=round(ha-hp,3),delta_q_m3s=round(qa-qp,3),fuente_fecha_hora=source_iso(t2),validacion="fuente2_layout_columnas_actual_gasto")
  out.append(d)

 # Peñitas: elegir el boletín más reciente entre FUENTE1 y FUENTE2.
 d=item("Peñitas","Mezcalapa")
 candidates=[]
 q1=penitas_fuente1(t)
 if q1 is not None:candidates.append((source_time(t) or 0,q1,"extraccion_promedio_ot_penitas_fuente1",source_iso(t)))
 # FUENTE2 se admite exclusivamente con columna Ext. Prom. verificada en PDF.
 q2=tab2.get('penitas',{}).get('q')
 if q2 is not None:candidates.append((source_time(t2) or 0,q2,"extraccion_promedio_24h_penitas_fuente2",source_iso(t2)))
 if candidates:
  _,q,validation,source_iso_value=max(candidates,key=lambda x:x[0])
  d.update(q_actual_m3s=q,fuente_fecha_hora=source_iso_value,validacion=validation)
 out.append(d)
 out=conservar_lecturas_recientes(out)

 payload={
  "fuente":"CONAGUA OCFS / fuentes ya recolectadas",
  "producto":"Gastos para modelo hidrologico",
  "generado_utc":datetime.now(timezone.utc).isoformat(),
  "fuente1_fecha_hora":source_iso(t),
  "fuente2_fecha_hora":source_iso(t2) if t2 else None,
  "regla":"Q FUENTE2: columna Actual/Gasto verificada por layout del PDF; FUENTE1 respaldo; Peñitas extracción promedio 24 h; ausente=null",
  "estaciones":out
 }
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")

if __name__=="__main__": main()
