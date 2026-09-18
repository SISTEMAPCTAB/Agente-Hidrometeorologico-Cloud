(() => {
  const URL='../data/weatherlink/latest.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let cache=null,loading=null;

  async function load(){
    if(cache)return cache;
    if(loading)return loading;
    loading=fetch(URL,{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(j=>{
      cache=j; return j;
    }).catch(()=>null).finally(()=>{loading=null});
    return loading;
  }

  function fmt(v){return Number.isFinite(Number(v))?Number(v).toFixed(1)+' mm':'s/d'}

  async function apply(){
    const j=await load(); if(!j?.stations)return;
    const map=new Map(j.stations.map(x=>[norm(x.nombre),x]));
    document.querySelectorAll('#content table').forEach(table=>{
      const hs=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
      const stIdx=hs.findIndex(h=>h==='estacion');
      const h24=hs.findIndex(h=>h.includes('24 h'));
      const h48=hs.findIndex(h=>h.includes('48 h'));
      const qIdx=hs.findIndex(h=>h==='calidad');
      if(stIdx<0||(h24<0&&h48<0))return;
      [...table.querySelectorAll('tbody tr')].forEach(tr=>{
        const w=map.get(norm(tr.cells[stIdx]?.textContent));
        if(!w)return;
        const a=w.accumulations_mm||{}, s=w.accumulation_status||{};
        if(h24>=0&&a['24']!==undefined&&a['24']!==null){
          tr.cells[h24].textContent=(s['24']==='minimo_observado'?'≥ ':'')+fmt(a['24']);
        }
        if(h48>=0&&a['48']!==undefined&&a['48']!==null){
          tr.cells[h48].textContent=(s['48']==='minimo_observado'?'≥ ':'')+fmt(a['48']);
        }
        if(qIdx>=0&&Object.values(s).includes('minimo_observado')){
          const current=tr.cells[qIdx].textContent||'';
          if(!/mínimo observado/i.test(current)) tr.cells[qIdx].textContent=current+' · mínimo observado por cruce de medianoche';
        }
      });
    });
  }

  function schedule(){setTimeout(apply,120);setTimeout(apply,700);setTimeout(apply,1600)}
  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    document.getElementById('nav')?.addEventListener('click',schedule);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{cache=null;schedule()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){cache=null;schedule()}});
    new MutationObserver(()=>setTimeout(apply,80)).observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  });
})();