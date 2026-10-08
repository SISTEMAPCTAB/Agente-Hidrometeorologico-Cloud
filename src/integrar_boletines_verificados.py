#!/usr/bin/env python3
"""Integra cortes hidrométricos verificados al histórico sin inventar datos.

Uso:
- Lee data/niveles/Boletines_Verificados/*.json.
- Sólo acepta estaciones/niveles explícitos y fecha_hora válida.
- Si ya existe una observación para estación+hora, no la duplica.
- Copia metadatos hidráulicos de la última fila conocida de esa estación.
- Actualiza JSON y CSV del histórico de forma idempotente.
"""
from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

BASE = Path("data/niveles")
VER = BASE / "Boletines_Verificados"
HJSON = BASE / "Historico" / "niveles_historicos.json"
HCSV = BASE / "Historico" / "niveles_historicos.csv"
COLS = [
    "fecha_hora","rio","estacion","nivel","namo","name","fuente",
    "asunto","message_id","hora_fuente","estado_dato","ultima_actualizacion_real"
]

def parse_dt(v):
    try:
        return datetime.fromisoformat(str(v))
    except Exception:
        return None

def load_history():
    try:
        x=json.loads(HJSON.read_text(encoding="utf-8"))
        return x if isinstance(x,list) else []
    except Exception:
        return []

def dedupe(rows):
    m={}
    for r in rows:
        k=(str(r.get("fecha_hora") or ""),str(r.get("estacion") or ""))
        old=m.get(k)
        if old is None or (r.get("estado_dato")=="observado" and old.get("estado_dato")!="observado"):
            m[k]=r
    return sorted(m.values(), key=lambda r:(str(r.get("fecha_hora") or ""),str(r.get("estacion") or "")))

def write(rows):
    HJSON.parent.mkdir(parents=True,exist_ok=True)
    HJSON.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    with HCSV.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=COLS,extrasaction="ignore",quoting=csv.QUOTE_ALL)
        w.writeheader()
        for r in rows:w.writerow({c:r.get(c) for c in COLS})

def main():
    hist=dedupe(load_history())
    if not hist:
        raise SystemExit("Histórico vacío/no disponible; no se integra para evitar fabricar metadatos.")
    files=sorted(VER.glob("*.json"))
    if not files:
        print("Sin boletines verificados por integrar.")
        return

    by_station={}
    for r in hist:
        st=r.get("estacion")
        if st: by_station.setdefault(st,[]).append(r)
    for vals in by_station.values():
        vals.sort(key=lambda r:str(r.get("fecha_hora") or ""))

    existing={(str(r.get("fecha_hora") or ""),str(r.get("estacion") or "")):r for r in hist}
    inserted=0
    for fp in files:
        try:
            doc=json.loads(fp.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"Omitido {fp.name}: {exc}")
            continue
        stations=doc.get("estaciones")
        if not isinstance(stations,list): continue
        for x in stations:
            st=str(x.get("estacion") or "").strip()
            stamp=str(x.get("fecha_hora") or doc.get("fecha_corte") or "").strip()
            dt=parse_dt(stamp)
            try: level=float(x.get("nivel_m"))
            except Exception: continue
            if not st or dt is None: continue
            key=(stamp,st)
            if key in existing and existing[key].get("estado_dato")=="observado":
                continue
            meta=(by_station.get(st) or [None])[-1]
            if not meta:
                print(f"Omitida {st} {stamp}: estación sin metadatos históricos.")
                continue
            row=dict(meta)
            row.update({
                "_key":f"{stamp}|{st}",
                "fecha_hora":stamp,
                "estacion":st,
                "nivel":level,
                "fuente":f"Boletines_Verificados/{fp.name}",
                "asunto":str(doc.get("fuente") or "Boletín hidrométrico verificado"),
                "message_id":f"verificado:{fp.stem}",
                "hora_fuente":dt.strftime("%H:%M"),
                "estado_dato":"observado",
                "ultima_actualizacion_real":stamp,
            })
            hist.append(row); existing[key]=row; by_station.setdefault(st,[]).append(row)
            inserted+=1

    hist=dedupe(hist)
    if inserted:
        write(hist)
    print(f"Boletines verificados integrados: {inserted} observaciones nuevas.")

if __name__=="__main__":
    main()
