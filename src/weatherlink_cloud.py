import csv
import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

BASE = "https://www.weatherlink.com"
MX_TZ = ZoneInfo("America/Mexico_City")
CONFIG = Path("config/weatherlink_stations.json")
SEED_CSV = Path("data/weatherlink/seed.csv")
SEED_DAILY = Path("data/weatherlink/seed_daily.json")
STATE_PATH = Path("data/weatherlink/state.json")
LATEST_CSV = Path("data/weatherlink/Tabla_WeatherLink_Cloud.csv")
LATEST_JSON = Path("data/weatherlink/latest.json")
STATUS_JSON = Path("data/weatherlink/Estado_WeatherLink_Cloud.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
    "Accept": "application/json,text/javascript,*/*;q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.weatherlink.com/map",
}

WINDOWS = (1, 6, 24, 48, 72)


def parse_float(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"sin dato", "none", "null", "nan"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def r1(value):
    if value is None:
        return None
    value = round(float(value) + 1e-10, 1)
    if abs(value) < 0.05:
        return 0.0
    return value


def iso_to_dt(value):
    if not value:
        return None
    value = value.replace("Z", "+00:00")
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def load_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_seed_table():
    rows = {}
    if not SEED_CSV.exists():
        return rows
    with SEED_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            rows[row["Estacion"]] = {
                "seed_1h_mm": parse_float(row.get("1 h mm")),
                "seed_24h_mm": parse_float(row.get("24 h mm")),
                "month_mm": parse_float(row.get("Mes mm")),
                "year_mm": parse_float(row.get("Año mm")),
                "variables": int(parse_float(row.get("Variables")) or 0),
            }
    return rows


def initial_state(stations):
    seed_table = load_seed_table()
    seed_daily_doc = load_json(SEED_DAILY, {"seed_utc": None, "daily_mm": {}})
    seed_utc = seed_daily_doc.get("seed_utc") or datetime.now(timezone.utc).isoformat()
    seed_dt = iso_to_dt(seed_utc) or datetime.now(timezone.utc)
    seed_local = seed_dt.astimezone(MX_TZ)
    daily_by_uuid = seed_daily_doc.get("daily_mm", {})
    state = {
        "version": 1,
        "seed_utc": seed_dt.isoformat(),
        "last_run_utc": None,
        "stations": {},
    }
    for station in stations:
        base = seed_table.get(station["nombre"], {})
        state["stations"][station["uuid"]] = {
            "nombre": station["nombre"],
            "prev_daily_mm": daily_by_uuid.get(station["uuid"]),
            "prev_observed_utc": seed_dt.isoformat(),
            "month_mm": base.get("month_mm"),
            "year_mm": base.get("year_mm"),
            "month_key": seed_local.strftime("%Y-%m"),
            "year_key": seed_local.strftime("%Y"),
            "seed_1h_mm": base.get("seed_1h_mm"),
            "seed_24h_mm": base.get("seed_24h_mm"),
            "variables": base.get("variables", 0),
            "events": [],
        }
    return state


def fetch_station(station):
    url = f"{BASE}/map/data/station/{station['uuid']}"
    r = requests.get(url, headers=HEADERS, timeout=35)
    r.raise_for_status()
    data = r.json()
    daily_in = parse_float(data.get("dailyRain"))
    daily_mm = r1(daily_in * 25.4) if daily_in is not None else None
    ts = data.get("lastTimestamp")
    observed = datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else datetime.now(timezone.utc)
    return {
        "nombre_fuente": data.get("sStation"),
        "daily_mm": daily_mm,
        "observed_utc": observed,
        "last_updated_at": data.get("lastUpdatedAt"),
        "age_seconds": data.get("ageInSeconds"),
        "temperature_f": parse_float(data.get("temperature")),
        "humidity_pct": parse_float(data.get("humidity")),
        "wind_mph": parse_float(data.get("windSpeed")),
        "barometer_inhg": parse_float(data.get("barometer")),
        "source_url": url,
    }


def classify_24h(mm):
    if mm is None:
        return "Sin dato", "Sin dato"
    if mm < 5:
        return "0–5 mm", f"{r1(5-mm):.1f} mm para 5 mm"
    if mm < 25:
        return "5–25 mm", f"{r1(25-mm):.1f} mm para 25 mm"
    if mm < 50:
        return "25–50 mm", f"{r1(50-mm):.1f} mm para 50 mm"
    if mm < 75:
        return "50–75 mm", f"{r1(75-mm):.1f} mm para 75 mm"
    if mm < 150:
        return "75–150 mm", f"{r1(150-mm):.1f} mm para 150 mm"
    return ">=150 mm", "Umbral >=150 mm alcanzado"


def window_sum(events, now_utc, hours):
    cutoff = now_utc - timedelta(hours=hours)
    return r1(sum(float(e["mm"]) for e in events if iso_to_dt(e.get("ts")) and iso_to_dt(e["ts"]) > cutoff))


def fmt(value):
    if value is None:
        return ""
    value = r1(value)
    if value is None:
        return ""
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.1f}"


def main():
    stations = load_json(CONFIG, [])
    if len(stations) != 32:
        raise RuntimeError(f"Se esperaban 32 estaciones y se encontraron {len(stations)}.")

    state = load_json(STATE_PATH, None) or initial_state(stations)
    now_utc = datetime.now(timezone.utc)
    seed_dt = iso_to_dt(state.get("seed_utc")) or now_utc
    coverage_hours = max(0.0, (now_utc - seed_dt).total_seconds() / 3600.0)

    rows = []
    raw = []
    ok = 0
    errors = []

    for station in stations:
        uuid = station["uuid"]
        st = state["stations"].setdefault(uuid, {
            "nombre": station["nombre"], "prev_daily_mm": None, "prev_observed_utc": None,
            "month_mm": None, "year_mm": None, "month_key": now_utc.astimezone(MX_TZ).strftime("%Y-%m"),
            "year_key": now_utc.astimezone(MX_TZ).strftime("%Y"), "seed_1h_mm": None,
            "seed_24h_mm": None, "variables": 0, "events": []
        })
        item = {"nombre": station["nombre"], "ubicacion": station["ubicacion"], "uuid": uuid}
        try:
            obs = fetch_station(station)
            item.update(obs)
            observed = obs["observed_utc"]
            observed_local = observed.astimezone(MX_TZ)
            current_daily = obs["daily_mm"]
            prev_daily = parse_float(st.get("prev_daily_mm"))
            prev_obs = iso_to_dt(st.get("prev_observed_utc"))

            increment = None
            if current_daily is not None:
                if prev_daily is None or prev_obs is None:
                    increment = 0.0
                else:
                    same_day = prev_obs.astimezone(MX_TZ).date() == observed_local.date()
                    if same_day and current_daily >= prev_daily - 0.05:
                        increment = max(0.0, current_daily - prev_daily)
                    else:
                        increment = max(0.0, current_daily)
                increment = r1(increment)

                if increment and increment > 0:
                    st.setdefault("events", []).append({"ts": observed.isoformat(), "mm": increment})

                month_key = observed_local.strftime("%Y-%m")
                year_key = observed_local.strftime("%Y")
                if st.get("month_key") != month_key:
                    st["month_key"] = month_key
                    st["month_mm"] = 0.0
                if st.get("year_key") != year_key:
                    st["year_key"] = year_key
                    st["year_mm"] = 0.0
                if increment is not None:
                    if st.get("month_mm") is not None:
                        st["month_mm"] = r1(float(st["month_mm"]) + increment)
                    if st.get("year_mm") is not None:
                        st["year_mm"] = r1(float(st["year_mm"]) + increment)

                st["prev_daily_mm"] = current_daily
                st["prev_observed_utc"] = observed.isoformat()

            prune_cutoff = now_utc - timedelta(hours=80)
            st["events"] = [e for e in st.get("events", []) if iso_to_dt(e.get("ts")) and iso_to_dt(e["ts"]) >= prune_cutoff]

            acc = {}
            quality_parts = []
            for h in WINDOWS:
                if coverage_hours >= h:
                    acc[h] = window_sum(st["events"], now_utc, h)
                elif h == 1 and st.get("seed_1h_mm") is not None:
                    acc[h] = r1(st.get("seed_1h_mm"))
                    quality_parts.append("1h heredado")
                elif h == 24 and st.get("seed_24h_mm") is not None:
                    acc[h] = r1(st.get("seed_24h_mm"))
                    quality_parts.append("24h heredado")
                else:
                    acc[h] = None

            range24, next_threshold = classify_24h(acc[24])
            age = obs.get("age_seconds")
            estado = "OK" if age is None or age <= 7200 else "Dato rezagado"
            quality = "Cloud" if not quality_parts else "Cloud + " + ", ".join(quality_parts)

            rows.append({
                "Estacion": station["nombre"],
                "Ubicacion": station["ubicacion"],
                "1 h mm": fmt(acc[1]),
                "6 h mm": fmt(acc[6]),
                "24 h mm": fmt(acc[24]),
                "48 h mm": fmt(acc[48]),
                "72 h mm": fmt(acc[72]),
                "Mes mm": fmt(st.get("month_mm")),
                "Año mm": fmt(st.get("year_mm")),
                "Rango SMN 24h": range24,
                "Siguiente umbral": next_threshold,
                "Variables": str(st.get("variables", 0)),
                "Estado": estado,
                "Corte fuente": observed_local.strftime("%Y-%m-%d %H:%M:%S"),
                "Calidad": quality,
            })
            ok += 1
            item["increment_mm"] = increment
            item["accumulations_mm"] = {str(k): acc[k] for k in WINDOWS}
            item["quality"] = quality
        except Exception as exc:
            errors.append({"estacion": station["nombre"], "error": f"{type(exc).__name__}: {exc}"})
            rows.append({
                "Estacion": station["nombre"], "Ubicacion": station["ubicacion"], "1 h mm": "", "6 h mm": "",
                "24 h mm": "", "48 h mm": "", "72 h mm": "", "Mes mm": "", "Año mm": "",
                "Rango SMN 24h": "Sin dato", "Siguiente umbral": "Sin dato", "Variables": "0",
                "Estado": "Error cloud", "Corte fuente": "", "Calidad": "Sin dato"
            })
            item["error"] = f"{type(exc).__name__}: {exc}"
        raw.append(item)

    state["last_run_utc"] = now_utc.isoformat()
    write_json(STATE_PATH, state)
    write_json(LATEST_JSON, {
        "run_utc": now_utc.isoformat(),
        "run_local": now_utc.astimezone(MX_TZ).isoformat(),
        "coverage_hours": round(coverage_hours, 2),
        "stations": raw,
    })

    LATEST_CSV.parent.mkdir(parents=True, exist_ok=True)
    fields = ["Estacion", "Ubicacion", "1 h mm", "6 h mm", "24 h mm", "48 h mm", "72 h mm", "Mes mm", "Año mm", "Rango SMN 24h", "Siguiente umbral", "Variables", "Estado", "Corte fuente", "Calidad"]
    with LATEST_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)

    status = {
        "agent": "WeatherLink Cloud",
        "run_utc": now_utc.isoformat(),
        "run_local": now_utc.astimezone(MX_TZ).isoformat(),
        "stations_expected": 32,
        "stations_ok": ok,
        "stations_error": len(errors),
        "coverage_hours_since_seed": round(coverage_hours, 2),
        "window_maturity": {f"{h}h": coverage_hours >= h for h in WINDOWS},
        "complete": ok == 32,
        "errors": errors,
        "source": "WeatherLink public map endpoint /map/data/station/{uuid}",
        "note": "1h y 24h se conservan como heredados del corte base hasta completar su ventana cloud; 6h/48h/72h quedan vacíos hasta reunir historia suficiente.",
    }
    write_json(STATUS_JSON, status)
    print(json.dumps(status, ensure_ascii=False, indent=2))

    if ok == 0:
        raise RuntimeError("No se pudo recuperar ninguna estación WeatherLink.")


if __name__ == "__main__":
    main()
