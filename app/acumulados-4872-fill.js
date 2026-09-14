(() => {
  const URL='../data/fuentes_publicas/acumulados_4872.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const fmt=v=>`${Number(v).toFixed(1)} mm`;

  async function getData(){
    const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`acumulados 48/72 HTTP ${r.status}`);
    return r.json();
  }

  function findAltoTable(){
    const blocks=[...document.querySelectorAll('[data-unified-alto="1"], .alto-usu')];
    for(const b of blocks){
      const h=(b.querySelector('h3')?.textContent||'');
      if(/alto\s+usumacinta/i.test(h))return b.querySelector('table');
    }
    return null;
  }

  function rowByName(table,name){
    return [...table.querySelectorAll('tbody tr')].find(tr=>norm(tr.cells?.[0]?.textContent)===norm(name))||null;
  }

  function set4872(row,v48,v72){
    if(!row||row.cells.length<8)return;
    row.cells[6].textContent=n(v48)===null?'s/d':fmt(v48);
    row.cells[7].textContent=n(v72)===null?'s/d':fmt(v72);
  }

  async function fill(){
    const table=findAltoTable();
    if(!table)return;
    try{
      const data=await getData();
      for(const x of (data.insivumeh||[])){
        const row=rowByName(table,x.estacion);
        set4872(row,x.precipitacion_48h_mm,x.precipitacion_72h_mm);
      }
      const lac=data.lacantun||{};
      set4872(rowByName(table,'Lacantún'),lac.precipitacion_48h_mm,lac.precipitacion_72h_mm);
      table.dataset.accum4872='1';
    }catch(e){
      // Si el producto derivado falla, no altera la tabla base ni otros módulos.
    }
  }

  function schedule(){setTimeout(fill,250);setTimeout(fill,1000);}
  document.addEventListener('DOMContentLoaded',schedule);
  document.getElementById('nav')?.addEventListener('click',schedule);
  document.getElementById('refreshBtn')?.addEventListener('click',schedule);
  const root=document.getElementById('content')||document.body;
  new MutationObserver(()=>{const t=findAltoTable();if(t&&!t.dataset.accum4872)schedule();}).observe(root,{childList:true,subtree:true});
})();
