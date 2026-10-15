import re
import subprocess
import tempfile
from pathlib import Path

import niveles_cloud_robusto as robust

nc = robust.base

PROCESSOR = Path('src/procesar_niveles_horas.js')
MACAYO_SHADOW_PROCESSOR = Path('src/extraer_macayo_horario_prueba.js')
BIFURCACION_HORARIO_PROCESSOR = Path('src/extraer_niveles_horarios_bifurcacion.js')


def normalize_subject_hour(subject: str) -> str:
    """Normaliza variantes reales del asunto: 12.00, 12:00 y 12 00."""
    return re.sub(r'(?i)(\b\d{1,2})[.](00\b)', r'\1:\2', str(subject or ''))


def run_processor(pdf_path: Path, subject: str, message_key: str):
    subject = normalize_subject_hour(subject)
    cmd = [
        'node', str(PROCESSOR),
        '--pdf', str(pdf_path),
        '--subject', subject,
        '--message-id', message_key,
        '--base', str(nc.BASE),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f'{PROCESSOR} terminó con código {proc.returncode}')


def run_macayo_shadow(pdf_path: Path, subject: str, message_key: str):
    """Prueba aislada no bloqueante: sólo escribe data/pronostico_hidrologico/prueba_macayo."""
    if not MACAYO_SHADOW_PROCESSOR.exists():
        return
    subject = normalize_subject_hour(subject)
    cmd = [
        'node', str(MACAYO_SHADOW_PROCESSOR),
        '--pdf', str(pdf_path),
        '--subject', subject,
        '--message-id', message_key,
        '--base', str(nc.BASE),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.stdout.strip():
        print(proc.stdout.strip())
    if proc.returncode != 0:
        # Nunca interrumpe la operación normal de niveles.
        print(proc.stderr.strip() or 'Shadow Macayo no disponible.')


def run_bifurcacion_horario(pdf_path: Path, subject: str, message_key: str):
    """Aditivo y no bloqueante: acumula niveles horarios Malpaso/Peñitas/Platanar/Samaria/Macayo/González
    en data/niveles/Horario_Bifurcacion para calibrar el tránsito Peñitas -> Samaria. Nunca lanza excepción."""
    try:
        if not BIFURCACION_HORARIO_PROCESSOR.exists():
            return
        cmd = [
            'node', str(BIFURCACION_HORARIO_PROCESSOR),
            '--pdf', str(pdf_path),
            '--subject', normalize_subject_hour(subject),
            '--message-id', message_key,
            '--base', str(nc.BASE),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if proc.stdout.strip():
            print(proc.stdout.strip())
        if proc.returncode != 0:
            print(proc.stderr.strip() or 'Horario bifurcación no disponible.')
    except Exception as exc:  # nunca interrumpe la operación normal de niveles
        print(f'Horario bifurcación omitido: {exc}')


def main():
    if not PROCESSOR.exists():
        raise RuntimeError(f'No existe {PROCESSOR}')

    results = []
    for account in nc.ACCOUNTS:
        if not account['user'] or not account['password']:
            continue
        try:
            token = nc.authenticate(account['user'], account['password'])
            candidates = nc.collect_candidates(token)
            results.append({'label': account['label'], 'ok': True, 'token': token, 'user': account['user'], 'candidates': candidates})
        except Exception as exc:
            print(f"Cuenta {account['label']} no disponible para reproceso horario: {exc}")

    selected = nc.choose_account(results)
    if not selected or not selected.get('candidates'):
        print('Sin boletín reciente para reproceso horario; se conserva el histórico existente.')
        return

    item = max(selected['candidates'], key=nc.msg_timestamp)
    mid = str(item.get('id', ''))
    subject = str(item.get('su', ''))
    message_key = f"{selected['label']}-{mid}"
    detail = nc.get_message(selected['token'], mid)
    pdfs = [
        a for a in nc.walk_attachments(detail.get('mp', []))
        if a['content_type'] == 'application/pdf' or a['filename'].lower().endswith('.pdf')
    ]
    if not pdfs:
        print('El último reporte de niveles no contiene PDF.')
        return

    with tempfile.TemporaryDirectory(prefix='niveles_horas_') as tmp:
        tmpdir = Path(tmp)
        for index, attachment in enumerate(pdfs, start=1):
            content = nc.download_pdf(selected['token'], selected['user'], mid, attachment['part'])
            safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', attachment['filename']).strip('_') or f'reporte_{index}.pdf'
            pdf_path = tmpdir / f'{message_key}_{index}_{safe_name}'
            pdf_path.write_bytes(content)
            run_processor(pdf_path, subject, message_key)
            run_macayo_shadow(pdf_path, subject, message_key)
            run_bifurcacion_horario(pdf_path, subject, message_key)


if __name__ == '__main__':
    main()
