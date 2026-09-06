import json, re, subprocess
from datetime import datetime, timedelta
from pathlib import Path

SRC=Path('data/latest/FUENTE2.txt')
OUT=Path('data/presas/historico_7d.json')
OUT.parent.mkdir(parents=True,exist_ok=True)
NAMO={'Angostura':533.0,'Malpaso':182.5}

def num(s):
    s=str(s).replace(',','') if ',' in str(s) and '.' in str(s) else str(s).replace(',','.')
    try:return float(s)
    except:return None

def parse(txt):
    dm=re.search(r'(\d{2}) DE ([A-ZÁÉÍÓÚÑ]+) DEL (\d{4})',txt,re.I)
    hm=re.search(r'(\d{2}:\d{2}) horas',txt,re.I)
    months={'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12}
    if not dm:return []
    day,mon,year=int(dm.group(1)),months.get(dm.group(2).lower()),int(dm.group(3))
    if not mon:return []
    hh,mm=(map(int,(hm.group(1) if hm else '08:00').split(':')))
    stamp=datetime(year,mon,day,hh,mm).isoformat()+'-06:00'
    out=[]
    for name in ('Angostura','Malpaso'):
        m=re.search(rf'^{name}\s+(.+)$',txt,re.M|re.I)
        if not m:continue
        vals=[num(x) for x in m.group(1).split()]
        vals=[v for v in vals if v is not None]
        if len(vals)<12:continue
        actual,pct,dif_curve=vals[4],vals[5],vals[7]
        out.append({'fecha_hora':stamp,'presa':name,'nivel':actual,'namo':NAMO[name],'curva_guia':actual-dif_curve,'dif_curva':dif_curve,'pct_llenado':pct})
    return out

def git_versions():
    texts=[]
    if SRC.exists():texts.append(SRC.read_text(encoding='utf-8',errors='ignore'))
    try:
        shas=subprocess.check_output(['git','log','--format=%H','--','data/latest/FUENTE2.txt'],text=True).splitlines()
        for sha in shas[:30]:
            try:texts.append(subprocess.check_output(['git','show',f'{sha}:data/latest/FUENTE2.txt'],text=True,stderr=subprocess.DEVNULL))
            except:pass
    except:pass
    return texts

rows={}
for txt in git_versions():
    for r in parse(txt):rows[(r['fecha_hora'],r['presa'])]=r
allrows=sorted(rows.values(),key=lambda r:r['fecha_hora'])
if allrows:
    last=max(datetime.fromisoformat(r['fecha_hora']) for r in allrows)
    cutoff=last-timedelta(days=7)
    allrows=[r for r in allrows if datetime.fromisoformat(r['fecha_hora'])>=cutoff]
OUT.write_text(json.dumps(allrows,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Historico presas: {len(allrows)} registros')
