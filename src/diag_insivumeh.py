import re, requests
from pathlib import Path
UA={"User-Agent":"Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0"}
B="https://insivumeh.gob.gt/img/"
NOMBRES=r"Playa\s*Grande|Cahab|Panz|Tigre|Porvenir|Bethel|Machaquil|Mact[uú]n|Chixoy|INS142201AT|INS161201CV|INS160701CV|INS171302AT"
out=[]
def get(u):
    try:
        r=requests.get(u,headers=UA,timeout=40); r.encoding=r.encoding if r.encoding and r.encoding.lower()!="iso-8859-1" else "utf-8"; return r.status_code,r.text,r.headers.get("Last-Modified","")
    except Exception as e: return "ERR "+str(e),"",""
for rel in ("Estaciones_Met/output_csv_page/INS142201AT.html","MAPAS_24H/todas_diario.csv","MAPAS_24H/merged_prep_data.csv","MAPAS_24H/datos_davis_ultimas_24h.csv","MAPAS_24H/acudia_fecha.csv","MAPAS_24H/data.txt","MAPAS_24H/acsem_with_metadata.csv"):
    st,t,lm=get(B+rel)
    lines=t.splitlines()
    out.append(f"## {rel} -> {st}, {len(t)} bytes, {len(lines)} líneas, Last-Modified: {lm}")
    cuerpo=re.sub(r"<style.*?</style>|<script.*?</script>","",t,flags=re.S|re.I) if rel.endswith("html") else t
    out.append("INICIO:\n"+cuerpo[:1500])
    out.append("FIN:\n"+"\n".join(lines[-4:])[:800])
    hits=[l[:300] for l in lines if re.search(NOMBRES,l,re.I)]
    out.append(f"COINCIDENCIAS ({len(hits)}):\n"+"\n".join(hits[:8]))
for d in ("MAPAS_24H/Diario/","MAPAS_24H/CSV_historico/","CSV/"):
    st,t,_=get(B+d)
    links=re.findall(r'href="([^"?/][^"]*)"',t)
    out.append(f"## DIR {d} -> {st}: {len(links)}\n"+", ".join(links[-25:]))
Path("data/fuentes_publicas/diagnostico_insivumeh_fuentes.txt").write_text("\n\n".join(out)[:60000],encoding="utf-8")
