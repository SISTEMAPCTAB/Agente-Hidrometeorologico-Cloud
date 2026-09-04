import json
from pathlib import Path

import requests

STATIONS = [
    {"nombre": "ACALA PCIVILCHIAPAS", "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8"},
    {"nombre": "ASUR Villahermosa", "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f"},
    {"nombre": "Centro", "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35"},
]
BASE = "https://www.weatherlink.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
    "Accept": "application/json,text/javascript,*/*;q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.weatherlink.com/map",
}


def test_station(station):
    url = f"{BASE}/map/data/station/{station['uuid']}"
    item = {"nombre": station["nombre"], "uuid": station["uuid"], "url": url}
    try:
        r = requests.get(url, headers=HEADERS, timeout=45, allow_redirects=True)
        item.update({
            "status": r.status_code,
            "content_type": r.headers.get("content-type"),
            "bytes": len(r.content),
            "final_url": r.url,
        })
        try:
            data = r.json()
            item["json_type"] = type(data).__name__
            item["data"] = data
        except Exception as exc:
            item["body_start"] = r.text[:3000]
            item["json_error"] = f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        item["error"] = f"{type(exc).__name__}: {exc}"
    return item


def main():
    data = {
        "purpose": "Probar el detalle público /map/data/station/{uuid} usado por WeatherLink, sin credenciales.",
        "stations": [test_station(s) for s in STATIONS],
    }
    out = Path("out/weatherlink_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
