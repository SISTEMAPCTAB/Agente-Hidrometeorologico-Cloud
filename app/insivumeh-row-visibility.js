(() => {
  const TARGETS=new Set(['el tigre','el porvenir','bethel','machaquila','mactun','chixoy hidro']);
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let busy=false;

  function prune(){
    if(busy)return;
    busy=true;
    try{
      const block=document.querySelector('[data-unified-alto="1"]');
      if(!block)return;
      for(const tr of [...block.querySelectorAll('tbody tr')]){
        const td=tr.querySelectorAll('td');
        if(td.length<13)continue;
        const station=norm(td[0].textContent);
        const source=norm(td[1].textContent);
        if(source!=='insivumeh'||!TARGETS.has(station))continue;

        // Sólo se conserva en la vista operativa si existe dato reciente:
        // Hoy, 1 h, 6 h, 24 h, 48 h, 72 h, semanal o mensual.
        // Un acumulado estacional aislado no justifica mantener una fila llena de s/d.
        const recentCols=[2,3,4,5,6,7,8,9];
        const hasRecent=recentCols.some(i=>{
          const v=norm(td[i]?.textContent);
          return v&&v!=='s/d'&&v!=='sin dato';
        });
        if(!hasRecent)tr.remove();
      }
    } finally {busy=false;}
  }

  function schedule(){[0,250,700,1400,2600,5000].forEach(ms=>setTimeout(prune,ms));}
  document.addEventListener('DOMContentLoaded',schedule);
  document.getElementById('refreshBtn')?.addEventListener('click',schedule);
  document.getElementById('nav')?.addEventListener('click',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  const target=document.getElementById('content')||document.body;
  new MutationObserver(schedule).observe(target,{childList:true,subtree:true});
})();
