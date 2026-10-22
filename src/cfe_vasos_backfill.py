"""Recupera los reportes CFE "FUNCIONAMIENTO DE VASOS" de los últimos N días (por defecto 45) y guarda la operación
horaria de cada día en data/cfe_vasos/historico/AAAA-MM-DD.json (la versión más reciente de cada FINddmmaa.xlsx).
No toca data/cfe_vasos/latest.json ni estado.json (lo que lee el modelo). Uso único / bajo demanda para estudiar el
tránsito Peñitas → Samaria / Carrizal (González). El Excel no se guarda."""
import email, imaplib, json, os, sys
from datetime import timedelta
sys.path.insert(0, os.path.dirname(__file__))
from cfe_vasos import OUT, NAME_RE, build, dec, now_local
from email.utils import parsedate_to_datetime


def main(dias=45):
    user = os.environ.get('GMAIL_BACKUP_USER', ''); pwd = os.environ.get('GMAIL_BACKUP_APP_PASSWORD', '')
    if not user or not pwd:
        print('sin credenciales'); return
    mail = imaplib.IMAP4_SSL('imap.gmail.com', 993, timeout=60); mail.login(user, pwd)
    boxes = ['INBOX']
    try:
        for ln in mail.list()[1] or []:
            t = ln.decode('utf-8', 'ignore')
            if '\\All' in t: boxes.append(t.split(' "/" ')[-1].strip())
    except Exception: pass
    since = (now_local() - timedelta(days=dias)).strftime('%d-%b-%Y')
    best = {}
    for bz in boxes:
        try: mail.select(bz, readonly=True)
        except Exception: continue
        typ, data = mail.uid('search', None, f'(SINCE "{since}" SUBJECT "FUNCIONAMIENTO")')
        uids = (data[0] or b'').split() if typ == 'OK' else []
        print(bz, len(uids), 'mensajes')
        for uid in uids:
            typ, md = mail.uid('fetch', uid, '(BODY.PEEK[])')
            if typ != 'OK' or not md or not isinstance(md[0], tuple): continue
            msg = email.message_from_bytes(md[0][1])
            try: mdt = parsedate_to_datetime(msg.get('Date'))
            except Exception: continue
            for part in msg.walk():
                fn = (dec(part.get_filename()) or '').strip()
                if fn and NAME_RE.match(fn):
                    blob = part.get_payload(decode=True)
                    try: out = build(blob, fn, mdt)
                    except Exception as e: print('error', fn, str(e)[:80]); continue
                    k = out['fecha']
                    if k not in best or out['fecha_hora_ultimo_dato'] > best[k]['fecha_hora_ultimo_dato'] or (
                       out['fecha_hora_ultimo_dato'] == best[k]['fecha_hora_ultimo_dato'] and out['mensaje_local'] > best[k]['mensaje_local']):
                        best[k] = out
        if best and bz != 'INBOX': break
    mail.logout()
    (OUT / 'historico').mkdir(parents=True, exist_ok=True)
    for k, out in sorted(best.items()):
        (OUT / 'historico' / f'{k}.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print('días guardados:', sorted(best))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 45)
