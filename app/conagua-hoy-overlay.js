(()=>{
'use strict';
const URL='../data/niveles/Lluvia_CONAGUA/ultimo_corte.json';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
let cache=null,loading=null,timer=null;

async function data(force=false){
  if(!force&&cache)return cache;
  if(loading)return loading;
  loading=fetch(URL+'?v='+Date.now(),{cache:'no-store'})
    .then(r=>r.ok?r.json():[])
    .then(rows=>{cache=Array.isArray(rows)?rows:[];return cache})
    .catch(()=>[])
    .finally(()=>{loading=null});
  return loading;
}

function latestByStation(rows){
  const map=new Map();
  for(const r of rows){
    const k=norm(r.estacion);
    if(!k)continue;
    const prev=map.get(k);
    if(!prev||new Date(r.fecha_hora)>new Date(prev.fecha_hora))map.set(k,r);
  }
  return map;
}

async function apply(force=false){
  const content=document.getElementById('content');
  if(!content)return;
  const rows=await data(force), by=latestByStation(rows);
  const sections=[...content.querySelectorAll('section.panel.wide')].filter(s=>/lluvia observada/i.test(s.querySelector('h2')?.textContent||''));
  for(const sec of sections){
    const table=sec.querySelector('table');
    if(!table)continue;
    const head=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const stationIdx=head.findIndex(x=>x==='estacion');
    const sourceIdx=head.findIndex(x=>x==='fuente');
    if(stationIdx<0||sourceIdx<0)continue;

    let todayIdx=head.findIndex(x=>x==='hoy desde 08:00'||x==='hoy');
    if(todayIdx<0){
      const th=document.createElement('th');
      th.textContent='HOY desde 08:00';
      const sourceTh=table.querySelectorAll('thead th')[sourceIdx];
      sourceTh.parentNode.insertBefore(th,sourceTh.nextSibling);
      todayIdx=sourceIdx+1;
    }

    for(const tr of table.querySelectorAll('tbody tr')){
      if(tr.cells.length<=stationIdx)continue;
      const station=norm(tr.cells[stationIdx]?.textContent);
      const source=norm(tr.cells[sourceIdx]?.textContent);
      let cell=tr.cells[todayIdx];
      if(!cell){
        cell=document.createElement('td');
        const ref=tr.cells[sourceIdx];
        ref.parentNode.insertBefore(cell,ref.nextSibling);
      }
      if(source.includes('conagua')){
        const r=by.get(station);
        cell.textContent=r&&finite(r.lluvia_hoy_desde_08_mm)?Number(r.lluvia_hoy_desde_08_mm).toFixed(1)+' mm':'s/d';
      }else{
        cell.textContent='—';
      }
    }
    const h=sec.querySelector('h2');
    if(h&&/24 y 48 h/i.test(h.textContent))h.textContent='Lluvia observada · HOY, 24 y 48 h';
  }
}

function schedule(force=false,delay=120){
  clearTimeout(timer);
  timer=setTimeout(()=>apply(force),delay);
}
document.addEventListener('DOMContentLoaded',()=>{
  const c=document.getElementById('content');
  c?.addEventListener('app-rendered',()=>schedule(false,80));
  document.getElementById('nav')?.addEventListener('click',()=>schedule(false,140));
  document.getElementById('refreshBtn')?.addEventListener('click',()=>{cache=null;schedule(true,250)});
  new MutationObserver(()=>schedule(false,100)).observe(c||document.body,{childList:true,subtree:true});
  schedule(false,400);
});
})();