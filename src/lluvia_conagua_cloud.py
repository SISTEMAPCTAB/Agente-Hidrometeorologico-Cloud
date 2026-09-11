import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import niveles_cloud_robusto as robust

base_agent = robust.base
RAIN_PROCESSOR = Path("src/extraer_lluvia_conagua.js")


def write_degraded_state(message: str) -> None:
    """Registra indisponibilidad temporal sin borrar ni inventar lluvia previa."""
    state_dir = base_agent.BASE / "Lluvia_CONAGUA"
    state_dir.mkdir(parents=True, exist_ok=True)
    state_path = state_dir / "Estado_Lluvia_CONAGUA.json"
    previous = {}
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            previous = {}
    previous.update({
        "run_utc": datetime.now(timezone.utc).isoformat(),
        "status": "fuente_temporalmente_no_disponible",
        "warning": message,
        "regla": "Se conserva el último dato válido; ausencia de fuente nunca equivale a cero.",
    })
    state_path.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(message)
    print("Se conserva la lluvia CONAGUA previamente validada.")


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
        detail = "; ".join(f"{r.get('label')}: {r.get('error','sin candidatos')}" for r in results) or "sin cuentas disponibles"
        write_degraded_state(f"No se pudo consultar un reporte reciente de CONAGUA en esta ejecución. {detail}")
        return

    candidates = sorted(selected["candidates"], key=base_agent.msg_timestamp, reverse=True)
    if not candidates:
        write_degraded_state("No hay un reporte reciente de niveles para extraer lluvia CONAGUA en esta ejecución.")
        return

    latest = candidates[0]
    mid = str(latest.get("id", ""))
    subject = str(latest.get("su", ""))
    try:
        detail = base_agent.get_message(selected["token"], mid)
        pdfs = [
            a for a in base_agent.walk_attachments(detail.get("mp", []))
            if a["content_type"] == "application/pdf" or a["filename"].lower().endswith(".pdf")
        ]
        if not pdfs:
            write_degraded_state("El reporte más reciente no contiene PDF; se conserva la lluvia CONAGUA previa.")
            return

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
    except Exception as exc:
        write_degraded_state(f"No fue posible completar la extracción de lluvia CONAGUA: {type(exc).__name__}: {exc}")
        return

    state_path = base_agent.BASE / "Lluvia_CONAGUA" / "Estado_Lluvia_CONAGUA.json"
    if state_path.exists():
        print(state_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
