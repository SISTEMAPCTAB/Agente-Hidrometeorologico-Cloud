import re, requests
from pathlib import Path
UA={"User-Agent":"Mozilla/5.0 Agente-Hidrometeorologico-Cloud/1.0"}
B="https://insivumeh.gob.gt/img/"
out=[]
def get(u):
    try:
        r=requests.get(u,headers=UA,timeout=30); return r.status_code,r.text
    except Exception as e: return "ERR "+str(e),""
def plano(t): return re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",re.sub(r"<style.*?</style>|<script.*?</script>","",t,flags=re.S|re.I)))
# 1) dashboard crudo
st,t=get(B+"Estaciones_Met/output_dashboard/INS142201AT.html")
out.append(f"## DASH crudo {st}\n"+re.sub(r"<style.*?</style>","",t,flags=re.S)[:4500])
# 2) directorios
for d in ("","Estaciones_Met/","MAPAS_24H/","MAPAS_24H/Sin_Lluvia/","MAPAS_24H/Con_Lluvia/","estaciones_automaticas_met/"):
    st,t=get(B+d)
    links=re.findall(r'href="([^"?][^"]*)"',t)
    out.append(f"## DIR {d or '/'} -> {st}: {len(links)} enlaces\n"+"\n".join(l for l in links if not l.startswith(("/","?")))[:3500])
Path("data/fuentes_publicas/diagnostico_insivumeh_fuentes.txt").write_text("\n\n".join(out)[:45000],encoding="utf-8")
