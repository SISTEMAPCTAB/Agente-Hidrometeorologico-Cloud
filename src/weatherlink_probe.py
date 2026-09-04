import json
import re
from pathlib import Path

import requests

STATIONS = [
    {"nombre": "ACALA PCIVILCHIAPAS", "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8", "system_id": 187735},
    {"nombre": "ASUR Villahermosa", "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f", "system_id": 120765},
    {"nombre": "Centro", "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35", "system_id": 145727},
]
VERSION = "10.0.7.4-c92a18e7"
BASE = "https://www.weatherlink.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
    "Accept": "application/json,text/javascript,*/*;q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.weatherlink.com/map",
}


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def snippets(text: str, term: str, limit=20, before=300, after=750):
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


def fetch_constants():
    url = f"{BASE}/js/{VERSION}/map/constants.js"
    r = requests.get(url, headers=HEADERS, timeout=45)
    r.raise_for_status()
    text = r.text
    return {
        "url": url,
        "chars": len(text),
        "station_url_snippets": snippets(text, "sMapStationsURL", 10),
        "data_snippets": snippets(text, "stationdata", 10),
        "url_literals": sorted(set(re.findall(r"[\"'](/[^\"']{2,180})[\"']", text)))[:150],
    }


def test_endpoint(url):
    result = {"url": url}
    try:
        r = requests.get(url, headers=HEADERS, timeout=60, allow_redirects=True)
        result.update({
            "status": r.status_code,
            "content_type": r.headers.get("content-type"),
            "final_url": r.url,
            "bytes": len(r.content),
            "body_start": clean(r.text[:1200]),
        })
        try:
            data = r.json()
            result["json_type"] = type(data).__name__
            result["json_len"] = len(data) if hasattr(data, "__len__") else None
            if isinstance(data, list):
                samples = []
                targets = {s["system_id"] for s in STATIONS}
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    vals = {str(v) for v in row.values()}
                    if any(str(t) in vals for t in targets) or any(s["uuid"] in vals for s in STATIONS):
                        samples.append(row)
                result["target_rows"] = samples[:20]
                result["first_row"] = data[0] if data and isinstance(data[0], dict) else None
            elif isinstance(data, dict):
                result["json_keys"] = list(data.keys())[:100]
                result["json_sample"] = data
        except Exception as exc:
            result["json_error"] = f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def main():
    constants = fetch_constants()
    candidate_urls = [BASE + "/map/stationdata"]
    for literal in constants.get("url_literals", []):
        if any(k in literal.lower() for k in ("station", "data")):
            candidate_urls.append(BASE + literal)
    candidate_urls = list(dict.fromkeys(candidate_urls))[:20]

    data = {
        "purpose": "Verificar el endpoint público que usa el mapa WeatherLink para obtener datos de estaciones, sin credenciales.",
        "constants": constants,
        "endpoint_tests": [test_endpoint(u) for u in candidate_urls],
    }
    out = Path("out/weatherlink_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
