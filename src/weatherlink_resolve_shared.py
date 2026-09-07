import json
import re
from pathlib import Path
import requests

BASE='https://www.weatherlink.com'
OUT=Path('data/weatherlink/shared_resolved.json')
HEADERS={
    'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}
LINKS=[
'https://www.weatherlink.com/map/shared/tJVpUesut3aW6WlV5kJUxW1lBdDjn5dC',
'https://www.weatherlink.com/map/shared/KZ25J3dtzfmh2b8TsoDpeWz9JkZtTOfm',
'https://www.weatherlink.com/map/shared/zlYzTERonJGNZ50uceYpcguOMNq8NpNJ',
'https://www.weatherlink.com/map/shared/KmsGOJSMYzMGpohKAz7fBNlyLhchnD20',
'https://www.weatherlink.com/map/shared/azvpbUtg9eRPhLPhIxQEnRYjKbRfPF6M',
'https://www.weatherlink.com/map/shared/EgARHcU53fUNDV8Xr5jHzIr17r25mXLn',
'https://www.weatherlink.com/map/shared/IilJ0nlP0LhoITdbbLxnOW5NQSwF9dvM',
'https://www.weatherlink.com/map/shared/eQzDgol4pn3zv0FkT4IxEp2nwyUYR4aF',
'https://www.weatherlink.com/map/shared/bxo8MzizoChNy4d9NdAIWciyfKjsVOid',
'https://www.weatherlink.com/map/shared/DJ3iU4YdZFGx9cuWo8tHEUaWrUySdP5z',
]
UUID_RE=re.compile(r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b')

def probe_uuid(u):
    try:
        r=requests.get(f'{BASE}/map/data/station/{u}',headers={**HEADERS,'Accept':'application/json,text/javascript,*/*;q=0.01','X-Requested-With':'XMLHttpRequest','Referer':f'{BASE}/map'},timeout=20)
        if not r.ok:return None
        j=r.json()
        if not j.get('sStation'):return None
        return {'uuid':u,'nombre':j.get('sStation'),'lastUpdatedAt':j.get('lastUpdatedAt'),'ageInSeconds':j.get('ageInSeconds')}
    except Exception:return None

def resolve(url):
    out={'shared_url':url,'resolved':False}
    try:
        r=requests.get(url,headers=HEADERS,timeout=30,allow_redirects=True)
        out['http_status']=r.status_code;out['final_url']=r.url
        candidates=[]
        for text in (r.url,r.text):
            for u in UUID_RE.findall(text or ''):
                if u not in candidates:candidates.append(u)
        probes=[]
        for u in candidates:
            p=probe_uuid(u)
            if p:probes.append(p)
        out['candidate_count']=len(candidates)
        out['probes']=probes
        preferred=[p for p in probes if str(p.get('nombre') or '').strip().lower()!='davis instruments']
        pick=(preferred or probes)
        if pick:
            out.update(pick[-1]);out['resolved']=True
    except Exception as e:
        out['error']=f'{type(e).__name__}: {e}'
    return out

def main():
    rows=[resolve(u) for u in LINKS]
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(rows,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
