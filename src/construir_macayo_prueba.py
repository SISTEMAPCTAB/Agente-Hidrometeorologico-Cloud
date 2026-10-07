#!/usr/bin/env python3
# Diagnóstico aislado Peñitas + Platanar -> Macayo.
# No escribe productos operativos ni modifica el modelo.
import json
from pathlib import Path
from datetime import datetime, timezone

BASE=Path("data")
INP=BASE/"Pronostico_Hidrologico_Prueba"/"macayo_entradas_ultima.json"
HIST=BASE/"Pronostico_Hidrologico_Prueba"/"macayo_entradas_horarias.json"
GASTOS=BASE/"pronostico_hidrologico"/"gastos_conagua.json"
OUT=BASE/"Pronostico_Hidrologico_Prueba"/"macayo_diagnostico_ultima.json"

QMIN=1412.0
QMAX=2705.34
INTER=0.029227346011724442
SLOPE=0.00010820395568911811

def load(p,default=None):
    try:return json.loads(p.read_text(encoding="utf-8"))
    except Exception:return default

def st(rows,name):
    for x in rows or []:
        if x.get("estacion")==name:return x
    return {}

def split(q_total,q_sam0,q_car0):
    qbase=q_sam0+q_car0
    if not all(isinstance(x,(int,float)) for x in [q_total,q_sam0,q_car0]) or qbase<=0:
        return None
    p0=q_car0/qbase
    pmin=INTER+SLOPE*QMIN
    if q_total<qbase:
        return {"estado":"por_debajo_condicion_observada","qtotal":q_total}
    if q_total<QMIN:
        u=max(0,min(1,(q_total-qbase)/(QMIN-qbase)))
        p=p0+(pmin-p0)*u
        regla="transicion_observado_a_HECRAS"
    elif q_total<=QMAX:
        p=INTER+SLOPE*q_total
        regla="HECRAS"
    else:
        return {"estado":"fuera_rango_superior","qtotal":q_total}
    return {
        "estado":"calculado",
        "regla":regla,
        "qtotal":q_total,
        "p_carrizal":p,
        "q_samaria":q_total*(1-p),
        "q_carrizal":q_total*p,
    }

def main():
    x=load(INP,{}) or {}
    g=load(GASTOS,{}) or {}
    rows=g.get("estaciones",[])
    sam=st(rows,"Samaria"); car=st(rows,"González")
    qsam=sam.get("q_actual_m3s"); qcar=car.get("q_actual_m3s")
    qpen=x.get("q_penitas_m3s"); qpla=x.get("q_platanar_m3s")
    qraw=(qpen+qpla) if isinstance(qpen,(int,float)) and isinstance(qpla,(int,float)) else None
    sobs=(qsam+qcar) if isinstance(qsam,(int,float)) and isinstance(qcar,(int,float)) else None

    res={
      "generado_utc":datetime.now(timezone.utc).isoformat(),
      "modo":"PRUEBA_AISLADA_NO_OPERATIVA",
      "fecha_hora_entrada":x.get("fecha_hora"),
      "peñitas_m3s":qpen,
      "platanar_m3s":qpla,
      "suma_entrada_sin_transito_m3s":qraw,
      "samaria_observado_m3s":qsam,
      "carrizal_observado_m3s":qcar,
      "suma_ramas_observada_m3s":sobs,
      "diferencia_entrada_cruda_vs_ramas_m3s":(qraw-sobs) if isinstance(qraw,(int,float)) and isinstance(sobs,(int,float)) else None,
      "reparto_solo_diagnostico":split(qraw,qsam,qcar) if isinstance(qraw,(int,float)) else None,
      "regla":"Peñitas y Platanar se conservan como forzantes observados. La suma cruda NO se interpreta como gasto instantáneo en Macayo hasta calibrar tránsito/atenuación.",
      "pendiente":"calibrar desfase Peñitas→Macayo y Platanar→Macayo con cambios horarios observados; después añadir sólo el incremento futuro de cuenca libre para evitar doble conteo."
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(res,ensure_ascii=False,indent=2),encoding="utf-8")
    print("OK MACAYO PRUEBA:",json.dumps({
      "hora":res["fecha_hora_entrada"],"Peñitas":qpen,"Platanar":qpla,
      "Qraw":qraw,"Qramos_obs":sobs
    },ensure_ascii=False))

if __name__=="__main__":main()
