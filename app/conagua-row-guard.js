(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  function invalidStation(text){
    const n=norm(text);
    return /^DATOS DE ESCALAS\b/.test(n) || /^DATOS DE PRECIPITACION\b/.test(n);
  }
  function clean(root=document){
    root.querySelectorAll?.('.conagua-all table tbody tr').forEach(tr=>{
      const station=tr.cells?.[0]?.textContent||'';
      if(invalidStation(station))tr.remove();
    });
  }
  let pending=false;
  function schedule(root=document){
    if(pending)return;
    pending=true;
    requestAnimationFrame(()=>{pending=false;clean(root)});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    const target=document.getElementById('content')||document.body;
    new MutationObserver(()=>schedule(target)).observe(target,{childList:true,subtree:true});
  });
})();
