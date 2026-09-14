from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

AUTO = Path("data/fuentes_publicas/insivumeh_automaticas.json")
OUT = Path("data/fuentes_publicas/acumulados_4872.json")
FUENTE1 = Path("data/latest/FUENTE1.txt")
ARCHIVE = Path("data/archive")
MX_TZ = ZoneInfo("America/Mexico_City")
AUTO_PATH = "data/fuentes_publicas/insivumeh_automaticas.json"
MAX_DELTA_MIN = 120


def num(v):
    try:
        if v is None or v == "":
            return None
        x = float(v)
        return x if x == x else None
    except Exception:
        return None


def parse_dt(value):
    if not value:
        return None
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    except Exception:
        return None


def stations_from_doc(doc):
    out = {}
    for row in doc.get("estaciones", []) or []:
        code = str(row.get("codigo") or "").upper().strip()
        name = str(row.get("estacion") or "").strip()
        rain = num(row.get("precipitacion_24h_mm"))
        if rain is None:
            continue
        key = code or name.casefold()
        out[key] = {
            "codigo": code or None,
            "estacion": name,
            "precipitacion_24h_mm": rain,
        }
    return out


def git_history_docs(days=4):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        proc = subprocess.run(
            ["git", "log", "--format=%H", f"--since={since}", "--", AUTO_PATH],
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return []
    docs = []
    for sha in [x.strip() for x in proc.stdout.splitlines() if x.strip()]:
        try:
            raw = subprocess.run(
                ["git", "show", f"{sha}:{AUTO_PATH}"],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            doc = json.loads(raw)
            dt = parse_dt(doc.get("consultado_utc"))
            if dt:
                docs.append((dt, stations_from_doc(doc)))
        except Exception:
            continue
    docs.sort(key=lambda x: x[0])
    return docs


def closest_snapshot(history, target):
    best = None
    best_delta = None
    for dt, stations in history:
        delta = abs((dt - target).total_seconds())
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = (dt, stations)
    if best is None or best_delta is None or best_delta > MAX_DELTA_MIN * 60:
        return None
    return best


def parse_lacantun(text):
    clean = str(text or "").replace(",", "")
    m = re.search(
        r"BHG21\s+Lacant[uú]n\s+Ocosingo\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)",
        clean,
        re.I,
    )
    return float(m.group(6)) if m else None


def lacantun_daily():
    rows = {}
    for p in sorted(ARCHIVE.glob("????-??-??/FUENTE1.txt")):
        try:
            day = p.parent.name
            v = parse_lacantun(p.read_text(encoding="utf-8", errors="ignore"))
            if v is not None:
                rows[day] = v
        except Exception:
            continue
    try:
        v = parse_lacantun(FUENTE1.read_text(encoding="utf-8", errors="ignore"))
        if v is not None:
            today = datetime.now(timezone.utc).astimezone(MX_TZ).date().isoformat()
            rows[today] = v
    except Exception:
        pass
    return rows


def consecutive_sum(values_by_day, days):
    if not values_by_day:
        return None, []
    latest = max(values_by_day)
    d0 = datetime.fromisoformat(latest).date()
    used = []
    total = 0.0
    for offset in range(days):
        day = (d0 - timedelta(days=offset)).isoformat()
        v = num(values_by_day.get(day))
        if v is None:
            return None, used
        used.append({"fecha": day, "precipitacion_24h_mm": v})
        total += v
    return round(total, 1), used


def main():
    if not AUTO.exists():
        raise RuntimeError(f"No existe {AUTO}")

    current_doc = json.loads(AUTO.read_text(encoding="utf-8"))
    current_dt = parse_dt(current_doc.get("consultado_utc")) or datetime.now(timezone.utc)
    current = stations_from_doc(current_doc)
    history = git_history_docs(4)
    snap24 = closest_snapshot(history, current_dt - timedelta(hours=24))
    snap48 = closest_snapshot(history, current_dt - timedelta(hours=48))

    result = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "regla": "48 h = ventana 24 h actual + ventana 24 h observada ~24 h antes; 72 h agrega la ventana observada ~48 h antes. Si falta una ventana real, se conserva s/d.",
        "tolerancia_historica_min": MAX_DELTA_MIN,
        "insivumeh": [],
        "lacantun": {},
    }

    for key, row in current.items():
        v0 = row["precipitacion_24h_mm"]
        v1 = snap24[1].get(key, {}).get("precipitacion_24h_mm") if snap24 else None
        v2 = snap48[1].get(key, {}).get("precipitacion_24h_mm") if snap48 else None
        out = dict(row)
        out["precipitacion_48h_mm"] = round(v0 + v1, 1) if v1 is not None else None
        out["precipitacion_72h_mm"] = round(v0 + v1 + v2, 1) if v1 is not None and v2 is not None else None
        out["componentes"] = {
            "actual": {"consultado_utc": current_dt.isoformat(), "mm": v0},
            "menos_24h": {"consultado_utc": snap24[0].isoformat(), "mm": v1} if snap24 and v1 is not None else None,
            "menos_48h": {"consultado_utc": snap48[0].isoformat(), "mm": v2} if snap48 and v2 is not None else None,
        }
        result["insivumeh"].append(out)

    lac = lacantun_daily()
    lac24, used24 = consecutive_sum(lac, 1)
    lac48, used48 = consecutive_sum(lac, 2)
    lac72, used72 = consecutive_sum(lac, 3)
    result["lacantun"] = {
        "precipitacion_24h_mm": lac24,
        "precipitacion_48h_mm": lac48,
        "precipitacion_72h_mm": lac72,
        "dias_disponibles": sorted(lac),
        "componentes_48h": used48,
        "componentes_72h": used72,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"insivumeh": len(result["insivumeh"]), "lacantun_48h": lac48, "lacantun_72h": lac72}, ensure_ascii=False))


if __name__ == "__main__":
    main()
