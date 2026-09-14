(() => {
  const URL='../data/fuentes_publicas/acumulados_4872.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const fmt=v=>valid(v)?`${Number(v).toFixed(1)} mm`:'s/d';

  let cache=null;
  let loading=false;

  async function load(force=false){
    if(loading)return cache;
    loading=true;
    try{
      if(cache&&!force)return cache;
      const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
      if(r.ok)cache=await r.json();
    }catch(e){/* respaldo visual: no altera el resto de la app */}
    finally{loading=false;}
    return cache;
  }

  function findTable(){
    const blocks=[...document.querySelectorAll('[data-unified-alto="1"], .alto-usu')];
    for(const b of blocks){
      const h=norm(b.querySelector('h3')?.textContent);
      if(h.includes('alto usumacinta'))return b.querySelector('table');
    }
    return null;
  }

  function apply(doc){
    const t=findTable();
    if(!t||!doc)return;
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
  }

  async function refresh(force=false){
    const doc=await load(force);
    if(!doc)return;
    // Reintentos finitos para esperar el render de Alto Usumacinta.
    [0,500,1200,2200].forEach(ms=>setTimeout(()=>apply(doc),ms));
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>refresh(true),1400));
  document.getElementById('nav')?.addEventListener('click',()=>setTimeout(()=>refresh(false),900));
  document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(()=>refresh(true),900));
})();
