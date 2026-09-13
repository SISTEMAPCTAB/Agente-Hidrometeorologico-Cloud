(() => {
  const URL='../data/niveles/Lluvia_CONAGUA/ultimo_corte.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  let byStation=new Map();
  let loading=null;
  let applying=false;
  let scheduled=false;

  async function load(){
    if(loading)return loading;
    loading=(async()=>{
      try{
        const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
        if(!r.ok)throw new Error(String(r.status));
        const rows=await r.json();
        byStation=new Map((Array.isArray(rows)?rows:[]).map(x=>[norm(x.estacion),x]));
      }catch(e){
        console.warn('CONAGUA 48 h no disponible',e);
      }finally{loading=null}
    })();
    return loading;
  }

  function setText(cell,value){
    if(cell && cell.textContent!==value)cell.textContent=value;
  }

  function apply(){
    if(applying||!byStation.size)return;
    applying=true;
    try{
      document.querySelectorAll('#content table').forEach(table=>{
        const th=[...table.querySelectorAll('thead th')].map(x=>norm(x.textContent));
        const stationIdx=th.findIndex(x=>x==='estacion');
        const sourceIdx=th.findIndex(x=>x==='fuente');
        const h48Idx=th.findIndex(x=>x==='48 h anteriores');
        const qualityIdx=th.findIndex(x=>x==='calidad');
        if(stationIdx<0||sourceIdx<0||h48Idx<0)return;
        [...table.querySelectorAll('tbody tr')].forEach(tr=>{
          if(norm(tr.cells[sourceIdx]?.textContent)!=='conagua')return;
          const data=byStation.get(norm(tr.cells[stationIdx]?.textContent));
          if(!data)return;
          const cell=tr.cells[h48Idx];
          if(!cell)return;
          if(norm(data.estado_48h)==='observado'&&finite(data.lluvia_48h_precedentes_mm)){
            const value=`${Number(data.lluvia_48h_precedentes_mm).toFixed(1)} mm`;
            setText(cell,value);
            if(cell.dataset.source!=='conagua-historico')cell.dataset.source='conagua-historico';
            if(qualityIdx>=0&&tr.cells[qualityIdx]&&!/48 h histórico/i.test(tr.cells[qualityIdx].textContent)){
              setText(tr.cells[qualityIdx],`${tr.cells[qualityIdx].textContent||'observado'} · 48 h histórico`);
            }
          }else{
            setText(cell,'s/d');
            if(cell.dataset.source)delete cell.dataset.source;
          }
        });
      });
    }finally{applying=false}
  }

  function scheduleApply(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      apply();
    });
  }

  async function refresh(){await load();scheduleApply()}

  document.addEventListener('DOMContentLoaded',()=>{
    refresh();
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(refresh,700));
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(scheduleApply,500));
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>scheduleApply()).observe(content,{childList:true,subtree:true});
  });
})();
