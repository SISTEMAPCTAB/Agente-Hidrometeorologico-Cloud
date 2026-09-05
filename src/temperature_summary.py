import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

MX_TZ = ZoneInfo("America/Mexico_City")
LATEST = Path("data/weatherlink/latest.json")
STATE = Path("data/weatherlink/temperature_state.json")
OUTPUT = Path("data/weatherlink/temperature_summary.json")


def load(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def f2c(f):
    return (float(f) - 32.0) * 5.0 / 9.0


def heat_index_f(t, rh):
    if t is None or rh is None:
        return None
    t = float(t)
    rh = float(rh)
    if t < 80 or rh < 40:
        return None
    hi = (-42.379 + 2.04901523*t + 10.14333127*rh - 0.22475541*t*rh
          - 0.00683783*t*t - 0.05481717*rh*rh + 0.00122874*t*t*rh
          + 0.00085282*t*rh*rh - 0.00000199*t*t*rh*rh)
    if rh < 13 and 80 <= t <= 112:
        hi -= ((13-rh)/4) * ((17-abs(t-95))/17) ** 0.5
    if rh > 85 and 80 <= t <= 87:
        hi += ((rh-85)/10) * ((87-t)/5)
    return hi


def territory(location):
    s = (location or "").lower()
    if "tab" in s or "tabasco" in s:
        return "Tabasco"
    if "chiapas" in s:
        return "Chiapas"
    if "pet" in s or "guatemala" in s:
        return "Guatemala/Petén"
    return "Otra ubicación"


def risk_level(hi_c):
    if hi_c is None:
        return "Sin dato"
    if hi_c >= 51.7:
        return "Peligro extremo"
    if hi_c >= 39.4:
        return "Peligro"
    if hi_c >= 32.2:
        return "Precaución extrema"
    if hi_c >= 26.7:
        return "Precaución"
    return "Normal"


def main():
    latest = load(LATEST, {})
    state = load(STATE, {"date_local": None, "stations": {}})
    now = datetime.now(MX_TZ)
    day = now.strftime("%Y-%m-%d")
    if state.get("date_local") != day:
        state = {"date_local": day, "stations": {}}

    rows = []
    for st in latest.get("stations", []):
        name = st.get("nombre")
        tf = st.get("temperature_f")
        if not name or tf is None:
            continue
        try:
            tc = f2c(tf)
        except Exception:
            continue
        rh = st.get("humidity_pct")
        hi_f = heat_index_f(tf, rh)
        hi_c = f2c(hi_f) if hi_f is not None else tc
        obs_time = st.get("last_updated_at") or st.get("observed_utc") or latest.get("run_local")
        rec = state["stations"].setdefault(name, {
            "max_temp_c": None, "max_temp_time": None,
            "max_heat_index_c": None, "max_heat_index_time": None,
            "territory": territory(st.get("ubicacion")),
            "ubicacion": st.get("ubicacion")
        })
        if rec.get("max_temp_c") is None or tc > float(rec["max_temp_c"]):
            rec["max_temp_c"] = round(tc, 1)
            rec["max_temp_time"] = obs_time
        if rec.get("max_heat_index_c") is None or hi_c > float(rec["max_heat_index_c"]):
            rec["max_heat_index_c"] = round(hi_c, 1)
            rec["max_heat_index_time"] = obs_time
        rec["territory"] = territory(st.get("ubicacion"))
        rec["ubicacion"] = st.get("ubicacion")
        rows.append({"estacion": name, **rec, "nivel_riesgo_max": risk_level(rec.get("max_heat_index_c"))})

    rows.sort(key=lambda x: (x.get("max_heat_index_c") is not None, x.get("max_heat_index_c") or -999), reverse=True)
    by_territory = {}
    for r in rows:
        t = r["territory"]
        by_territory.setdefault(t, []).append(r)
    territory_summary = []
    for t, vals in by_territory.items():
        top = max(vals, key=lambda x: x.get("max_heat_index_c") or -999)
        territory_summary.append({
            "territorio": t,
            "estaciones": len(vals),
            "max_temp_c": max(v.get("max_temp_c") or -999 for v in vals),
            "max_heat_index_c": top.get("max_heat_index_c"),
            "estacion_mas_caliente": top.get("estacion"),
            "nivel_riesgo": top.get("nivel_riesgo_max")
        })
    territory_summary.sort(key=lambda x: x.get("max_heat_index_c") or -999, reverse=True)

    state["updated_local"] = now.isoformat()
    save(STATE, state)
    save(OUTPUT, {
        "date_local": day,
        "updated_local": now.isoformat(),
        "units": {"temperature": "°C", "heat_index": "°C"},
        "stations": rows,
        "territories": territory_summary,
        "note": "Máximas del día construidas con observaciones WeatherLink recibidas por el agente cloud. No se reconstruyen horas anteriores a la primera observación almacenada del día."
    })


if __name__ == "__main__":
    main()
