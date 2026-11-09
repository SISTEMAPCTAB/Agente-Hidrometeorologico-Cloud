#!/usr/bin/env python3
"""Palizada y Candelaria (Campeche) desde el Boletín Hidrométrico diario del OCFS (FUENTE1) al histórico de niveles.

Pedido de Gilberto (6-nov-2026) para el Modelo Hidrológico: la estación Palizada (río Palizada, brazo del Usumacinta hacia la
laguna de Términos; SIH PLZCA) explica las zonas de inundación del Usumacinta del borde oriente del sector Puxcatán-Tulijá-Chilapa
mejor que Gaviotas o Boca del Cerro, y no llegaba por el Agente. El boletín del OCFS trae en la fila "AFC1 Palizada Palizada":
NAMO, día anterior (nivel, gasto), actual (nivel, gasto), lluvia, Tmax, Tmin; y "AFC2 Candelaria Candelaria": NAMO, día anterior,
actual (sólo nivel). Escala tomada por el aforador entre 8:00 y 9:00 a.m. (se registra 08:00).

Reglas (no se inventa nada):
- Sólo se acepta una fila con los DOS pares (anterior y actual): si falta uno, las columnas no se pueden asignar con certeza.
- Cada nivel se valida por separado (Palizada 0-8 m; Candelaria 30-40 m): un valor fuera de rango (p. ej. "502.00") se omite.
- El nivel "actual" va al día del boletín; el "anterior" sólo se escribe si ese día no tiene ya una observación.
- Lee data/latest/FUENTE1.txt y data/archive/*/FUENTE1.txt (relleno de los días anteriores); idempotente.
No toca a las 15 estaciones de Tabasco (ésas vienen de los informes horarios). Las filas nuevas sólo se agregan al histórico.
"""
from __future__ import annotations

import csv
import json
import re
from datetime import date, timedelta
from pathlib import Path

BASE = Path("data/niveles")
HJSON = BASE / "Historico" / "niveles_historicos.json"
HCSV = BASE / "Historico" / "niveles_historicos.csv"
COLS = ["fecha_hora", "rio", "estacion", "nivel", "namo", "name", "fuente", "asunto", "message_id", "hora_fuente",
        "estado_dato", "ultima_actualizacion_real"]
ESTACIONES = {
    # clave del boletín: (estación, río, rango plausible del nivel, trae gasto)
    "AFC1 Palizada Palizada": ("Palizada", "Río Palizada", (0.3, 8.0), True),
    "AFC2 Candelaria Candelaria": ("Candelaria", "Río Candelaria", (30.0, 40.0), False),
}
NUM = re.compile(r"(?<![A-Za-z\d])-?\d+(?:\.\d+)?")


def header(text, key):
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", text, re.M | re.I)
    return m.group(1).strip() if m else ""


def fecha_boletin(text):
    m = re.search(r"(\d{2})-(\d{2})-(20\d{2})", header(text, "ASUNTO"))
    try:
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        meses = {"ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8,
                 "SEPTIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12}
        m = re.search(r"GUTI[ÉE]RREZ\s+A\s+(\d{1,2})\s+DE\s+([A-ZÉ]+)\s+DE\s+(20\d{2})", text.upper())
        if m and m.group(2) in meses:
            return date(int(m.group(3)), meses[m.group(2)], int(m.group(1)))
    except ValueError:
        pass
    return None


def lecturas(text):
    """{estación: {"anterior": nivel|None, "actual": nivel|None}} según cuántos números trae la fila.

    V110p (9-nov-2026): antes sólo se aceptaban filas completas y, peor, una fila con un solo par MÁS lluvia/Tmax/Tmin se leía como
    dos pares (Tmax como "gasto"). El OCFS publica a veces la fila a medias. Por posición, con NAMO al inicio:
      Palizada (nivel y gasto), sin contar NAMO: 7 números = anterior, actual, clima · 4 = anterior, actual · 2 = sólo anterior (fila cortada antes del
      dato del día) · 5 = un par + clima = ACTUAL (el día anterior no se repitió).
      Candelaria (sólo nivel): 5 = anterior, actual, clima · 2 = anterior, actual · 1 = sólo anterior · 4 = un nivel + clima = ACTUAL.
    Comprobado con los boletines 2 a 9-nov-2026: el "anterior" de cada día coincide con el actual (o el par suelto) del día previo
    (Palizada 4.52 el 3 y 4-nov; 4.18 el 6 y 7-nov; 4.06 el 7 y 8-nov; Candelaria 35.95 el 3 y 4-nov; 35.92 el 5 y 6-nov).
    Cada nivel se valida por rango; un gasto debe ser > 20 m³/s."""
    out = {}
    for clave, (est, _rio, (lo, hi), con_gasto) in ESTACIONES.items():
        m = re.search(re.escape(clave) + r"\s+([^A-Za-z\n]*)", text)
        if not m:
            continue
        n = [float(x) for x in NUM.findall(m.group(1))]
        if len(n) < 2:
            continue
        namo, r = n[0], n[1:]
        ok = lambda v: v is not None and lo < v <= hi
        ant = act = None
        if con_gasto:
            par = lambda k: r[k] if len(r) > k + 1 and r[k + 1] > 20 and (ok(r[k]) or r[k] > 100) else None
            if len(r) in (7, 4):  ant, act = par(0), par(2)          # dos pares (+ clima)
            elif len(r) == 5:     act = par(0)                       # un par + clima = actual
            elif len(r) == 2:     ant = par(0)                       # fila cortada: sólo el día anterior
            else:                 continue
        else:
            if len(r) in (5, 2):  ant, act = r[0], r[1]              # dos niveles (+ clima)
            elif len(r) == 4:     act = r[0]                         # un nivel + clima = actual
            elif len(r) == 1:     ant = r[0]                         # fila cortada: sólo el día anterior
            else:                 continue
        ant = ant if ok(ant) else None; act = act if ok(act) else None
        if ant is None and act is None:
            continue
        out[est] = {"namo": namo, "anterior": ant, "actual": act}
    return out


def cargar():
    try:
        x = json.loads(HJSON.read_text(encoding="utf-8"))
        return x if isinstance(x, list) else []
    except Exception:
        return []


def escribir(rows):
    HJSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with HCSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore", quoting=csv.QUOTE_ALL)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c) for c in COLS})


def main():
    hist = cargar()
    if not hist:
        raise SystemExit("Histórico vacío/no disponible; no se integra Palizada/Candelaria.")
    existentes = {(r.get("fecha_hora"), r.get("estacion")) for r in hist if r.get("estado_dato") == "observado"}
    archivos = sorted(Path("data/archive").glob("*/FUENTE1.txt")) + [Path("data/latest/FUENTE1.txt")]
    nuevas = 0
    for fp in archivos:
        try:
            text = fp.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        d = fecha_boletin(text)
        if not d:
            continue
        for est, v in lecturas(text).items():
            _clave, (_e, rio, _r, _g) = next((k, x) for k, x in ESTACIONES.items() if x[0] == est)
            for dia, nivel in ((d, v["actual"]), (d - timedelta(days=1), v["anterior"])):
                if nivel is None:
                    continue
                stamp = f"{dia.isoformat()}T08:00:00-06:00"
                if (stamp, est) in existentes:
                    continue
                hist.append({"_key": f"{stamp}|{est}", "fecha_hora": stamp, "rio": rio, "estacion": est, "nivel": nivel,
                             "namo": v["namo"], "name": None, "fuente": header(text, "ARCHIVO ORIGINAL") or fp.name,
                             "asunto": header(text, "ASUNTO"), "message_id": header(text, "ID MENSAJE"),
                             "hora_fuente": "08:00", "estado_dato": "observado", "ultima_actualizacion_real": stamp})
                existentes.add((stamp, est)); nuevas += 1
    if not nuevas:
        print("Palizada/Candelaria: sin lecturas nuevas.")
        return
    hist.sort(key=lambda r: (str(r.get("fecha_hora") or ""), str(r.get("estacion") or "")))
    escribir(hist)
    print(f"Palizada/Candelaria: {nuevas} lecturas nuevas en el histórico.")


if __name__ == "__main__":
    main()
