import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests

STATIONS = [
    {"nombre": "ACALA PCIVILCHIAPAS", "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8"},
    {"nombre": "ASUR Villahermosa", "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f"},
    {"nombre": "Centro", "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.7",
}


def title_of(html):
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else None


def snippets(html: str, term: str, limit=12, before=260, after=620):
    low = html.lower()
    out = []
    pos = 0
    while len(out) < limit:
        idx = low.find(term.lower(), pos)
        if idx < 0:
            break
        a = max(0, idx - before)
        b = min(len(html), idx + after)
        out.append(re.sub(r"\s+", " ", html[a:b]).strip())
        pos = idx + max(1, len(term))
    return out


def interesting_urls(html: str, base_url: str):
    found = []
    for m in re.finditer(r"(?:src|href)=[\"']([^\"']+)[\"']", html, re.I):
        u = urljoin(base_url, m.group(1))
        if any(k in u.lower() for k in ("map", "station", "weatherlink", "api", "sensor", "data")) and u not in found:
            found.append(u)
    for raw in re.findall(r"https?://[^\"'<>\\\s]+", html):
        if any(k in raw.lower() for k in ("map", "station", "weatherlink", "api", "sensor", "data")) and raw not in found:
            found.append(raw)
    return found[:80]


def map_probe(station):
    uuid = station["uuid"]
    url = f"https://www.weatherlink.com/map/{uuid}"
    item = {"route": "map", "requested_url": url}
    try:
        r = requests.get(url, headers=HEADERS, timeout=45, allow_redirects=True)
        html = r.text
        item.update({
            "status": r.status_code,
            "final_url": r.url,
            "bytes": len(r.content),
            "title": title_of(html),
            "uuid_present": uuid in html,
            "station_name_present": station["nombre"].lower() in html.lower(),
            "rain_present": "rain" in html.lower(),
            "interesting_urls": interesting_urls(html, r.url),
            "station_snippets": snippets(html, station["nombre"], 8),
            "uuid_snippets": snippets(html, uuid, 8),
            "rain_snippets": snippets(html, "rain", 18),
            "stationdata_snippets": snippets(html, "stationdata", 12),
            "sensor_snippets": snippets(html, "sensor", 12),
            "ajax_snippets": snippets(html, "ajax", 12),
            "json_snippets": snippets(html, "json", 12),
        })
    except Exception as exc:
        item["error"] = f"{type(exc).__name__}: {exc}"
    return item


def main():
    data = {
        "purpose": "Inspección de datos y rutas embebidas en el mapa público WeatherLink desde GitHub Actions; sin credenciales y sin modificar WeatherLink.",
        "stations": [
            {"nombre": station["nombre"], "uuid": station["uuid"], "map": map_probe(station)}
            for station in STATIONS
        ],
    }
    out = Path("out/weatherlink_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
