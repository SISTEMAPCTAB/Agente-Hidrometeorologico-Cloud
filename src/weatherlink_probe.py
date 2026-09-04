import json
import re
from pathlib import Path

import requests

STATIONS = [
    {"nombre": "ACALA PCIVILCHIAPAS", "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8"},
    {"nombre": "ASUR Villahermosa", "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f"},
    {"nombre": "Centro", "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35"},
]
VERSION = "10.0.7.4-c92a18e7"
BASE = "https://www.weatherlink.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.7",
}


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def snippets(text: str, term: str, limit=15, before=320, after=760):
    low = text.lower()
    out = []
    pos = 0
    while len(out) < limit:
        idx = low.find(term.lower(), pos)
        if idx < 0:
            break
        out.append(clean(text[max(0, idx-before):min(len(text), idx+after)]))
        pos = idx + max(1, len(term))
    return out


def fetch_text(url):
    r = requests.get(url, headers=HEADERS, timeout=45, allow_redirects=True)
    r.raise_for_status()
    return r.url, r.text


def inspect_js():
    paths = [
        f"/js/{VERSION}/map/map.js",
        f"/js/{VERSION}/map/app.js",
        f"/js/{VERSION}/map/infobox.js",
        f"/js/{VERSION}/vendor/davis/ajax-handler.js",
    ]
    items = []
    for path in paths:
        url = BASE + path
        item = {"url": url}
        try:
            final_url, text = fetch_text(url)
            item.update({
                "final_url": final_url,
                "chars": len(text),
                "ajax": snippets(text, "ajax", 20),
                "station": snippets(text, "station", 25),
                "system": snippets(text, "system", 25),
                "current": snippets(text, "current", 20),
                "observation": snippets(text, "observation", 20),
                "sensor": snippets(text, "sensor", 20),
                "rain": snippets(text, "rain", 20),
                "url_literals": sorted(set(re.findall(r"[\"'](/[^\"']{2,160})[\"']", text)))[:200],
            })
        except Exception as exc:
            item["error"] = f"{type(exc).__name__}: {exc}"
        items.append(item)
    return items


def inspect_station(station):
    url = f"{BASE}/map/{station['uuid']}"
    item = {"url": url}
    try:
        final_url, html = fetch_text(url)
        sid = re.search(r"wl\.data\.systemId\s*=\s*(\d+)", html)
        lat = re.search(r"wl\.data\.dLat\s*=\s*([-0-9.]+)", html)
        lng = re.search(r"wl\.data\.dLng\s*=\s*([-0-9.]+)", html)
        item.update({
            "final_url": final_url,
            "system_id": int(sid.group(1)) if sid else None,
            "lat": float(lat.group(1)) if lat else None,
            "lng": float(lng.group(1)) if lng else None,
            "guest": "wl.__bootstrap_is_guest = true" in html,
            "station_name_present": station["nombre"].lower() in html.lower(),
        })
    except Exception as exc:
        item["error"] = f"{type(exc).__name__}: {exc}"
    return item


def main():
    data = {
        "purpose": "Descubrir las llamadas de datos usadas por el mapa público de WeatherLink sin credenciales.",
        "stations": [
            {"nombre": s["nombre"], "uuid": s["uuid"], **inspect_station(s)}
            for s in STATIONS
        ],
        "javascript": inspect_js(),
    }
    out = Path("out/weatherlink_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
