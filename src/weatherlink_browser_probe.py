import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

STATIONS = [
    {"nombre": "ACALA PCIVILCHIAPAS", "uuid": "223fd3da-5715-46cb-9e36-a8f53283baf8"},
    {"nombre": "ASUR Villahermosa", "uuid": "77ead3a5-9f34-4f2d-aa8d-2dfeed3eba4f"},
    {"nombre": "Centro", "uuid": "903123f2-ae03-4f9c-9f75-2ce5ec49af35"},
]


def snippets(text: str, term: str, limit=8):
    low = text.lower()
    out = []
    pos = 0
    while len(out) < limit:
        i = low.find(term.lower(), pos)
        if i < 0:
            break
        a = max(0, i - 160)
        b = min(len(text), i + 320)
        out.append(re.sub(r"\s+", " ", text[a:b]).strip())
        pos = i + len(term)
    return out


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            locale="es-MX",
            timezone_id="America/Mexico_City",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152 Safari/537.36",
            viewport={"width": 1440, "height": 1000},
        )
        for station in STATIONS:
            url = f"https://www.weatherlink.com/bulletin/{station['uuid']}"
            page = context.new_page()
            item = {"nombre": station["nombre"], "uuid": station["uuid"], "requested_url": url}
            try:
                response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                try:
                    page.wait_for_load_state("networkidle", timeout=30000)
                except Exception:
                    pass
                page.wait_for_timeout(5000)
                text = page.locator("body").inner_text(timeout=15000)
                item.update({
                    "http_status": response.status if response else None,
                    "final_url": page.url,
                    "title": page.title(),
                    "body_chars": len(text),
                    "station_name_present": station["nombre"].lower() in text.lower(),
                    "rain_snippets": snippets(text, "Rain", 10),
                    "lluvia_snippets": snippets(text, "lluvia", 10),
                    "updated_snippets": snippets(text, "Last updated", 5),
                    "body_start": re.sub(r"\s+", " ", text[:1600]).strip(),
                })
            except Exception as exc:
                item["error"] = f"{type(exc).__name__}: {exc}"
                item["final_url"] = page.url
            finally:
                page.close()
            results.append(item)
        browser.close()

    output = {
        "purpose": "Prueba de acceso WeatherLink con Chromium headless desde GitHub Actions; sin credenciales y sin modificar WeatherLink.",
        "stations": results,
    }
    path = Path("out/weatherlink_browser_probe.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
