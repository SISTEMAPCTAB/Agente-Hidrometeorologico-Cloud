import hashlib
import json
import re
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

BASE = Path("data/analysis")
SOURCE = BASE / "latest.md"
REPORT_DIR = BASE / "Reportes"
ARCHIVE_DIR = REPORT_DIR / "Archivo"
LATEST = REPORT_DIR / "Analisis_Hidrometeorologico_Ultimo.docx"
WORD_STATUS = REPORT_DIR / "Estado_Word.json"

BLUE = RGBColor(31, 78, 121)


def clean_inline(text):
    text = text.strip()
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text


def extract_cut(text):
    patterns = [
        r"(?im)^\s*(?:Corte|CORTE)\s*:\s*(\d{4}-\d{2}-\d{2})(?:\s+|T)(\d{1,2}:\d{2})?",
        r"(?im)Corte\s*:\s*(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+de\s+(\d{4}).*?(\d{1,2}:\d{2})?",
    ]
    m = re.search(patterns[0], text)
    if m:
        hh = m.group(2) or "11:00"
        return datetime.fromisoformat(f"{m.group(1)}T{hh}")
    # Fallback: fecha actual; el contenido conserva el corte en el documento.
    return datetime.now()


def add_heading(doc, text, level):
    p = doc.add_paragraph()
    r = p.add_run(clean_inline(text))
    r.font.name = "Arial"
    r.font.bold = True
    r.font.color.rgb = BLUE
    r.font.size = Pt({1: 14, 2: 12, 3: 10.5}.get(level, 10))
    return p


def add_table(doc, lines):
    rows = []
    for line in lines:
        cells = [clean_inline(x) for x in line.strip().strip("|").split("|")]
        rows.append(cells)
    if len(rows) >= 2 and all(re.fullmatch(r"\s*:?-{3,}:?\s*", c or "") for c in rows[1]):
        rows.pop(1)
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=0, cols=cols)
    table.style = "Table Grid"
    for ri, row in enumerate(rows):
        cells = table.add_row().cells
        for ci in range(cols):
            cells[ci].text = row[ci] if ci < len(row) else ""
            for p in cells[ci].paragraphs:
                for run in p.runs:
                    run.font.name = "Arial"
                    run.font.size = Pt(8)
                    run.font.bold = ri == 0


def render_markdown(doc, text):
    lines = text.splitlines()
    i = 0
    paragraph_buffer = []

    def flush_paragraph():
        nonlocal paragraph_buffer
        if not paragraph_buffer:
            return
        joined = " ".join(clean_inline(x) for x in paragraph_buffer if x.strip()).strip()
        if joined:
            p = doc.add_paragraph(joined)
            for r in p.runs:
                r.font.name = "Arial"
                r.font.size = Pt(9.5)
        paragraph_buffer = []

    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            flush_paragraph()
            i += 1
            continue
        if line.startswith("### "):
            flush_paragraph(); add_heading(doc, line[4:], 3); i += 1; continue
        if line.startswith("## "):
            flush_paragraph(); add_heading(doc, line[3:], 2); i += 1; continue
        if line.startswith("# "):
            flush_paragraph(); add_heading(doc, line[2:], 1); i += 1; continue
        if line.lstrip().startswith("|") and "|" in line.strip("|"):
            flush_paragraph()
            block = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                block.append(lines[i]); i += 1
            add_table(doc, block)
            continue
        if re.match(r"^\s*[-*]\s+", line):
            flush_paragraph()
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(clean_inline(re.sub(r"^\s*[-*]\s+", "", line)))
            for r in p.runs:
                r.font.name = "Arial"; r.font.size = Pt(9.5)
            i += 1; continue
        if re.match(r"^\s*\d+[.)]\s+", line):
            flush_paragraph()
            p = doc.add_paragraph(style="List Number")
            p.add_run(clean_inline(re.sub(r"^\s*\d+[.)]\s+", "", line)))
            for r in p.runs:
                r.font.name = "Arial"; r.font.size = Pt(9.5)
            i += 1; continue
        paragraph_buffer.append(line)
        i += 1
    flush_paragraph()


def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists() or SOURCE.stat().st_size < 100:
        status = {"report": "Análisis hidrometeorológico diario", "verified": False, "state": "waiting_for_latest_md"}
        WORD_STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(status, ensure_ascii=False, indent=2))
        return 0

    text = SOURCE.read_text(encoding="utf-8-sig")
    cut = extract_cut(text)
    archive_name = f"Analisis_Hidrometeorologico_{cut.strftime('%Y-%m-%d')}.docx"

    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(0.55)
    sec.bottom_margin = Inches(0.55)
    sec.left_margin = Inches(0.6)
    sec.right_margin = Inches(0.6)
    doc.styles["Normal"].font.name = "Arial"
    doc.styles["Normal"].font.size = Pt(9.5)

    # Encabezado institucional neutro y estable.
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Actualización del análisis operativo hidrometeorológico")
    r.font.name = "Arial"; r.font.size = Pt(16); r.font.bold = True; r.font.color.rgb = BLUE
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = p2.add_run("Cuencas Grijalva–Usumacinta")
    r2.font.name = "Arial"; r2.font.size = Pt(10); r2.font.bold = True

    render_markdown(doc, text)
    doc.save(LATEST)

    with zipfile.ZipFile(LATEST, "r") as zf:
        bad = zf.testzip()
        if bad:
            raise RuntimeError(f"DOCX corrupto; entrada dañada: {bad}")
    Document(str(LATEST))
    if LATEST.stat().st_size < 5000:
        raise RuntimeError("DOCX generado demasiado pequeño.")

    archived = ARCHIVE_DIR / archive_name
    shutil.copy2(LATEST, archived)
    digest = hashlib.sha256(LATEST.read_bytes()).hexdigest()
    status = {
        "report": "Análisis hidrometeorológico diario",
        "cut": cut.isoformat(),
        "verified": True,
        "source_path": str(SOURCE).replace("\\", "/"),
        "latest_path": str(LATEST).replace("\\", "/"),
        "archive_path": str(archived).replace("\\", "/"),
        "bytes": LATEST.stat().st_size,
        "sha256": digest,
    }
    WORD_STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
