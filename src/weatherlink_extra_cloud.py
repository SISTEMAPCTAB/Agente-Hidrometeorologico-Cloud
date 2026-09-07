import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from weatherlink_cloud import fetch_station, parse_float, r1, iso_to_dt

MX_TZ=ZoneInfo('America/Mexico_City')
CONFIG=Path('config/weatherlink_stations_extra.json')
STATE=Path('data/weatherlink/extra_state.json')
LATEST=Path('data/weatherlink/extra_latest.json')
WINDOWS=(1,6,24,48,72,96,120)


def load(path,default):
    if not path.exists():return default
    return json.loads(path.read_text(encoding='utf-8-sig'))

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def window_sum(events,now,hours):
    cut=now-timedelta(hours=hours)
    return r1(sum(float(e['mm']) for e in events if iso_to_dt(e.get('ts')) and iso_to_dt(e['ts'])>cut))

def main():
    stations=load(CONFIG,[])
    now=datetime.now(timezone.utc)
    state=load(STATE,{'seed_utc':now.isoformat(),'stations':{}})
    seed=iso_to_dt(state.get('seed_utc')) or now
    coverage=max(0,(now-seed).total_seconds()/3600)
    rows=[]
    for s in stations:
        uid=s['uuid']
        st=state['stations'].setdefault(uid,{
            'prev_daily_mm':None,'prev_observed_utc':None,'events':[],
            'month_mm':0.0,'year_mm':0.0,'month_key':now.astimezone(MX_TZ).strftime('%Y-%m'),'year_key':now.astimezone(MX_TZ).strftime('%Y')
        })
        item={'nombre':s['nombre'],'ubicacion':s['ubicacion'],'uuid':uid,'grupo':s['grupo']}
        try:
            obs=fetch_station(s);item.update(obs)
            observed=obs['observed_utc'];local=observed.astimezone(MX_TZ)
            cur=obs.get('daily_mm');prev=parse_float(st.get('prev_daily_mm'));prev_dt=iso_to_dt(st.get('prev_observed_utc'))
            inc=0.0
            if cur is not None:
                if prev is not None and prev_dt is not None:
                    same=prev_dt.astimezone(MX_TZ).date()==local.date()
                    inc=max(0.0,cur-prev) if same and cur>=prev-0.05 else max(0.0,cur)
                inc=r1(inc)
                if inc and inc>0:st['events'].append({'ts':observed.isoformat(),'mm':inc})
                mk=local.strftime('%Y-%m');yk=local.strftime('%Y')
                if st.get('month_key')!=mk:st['month_key']=mk;st['month_mm']=0.0
                if st.get('year_key')!=yk:st['year_key']=yk;st['year_mm']=0.0
                st['month_mm']=r1(float(st.get('month_mm') or 0)+inc)
                st['year_mm']=r1(float(st.get('year_mm') or 0)+inc)
                st['prev_daily_mm']=cur;st['prev_observed_utc']=observed.isoformat()
            cutoff=now-timedelta(hours=240)
            st['events']=[e for e in st.get('events',[]) if iso_to_dt(e.get('ts')) and iso_to_dt(e['ts'])>=cutoff]
            acc={str(h):(window_sum(st['events'],now,h) if coverage>=h else None) for h in WINDOWS}
            item['increment_mm']=inc;item['accumulations_mm']=acc;item['month_mm']=st.get('month_mm');item['year_mm']=st.get('year_mm')
            age=obs.get('age_seconds');item['estado']='OK' if age is None or age<=7200 else 'Dato rezagado';item['quality']='Cloud adicional'
        except Exception as e:
            item['error']=f'{type(e).__name__}: {e}';item['estado']='Error cloud';item['quality']='Sin dato';item['accumulations_mm']={str(h):None for h in WINDOWS}
        rows.append(item)
    state['last_run_utc']=now.isoformat();save(STATE,state)
    save(LATEST,{'run_utc':now.isoformat(),'run_local':now.astimezone(MX_TZ).isoformat(),'coverage_hours':round(coverage,2),'stations':rows})
    print(json.dumps({'stations':len(rows),'ok':sum(1 for r in rows if r.get('estado')=='OK')},ensure_ascii=False))

if __name__=='__main__':main()
