import json
import re
import subprocess
import tempfile
from pathlib import Path

import niveles_cloud_robusto as robust

base_agent = robust.base

RAIN_PROCESSOR = Path("src/extraer_lluvia_conagua.js")


def main():
    if not RAIN_PROCESSOR.exists():
        raise RuntimeError(f"No existe {RAIN_PROCESSOR}")

    results = []
    for account in base_agent.ACCOUNTS:
        if not account["user"] or not account["password"]:
            continue
        try:
            token = base_agent.authenticate(account["user"], account["password"])
            candidates = base_agent.collect_candidates(token)
            results.append({"label": account["label"], "user": account["user"], "token": token, "candidates": candidates, "ok": True})
        except Exception as exc:
            results.append({"label": account["label"], "ok": False, "error": f"{type(exc).__name__}: {exc}", "candidates": []})

    selected = base_agent.choose_account(results)
    if not selected:
        raise RuntimeError("No se encontró cuenta con reportes recientes para lluvia CONAGUA.")

    candidates = sorted(selected["candidates"], key=base_agent.msg_timestamp, reverse=True)
    if not candidates:
        raise RuntimeError("No hay reportes recientes de niveles para extraer lluvia CONAGUA.")

    latest = candidates[0]
    mid = str(latest.get("id", ""))
    subject = str(latest.get("su", ""))
    detail = base_agent.get_message(selected["token"], mid)
    pdfs = [
        a for a in base_agent.walk_attachments(detail.get("mp", []))
        if a["content_type"] == "application/pdf" or a["filename"].lower().endswith(".pdf")
    ]
    if not pdfs:
        raise RuntimeError("El reporte más reciente no contiene PDF.")

    with tempfile.TemporaryDirectory(prefix="lluvia_conagua_") as tmp:
        tmpdir = Path(tmp)
        attachment = pdfs[0]
        content = base_agent.download_pdf(selected["token"], selected["user"], mid, attachment["part"])
        safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', attachment["filename"]).strip("_") or "reporte.pdf"
        pdf_path = tmpdir / safe_name
        pdf_path.write_bytes(content)
        cmd = [
            "node", str(RAIN_PROCESSOR), "--pdf", str(pdf_path),
            "--subject", subject, "--message-id", f"{selected['label']}-{mid}",
            "--base", str(base_agent.BASE),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.stdout.strip():
            print(proc.stdout.strip())
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or f"Extractor lluvia terminó con código {proc.returncode}")

    state_path = base_agent.BASE / "Lluvia_CONAGUA" / "Estado_Lluvia_CONAGUA.json"
    if state_path.exists():
        print(state_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
