(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const hasMm=text=>/^-?\d+(?:\.\d+)?\s*MM$/i.test(String(text||'').trim());
  function invalidStation(text){
    const n=norm(text);
    return /^DATOS DE ESCALAS\b/.test(n) || /^DATOS DE PRECIPITACION\b/.test(n) || /^CAPTACIONES\b/.test(n);
  }
  function clean(root=document){
    root.querySelectorAll?.('.conagua-all').forEach(block=>{
      const h=block.querySelector('h3');
      if(h&&/TODAS LAS ESTACIONES DEL CORTE HORARIO CONAGUA/i.test(h.textContent||'')){
        h.textContent='Estaciones con precipitación estructurada · reporte horario CONAGUA';
        if(!block.querySelector('.conagua-source-note')){
          const p=document.createElement('p');
          p.className='muted conagua-source-note';
          p.textContent='Fuente exclusiva: reporte horario oficial de CONAGUA recibido por correo. No incluye WeatherLink. Se omiten rótulos narrativos y filas sin ningún valor numérico de precipitación.';
          h.insertAdjacentElement('afterend',p);
        }
        block.querySelectorAll('table tbody tr').forEach(tr=>{
          const station=tr.cells?.[0]?.textContent||'';
          const v24=tr.cells?.[1]?.textContent||'';
          const hoy=tr.cells?.[2]?.textContent||'';
          if(invalidStation(station)||(!hasMm(v24)&&!hasMm(hoy)))tr.remove();
        });
      }
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
