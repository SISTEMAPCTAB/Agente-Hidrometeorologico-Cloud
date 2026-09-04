import json
import re
from pathlib import Path

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


def route_probe(name, url, station_name, uuid):
    item = {"route": name, "requested_url": url}
    try:
        r = requests.get(url, headers=HEADERS, timeout=45, allow_redirects=True)
        html = r.text
        item.update({
            "status": r.status_code,
            "final_url": r.url,
            "bytes": len(r.content),
            "title": title_of(html),
            "uuid_present": uuid in html,
            "station_name_present": station_name.lower() in html.lower(),
            "rain_present": "rain" in html.lower(),
            "login_present": "password" in html.lower() and "username" in html.lower(),
        })
    except Exception as exc:
        item["error"] = f"{type(exc).__name__}: {exc}"
    return item


def probe_station(station):
    uuid = station["uuid"]
    variants = [
        ("bulletin", f"https://www.weatherlink.com/bulletin/{uuid}"),
        ("map", f"https://www.weatherlink.com/map/{uuid}"),
        ("browse", f"https://www.weatherlink.com/browse/{uuid}"),
        ("embed_summary", f"https://www.weatherlink.com/embeddablePage/show/{uuid}/summary"),
        ("embed_wide", f"https://www.weatherlink.com/embeddablePage/show/{uuid}/wide"),
    ]
    return {
        "nombre": station["nombre"],
        "uuid": uuid,
        "routes": [route_probe(name, url, station["nombre"], uuid) for name, url in variants],
    }


def main():
    data = {
        "purpose": "Diagnóstico de rutas públicas WeatherLink desde GitHub Actions; sin credenciales y sin modificar WeatherLink.",
        "stations": [probe_station(s) for s in STATIONS],
    }
    out = Path("out/weatherlink_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
