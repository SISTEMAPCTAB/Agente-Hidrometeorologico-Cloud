(()=>{
'use strict';
const PRIMARY_URL='../data/niveles/Estado_Niveles_Cloud.json';
const GMAIL_URL='../data/niveles/Estado_Gmail_Backup.json';
const TZ='America/Mexico_City';
const ACTIVE_MIN=45;
const ALERT_MIN=180;
const START_HOUR=6;
const END_HOUR=20;
const START_GRACE_MIN=45;
let timer=null;
function fmt(v){if(!v)return's/d';const d=new Date(v);if(Number.isNaN(d.getTime()))return's/d';return d.toLocaleString('es-MX',{timeZone:TZ,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});}
function ageMinutes(v){const t=new Date(v).getTime();return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):null;}
function localClock(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const h=Number(parts.find(p=>p.type==='hour')?.value||0);const m=Number(parts.find(p=>p.type==='minute')?.value||0);return{h,m,total:h*60+m};}
function operatingState(){const c=localClock();const start=START_HOUR*60,end=END_HOUR*60;if(c.total<start||c.total>=end)return{mode:'pause',clock:c};if(c.total<start+START_GRACE_MIN)return{mode:'startup',clock:c};return{mode:'active',clock:c};}
function ensureStyle(){if(document.getElementById('niveles-status-guard-style'))return;const s=document.createElement('style');s.id='niveles-status-guard-style';s.textContent='.niveles-agent-state{display:block;margin-top:6px;font-size:12px;line-height:1.25;font-weight:600;color:#5e5e5e}.niveles-agent-state.ok{color:#21623d}.niveles-agent-state.warn{color:#8a5a00}.niveles-agent-state.bad{color:#8b1e2d}.niveles-agent-detail{display:block;margin-top:2px;font-size:11px;font-weight:500;color:#6a6a6a}';document.head.appendChild(s);}
async function fetchJSON(url){const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
function primaryInfo(data){if(!data)return{valid:false,time:null,mins:null};const errors=Array.isArray(data.errors)?data.errors.length:0;const accounts=Array.isArray(data.accounts)?data.accounts:[];const accountOk=accounts.length===0||accounts.some(a=>a&&a.ok===true);const time=data.run_utc||null;const mins=ageMinutes(time);return{valid:data.complete===true&&errors===0&&accountOk&&mins!==null,time,mins,errors,accountOk};}
function gmailInfo(data){if(!data)return{valid:false,time:null,mins:null};const errors=Array.isArray(data.errors)?data.errors.length:0;const time=data.run_local||data.run_utc||null;const mins=ageMinutes(time);return{valid:data.configured===true&&errors===0&&mins!==null,time,mins,errors};}
function paint(primary,gmail){ensureStyle();const strip=document.getElementById('statusStrip');if(!strip)return false;const card=[...strip.querySelectorAll('.status-card')].find(x=>/niveles/i.test(x.querySelector('span')?.textContent||''));if(!card)return false;let line=card.querySelector('.niveles-agent-state');if(!line){line=document.createElement('span');line.className='niveles-agent-state';card.appendChild(line);}let detail=card.querySelector('.niveles-agent-detail');if(!detail){detail=document.createElement('small');detail.className='niveles-agent-detail';card.appendChild(detail);}
const p=primaryInfo(primary),g=gmailInfo(gmail);const candidates=[];if(p.valid)candidates.push({source:'Carbonio',...p});if(g.valid)candidates.push({source:'Gmail',...g});candidates.sort((a,b)=>new Date(b.time)-new Date(a.time));const best=candidates[0]||null;const op=operatingState();
let cls='bad',label='Recolección sin revisión reciente',cloud='GitHub Cloud · revisar niveles';
if(op.mode==='pause'){
  cls='ok';label='Pausa nocturna programada';cloud='GitHub Cloud · niveles en pausa nocturna';
  line.className=`niveles-agent-state ${cls}`;line.textContent=label;
  detail.textContent=best?`Última revisión válida: ${fmt(best.time)} · ${best.source}${best.source==='Gmail'?' (respaldo)':''} · reanuda 06:00`:'Recolección pausada · reanuda automáticamente a las 06:00';
  const cloudEl=document.getElementById('cloudState');if(cloudEl)cloudEl.textContent=cloud;return true;
}
if(op.mode==='startup'){
  cls='warn';label='Reanudando recolección · ventana operativa';cloud='GitHub Cloud · iniciando niveles';
  line.className=`niveles-agent-state ${cls}`;line.textContent=label;
  detail.textContent=best?`Última revisión válida: ${fmt(best.time)} · ${best.source}${best.source==='Gmail'?' (respaldo)':''} · margen de arranque hasta 06:45`:'Ventana iniciada a las 06:00 · esperando primera revisión válida';
  const cloudEl=document.getElementById('cloudState');if(cloudEl)cloudEl.textContent=cloud;return true;
}
const primaryFresh=p.valid&&p.mins<=ACTIVE_MIN;const gmailFresh=g.valid&&g.mins<=ACTIVE_MIN;const gmailTakingOver=g.valid&&(!p.valid||p.mins>ACTIVE_MIN)&&g.mins<=ALERT_MIN;
if(primaryFresh){cls='ok';label='Recolección activa';cloud='GitHub Cloud · niveles activos';}
else if(gmailFresh){cls='ok';label='Recolección operativa · respaldo Gmail activo';cloud='GitHub Cloud · respaldo Gmail activo';}
else if(best&&best.mins<=ALERT_MIN){cls='ok';label=gmailTakingOver?'Recolección operativa · respaldo Gmail activo':'Recolección operativa · sin nuevo boletín';cloud='GitHub Cloud · niveles operativos';}
else if(best){cls='bad';label='Recolección sin revisión reciente';cloud='GitHub Cloud · revisar niveles';}
else{cls='bad';label='Recolección sin ruta válida';cloud='GitHub Cloud · revisar niveles';}
line.className=`niveles-agent-state ${cls}`;line.textContent=label;
if(best){detail.textContent=`Última revisión válida: ${fmt(best.time)} · hace ${best.mins} min · ${best.source}${best.source==='Gmail'?' (respaldo)':''}`;}else{const parts=[];if(primary?.run_utc)parts.push(`Carbonio ${fmt(primary.run_utc)}`);if(gmail?.run_local)parts.push(`Gmail ${fmt(gmail.run_local)}`);detail.textContent=parts.length?`Sin ruta válida reciente · ${parts.join(' · ')}`:'Estado de recolección no disponible';}
const cloudEl=document.getElementById('cloudState');if(cloudEl)cloudEl.textContent=cloud;return true;}
async function refresh(){const [pr,gr]=await Promise.allSettled([fetchJSON(PRIMARY_URL),fetchJSON(GMAIL_URL)]);const primary=pr.status==='fulfilled'?pr.value:null;const gmail=gr.status==='fulfilled'?gr.value:null;if(!paint(primary,gmail))setTimeout(()=>paint(primary,gmail),700);}
function start(){refresh().catch(e=>console.warn('Estado combinado de niveles no disponible',e));clearInterval(timer);timer=setInterval(()=>refresh().catch(()=>{}),60000);document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(()=>refresh().catch(()=>{}),900));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
