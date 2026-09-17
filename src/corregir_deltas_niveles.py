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


def reference_level(rows, target):
    """Obtiene una referencia cercana al instante objetivo sin convertir un valor aislado anómalo en delta.

    Se acepta sólo información observada. La lectura más próxima debe estar dentro de ±4 h.
    Si hay varias lecturas alrededor del objetivo, se usa control robusto con la mediana
    de las tres más cercanas para descartar un valor aislado incompatible con sus vecinas.
    """
    nearby = [(abs((t - target).total_seconds()), t, v) for t, v in rows if abs((t - target).total_seconds()) <= 4 * 3600]
    if not nearby:
        return None
    nearby.sort(key=lambda x: x[0])
    closest = nearby[0]

    if len(nearby) >= 3:
        trio = nearby[:3]
        med = float(median([x[2] for x in trio]))
        threshold = max(0.30, 0.25 * max(abs(med), 1.0))
        if abs(closest[2] - med) > threshold:
            return med
        return float(closest[2])

    if len(nearby) == 2:
        a, b = nearby[0][2], nearby[1][2]
        if abs(a - b) > max(0.30, 0.25 * max(abs(a), abs(b), 1.0)):
            return None
        return float(a)

    if closest[0] <= 3600:
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


def main():
    if not HIST.exists() or not SUMMARY.exists():
        raise RuntimeError("Faltan histórico o resumen de niveles.")

    history = json.loads(HIST.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    changes = []

    mac_before = next((r for r in summary if r.get("estacion") == "Macuspana"), None)
    if mac_before:
        mt = parse_dt(mac_before.get("fecha_hora"))
        mobs = observed_station(history, "Macuspana")
        if mt:
            target = mt - timedelta(hours=24)
            diag = [
                {"fecha_hora": t.isoformat(), "nivel": v, "dist_h": round((t-target).total_seconds()/3600, 2)}
                for t, v in mobs if abs((t-target).total_seconds()) <= 36*3600
            ]
            print("DIAGNOSTICO_MACUSPANA_24H=" + json.dumps(diag, ensure_ascii=False))

    for row in summary:
        station = row.get("estacion")
        current_time = parse_dt(row.get("fecha_hora"))
        current_level = row.get("ultimo_nivel")
        obs = observed_station(history, station)
        for hours, field in ((24, "delta_24h"), (48, "delta_48h"), (72, "delta_72h")):
            new = recalc_delta(obs, current_time, current_level, hours)
            old = row.get(field)
            same = (old is None and new is None) or (finite(old) and finite(new) and abs(float(old) - float(new)) < 1e-9)
            if not same:
                changes.append({"estacion": station, "campo": field, "antes": old, "despues": new})
                row[field] = new

    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if summary:
        fields = list(summary[0].keys())
        with SUMMARY_CSV.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_ALL)
            w.writeheader()
            w.writerows(summary)

    mac = next((r for r in summary if r.get("estacion") == "Macuspana"), None)
    print(json.dumps({
        "cambios": changes,
        "macuspana": {
            "nivel": mac.get("ultimo_nivel") if mac else None,
            "delta_24h": mac.get("delta_24h") if mac else None,
            "delta_48h": mac.get("delta_48h") if mac else None,
            "delta_72h": mac.get("delta_72h") if mac else None,
        }
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
