(()=>{
'use strict';
// Envolvente de la temporada de "Localidades que pueden afectarse" (14-nov-2026, Gilberto: "sí"). Sólo lectura de
// data/modelo_rubio/envolvente_localidades.json (src/envolvente_localidades.py, con las corridas que publica el modelo, V111ca).
// Se agrega al final del apartado "Modelo Rubio/SegAMH" sin tocar lo demás.
const SRC='../data/modelo_rubio/envolvente_localidades.json';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('es-MX');
const fh=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?new Date(t).toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'s/d'};
let d=null,t=0,ocupado=false;
async function cargar(){if(d&&Date.now()-t<600000)return d;try{const r=await fetch(SRC+'?v='+Date.now(),{cache:'no-store'});if(r.ok){d=await r.json();t=Date.now()}}catch(e){}return d}
async function poner(){
 const root=document.getElementById('modelo-rubio-root');if(!root||ocupado||document.getElementById('envLocRubio')||!root.querySelector('section'))return;ocupado=true;
 try{const D=await cargar();if(!document.getElementById('modelo-rubio-root')||document.getElementById('envLocRubio'))return;
  const s=document.createElement('section');s.className='panel wide';s.id='envLocRubio';
  if(!D){s.innerHTML='<h2>Localidades que pueden afectarse · envolvente de la temporada</h2><p class="muted">Aún sin archivo.</p>'}
  else{const L=D.localidades||[];
   s.innerHTML='<h2>Localidades que pueden afectarse · envolvente de la temporada</h2>'+
    '<p><b>'+fmt(D.n_dentro)+'</b> localidades de Tabasco dentro de la mancha ('+fmt(D.hab_dentro)+' hab., Censo 2020) y <b>'+fmt(D.n_cerca)+'</b> cerca, desde el '+esc(D.temporada_desde)+
    ', en '+fmt(D.corridas_con_localidades)+' corridas publicadas del modelo.</p>'+
    (L.length?'<div class="table-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>Localidad</th><th>Municipio</th><th>Hab.</th><th>Grado</th><th>Peor caso</th><th>Primera vez</th><th>Última vez</th><th>Corridas</th></tr></thead><tbody>'+
     L.slice(0,500).map(e=>{const p=e.peor||{};return '<tr><td>'+esc(e.n)+'</td><td>'+esc(e.mun)+'</td><td>'+fmt(e.pob)+'</td><td>'+(e.dentro?'<b>dentro</b>':'cerca')+'</td><td><small>'+
      (p.extra!=null?'+'+esc(p.extra)+' % · ':'')+esc(p.ref||'')+' '+(p.x!=null?esc(p.x)+' '+esc(p.u||'m'):'')+' · '+(p.t?esc(p.t)+' h':'ahora')+' '+esc(p.esc||'')+'</small></td><td><small>'+fh(e.primera)+'</small></td><td><small>'+fh(e.ultima)+'</small></td><td>'+fmt(e.corridas)+'</td></tr>'}).join('')+'</tbody></table></div>'
     :'<p class="muted">Todavía ninguna corrida publicada trae localidades (la exportación del modelo empezó el 14-nov-2026).</p>')+
    '<p class="muted">'+esc(D.nota||'')+' Fuente: Modelo Hidrológico Grijalva-Usumacinta (cruce nivel → mancha de inundación por radar Sentinel-1 2015-2025 → localidades INEGI 2020).</p>'}
  root.appendChild(s)}finally{ocupado=false}}
document.addEventListener('DOMContentLoaded',()=>{const c=document.getElementById('content');if(c)new MutationObserver(()=>{if(document.getElementById('modelo-rubio-root')&&!document.getElementById('envLocRubio'))poner()}).observe(c,{childList:true,subtree:true})});
})();
