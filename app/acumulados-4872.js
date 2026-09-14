(() => {
  const URL='../data/fuentes_publicas/acumulados_4872.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const fmt=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?'s/d':`${Number(v).toFixed(1)} mm`;

  async function load(){
    try{
      const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
      return r.ok?await r.json():null;
    }catch(e){return null;}
  }

  function findTable(){
    const blocks=[...document.querySelectorAll('[data-unified-alto="1"]')];
    for(const b of blocks){
      const h=norm(b.querySelector('h3')?.textContent);
      if(h.includes('alto usumacinta')) return b.querySelector('table');
    }
    return null;
  }

  function apply(doc){
    const t=findTable();
    if(!t||!doc)return false;
    const byName=new Map((doc.insivumeh||[]).map(x=>[norm(x.estacion),x]));
    for(const tr of [...t.querySelectorAll('tbody tr')]){
      const td=[...tr.querySelectorAll('td')];
      if(td.length<8)continue;
      const name=norm(td[0].textContent);
      let row=byName.get(name);
      if(name==='lacantun')row=doc.lacantun||null;
      if(!row)continue;
      td[6].textContent=fmt(row.precipitacion_48h_mm);
      td[7].textContent=fmt(row.precipitacion_72h_mm);
    }
    return true;
  }

  let cache=null;
  let loading=false;
  async function run(){
    if(loading)return;
    loading=true;
    try{
      cache=await load()||cache;
      if(cache)apply(cache);
    }finally{loading=false;}
  }

  function refresh(){cache=null;setTimeout(run,900)}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(run,1500));
  document.getElementById('nav')?.addEventListener('click',()=>setTimeout(run,1000));
  document.getElementById('refreshBtn')?.addEventListener('click',refresh);
  const c=document.getElementById('content')||document.body;
  new MutationObserver(()=>{if(cache)apply(cache)}).observe(c,{childList:true,subtree:true});
})();
