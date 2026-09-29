(()=>{
'use strict';
const URL='../data/fuentes_publicas/insivumeh_alto_hidro_historico.json';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stations=[['El Tigre','Usumacinta'],['El Porvenir','La Pasión']];
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
function chart(rows,name,river){
 const observations=[];
 for(const r of rows){
  const m=String(r.fecha||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m)continue;
  const time=String(r.hora||'').match(/(\d{1,2}):(\d{2})/);
  if(!time)continue;
  const date=new Date(Date.UTC(+m[3],+m[2]-1,+m[1],+time[1],+time[2]));
  const st=(r.estaciones||[]).find(x=>norm(x.estacion)===norm(name)&&x.estado_dato==='observado'&&valid(x.nivel_instantaneo_m));
  if(st&&Number.isFinite(+date))observations.push({date,value:Number(st.nivel_instantaneo_m),max:valid(st.nivel_referencia_max_m)?Number(st.nivel_referencia_max_m):null});
 }
 const unique=[...new Map(observations.map(x=>[x.date.toISOString(),x])).values()].sort((a,b)=>a.date-b.date).slice(-60);
 if(unique.length<2)return '<p class="muted">Pendiente de dos cortes oficiales independientes y verificados.</p>';
 const vals=unique.map(x=>x.value),lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max(.05,(hi-lo)*.18,.12);
 const low=lo-pad,high=hi+pad,W=Math.max(760,unique.length*58+80),L=58,R=22,T=42,B=52,H=340;
 const x=d=>L+(d-unique[0].date)/(unique.at(-1).date-unique[0].date||1)*(W-L-R);
 const y=v=>T+(high-v)/(high-low)*(H-T-B);
 const max=unique.at(-1).max;
 const ref=max===null?'':max>=low&&max<=high?'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(max)+'" y2="'+y(max)+'" stroke="#7a1230" stroke-width="2" stroke-dasharray="8 5"/><text x="'+(L+6)+'" y="'+(y(max)-5)+'" fill="#7a1230" font-size="12" font-weight="700">Máximo de referencia '+max.toFixed(2)+' m</text>':'<line x1="'+L+'" x2="'+(W-R)+'" y1="54" y2="54" stroke="#7a1230" stroke-width="2" stroke-dasharray="8 5"/><text x="'+(L+6)+'" y="48" fill="#7a1230" font-size="11" font-weight="700">Máximo de referencia '+max.toFixed(2)+' m · fuera de escala</text>';
 const grid=[0,.25,.5,.75,1].map(t=>{let yy=T+t*(H-T-B);return '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'" stroke="#ddd"/><text x="'+(L-7)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11">'+(high-t*(high-low)).toFixed(2)+'</text>'}).join('');
 const points=unique.map(o=>x(o.date).toFixed(1)+','+y(o.value).toFixed(1)).join(' ');
 const dots=unique.map(o=>'<circle cx="'+x(o.date)+'" cy="'+y(o.value)+'" r="4" fill="#1f77b4"><title>'+o.date.toLocaleString('es-MX',{timeZone:'America/Mexico_City'})+' · '+o.value.toFixed(2)+' m</title></circle>').join('');
 const labels=unique.map(o=>'<text x="'+x(o.date)+'" y="'+(H-16)+'" text-anchor="middle" font-size="10">'+o.date.toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit'})+'</text>').join('');
 return '<div class="hydro48-scroll"><svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolución '+esc(name)+'">'+grid+ref+'<polyline points="'+points+'" fill="none" stroke="#1f77b4" stroke-width="3"/>'+dots+labels+'</svg></div><div class="hydro48-foot">Último nivel '+unique.at(-1).value.toFixed(2)+' m · Máximo estadístico de referencia, no NAMO ni umbral de inundación.</div>';
}
let running=false;
async function render(){
 if(running||document.querySelector('#nav button.active')?.dataset.section!=='usumacinta')return;
 const panel=document.getElementById('hydro48Panel');if(!panel)return;
 running=true;
 try{
  const response=await fetch(URL+'?v='+Date.now(),{cache:'no-store'});if(!response.ok)return;
  const data=await response.json();
  if(!panel.isConnected)return;
  let grid=panel.querySelector('.hydro48-grid');if(!grid)return;
  grid.querySelectorAll('[data-guatemala-chart]').forEach(x=>x.remove());
  const frag=document.createDocumentFragment();
  for(const [name,river] of stations){
   const card=document.createElement('div');card.className='hydro48-card';card.dataset.guatemalaChart=name;
   card.innerHTML='<div class="hydro48-head"><div><strong>'+esc(name)+'</strong><span>'+esc(river)+' · INSIVUMEH</span></div></div>'+chart(data.registros||[],name,river);
   frag.appendChild(card);
  }
  grid.prepend(frag);
 }catch(e){console.warn('Gráficas INSIVUMEH:',e)}finally{running=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 const content=document.getElementById('content');let timer;
 new MutationObserver(()=>{if(document.querySelector('#nav button.active')?.dataset.section!=='usumacinta')return;clearTimeout(timer);timer=setTimeout(()=>{if(!document.querySelector('[data-guatemala-chart]'))render()},350)}).observe(content,{childList:true,subtree:true});
 document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,1100));
 document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(render,1300));
 setTimeout(render,1300);
});
})();