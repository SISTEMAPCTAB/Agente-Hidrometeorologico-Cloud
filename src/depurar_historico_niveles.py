"""Depura lecturas espurias del histórico horario de niveles.

Se ejecuta después de incorporar cualquier informe (principal, respaldo Gmail,
watchdog o recuperación) y antes de calcular resúmenes, deltas y gráficas.

Una lectura "observado" se considera espuria cuando:
  1. Es cero (o casi cero) y la estación tenía nivel real antes: ninguna de las
     estaciones de la red llega a 0 m; un 0 es una celda vacía o "N/A".
  2. Es un pico aislado: difiere ≥ 1.0 m de la lectura observada anterior y de
     la siguiente (ambas a ≤ 14 h), en el mismo sentido, mientras esas dos
     vecinas coinciden entre sí (diferencia ≤ 40 % del salto menor).
     Ej.: Macuspana 6.14 → 0.14 → 6.16; Puyacatengo 24.97 → 20.96 → 24.95.
  3. Es la lectura más reciente y cae por debajo del 25 % del nivel anterior
     (≤ 6 h antes, nivel > 1 m): pérdida de dígito, físicamente imposible.

La lectura espuria pasa a "heredado" con el último nivel observado válido, igual
que una hora sin dato; las horas heredadas que dependían de ella se recalculan.
Cada cambio queda registrado en data/niveles/Auditoria/depuracion_historico.json.
Es idempotente: si no hay nada que corregir no reescribe los archivos.
"""

import csv
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = Path("data/niveles")
HIST_JSON = BASE / "Historico" / "niveles_historicos.json"
HIST_CSV = BASE / "Historico" / "niveles_historicos.csv"
LOG = BASE / "Auditoria" / "depuracion_historico.json"
MX = ZoneInfo("America/Mexico_City")
CSV_FIELDS = ["fecha_hora", "rio", "estacion", "nivel", "namo", "name", "fuente", "asunto",
              "message_id", "hora_fuente", "estado_dato", "ultima_actualizacion_real"]

ZERO_EPS = 0.05
SPIKE_MIN = 1.0
SPIKE_WINDOW = timedelta(hours=14)
NEIGHBOR_AGREE = 0.40
COLLAPSE_RATIO = 0.25
COLLAPSE_WINDOW = timedelta(hours=6)


def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def parse_dt(v):
    try:
        d = datetime.fromisoformat(str(v))
        return (d if d.tzinfo else d.replace(tzinfo=MX)).astimezone(MX)
    except Exception:
        return None


def is_zero(v):
    return abs(v) < ZERO_EPS


def detect(obs):
    """obs: lista ordenada de (t, nivel, row) observados de una estación."""
    bad = {}
    # 1. Ceros con nivel real previo.
    for i, (t, v, r) in enumerate(obs):
        if is_zero(v):
            prev = [p for p in obs[:i] if not is_zero(p[1])]
            if prev and prev[-1][1] > 0.25:
                bad[id(r)] = "cero_espurio"
    clean = [o for o in obs if id(o[2]) not in bad]
    # 2. Picos aislados.
    for i in range(1, len(clean) - 1):
        (tp, vp, _), (t, v, r), (tn, vn, _) = clean[i - 1], clean[i], clean[i + 1]
        if t - tp > SPIKE_WINDOW or tn - t > SPIKE_WINDOW:
            continue
        dp, dn = v - vp, v - vn
        if abs(dp) >= SPIKE_MIN and abs(dn) >= SPIKE_MIN and dp * dn > 0:
            if abs(vp - vn) <= NEIGHBOR_AGREE * min(abs(dp), abs(dn)):
                bad[id(r)] = "pico_aislado"
    # 3. Colapso en la lectura más reciente (aún no hay vecina posterior).
    clean = [o for o in obs if id(o[2]) not in bad]
    if len(clean) >= 2:
        (tp, vp, _), (t, v, r) = clean[-2], clean[-1]
        if vp > 1.0 and t - tp <= COLLAPSE_WINDOW and v < COLLAPSE_RATIO * vp:
            bad[id(r)] = "colapso_ultima_lectura"
    return bad


def main():
    if not HIST_JSON.exists():
        print("Sin histórico de niveles; nada que depurar.")
        return
    history = json.loads(HIST_JSON.read_text(encoding="utf-8"))
    by_station = {}
    for r in history:
        t = parse_dt(r.get("fecha_hora"))
        if t is not None:
            by_station.setdefault(r.get("estacion"), []).append((t, r))

    changes = []
    for station, rows in by_station.items():
        rows.sort(key=lambda x: x[0])
        obs = [(t, float(r["nivel"]), r) for t, r in rows
               if r.get("estado_dato") == "observado" and finite(r.get("nivel"))]
        bad = detect(obs)
        if not bad:
            continue
        # Recalcula en orden: las espurias y solo las heredadas que copiaban una
        # espuria toman el último observado válido; las demás no se tocan.
        bad_times = {r.get("fecha_hora") for _, _, r in obs if id(r) in bad}
        last_good = None
        for t, r in rows:
            if r.get("estado_dato") == "observado" and finite(r.get("nivel")) and id(r) not in bad:
                last_good = r
                continue
            spurious = id(r) in bad
            depends = (r.get("estado_dato") == "heredado"
                       and r.get("ultima_actualizacion_real") in bad_times)
            if not (spurious or depends):
                continue
            if last_good is not None:
                new_level, new_state, new_real = last_good["nivel"], "heredado", last_good["fecha_hora"]
            else:
                new_level, new_state, new_real = None, "sin_dato", None
            if spurious or r.get("nivel") != new_level or r.get("ultima_actualizacion_real") != new_real:
                changes.append({
                    "fecha_hora": r.get("fecha_hora"), "estacion": station,
                    "motivo": bad.get(id(r), "heredado_recalculado"),
                    "antes": {"nivel": r.get("nivel"), "estado_dato": r.get("estado_dato")},
                    "despues": {"nivel": new_level, "estado_dato": new_state},
                    "message_id": r.get("message_id"),
                })
                r["nivel"], r["estado_dato"], r["ultima_actualizacion_real"] = new_level, new_state, new_real

    if not changes:
        print("Histórico de niveles sin lecturas espurias.")
        return

    HIST_JSON.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with HIST_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore", quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(history)

    LOG.parent.mkdir(parents=True, exist_ok=True)
    try:
        log = json.loads(LOG.read_text(encoding="utf-8"))
    except Exception:
        log = []
    stamp = datetime.now(MX).isoformat(timespec="seconds")
    log.extend({"depurado": stamp, **c} for c in changes)
    LOG.write_text(json.dumps(log[-2000:], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for c in changes:
        print(f"{c['estacion']:<15} {c['fecha_hora']}  {c['antes']['nivel']} -> {c['despues']['nivel']}  ({c['motivo']})")


if __name__ == "__main__":
    main()
