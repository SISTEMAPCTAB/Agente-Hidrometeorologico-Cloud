"""Sondeo (25-nov-2026): ¿qué publica el SMN del radar de Sabancuy y en qué URL? Imprime en el log los enlaces de imágenes de radar."""
import re, requests
UA={'User-Agent':'Mozilla/5.0 (IPCET-Hidromet sondeo radar)'}
def get(u):
    try:
        r=requests.get(u,headers=UA,timeout=40);return r.text,r.status_code
    except Exception as e: return repr(e)[:300],None
for u in ['https://smn.conagua.gob.mx/es/observando-el-tiempo/radares-meteorologicos','https://smn.conagua.gob.mx/es/observando-el-tiempo/radares-meteorologicos/radar-sabancuy','https://smn.conagua.gob.mx/es/','https://smn.conagua.gob.mx/es/observando-el-tiempo/radares-meteorologicos/sabancuy']:
    t,s=get(u);print('==',u,s,len(t),t[:150] if s is None else '')
    for m in sorted(set(re.findall(r'[\w/:.\-%?=&]*(?:sabancuy|Sabancuy|SAB|radar)[\w/:.\-%?=&]*\.(?:png|gif|jpg|jpeg|json|php)[\w=&?.\-]*',t)))[:60]: print('  ',m)
    for m in sorted(set(re.findall(r'href="([^"]*radar[^"]*)"',t,re.I)))[:40]: print('  href',m)
