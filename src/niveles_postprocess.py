import csv
import json
import math
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

BASE = Path("data/niveles")
HIST_JSON = BASE / "Historico" / "niveles_historicos.json"
CUT_JSON = BASE / "Ultimo_Corte" / "ultimo_resumen.json"
CUT_CSV = BASE / "Ultimo_Corte" / "ultimo_resumen.csv"
GRAPH_DIR = BASE / "Graficas"
MX = ZoneInfo("America/Mexico_City")

PRIORITY = [
    "Samaria", "González", "Oxolotán", "Tapijulapa", "Teapa", "Puyacatengo",
    "San Joaquín", "Pueblo Nuevo", "Gaviotas", "El Muelle", "Porvenir",
    "Salto de Agua", "Macuspana", "San Pedro", "Boca del Cerro",
]


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def dt(value):
    if not value:
        return None
    return datetime.fromisoformat(value).astimezone(MX)


def clean_name(value):
    value = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_")
    return value or "sin_nombre"


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def observed(rows):
    return [r for r in rows if finite(r.get("nivel")) and r.get("estado_dato") == "observado"]


def cycle_start_for(cutoff):
    start = cutoff.replace(hour=6, minute=0, second=0, microsecond=0)
    if cutoff < start:
        start -= timedelta(days=1)
    return start


def row_at_exact(rows, target, observed_only=False):
    candidates = []
    for r in rows:
        t = dt(r.get("fecha_hora"))
        if not t or t != target or not finite(r.get("nivel")):
            continue
        if observed_only and r.get("estado_dato") != "observado":
            continue
        candidates.append(r)
    return candidates[-1] if candidates else None


def last_at_or_before(rows, target, observed_only=False):
    candidates = []
    for r in rows:
        t = dt(r.get("fecha_hora"))
        if not t or t > target or not finite(r.get("nivel")):
            continue
        if observed_only and r.get("estado_dato") != "observado":
            continue
        candidates.append((t, r))
    candidates.sort(key=lambda x: x[0])
    return candidates[-1][1] if candidates else None


def previous_report(rows, cutoff):
    candidates = []
    for r in rows:
        t = dt(r.get("fecha_hora"))
        if t and t < cutoff and finite(r.get("nivel")):
            candidates.append((t, r))
    candidates.sort(key=lambda x: x[0])
    return candidates[-1][1] if candidates else None


def delta_window(rows, cutoff, hours):
    real = [(dt(r.get("fecha_hora")), r) for r in observed(rows)]
    real = [(t, r) for t, r in real if t and t <= cutoff]
    real.sort(key=lambda x: x[0])
    if not real:
        return None
    current = real[-1][1]
    anchor_target = dt(current.get("fecha_hora")) - timedelta(hours=hours)
    anchor = last_at_or_before([r for _, r in real], anchor_target, observed_only=True)
    return current["nivel"] - anchor["nivel"] if anchor else None


def trend_label(rows, cutoff):
    real = [(dt(r.get("fecha_hora")), r) for r in observed(rows)]
    real = [r for t, r in real if t and t <= cutoff]
    if len(real) < 2:
        return "Sin tendencia suficiente", None
    d = real[-1]["nivel"] - real[-2]["nivel"]
    eps = 0.01
    if abs(d) <= eps:
        return "Estable", d
    if d > 0:
        if len(real) >= 3:
            p = real[-2]["nivel"] - real[-3]["nivel"]
            if p > eps and d > p * 1.5:
                return "Ascenso acelerado", d
            if p < -eps:
                return "Cambio a ascenso", d
        return "Ascenso", d
    if len(real) >= 3:
        p = real[-2]["nivel"] - real[-3]["nivel"]
        if p < -eps and abs(d) > abs(p) * 1.5:
            return "Descenso acelerado", d
        if p > eps:
            return "Cambio a descenso", d
    return "Descenso", d


def latest_cutoff(history):
    times = [dt(r.get("fecha_hora")) for r in history if dt(r.get("fecha_hora"))]
    if not times:
        raise RuntimeError("El histórico de niveles no contiene fechas válidas.")
    return max(times)


def station_meta(rows):
    last = rows[-1]
    return {
        "rio": last.get("rio"),
        "estacion": last.get("estacion"),
        "namo": last.get("namo"),
        "name": last.get("name"),
    }


def cycle_series(rows, start, cutoff):
    out = []
    for r in rows:
        t = dt(r.get("fecha_hora"))
        if t and start <= t <= cutoff and finite(r.get("nivel")):
            out.append(r)
    out.sort(key=lambda r: dt(r["fecha_hora"]))
    return out


def format_delta(value):
    return "s/d" if value is None else f"{value:+.2f} m"


def reference_ylim(values, namo=None, name=None):
    vals = [float(v) for v in values if finite(v)]
    if finite(namo):
        vals.append(float(namo))
    if finite(name):
        vals.append(float(name))
    if not vals:
        return None
    lo, hi = min(vals), max(vals)
    span = hi - lo
    if span < 0.20:
        span = 0.20
    pad = max(0.08, span * 0.06)
    return lo - pad, hi + pad


def plot_station(meta, series, base, summary_row, cutoff):
    if not series:
        return None
    out_dir = GRAPH_DIR / "Estaciones" / clean_name(meta["estacion"])
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "ciclo_actual.png"

    start = cycle_start_for(cutoff)
    x = [dt(r["fecha_hora"]) for r in series]
    y = [r["nivel"] for r in series]
    fig, ax = plt.subplots(figsize=(12, 6.4), dpi=140)
    ax.plot(x, y, marker="o", linewidth=2.4, markersize=5.5, label="Nivel observado del ciclo")

    for i, (xx, yy, rr) in enumerate(zip(x, y, series)):
        ax.annotate(
            f"{yy:.2f} m",
            (xx, yy),
            xytext=(0, 9 if i % 2 == 0 else -15),
            textcoords="offset points",
            ha="center",
            va="bottom" if i % 2 == 0 else "top",
            fontsize=8,
            fontweight="bold",
        )

    inherited_x = [dt(r["fecha_hora"]) for r in series if r.get("estado_dato") == "heredado"]
    inherited_y = [r["nivel"] for r in series if r.get("estado_dato") == "heredado"]
    if inherited_x:
        ax.scatter(inherited_x, inherited_y, facecolors="none", edgecolors="black", s=70, linewidths=1.5, label="Dato heredado")

    limits = reference_ylim(y, meta.get("namo"), meta.get("name"))
    if limits:
        ax.set_ylim(*limits)

    ref_text = []
    if finite(meta.get("namo")):
        ref_text.append(f"NAMO {meta['namo']:.2f} m")
        ax.axhline(meta["namo"], linestyle="--", linewidth=2.2, label=f"NAMO {meta['namo']:.2f} m")
        ax.text(
            0.01, meta["namo"], f"NAMO {meta['namo']:.2f} m",
            transform=ax.get_yaxis_transform(), ha="left", va="bottom",
            fontsize=8, fontweight="bold"
        )
    if finite(meta.get("name")):
        ref_text.append(f"NAME {meta['name']:.2f} m")
        ax.axhline(meta["name"], linestyle=":", linewidth=1.8, label=f"NAME {meta['name']:.2f} m")
        ax.text(
            0.01, meta["name"], f"NAME {meta['name']:.2f} m",
            transform=ax.get_yaxis_transform(), ha="left", va="bottom",
            fontsize=8
        )

    base_time = dt(base.get("fecha_hora")) if base else None
    if base and finite(base.get("nivel")) and base_time and start <= base_time <= cutoff:
        ax.scatter([base_time], [base["nivel"]], marker="s", s=90, zorder=5, label=f"Base 06:00 {base['nivel']:.2f} m")

    current_level = summary_row.get("ultimo_nivel")
    refs = " · ".join(ref_text) if ref_text else "Referencias altas s/d"
    ax.set_title(
        f"{meta['rio']} — {meta['estacion']}\n"
        f"{cutoff.strftime('%d/%m/%Y')} · ciclo 06:00 → {cutoff.strftime('%H:%M')} | "
        f"actual {current_level:.2f} m | Δ base {format_delta(summary_row['delta_vs_06'])} | "
        f"Δ anterior {format_delta(summary_row['delta_reporte'])}\n{refs}"
    )
    ax.set_ylabel("Nivel observado (m)")
    ax.grid(True, alpha=0.28)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M", tz=MX))
    ax.yaxis.set_major_formatter(plt.FormatStrFormatter("%.2f"))
    fig.autofmt_xdate(rotation=0)
    ax.legend(loc="best", fontsize=8)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    return str(out)


def plot_system(rio, station_series, cutoff, start):
    if not station_series:
        return None
    out_dir = GRAPH_DIR / "Sistemas"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{clean_name(rio)}.png"
    fig, ax = plt.subplots(figsize=(12, 6.5), dpi=140)
    plotted = 0
    for station, series in station_series.items():
        if not series:
            continue
        x = [dt(r["fecha_hora"]) for r in series]
        y = [r["nivel"] for r in series]
        ax.plot(x, y, marker="o", linewidth=1.8, label=station)
        plotted += 1
    if not plotted:
        plt.close(fig)
        return None
    ax.set_title(f"{rio} — evolución del ciclo operativo {start.strftime('%d/%m %H:%M')} a {cutoff.strftime('%d/%m %H:%M')}")
    ax.set_ylabel("Nivel (m)")
    ax.grid(True, alpha=0.25)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M", tz=MX))
    ax.legend(loc="best", fontsize=8)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    return str(out)


def plot_dashboard(summary, by_station, start, cutoff):
    rows = [r for r in summary if r["estacion"] in PRIORITY]
    if not rows:
        return None
    GRAPH_DIR.mkdir(parents=True, exist_ok=True)
    out = GRAPH_DIR / "tablero_operativo.png"
    cols = 3
    n = len(rows)
    nrows = math.ceil(n / cols)
    fig, axes = plt.subplots(nrows, cols, figsize=(15, 3.4 * nrows), dpi=130)
    axes = axes.flatten() if hasattr(axes, "flatten") else [axes]
    for ax, row in zip(axes, rows):
        series = cycle_series(by_station[row["estacion"]], start, cutoff)
        meta = station_meta(by_station[row["estacion"]])
        if series:
            x = [dt(r["fecha_hora"]) for r in series]
            y = [r["nivel"] for r in series]
            ax.plot(x, y, marker="o", linewidth=1.6)
            limits = reference_ylim(y, meta.get("namo"), None)
            if limits:
                ax.set_ylim(*limits)
            if finite(meta.get("namo")):
                ax.axhline(meta["namo"], linestyle="--", linewidth=1.2)
                ax.text(0.01, meta["namo"], f"NAMO {meta['namo']:.2f}", transform=ax.get_yaxis_transform(), fontsize=6, va="bottom")
            ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M", tz=MX))
        ax.set_title(
            f"{row['estacion']} | {row['ultimo_nivel']:.2f} m\n"
            f"Δ06 {format_delta(row['delta_vs_06'])} | Δant {format_delta(row['delta_reporte'])} | {row['estado_dato']}"
        )
        ax.grid(True, alpha=0.2)
        ax.tick_params(axis="x", labelsize=7)
        ax.tick_params(axis="y", labelsize=7)
    for ax in axes[n:]:
        ax.axis("off")
    fig.suptitle(
        f"Tablero operativo de niveles — ciclo {start.strftime('%d/%m %H:%M')} a {cutoff.strftime('%d/%m %H:%M')}",
        fontsize=16,
        y=0.995,
    )
    fig.tight_layout(rect=[0, 0, 1, 0.985])
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    return str(out)


def write_csv(rows):
    fields = [
        "rio", "estacion", "ultimo_nivel", "nivel_base_06", "estado_base_06", "fecha_hora_base_ciclo",
        "delta_vs_06", "delta_reporte", "tendencia", "delta_24h", "delta_48h", "delta_72h",
        "distancia_namo", "distancia_name", "fecha_hora", "estado_dato", "ultima_actualizacion_real",
        "ciclo_operativo", "grafica_png",
    ]
    CUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with CUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)


def main():
    history = load_json(HIST_JSON, [])
    if not history:
        raise RuntimeError("No existe histórico de niveles para postprocesar.")

    by_station = defaultdict(list)
    for r in history:
        if r.get("estacion"):
            by_station[r["estacion"]].append(r)
    for rows in by_station.values():
        rows.sort(key=lambda r: dt(r["fecha_hora"]) if dt(r.get("fecha_hora")) else datetime.min.replace(tzinfo=MX))

    cutoff = latest_cutoff(history)
    start = cycle_start_for(cutoff)
    summary = []
    systems = defaultdict(dict)

    for station in PRIORITY:
        rows = by_station.get(station, [])
        if not rows:
            continue
        current = last_at_or_before(rows, cutoff, observed_only=False)
        if not current:
            continue

        exact_06 = row_at_exact(rows, start, observed_only=True)
        if exact_06:
            base = exact_06
            base_state = "observado"
        else:
            base = last_at_or_before(rows, start, observed_only=True)
            base_state = "base_heredada" if base else "sin_dato"

        prev = previous_report(rows, cutoff)
        tr_label, tr_delta = trend_label(rows, cutoff)
        delta_prev = current["nivel"] - prev["nivel"] if prev and finite(current.get("nivel")) and finite(prev.get("nivel")) else None
        delta_06 = current["nivel"] - base["nivel"] if base and finite(current.get("nivel")) and finite(base.get("nivel")) else None
        meta = station_meta(rows)
        series = cycle_series(rows, start, cutoff)

        row = {
            "rio": meta["rio"],
            "estacion": station,
            "ultimo_nivel": current.get("nivel"),
            "nivel_base_06": base.get("nivel") if base else None,
            "estado_base_06": base_state,
            "fecha_hora_base_ciclo": base.get("fecha_hora") if base else None,
            "delta_vs_06": delta_06,
            "delta_reporte": delta_prev,
            "tendencia": tr_label,
            "delta_24h": delta_window(rows, cutoff, 24),
            "delta_48h": delta_window(rows, cutoff, 48),
            "delta_72h": delta_window(rows, cutoff, 72),
            "distancia_namo": current["nivel"] - meta["namo"] if finite(current.get("nivel")) and finite(meta.get("namo")) else None,
            "distancia_name": current["nivel"] - meta["name"] if finite(current.get("nivel")) and finite(meta.get("name")) else None,
            "fecha_hora": current.get("fecha_hora"),
            "estado_dato": current.get("estado_dato", "sin_dato"),
            "ultima_actualizacion_real": current.get("ultima_actualizacion_real"),
            "ciclo_operativo": f"{start.isoformat()} -> {(start + timedelta(days=1)).isoformat()}",
            "grafica_png": None,
        }
        row["grafica_png"] = plot_station(meta, series, base, row, cutoff)
        summary.append(row)
        systems[meta["rio"]][station] = series

    summary.sort(key=lambda r: PRIORITY.index(r["estacion"]) if r["estacion"] in PRIORITY else 999)
    CUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    CUT_JSON.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(summary)

    system_graphs = {}
    for rio, station_series in systems.items():
        system_graphs[rio] = plot_system(rio, station_series, cutoff, start)
    dashboard = plot_dashboard(summary, by_station, start, cutoff)

    index = {
        "ciclo_inicio": start.isoformat(),
        "ciclo_fin": (start + timedelta(days=1)).isoformat(),
        "corte_actual": cutoff.isoformat(),
        "estaciones": len(summary),
        "graficas_individuales": {r["estacion"]: r["grafica_png"] for r in summary},
        "graficas_sistema": system_graphs,
        "tablero": dashboard,
        "regla_base": "Se usa lectura observada exacta de 06:00; si falta, último valor observado válido disponible al inicio del ciclo y se marca base_heredada. Una base heredada anterior al inicio del ciclo no se dibuja en la gráfica del día actual.",
        "regla_escala": "Todas las gráficas individuales incluyen el NAMO dentro de la escala vertical y lo trazan como línea de referencia. NAME también se traza cuando está disponible. Cada observación conserva su etiqueta en metros y los puntos se unen cronológicamente.",
    }
    (BASE / "Ultimo_Corte" / "indice_graficas.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(index, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
