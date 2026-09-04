import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

STATIONS = [
    {"nombre": "ACALA PCIVILCHIAPAS", "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8"},
    {"nombre": "ASUR Villahermosa", "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f"},
    {"nombre": "Centro", "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35"},
]


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def snippets(text: str, term: str, limit=12):
    low = text.lower()
    out = []
    pos = 0
    while len(out) < limit:
        i = low.find(term.lower(), pos)
        if i < 0:
            break
        out.append(clean(text[max(0, i-220):min(len(text), i+520)]))
        pos = i + max(1, len(term))
    return out


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            locale="es-MX",
            timezone_id="America/Mexico_City",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152 Safari/537.36",
            viewport={"width": 1440, "height": 1200},
        )
        for station in STATIONS:
            page = context.new_page()
            map_url = f"https://www.weatherlink.com/map/{station['uuid']}"
            bulletin_url = f"https://www.weatherlink.com/bulletin/{station['uuid']}"
            item = {"nombre": station["nombre"], "uuid": station["uuid"], "map_url": map_url, "bulletin_url": bulletin_url}
            try:
                map_response = page.goto(map_url, wait_until="domcontentloaded", timeout=60000)
                try:
                    page.wait_for_load_state("networkidle", timeout=25000)
                except Exception:
                    pass
                page.wait_for_timeout(3000)
                item["map"] = {
                    "status": map_response.status if map_response else None,
                    "final_url": page.url,
                    "title": page.title(),
                }

                bulletin_response = page.goto(bulletin_url, wait_until="domcontentloaded", timeout=60000)
                try:
                    page.wait_for_load_state("networkidle", timeout=30000)
                except Exception:
                    pass
                page.wait_for_timeout(6000)
                text = page.locator("body").inner_text(timeout=20000)
                item["bulletin"] = {
                    "status": bulletin_response.status if bulletin_response else None,
                    "final_url": page.url,
                    "title": page.title(),
                    "body_chars": len(text),
                    "station_name_present": station["nombre"].lower() in text.lower(),
                    "rain_snippets": snippets(text, "Rain", 20),
                    "lluvia_snippets": snippets(text, "lluvia", 20),
                    "24h_snippets": snippets(text, "24", 20),
                    "month_snippets": snippets(text, "Month", 15),
                    "year_snippets": snippets(text, "Year", 15),
                    "storm_snippets": snippets(text, "Storm", 15),
                    "body_start": clean(text[:10000]),
                }
            except Exception as exc:
                item["error"] = f"{type(exc).__name__}: {exc}"
                item["current_url"] = page.url
            finally:
                page.close()
            results.append(item)
        browser.close()

    output = {
        "purpose": "Probar si el acceso público al mapa establece la sesión de invitado necesaria para abrir el boletín WeatherLink sin credenciales.",
        "stations": results,
    }
    path = Path("out/weatherlink_browser_probe.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
