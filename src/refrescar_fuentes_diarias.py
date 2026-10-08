#!/usr/bin/env python3
"""Recupera FUENTE1/FUENTE2 sólo cuando la copia publicada está rezagada.

No inventa datos ni deriva caudales. Reutiliza carbonio_to_repo.py y sólo
promueve una fuente si el mensaje localizado es estrictamente más reciente
que el archivo vigente.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

MX=ZoneInfo("America/Mexico_City")
ROOT=Path(".")
LATEST=ROOT/"data"/"latest"
STATE=ROOT/"data"/"Estado_Cloud.json"

def parse_iso(v):
    if not v:
        return None
    try:
        d=datetime.fromisoformat(str(v).replace("Z","+00:00"))
        if d.tzinfo is None:
            d=d.replace(tzinfo=MX)
        return d.astimezone(MX)
    except Exception:
        return None

def file_time(source):
    p=LATEST/f"{source}.txt"
    if not p.exists():
        return None
    try:
        text=p.read_text(encoding="utf-8-sig")
    except Exception:
        return None
    m=re.search(r"FECHA/HORA MENSAJE:\s*([^\r\n]+)",text,re.I)
    return parse_iso(m.group(1).strip()) if m else None

def need_refresh(now):
    f1=file_time("FUENTE1")
    f2=file_time("FUENTE2")
    today=now.date()
    # FUENTE2 suele estar disponible después de ~08:30.
    need2=(now.hour>8 or (now.hour==8 and now.minute>=45)) and (not f2 or f2.date()<today)
    # FUENTE1 suele llegar alrededor de las 10:00; no exigirlo antes de 10:15.
    need1=(now.hour>10 or (now.hour==10 and now.minute>=15)) and (not f1 or f1.date()<today)
    return need1,need2,f1,f2

def main():
    now=datetime.now(MX)
    need1,need2,old1,old2=need_refresh(now)
    print(json.dumps({
        "now":now.isoformat(),
        "need_fuente1":need1,"need_fuente2":need2,
        "fuente1_actual":old1.isoformat() if old1 else None,
        "fuente2_actual":old2.isoformat() if old2 else None
    },ensure_ascii=False))
    if not (need1 or need2):
        print("Fuentes diarias dentro de la ventana esperada; no se consulta Carbonio.")
        return 0

    with tempfile.TemporaryDirectory(prefix="fuentes-diarias-") as td:
        out=Path(td)/"out"
        env=os.environ.copy()
        env["OUTPUT_DIR"]=str(out)
        subprocess.run([sys.executable,"src/carbonio_to_repo.py"],check=True,env=env)
        st_path=out/"data"/"Estado_Cloud.json"
        if not st_path.exists():
            raise RuntimeError("El recolector no generó Estado_Cloud.json")
        st=json.loads(st_path.read_text(encoding="utf-8"))
        promoted=[]
        for source,old in (("FUENTE1",old1),("FUENTE2",old2)):
            info=(st.get("sources") or {}).get(source) or {}
            cand=parse_iso(info.get("message_time"))
            src=out/"data"/"latest"/f"{source}.txt"
            if info.get("status")!="ok" or not cand or not src.exists():
                continue
            if old and cand<=old:
                continue
            dst=LATEST/f"{source}.txt"
            dst.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(src,dst)
            arch=out/"data"/"archive"/cand.strftime("%Y-%m-%d")/f"{source}.txt"
            if arch.exists():
                adst=ROOT/"data"/"archive"/cand.strftime("%Y-%m-%d")/f"{source}.txt"
                adst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(arch,adst)
            promoted.append({"source":source,"message_time":cand.isoformat(),"subject":info.get("subject")})
        if promoted:
            STATE.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(st_path,STATE)
        print(json.dumps({"promovidas":promoted},ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
