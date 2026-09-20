import csv
import json
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

WINDOWS = (1, 6, 24, 48, 72, 96, 120)


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


def json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Tipo no serializable: {type(value).__name__}")


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, default=json_default)
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
            "prev_storm_mm": None,
            "prev_storm_start": None,
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
    storm_in = parse_float(data.get("stormRain"))
    month_in = parse_float(data.get("monthlyRain"))
    year_in = parse_float(data.get("yearlyRain") if data.get("yearlyRain") is not None else data.get("totalRain"))
    rain_rate_in = parse_float(data.get("rainRate"))
    daily_mm = r1(daily_in * 25.4) if daily_in is not None else None
    storm_mm = r1(storm_in * 25.4) if storm_in is not None else None
    monthly_native_mm = r1(month_in * 25.4) if month_in is not None else None
    yearly_native_mm = r1(year_in * 25.4) if year_in is not None else None
    rain_rate_mmh = r1(rain_rate_in * 25.4) if rain_rate_in is not None else None
    ts = data.get("lastTimestamp")
    if not ts:
        raise ValueError("WeatherLink no entregó lastTimestamp; no se inventa fecha de observación")
    observed = datetime.fromtimestamp(int(ts), tz=timezone.utc)
    if observed > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("Fecha de observación futura: no se incorpora al histórico")
    return {
        "nombre_fuente": data.get("sStation"),
        "daily_mm": daily_mm,
        "storm_mm": storm_mm,
        "storm_start": data.get("stormStart") or data.get("stormStartAt") or data.get("stormStartDate"),
        "monthly_native_mm": monthly_native_mm,
        "yearly_native_mm": yearly_native_mm,
        "rain_rate_mmh": rain_rate_mmh,
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


def mark_legacy_rollovers(events):
    """Marca cruces de medianoche heredados que no pudieron verificarse.

    Antes de esta corrección los eventos sólo guardaban ts/mm. Si dos eventos
    consecutivos de lluvia quedan a ambos lados de la medianoche local con una
    separación corta, el primer evento del nuevo día pudo perder lluvia caída
    entre la última consulta y las 00:00. Se marca como incierto de forma
    conservadora para no publicar una ventana móvil de 24 h como exacta.
    """
    ordered = sorted(
        [e for e in events if iso_to_dt(e.get("ts"))],
        key=lambda e: iso_to_dt(e["ts"]),
    )
    prev = None
    for e in ordered:
        if "rollover_incierto" not in e:
            e["rollover_incierto"] = False
            e.setdefault("metodo", "historico_sin_metodo")
        if prev is not None:
            pt = iso_to_dt(prev["ts"])
            et = iso_to_dt(e["ts"])
            if pt and et:
                pl = pt.astimezone(MX_TZ)
                el = et.astimezone(MX_TZ)
                gap_h = (et - pt).total_seconds() / 3600.0
                if pl.date() != el.date() and 0 < gap_h <= 6:
                    e["rollover_incierto"] = True
                    e["metodo"] = "rollover_historico_no_verificable"
        prev = e
    return ordered


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
            "nombre": station["nombre"], "prev_daily_mm": None, "prev_storm_mm": None, "prev_storm_start": None, "prev_observed_utc": None,
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
            current_storm = obs.get("storm_mm")
            current_storm_start = obs.get("storm_start")
            prev_daily = parse_float(st.get("prev_daily_mm"))
            prev_storm = parse_float(st.get("prev_storm_mm"))
            prev_storm_start = st.get("prev_storm_start")
            prev_obs = iso_to_dt(st.get("prev_observed_utc"))
            # El mapa público puede devolver durante horas una misma lectura antigua.
            # No se suma ni se retrocede el acumulado cuando no hay observación nueva.
            if prev_obs is not None and observed <= prev_obs:
                current_daily = None
                item["recollection_status"] = "lectura_repetida_o_anterior"

            increment = None
            increment_method = "sin_dato"
            rollover_uncertain = False
            if current_daily is not None:
                if prev_daily is None or prev_obs is None:
                    increment = 0.0
                    increment_method = "inicio_sin_referencia"
                else:
                    same_day = prev_obs.astimezone(MX_TZ).date() == observed_local.date()
                    if same_day and current_daily >= prev_daily - 0.05:
                        increment = max(0.0, current_daily - prev_daily)
                        increment_method = "diferencia_diaria"
                    else:
                        same_storm = (
                            current_storm is not None and prev_storm is not None
                            and current_storm >= prev_storm - 0.05
                            and (
                                not current_storm_start or not prev_storm_start
                                or str(current_storm_start) == str(prev_storm_start)
                            )
                        )
                        if same_storm:
                            increment = max(0.0, current_storm - prev_storm)
                            increment_method = "puente_tormenta_rollover"
                        else:
                            # El acumulado diario reinició y el endpoint público no ofrece
                            # un acumulado nativo móvil de 24 h. Conservamos sólo la lluvia
                            # comprobable del nuevo día y marcamos la ventana como incierta.
                            increment = max(0.0, current_daily)
                            increment_method = "rollover_sin_puente"
                            rollover_uncertain = True
                increment = r1(increment)
                # Un intervalo sin observaciones no permite localizar la lluvia
                # con exactitud dentro de las ventanas móviles.
                if prev_obs is not None and observed > prev_obs and (observed-prev_obs).total_seconds()>1800:
                    rollover_uncertain = True
                    increment_method += "_intervalo_sin_observaciones"
                # La lluvia entre dos observaciones no tiene hora exacta. Una ventana
                # móvil que comienza dentro del intervalo NO tiene suma exacta.
                # Registrar el intervalo sin alterar los incrementos ya observados.
                if prev_obs is not None and observed > prev_obs:
                    item["observation_interval_start_utc"] = prev_obs.isoformat()
                    item["observation_interval_end_utc"] = observed.isoformat()
                if (increment is not None and increment > 0) or rollover_uncertain:
                    st.setdefault("events", []).append({
                        "ts": observed.isoformat(),
                        "mm": increment or 0.0,
                        "metodo": increment_method,
                        "rollover_incierto": rollover_uncertain,
                    })

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
                st["prev_storm_mm"] = current_storm
                st["prev_storm_start"] = current_storm_start
                st["prev_observed_utc"] = observed.isoformat()

            st["events"] = mark_legacy_rollovers(st.get("events", []))
            prune_cutoff = now_utc - timedelta(hours=240)
            st["events"] = [e for e in st.get("events", []) if iso_to_dt(e.get("ts")) and iso_to_dt(e["ts"]) >= prune_cutoff]

            acc = {}
            window_status = {}
            quality_parts = []
            for h in WINDOWS:
                if coverage_hours >= h:
                    acc[h] = window_sum(st["events"], now_utc, h)
                    cutoff = now_utc - timedelta(hours=h)
                    uncertain = any(
                        e.get("rollover_incierto") is True
                        and iso_to_dt(e.get("ts"))
                        and iso_to_dt(e["ts"]) > cutoff
                        for e in st.get("events", [])
                    )
                    window_status[h] = "minimo_observado" if uncertain else "reconstruido_por_intervalos"
                elif h == 1 and st.get("seed_1h_mm") is not None:
                    acc[h] = r1(st.get("seed_1h_mm"))
                    window_status[h] = "heredado"
                    quality_parts.append("1h heredado")
                elif h == 24 and st.get("seed_24h_mm") is not None:
                    acc[h] = r1(st.get("seed_24h_mm"))
                    window_status[h] = "heredado"
                    quality_parts.append("24h heredado")
                else:
                    acc[h] = None
                    window_status[h] = "sin_dato"

            uncertain_windows = [h for h in WINDOWS if window_status.get(h) == "minimo_observado"]
            range24, next_threshold = classify_24h(acc[24])
            age = obs.get("age_seconds")
            # La antigüedad se deriva de la marca temporal observada: una edad
            # ausente o errónea del mapa no convierte datos antiguos en vigentes.
            actual_age = (now_utc - observed).total_seconds()
            estado = "Dato rezagado" if (item.get("recollection_status") or actual_age > 7200 or actual_age < -300) else "OK"
            item["age_seconds"] = max(0, int(actual_age))
            if uncertain_windows:
                quality_parts.append(
                    "ventanas con mínimo observado por cruce de medianoche: "
                    + "/".join(f"{h}h" for h in uncertain_windows)
                )
            quality_parts.append("lluvia móvil reconstruida de lecturas periódicas; no es acumulado nativo WeatherLink")
            quality = "Cloud" if not quality_parts else "Cloud + " + ", ".join(quality_parts)

            rows.append({
                "Estacion": station["nombre"],
                "Ubicacion": station["ubicacion"],
                "1 h mm": fmt(acc[1]),
                "6 h mm": fmt(acc[6]),
                "24 h mm": fmt(acc[24]),
                "48 h mm": fmt(acc[48]),
                "72 h mm": fmt(acc[72]),
                "96 h mm": fmt(acc[96]),
                "120 h mm": fmt(acc[120]),
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
            item["increment_method"] = increment_method
            item["rollover_uncertain_24h"] = window_status.get(24) == "minimo_observado"
            item["accumulations_mm"] = {str(k): acc[k] for k in WINDOWS}
            item["accumulation_status"] = {str(k): window_status.get(k, "sin_dato") for k in WINDOWS}
            item["reconstructed_24h_mm_raw"] = acc[24]
            item["quality"] = quality
        except Exception as exc:
            errors.append({"estacion": station["nombre"], "error": f"{type(exc).__name__}: {exc}"})
            rows.append({
                "Estacion": station["nombre"], "Ubicacion": station["ubicacion"], "1 h mm": "", "6 h mm": "",
                "24 h mm": "", "48 h mm": "", "72 h mm": "", "96 h mm": "", "120 h mm": "", "Mes mm": "", "Año mm": "",
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
    fields = ["Estacion", "Ubicacion", "1 h mm", "6 h mm", "24 h mm", "48 h mm", "72 h mm", "96 h mm", "120 h mm", "Mes mm", "Año mm", "Rango SMN 24h", "Siguiente umbral", "Variables", "Estado", "Corte fuente", "Calidad"]
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
        "note": "Hoy (dailyRain) es acumulado desde medianoche. Las ventanas móviles se reconstruyen con incrementos observados. Si un cruce de medianoche no puede verificarse, la ventana afectada se conserva como mínimo observado (≥ valor), no como exacta ni como s/d. La incertidumbre se propaga coherentemente a 24/48/72/96/120 h mientras ese tramo permanezca dentro de cada ventana.",
    }
    write_json(STATUS_JSON, status)
    print(json.dumps(status, ensure_ascii=False, indent=2))

    if ok == 0:
        raise RuntimeError("No se pudo recuperar ninguna estación WeatherLink.")


if __name__ == "__main__":
    main()
