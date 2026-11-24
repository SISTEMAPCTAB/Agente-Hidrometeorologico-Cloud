"""Sondeo (24-nov-2026, Gilberto): ¿el informe HORARIO de niveles de CONAGUA va actualizando las filas MAX/MIN de temperatura a lo largo
del día? Lee de Gmail (sólo lectura) los informes de niveles de hoy y de ayer, extrae el texto de cada PDF e imprime en el log las filas de
estaciones, MAX y MIN por hora de informe. No escribe nada en el repositorio."""
import imaplib, email, io, os, re
from datetime import datetime, timedelta
import pdfplumber
from gmail_fallback import decode, message_time, pdf_parts
U = os.getenv('GMAIL_BACKUP_USER', '').strip(); P = os.getenv('GMAIL_BACKUP_APP_PASSWORD', '').strip()
m = imaplib.IMAP4_SSL('imap.gmail.com', 993, timeout=30); m.login(U, P); m.select('INBOX', readonly=True)
since = (datetime.now() - timedelta(days=1)).strftime('%d-%b-%Y')
typ, data = m.uid('search', None, f'(SINCE "{since}" SUBJECT "NIVELES")')
uids = data[0].split()[-40:]
vistos = 0
for u in uids:
    typ, d = m.uid('fetch', u, '(RFC822)'); msg = email.message_from_bytes(d[0][1]); subj = decode(msg.get('Subject'))
    for fn, pdf in pdf_parts(msg):
        try:
            with pdfplumber.open(io.BytesIO(pdf)) as doc:
                for pi, pg in enumerate(doc.pages):
                    lines = (pg.extract_text() or '').splitlines()
                    sel = [l for l in lines if re.match(r'\s*(MAX|MIN|M[ÁA]X|M[ÍI]N|TEMP|Evap|ESTACI|NAME)\b', l, re.I)]
                    if sel:
                        vistos += 1
                        print(f'=== {message_time(msg):%Y-%m-%d %H:%M} | {subj[:70]} | {fn[:40]} | pág {pi+1}')
                        for l in sel: print('   ', l[:220])
        except Exception as e:
            print('error', subj[:60], e)
print('PDF con filas MAX/MIN:', vistos)
