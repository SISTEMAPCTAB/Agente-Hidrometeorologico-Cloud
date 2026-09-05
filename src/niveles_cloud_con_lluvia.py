import subprocess
from pathlib import Path

import niveles_cloud as base_agent

RAIN_PROCESSOR = Path("src/extraer_lluvia_conagua.js")
_original_run_processor = base_agent.run_processor


def run_processor_with_rain(pdf_path: Path, subject: str, message_key: str):
    # Mantiene intacto el procesamiento probado de niveles.
    _original_run_processor(pdf_path, subject, message_key)

    # Complemento independiente: lluvia reportada por CONAGUA en el mismo PDF.
    # Regla: blanco = sin_dato; solo un cero explícito se conserva como 0 mm.
    if not RAIN_PROCESSOR.exists():
        raise RuntimeError(f"No existe {RAIN_PROCESSOR}")
    cmd = [
        "node",
        str(RAIN_PROCESSOR),
        "--pdf",
        str(pdf_path),
        "--subject",
        subject,
        "--message-id",
        message_key,
        "--base",
        str(base_agent.BASE),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"extraer_lluvia_conagua.js terminó con código {proc.returncode}")


base_agent.run_processor = run_processor_with_rain

if __name__ == "__main__":
    base_agent.main()
