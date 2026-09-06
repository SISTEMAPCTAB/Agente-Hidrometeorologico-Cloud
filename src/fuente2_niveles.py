import csv
import json
import math
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SRC = Path("data/latest/FUENTE2.txt")
BASE = Path("data/niveles")
HIST_JSON = BASE / "Historico" / "niveles_historicos.json"
HIST_CSV = BASE / "Historico" / "niveles_historicos.csv"
MX = ZoneInfo("America/Mexico_City")

STATIONS = [
    {"rio": "Río Samaria", "estacion": "Samaria", "namo": 14.90, "name": 18.50, "label": "Samaria", "idx": 6},
    {"rio": "Río Carrizal", "estacion": "González", "namo": 8.77, "name": 10.20, "label": "González", "idx": 6},
    {"rio": "Ríos de la Sierra", "estacion": "Oxolotán", "namo": 39.53, "name": 47.37, "label": "Oxolotán", "idx": 6},
    {"rio": "Ríos de la Sierra", "estacion": "Tapijulapa", "namo": 24.63, "name": 28.15, "label": "Tapijulapa", "idx": 6},
    {"rio": "Ríos de la Sierra", "estacion": "Teapa", "namo": 37.71, "name": 39.56, "label": "Teapa", "idx": 6},
    {"rio": "Ríos de la Sierra", "estacion": "Puyacatengo", "namo": 29.65, "name": 31.35, "label": "Puyacatengo", "idx": 6},
    {"rio": "Ríos de la Sierra", "estacion": "San Joaquín", "namo": 23.12, "name": 26.66, "label": "San Joaquín", "idx": 6},
    {"rio": "Ríos de la Sierra", "estacion": "Pueblo Nuevo", "namo": 7.49, "name": 8.40, "label": "Pueblo Nuevo", "idx": 6},
    {"rio": "Río Grijalva", "estacion": "Gaviotas", "namo": 7.00, "name": 7.85, "label": "Gaviotas", "idx": 4},
    {"rio": "Río Grijalva", "estacion": "El Muelle", "namo": None, "name": 7.23, "label": "Muelle", "idx": 3},
    {"rio": "Río Grijalva", "estacion": "Porvenir", "namo": 4.74, "name": 6.67, "label": "Porvenir", "idx": 5},
    {"rio": "Río Tulijá", "estacion": "Salto de Agua", "namo": 10.99, "name": 14.72, "label": "Salto de Agua", "idx": 6},
    {"rio": "Río Puxcatán", "estacion": "Macuspana", "namo": 9.85, "name": 12.78, "label": "Macuspana", "idx": 6},
    {"rio": "Río San Pedro", "estacion": "San Pedro", "namo": 9.01, "name": 9.77, "label": "San Pedro", "idx": 5},
    {"rio": "Río Usumacinta", "estacion": "Boca del Cerro", "namo": 19.21, "name": 21.57, "label": "Boca del Cerro", "idx": 6},
]


def norm(value):
    return "".join(c for c in unicodedata.normalize("NFD", str(value or "")) if unicodedata.category(c) != "Mn").lower()


def parse_cut(text):
    months = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,"julio":7,"agosto":8,"septiembre":9,"octubre":10,"noviembre":11,"diciembre":12}
    n = norm(text)
    dm = re.search(r"\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:del\s+)?(20\d{2})\b", n)
    hm = re.search(r"\b(\d{1,2}):00\s+horas\b", n)
    if not dm or not hm:
        raise RuntimeError("FUENTE2 no contiene fecha/hora de corte identificable.")
    return datetime(int(dm.group(3)), months[dm.group(2)], int(dm.group(1)), int(hm.group(1)), tzinfo=MX)


def header(text, key):
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", text, re.M | re.I)
    return m.group(1).strip() if m else ""


def numeric_tokens(line):
    return [float(x.replace(",", "")) for x in re.findall(r"(?<!\S)-?\d+(?:,\d{3})*(?:\.\d+)?(?!\S)", line)]


def find_line(text, label):
    target = norm(label).strip()
    for raw in text.splitlines():
        candidate = re.sub(r"^[\s*•-]+", "", norm(raw)).strip()
        if candidate.startswith(target):
            return raw
    return None


def extract_values(text):
    values = {}
    diagnostics = {}
    for st in STATIONS:
        line = find_line(text, st["label"])
        nums = numeric_tokens(line or "")
        value = nums[st["idx"]] if len(nums) > st["idx"] else None
        if value is not None and (not math.isfinite(value) or value < -5 or value > 60):
            value = None
        values[st["estacion"]] = value
        diagnostics[st["estacion"]] = {"line": line, "numeric_count": len(nums), "value": value}
    return values, diagnostics


def load_history():
    if not HIST_JSON.exists():
        return []
    return json.loads(HIST_JSON.read_text(encoding="utf-8"))


def parse_dt(value):
    try:
        return datetime.fromisoformat(value).astimezone(MX)
    except Exception:
        return None


def last_real(history, station, cutoff):
    rows = []
    for r in history:
        if r.get("estacion") != station or r.get("estado_dato") != "observado":
            continue
        try:
            level = float(r.get("nivel"))
        except Exception:
            continue
        t = parse_dt(r.get("fecha_hora"))
        if t and t < cutoff and math.isfinite(level):
            rows.append((t, r))
    rows.sort(key=lambda x: x[0])
    return rows[-1][1] if rows else None


def save_history(history):
    HIST_JSON.parent.mkdir(parents=True, exist_ok=True)
    history.sort(key=lambda r: parse_dt(r.get("fecha_hora")) or datetime.min.replace(tzinfo=MX))
    HIST_JSON.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fields = ["fecha_hora","rio","estacion","nivel","namo","name","fuente","asunto","message_id","hora_fuente","estado_dato","ultima_actualizacion_real"]
    with HIST_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(history)


def main():
    if not SRC.exists():
        print("FUENTE2 no disponible; se conserva el histórico existente.")
        return
    text = SRC.read_text(encoding="utf-8-sig")
    cut = parse_cut(text)
    stamp = cut.isoformat()
    subject = header(text, "ASUNTO")
    message_id = header(text, "ID MENSAJE") or "sin-id"
    values, diagnostics = extract_values(text)
    history = load_history()

    existing_times = [parse_dt(r.get("fecha_hora")) for r in history]
    latest = max((t for t in existing_times if t), default=None)
    if latest and cut < latest:
        print(f"FUENTE2 {stamp} es anterior al histórico vigente {latest.isoformat()}; no se retrocede el corte.")
        return

    added = observed_added = inherited_added = 0
    for st in STATIONS:
        key = f"{stamp}|{st['estacion']}|FUENTE2-{message_id}"
        if any(r.get("_key") == key for r in history):
            continue
        observed = values.get(st["estacion"])
        prev = last_real(history, st["estacion"], cut)
        if observed is not None:
            level, state, last_real_time = observed, "observado", stamp
            observed_added += 1
        elif prev:
            level, state, last_real_time = prev.get("nivel"), "heredado", prev.get("fecha_hora")
            inherited_added += 1
        else:
            level, state, last_real_time = None, "sin_dato", None
        history.append({
            "_key": key, "fecha_hora": stamp, "rio": st["rio"], "estacion": st["estacion"], "nivel": level,
            "namo": st["namo"], "name": st["name"], "fuente": "data/latest/FUENTE2.txt", "asunto": subject,
            "message_id": f"FUENTE2-{message_id}", "hora_fuente": cut.strftime("%H:%M"), "estado_dato": state,
            "ultima_actualizacion_real": last_real_time,
        })
        added += 1

    save_history(history)
    evidence = BASE / "Evidencia_Texto"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / f"FUENTE2_{cut.strftime('%Y-%m-%d_%H%M')}_{message_id}_diagnostico.json").write_text(
        json.dumps({"cut": stamp, "subject": subject, "message_id": message_id, "diagnostics": diagnostics}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"source":"FUENTE2","cut":stamp,"added":added,"observed":observed_added,"inherited":inherited_added}, ensure_ascii=False))


if __name__ == "__main__":
    main()
