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
GT_TZ = ZoneInfo("America/Guatemala")
AUTO_PATH = "data/fuentes_publicas/insivumeh_automaticas.json"
MAX_DELTA_MIN = 120

MONTHS = {
    "ene": 1, "jan": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4, "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8, "aug": 8,
    "sep": 9, "sept": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12, "dec": 12,
}


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


def parse_source_cut(value):
    """Convierte el corte publicado por INSIVUMEH a UTC.

    Se acepta el formato observado DD/Mon/YYYY HH:MM con abreviaturas
    españolas o inglesas. Si no existe un corte explícito, no se usa la hora
    de consulta como sustituto, para evitar acumular un dato estancado.
    """
    if not value:
        return None
    m = re.search(r"(\d{1,2})/([A-Za-zÁÉÍÓÚáéíóú]{3,5})/(\d{4})\s+(\d{1,2}):(\d{2})", str(value))
    if not m:
        return None
    mon = m.group(2).lower()
    mon = (mon.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u"))
    month = MONTHS.get(mon)
    if month is None:
        month = MONTHS.get(mon[:3])
    if month is None:
        return None
    try:
        d = datetime(int(m.group(3)), month, int(m.group(1)), int(m.group(4)), int(m.group(5)), tzinfo=GT_TZ)
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
    seen_cuts = set()
    for sha in [x.strip() for x in proc.stdout.splitlines() if x.strip()]:
        try:
            raw = subprocess.run(
                ["git", "show", f"{sha}:{AUTO_PATH}"],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            doc = json.loads(raw)
            source_dt = parse_source_cut(doc.get("corte_fuente"))
            if not source_dt:
                continue
            cut_key = source_dt.isoformat()
            if cut_key in seen_cuts:
                continue
            seen_cuts.add(cut_key)
            docs.append((source_dt, stations_from_doc(doc), doc.get("corte_fuente")))
        except Exception:
            continue
    docs.sort(key=lambda x: x[0])
    return docs


def closest_snapshot(history, target):
    best = None
    best_delta = None
    for dt, stations, label in history:
        delta = abs((dt - target).total_seconds())
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = (dt, stations, label)
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
        raw = FUENTE1.read_text(encoding="utf-8", errors="ignore")
        v = parse_lacantun(raw)
        # Never assign an old email attachment to today's date just because
        # the collector executed today. Use the actual source message date.
        match = re.search(r"^FECHA/HORA MENSAJE:\s*(\d{4}-\d{2}-\d{2})T", raw, re.M)
        if v is not None and match:
            rows[match.group(1)] = v
    except Exception:
        pass
    return rows


def consecutive_sum(values_by_day, days, reference_day=None):
    if not values_by_day:
        return None, []
    # Require the requested current cut; do not relabel an old valid window
    # as today's 24/48/72 h merely because its historical dates are consecutive.
    latest = reference_day or max(values_by_day)
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
    consulted_dt = parse_dt(current_doc.get("consultado_utc")) or datetime.now(timezone.utc)
    source_dt = parse_source_cut(current_doc.get("corte_fuente"))
    current = stations_from_doc(current_doc)
    history = git_history_docs(4)
    snap24 = closest_snapshot(history, source_dt - timedelta(hours=24)) if source_dt else None
    snap48 = closest_snapshot(history, source_dt - timedelta(hours=48)) if source_dt else None

    result = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "regla": "48 h y 72 h sólo se forman con ventanas de 24 h asociadas a cortes fuente distintos de INSIVUMEH, separados aproximadamente 24 h. La hora de consulta del agente nunca sustituye al corte fuente. Si falta una ventana verificable, se conserva s/d.",
        "tolerancia_historica_min": MAX_DELTA_MIN,
        "insivumeh_corte_fuente_actual": current_doc.get("corte_fuente"),
        "insivumeh_corte_fuente_valido": source_dt is not None,
        "insivumeh": [],
        "lacantun": {},
    }

    for key, row in current.items():
        v0 = row["precipitacion_24h_mm"]
        v1 = snap24[1].get(key, {}).get("precipitacion_24h_mm") if snap24 else None
        v2 = snap48[1].get(key, {}).get("precipitacion_24h_mm") if snap48 else None
        out = dict(row)
        out["precipitacion_48h_mm"] = round(v0 + v1, 1) if source_dt and v1 is not None else None
        out["precipitacion_72h_mm"] = round(v0 + v1 + v2, 1) if source_dt and v1 is not None and v2 is not None else None
        out["componentes"] = {
            "actual": {
                "corte_fuente": current_doc.get("corte_fuente"),
                "corte_utc": source_dt.isoformat() if source_dt else None,
                "consultado_utc": consulted_dt.isoformat(),
                "mm": v0,
            },
            "menos_24h": {"corte_fuente": snap24[2], "corte_utc": snap24[0].isoformat(), "mm": v1} if snap24 and v1 is not None else None,
            "menos_48h": {"corte_fuente": snap48[2], "corte_utc": snap48[0].isoformat(), "mm": v2} if snap48 and v2 is not None else None,
        }
        result["insivumeh"].append(out)

    lac = lacantun_daily()
    today = datetime.now(timezone.utc).astimezone(MX_TZ).date().isoformat()
    lac24, used24 = consecutive_sum(lac, 1, reference_day=today)
    lac48, used48 = consecutive_sum(lac, 2, reference_day=today)
    lac72, used72 = consecutive_sum(lac, 3, reference_day=today)
    result["lacantun"] = {
        "precipitacion_24h_mm": lac24,
        "precipitacion_48h_mm": lac48,
        "precipitacion_72h_mm": lac72,
        "fecha_corte_requerida": today,
        "ultima_fecha_observada": max(lac) if lac else None,
        "estado_24h": "observado" if lac24 is not None else "sin_dato_del_corte",
        "estado_48h": "observado" if lac48 is not None else "sin_dato_del_corte",
        "estado_72h": "observado" if lac72 is not None else "sin_dato_del_corte",
        "dias_disponibles": sorted(lac),
        "componentes_48h": used48,
        "componentes_72h": used72,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"insivumeh": len(result["insivumeh"]), "corte_fuente_valido": source_dt is not None, "lacantun_48h": lac48, "lacantun_72h": lac72}, ensure_ascii=False))


if __name__ == "__main__":
    main()
