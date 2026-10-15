from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

OUT = Path("data/fuentes_publicas/insivumeh_automaticas.json")
URL = "https://www.insivumeh.gob.gt/img/estaciones_automaticas_met/"
DASHBOARD_BASE = "https://insivumeh.gob.gt/img/Estaciones_Met/output_dashboard"
SEASON_URL = "https://insivumeh.gob.gt/img/MAPAS_24H/Sin_Lluvia/Resumen_Departamentos.html"
CHRONO_URL = "https://insivumeh.gob.gt/img/MAPAS_24H/Sin_Lluvia/Resumen_Cronologico_Grupo.html"
UA = {"User-Agent": "Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0"}

ALTO_USUMACINTA = {
    "El Tigre": "INS171302AT",
    "El Porvenir": "INS171001AT",
    "Bethel": "INS171301AT",
    "Machaquilá": "INS171201AT",
    "Mactún": "INS170401AT",
    "Chixoy Hidro": "INS161301AT",
    "Playa Grande Met (Ixcan)": "INS142201AT",
    "Santa María Cahabón": "INS161201CV",
    "Panzos PHC Altaverapaz": "INS160701CV",
}


def response_text_utf8(r: requests.Response) -> str:
    try:
        return r.content.decode("utf-8")
    except UnicodeDecodeError:
        return r.text


def clean_html(s: str) -> str:
    s = s.replace("\\u00b0", "°").replace("\\u00f3", "ó").replace("\\u00ed", "í")
    s = re.sub(r"<br\s*/?>", " | ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("&nbsp;", " ").replace("&deg;", "°")
    return re.sub(r"\s+", " ", s).strip()


def number(pattern: str, text: str):
    m = re.search(pattern, text, re.I)
    if not m:
        return None
    try:
        value = float(m.group(1))
        return value if value == value else None
    except Exception:
        return None


def season_rows(html: str):
    text = clean_html(html)
    period = re.search(r"[ÉE]poca\s+lluviosa\s*:\s*(\d{2}/\d{2}/\d{4})\s+al\s+(\d{2}/\d{2}/\d{4})", text, re.I)
    rows = []
    pat = re.compile(r"([^|]{2,100}?)\s+((?:INS|ICC)\d{6}[A-Z]{2})\s+[^0-9]{0,30}(\d+(?:\.\d+)?)\s*mm\s+acumulados", re.I)
    for m in pat.finditer(text):
        name = re.sub(r"\s+", " ", m.group(1)).strip(" |-:")
        name = re.split(r"(?:Alta Verapaz|Baja Verapaz|Pet[eé]n|Quich[eé]|Huehuetenango|Izabal)\s+", name, flags=re.I)[-1].strip()
        rows.append({"estacion": name, "codigo": m.group(2).upper(), "acumulado_epoca_lluviosa_mm": float(m.group(3))})
    unique = {}
    for row in rows:
        unique[row["codigo"]] = row
    return list(unique.values()), ({"inicio": period.group(1), "fin": period.group(2)} if period else None)


def monthly_rows_from_chrono(html: str):
    """Extrae solo el acumulado explícito mostrado por INSIVUMEH en Progreso Diario.
    No deriva 24 h ni convierte faltantes en cero.
    """
    text = clean_html(html)
    rows = []
    for name, code in ALTO_USUMACINTA.items():
        m = re.search(re.escape(name) + r"\s+(?:🌧️\s*)?(\d+(?:\.\d+)?)\s*mm\s+acumulados", text, re.I)
        if not m and name == "Playa Grande Met (Ixcan)":
            m = re.search(r"Playa\s+Grande\s+Met\s*\(Ixc[aá]n\)\s+(?:🌧️\s*)?(\d+(?:\.\d+)?)\s*mm\s+acumulados", text, re.I)
        if m:
            rows.append({"estacion": name, "codigo": code, "acumulado_mensual_mm": float(m.group(1)), "estado_dato": "observado_preliminar", "url_producto": CHRONO_URL})
    return rows


def dashboard_row(name: str, code: str):
    url = f"{DASHBOARD_BASE}/{code}.html"
    r = requests.get(url, headers=UA, timeout=25)
    r.raise_for_status()
    text = clean_html(response_text_utf8(r))
    rain24 = number(r"Precipitaci[oó]n\s*24\s*hrs?\s*(-?\d+(?:\.\d+)?)\s*mm", text)
    tmin = number(r"Temperatura\s*M[ií]nima\s*(-?\d+(?:\.\d+)?)\s*°?\s*C", text)
    tmean = number(r"Temperatura\s*Media\s*(-?\d+(?:\.\d+)?)\s*°?\s*C", text)
    tmax = number(r"Temperatura\s*M[aá]xima\s*(-?\d+(?:\.\d+)?)\s*°?\s*C", text)
    hum = number(r"Humedad\s*Relativa\s*(-?\d+(?:\.\d+)?)\s*%", text)
    if rain24 is None and tmin is None and tmean is None and tmax is None and hum is None:
        return None
    return {"estacion": name, "codigo": code, "precipitacion_24h_mm": rain24, "temperatura_min_c": tmin, "temperatura_media_c": tmean, "temperatura_max_c": tmax, "humedad_relativa_pct": hum, "estado_dato": "observado_preliminar", "url_tablero": url}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    result = {"fuente": "INSIVUMEH", "producto": "Estaciones meteorologicas automaticas y acumulados oficiales", "url": URL, "consultado_utc": now, "independiente_weatherlink": True, "estado": "sin_validar", "estaciones": [], "acumulados_mes_actual": [], "acumulados_epoca_lluviosa": [], "nota": "Datos oficiales/preliminares según producto. No se sustituyen s/d por cero y no se estiman valores desde colores del mapa."}
    try:
        r = requests.get(URL, headers=UA, timeout=35)
        r.raise_for_status()
        raw = response_text_utf8(r)
        result["http_status"] = r.status_code
        result["bytes"] = len(r.content)
        h = re.search(r"INFORMACI[ÓO]N\s+PRELIMINAR.*?[–-]\s*(\d{1,2}/[A-Za-z]{3}/\d{4}\s+\d{1,2}:\d{2})", clean_html(raw), re.I)
        result["corte_fuente"] = h.group(1) if h else None
        try:  # diagnóstico compacto de la estructura actual (la página pesa ~2 MB)
            diag = [f"bytes={len(raw)} corte={result['corte_fuente']}"]
            for pat in (r"var html_[0-9a-f]+", r"setContent", r"bindPopup|bindTooltip|L\.popup", r"mm/h|mm\b", r"Estaci[oó]n"):
                ms = list(re.finditer(pat, raw, re.I))
                diag.append(f"\n=== {pat}: {len(ms)} coincidencias ===")
                for m in ms[:4]:
                    a, b = max(0, m.start() - 250), min(len(raw), m.end() + 450)
                    diag.append(raw[a:b].replace("\n", " ")[:700])
            Path("data/fuentes_publicas/diagnostico_insivumeh_mapa.txt").write_text("\n".join(diag)[:45000], encoding="utf-8")
        except Exception:
            pass
        candidates = re.findall(r"(?:html_|popup_|tooltip_)[A-Za-z0-9_]+\s*=\s*\$\(`(.*?)`\)", raw, re.S)
        if not candidates:
            candidates = re.findall(r"<div[^>]*>(.*?)</div>", raw, re.S | re.I)
        seen = set()
        for block in candidates:
            text = clean_html(block)
            if len(text) < 8 or not re.search(r"lluv|precip|temperat|humedad|estaci[oó]n", text, re.I):
                continue
            nm = re.search(r"(?:Estaci[oó]n|Nombre)\s*[:|-]\s*([^|]{2,80})", text, re.I)
            if not nm:
                nm2 = re.search(r"<b[^>]*>([^<]{2,80})</b>", block, re.I)
                name = clean_html(nm2.group(1)) if nm2 else None
            else:
                name = nm.group(1).strip()
            if not name or name.casefold() in seen:
                continue
            seen.add(name.casefold())
            lluvia_1h = number(r"(?:lluvia|precipitaci[oó]n)[^0-9-]{0,40}(-?\d+(?:\.\d+)?)\s*mm", text)
            temp = number(r"temperatura[^0-9-]{0,30}(-?\d+(?:\.\d+)?)\s*°?\s*C", text)
            hum = number(r"humedad[^0-9-]{0,30}(-?\d+(?:\.\d+)?)\s*%", text)
            if lluvia_1h is None and temp is None and hum is None:
                continue
            result["estaciones"].append({"estacion": name, "precipitacion_ultima_hora_mm": lluvia_1h, "temperatura_c": temp, "humedad_relativa_pct": hum, "estado_dato": "observado_preliminar", "texto_fuente": text[:500]})
        result["estado_mapa_automatico"] = "ok" if result["estaciones"] else "fuente_consultada_sin_dato_estructurado_extraible"
    except Exception as e:
        result["estado_mapa_automatico"] = "error_consulta"
        result["error_mapa_automatico"] = str(e)

    dashboard_ok = 0
    dashboard_errors = {}
    by_code = {str(x.get("codigo", "")).upper(): x for x in result["estaciones"] if x.get("codigo")}
    for name, code in ALTO_USUMACINTA.items():
        try:
            row = dashboard_row(name, code)
            if not row:
                continue
            dashboard_ok += 1
            existing = by_code.get(code)
            if existing:
                existing.update({k: v for k, v in row.items() if v is not None})
            else:
                result["estaciones"].append(row)
                by_code[code] = row
        except Exception as e:
            dashboard_errors[code] = str(e)
    result["tableros_alto_usumacinta_consultados"] = len(ALTO_USUMACINTA)
    result["tableros_alto_usumacinta_con_dato"] = dashboard_ok
    if dashboard_errors:
        result["errores_tableros_alto_usumacinta"] = dashboard_errors

    try:
        c = requests.get(CHRONO_URL, headers=UA, timeout=35)
        c.raise_for_status()
        monthly = monthly_rows_from_chrono(response_text_utf8(c))
        result["acumulados_mes_actual"] = monthly
        result["url_progreso_diario"] = CHRONO_URL
        result["estado_mes_actual"] = "ok" if monthly else "sin_dato_estructurado_extraible"
    except Exception as e:
        result["estado_mes_actual"] = "error_consulta"
        result["error_mes_actual"] = str(e)

    result["total_estaciones_extraidas"] = len(result["estaciones"])
    result["estado"] = "ok" if (result["estaciones"] or result["acumulados_mes_actual"]) else "fuente_consultada_sin_dato_estructurado_extraible"

    try:
        s = requests.get(SEASON_URL, headers=UA, timeout=35)
        s.raise_for_status()
        rows, period = season_rows(response_text_utf8(s))
        result["acumulados_epoca_lluviosa"] = rows
        result["periodo_epoca_lluviosa"] = period
        result["url_epoca_lluviosa"] = SEASON_URL
        result["estado_epoca_lluviosa"] = "ok" if rows else "sin_dato_estructurado_extraible"
    except Exception as e:
        result["estado_epoca_lluviosa"] = "error_consulta"
        result["error_epoca_lluviosa"] = str(e)

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"estado": result["estado"], "estaciones": len(result["estaciones"]), "tableros_alto_con_dato": dashboard_ok, "acumulados_mes_actual": len(result["acumulados_mes_actual"]), "acumulados_epoca_lluviosa": len(result["acumulados_epoca_lluviosa"]), "corte": result.get("corte_fuente")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
