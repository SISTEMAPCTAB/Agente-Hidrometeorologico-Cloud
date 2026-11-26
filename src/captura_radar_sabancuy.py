"""Captura del radar Sabancuy (SMN, PPI reflectividad 300 km, cada ~9 min) para evaluar
si sirve al modelo (prueba 25-nov-2026; PENDIENTES 24d). Guarda las imágenes nuevas (PNG 1000x1000 aunque el nombre diga .gif) en
radar/sabancuy/AAAAMMDD/ (rama 'radar', no en main). Límites del GIF (radarsDB.json):
N 21.661849 O -94.013617, S 16.283065 E -88.329891."""
import os, sys, requests
B = 'https://smn.conagua.gob.mx/tools/GUI/visor_radares_v3/'
L = 'https://smn.conagua.gob.mx/tools/PHP/RDA/static/php/RDA_repository.php?dir=ecos&type=json'
out = sys.argv[1] if len(sys.argv) > 1 else 'radar/sabancuy'
lista = [x for x in requests.get(L, timeout=60).json() if x.startswith('SABA_PPIX_REFL_299')]
n = 0
for f in lista:
    dia = f.split('_')[-2]; p = os.path.join(out, dia, f[:-4] + '.png')
    if os.path.exists(p): continue
    r = requests.get(B + 'ecos/' + f, timeout=60)
    if r.status_code == 200 and r.content[:4] in (b'GIF8', b'\x89PNG'):
        pass
    else:
        print('fallo', f, r.status_code, r.content[:40]); continue
    if True:
        os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(r.content); n += 1
print('radar Sabancuy: lista', len(lista), 'nuevos', n)
