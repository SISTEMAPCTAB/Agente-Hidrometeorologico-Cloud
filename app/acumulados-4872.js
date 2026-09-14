(() => {
  const URL='../data/fuentes_publicas/acumulados_4872.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const fmt=v=>valid(v)?`${Number(v).toFixed(1)} mm`:'s/d';

  let cache=null;
  let loading=false;
  let timer=null;

  async function load(){
    try{
      const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
      return r.ok?await r.json():null;
    }catch(e){return null;}
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
    if(!t||!doc)return false;
    const byName=new Map((doc.insivumeh||[]).map(x=>[norm(x.estacion),x]));
    let changed=0;
    for(const tr of [...t.querySelectorAll('tbody tr')]){
      const td=[...tr.querySelectorAll('td')];
      if(td.length<8)continue;
      const name=norm(td[0].textContent);
      let row=byName.get(name);
      if(name==='lacantun')row=doc.lacantun||null;
      if(!row)continue;
      const v48=fmt(row.precipitacion_48h_mm);
      const v72=fmt(row.precipitacion_72h_mm);
      if(td[6].textContent.trim()!==v48){td[6].textContent=v48;changed++;}
      if(td[7].textContent.trim()!==v72){td[7].textContent=v72;changed++;}
      tr.dataset.accum4872='1';
    }
    t.dataset.accum4872='1';
    return changed>0;
  }

  async function ensure(forceReload=false){
    if(loading)return;
    loading=true;
    try{
      if(forceReload||!cache)cache=await load()||cache;
      if(cache){
        apply(cache);
        setTimeout(()=>apply(cache),250);
        setTimeout(()=>apply(cache),800);
        setTimeout(()=>apply(cache),1600);
      }
    }finally{loading=false;}
  }

  function schedule(forceReload=false){
    clearTimeout(timer);
    timer=setTimeout(()=>ensure(forceReload),120);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>ensure(true),1200);
  });

  document.getElementById('nav')?.addEventListener('click',()=>setTimeout(()=>ensure(false),900));
  document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(()=>ensure(true),900));

  const root=document.getElementById('content')||document.body;
  new MutationObserver(()=>{
    const t=findTable();
    if(t){
      if(cache)apply(cache);
      else schedule(false);
    }
  }).observe(root,{childList:true,subtree:true,characterData:true});

  // Red de seguridad contra renders tardíos de otros módulos.
  setInterval(()=>{if(cache&&findTable())apply(cache);},2000);
})();
