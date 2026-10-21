import csv
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from statistics import median
from zoneinfo import ZoneInfo

BASE = Path("data/niveles")
HIST = BASE / "Historico" / "niveles_historicos.json"
SUMMARY = BASE / "Ultimo_Corte" / "ultimo_resumen.json"
SUMMARY_CSV = BASE / "Ultimo_Corte" / "ultimo_resumen.csv"
MX = ZoneInfo("America/Mexico_City")


def finite(v):
    return isinstance(v, (int, float)) and math.isfinite(v)


def parse_dt(v):
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=MX)
        return d.astimezone(MX)
    except Exception:
        return None


def observed_station(history, station):
    rows = []
    for r in history:
        if r.get("estacion") != station:
            continue
        if r.get("estado_dato") != "observado" or not finite(r.get("nivel")):
            continue
        t = parse_dt(r.get("fecha_hora"))
        if t:
            rows.append((t, float(r["nivel"])))
    rows.sort(key=lambda x: x[0])
    return rows


def zero_reference_anomaly(rows, target):
    nearby_zero = [(t, v) for t, v in rows if abs((t-target).total_seconds()) <= 4*3600 and abs(v) < 1e-9]
    if not nearby_zero:
        return False
    prev_nonzero = [(t, v) for t, v in rows if t < target and target - t <= timedelta(hours=36) and abs(v) > 0.25]
    next_nonzero = [(t, v) for t, v in rows if t > target and t - target <= timedelta(hours=36) and abs(v) > 0.25]
    if not prev_nonzero or not next_nonzero:
        return False
    pv = prev_nonzero[-1][1]
    nv = next_nonzero[0][1]
    tol = max(0.30, 0.25 * max(abs(pv), abs(nv), 1.0))
    return abs(pv - nv) <= tol


def reference_level(rows, target):
    nearby = [(abs((t - target).total_seconds()), t, v) for t, v in rows if abs((t - target).total_seconds()) <= 4 * 3600]
    if not nearby:
        return None
    nearby.sort(key=lambda x: x[0])
    closest = nearby[0]

    if abs(closest[2]) < 1e-9 and zero_reference_anomaly(rows, target):
        return None

    if len(nearby) >= 3:
        trio = nearby[:3]
        med = float(median([x[2] for x in trio]))
        threshold = max(0.30, 0.25 * max(abs(med), 1.0))
        if abs(closest[2] - med) > threshold:
            return None
        return float(closest[2])

    if len(nearby) == 2:
        a, b = nearby[0][2], nearby[1][2]
        if abs(a - b) > max(0.30, 0.25 * max(abs(a), abs(b), 1.0)):
            return None
        return float(a)

    # Una sola lectura observada cercana: el histórico ya pasó por
    # depurar_historico_niveles.py, así que se acepta hasta 3 h de distancia.
    if closest[0] <= 3 * 3600:
        return float(closest[2])
    return None


def recalc_delta(rows, current_time, current_level, hours):
    if not rows or not current_time or not finite(current_level):
        return None
    target = current_time - timedelta(hours=hours)
    ref = reference_level(rows, target)
    if ref is None:
        return None
    return round(float(current_level) - ref, 4)


def record_change(changes, station, field, old, new):
    same = (old is None and new is None) or (finite(old) and finite(new) and abs(float(old) - float(new)) < 1e-9) or (old == new)
    if not same:
        changes.append({"estacion": station, "campo": field, "antes": old, "despues": new})


def main():
    if not HIST.exists() or not SUMMARY.exists():
        raise RuntimeError("Faltan histórico o resumen de niveles.")

    history = json.loads(HIST.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    changes = []

    for row in summary:
        station = row.get("estacion")
        current_time = parse_dt(row.get("fecha_hora"))
        current_level = row.get("ultimo_nivel")
        obs = observed_station(history, station)

        for hours, field in ((24, "delta_24h"), (48, "delta_48h"), (72, "delta_72h")):
            new = recalc_delta(obs, current_time, current_level, hours)
            old = row.get(field)
            record_change(changes, station, field, old, new)
            row[field] = new

        # Si la base heredada es un cero espurio, no debe generar Δ06 ni una falsa tendencia.
        base_time = parse_dt(row.get("fecha_hora_base_ciclo"))
        if base_time and finite(row.get("nivel_base_06")) and abs(float(row.get("nivel_base_06"))) < 1e-9 and zero_reference_anomaly(obs, base_time):
            for field, new in (
                ("nivel_base_06", None),
                ("fecha_hora_base_ciclo", None),
                ("estado_base_06", "sin_dato"),
                ("delta_vs_06", None),
            ):
                record_change(changes, station, field, row.get(field), new)
                row[field] = new

        # Si el reporte inmediatamente anterior es un cero espurio, no se publica ascenso derivado de él.
        if current_time:
            prior = [(t, v) for t, v in obs if t < current_time]
            if prior:
                pt, pv = prior[-1]
                if abs(pv) < 1e-9 and zero_reference_anomaly(obs, pt):
                    for field, new in (("delta_reporte", None), ("tendencia", "Sin tendencia suficiente")):
                        record_change(changes, station, field, row.get(field), new)
                        row[field] = new

    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if summary:
        fields = list(summary[0].keys())
        with SUMMARY_CSV.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_ALL)
            w.writeheader()
            w.writerows(summary)

    mac = next((r for r in summary if r.get("estacion") == "Macuspana"), None)
    print(json.dumps({"cambios": changes, "macuspana": mac}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
