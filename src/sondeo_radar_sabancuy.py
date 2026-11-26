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

t,s=get('https://smn.conagua.gob.mx/es/')
links=sorted(set(re.findall(r'href="([^"]+)"',t)))
print('LINKS', [l for l in links if re.search(r'radar|observ|satel|imagen',l,re.I)][:80])
for l in [l for l in links if re.search(r'radar',l,re.I)][:10]:
    u=l if l.startswith('http') else 'https://smn.conagua.gob.mx'+l
    t2,s2=get(u);print('== sub',u,s2,len(t2))
    print('   img', sorted(set(re.findall(r'(?:src|href|data-src)="([^"]+\.(?:png|gif|jpg|jpeg|json|php)[^"]*)"',t2)))[:50])
    print('   sab', sorted(set(re.findall(r'[^"\' ]*[Ss]abancuy[^"\' ]*',t2)))[:30])
t,s=get('https://smn.conagua.gob.mx/es/observando-el-tiempo/radares-meteorologicos-separador/visor-de-radares-meteorologicos')
print('IFR', re.findall(r'<iframe[^>]+src="([^"]+)"',t)[:5]); print('SCR', [x for x in re.findall(r'src="([^"]+\.js[^"]*)"',t) if 'gob.mx' not in x][:20])
for x in re.findall(r'<iframe[^>]+src="([^"]+)"',t)[:3]:
    u=x if x.startswith('http') else 'https://smn.conagua.gob.mx'+x; t3,s3=get(u); print('== ifr',u,s3,len(t3)); print('   ', re.findall(r'[\w/:.\-]*(?:\.png|\.gif|\.json|\.php|radar)[\w/:.\-?=&]*',t3)[:60])
B='https://smn.conagua.gob.mx/tools/GUI/visor_radares_v3/'
t,s=get(B+'index.html'); print('IDX', t[:500].replace('\n',' '))
for x in re.findall(r'(?:src|href)="([^"]+)"',t):
    if x.startswith('http'): continue
    t2,s2=get(B+x); print('== sub',x,s2,len(t2)); print('   ', sorted(set(re.findall(r'[\w/:.\-]*(?:\.png|\.gif|\.jpg|\.json|\.php|\.txt|sabancuy|Sabancuy)[\w/:.\-?=&]*',t2)))[:80])
import json as J
for u in [B+'utils/radarsDB.json',B+'utils/ultimas_v4.json','https://smn.conagua.gob.mx/tools/PHP/RDA/static/php/RDA_repository.php?dir=ecos&type=json']:
    t,s=get(u); print('== J',u,s,len(t)); i=t.lower().find('sabancuy'); print('   SAB',t[max(0,i-300):i+900].replace('\n',' ') if i>=0 else t[:600])
js,_=get(B+'assets/index-BbChE2h9.js')
for k in ['ultimas_v4','radarsDB','RDA_repository','lista.json']:
    for m in re.finditer(k,js): print('CTX',k,js[max(0,m.start()-250):m.start()+250].replace('\n',' '))
t,s=get('https://smn.conagua.gob.mx/tools/PHP/RDA/static/php/RDA_repository.php?dir=ecos&type=json')
d=J.loads(t); print('RDA n',len(d)); print('RDA0',J.dumps(d[:2])[:800])
sab=[x for x in d if 'sab' in J.dumps(x).lower()]; print('RDAS',J.dumps(sab[:3])[:1500])
for m in re.finditer(r'ecos/',js): print('ECO',js[max(0,m.start()-200):m.start()+200].replace('\n',' '))
pr=sorted(set('_'.join(x.split('_')[:5]) for x in d if x.startswith('SABA'))); print('PROD',pr)
f=[x for x in d if x.startswith('SABA')]; print('NSAB',len(f),f[-1],f[0])
r=requests.get(B+'ecos/'+f[0],timeout=60); print('GIF',r.status_code,len(r.content),r.headers.get('content-type'))
db=requests.get(B+'utils/radarsDB.json',timeout=120).json()
s=J.dumps(db); i=s.find('SABA'); print('DB',s[max(0,i-1500):i+2500])
