import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests

STATIONS = [
    {
        "nombre": "ACALA PCIVILCHIAPAS",
        "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8",
    },
    {
        "nombre": "ASUR Villahermosa",
        "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f",
    },
    {
        "nombre": "Centro",
        "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35",
    },
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.7",
}


def compact_snippets(html: str, term: str, limit: int = 8):
    out = []
    low = html.lower()
    start = 0
    while len(out) < limit:
        idx = low.find(term.lower(), start)
        if idx < 0:
            break
        a = max(0, idx - 120)
        b = min(len(html), idx + 240)
        snippet = re.sub(r"\s+", " ", html[a:b]).strip()
        out.append(snippet)
        start = idx + len(term)
    return out


def probe_station(station):
    url = f"https://www.weatherlink.com/bulletin/{station['uuid']}"
    result = {"nombre": station["nombre"], "uuid": station["uuid"], "url": url}
    try:
        r = requests.get(url, headers=HEADERS, timeout=45, allow_redirects=True)
        html = r.text
        result.update(
            {
                "status_code": r.status_code,
                "final_url": r.url,
                "content_type": r.headers.get("content-type"),
                "bytes": len(r.content),
                "chars": len(html),
            }
        )

        title = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
        result["title"] = re.sub(r"\s+", " ", title.group(1)).strip() if title else None

        scripts = re.findall(r"<script[^>]+src=[\"']([^\"']+)", html, flags=re.I)
        result["script_srcs"] = [urljoin(r.url, s) for s in scripts[:40]]

        urls = re.findall(r"https?://[^\"'<>\\\s]+", html)
        interesting = []
        for item in urls:
            if any(k in item.lower() for k in ("api", "weatherlink", "station", "bulletin", "historic", "current")):
                if item not in interesting:
                    interesting.append(item)
        result["interesting_urls"] = interesting[:60]

        result["has_next_data"] = "__NEXT_DATA__" in html
        result["has_angular"] = "ng-version" in html or "angular" in html.lower()
        result["has_station_uuid_in_html"] = station["uuid"] in html
        result["rain_snippets"] = compact_snippets(html, "rain", 10)
        result["api_snippets"] = compact_snippets(html, "api", 10)
        result["sensor_snippets"] = compact_snippets(html, "sensor", 10)
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def main():
    data = {
        "purpose": "Diagnóstico de acceso público WeatherLink desde GitHub Actions; no modifica datos ni usa credenciales.",
        "stations": [probe_station(s) for s in STATIONS],
    }
    out = Path("out/weatherlink_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
