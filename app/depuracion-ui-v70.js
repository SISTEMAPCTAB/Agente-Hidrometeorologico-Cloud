(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let cleaning=false;

  function removeLegacyGovernorPanel(root=document){
    root.querySelectorAll('h1,h2,h3,h4,strong').forEach(h=>{
      const t=norm(h.textContent);
      if(!t.includes('estaciones que gobiernan el semaforo de lluvia')) return;
      const panel=h.closest('section,.panel,.wide')||h.parentElement;
      if(panel && panel.id!=='riverBasinSemaphore') panel.remove();
    });
  }

  function simplifyRiverSemaphore(root=document){
    const panel=root.querySelector('#riverBasinSemaphore');
    if(!panel)return;
    panel.querySelector('.lowflow-legend')?.remove();
    panel.querySelectorAll('.river-basin-card').forEach(card=>{
      card.querySelector('.lowflow-note')?.remove();
      const row=card.querySelector('.lowflow-row');
      if(row){
        [...row.children].forEach(el=>{
          const active=el.classList.contains('signal-cafe')||el.classList.contains('signal-gris-bajo')||el.classList.contains('signal-negro');
          if(!active)el.remove();
        });
        if(!row.children.length)row.remove();
      }
      card.querySelectorAll('small').forEach(s=>{
        const t=norm(s.textContent);
        if(t.includes('color de lluvia gobernado')||t.includes('gris del semaforo de lluvia'))s.remove();
      });
      const list=card.querySelector('ul');
      if(list){
        const items=[...list.querySelectorAll('li')];
        items.slice(2).forEach(x=>x.remove());
      }
    });
    panel.querySelectorAll('.section-note').forEach(n=>n.remove());
  }

  function simplifyEstiaje(root=document){
    const panel=root.querySelector('#estiajePanel');
    if(!panel)return;
    panel.querySelector('.estiaje-legend')?.remove();
    panel.querySelectorAll('.estiaje-card').forEach(card=>{
      const active=card.querySelector('.signal-cafe,.signal-gris-bajo,.signal-negro');
      if(!active)card.remove();
      else{
        card.querySelectorAll('p,small').forEach(x=>x.remove());
        card.querySelectorAll('.river-signal.nodata,.river-signal.signal-azul').forEach(x=>x.remove());
      }
    });
    panel.querySelector('.section-note')?.remove();
    if(!panel.querySelector('.estiaje-card'))panel.remove();
  }

  function removeVerboseMethod(root=document){
    root.querySelectorAll('.op-method,.trace-strip,.graph-priority-method').forEach(el=>el.remove());
  }

  function clean(){
    if(cleaning)return;
    cleaning=true;
    try{
      const root=document.getElementById('content')||document;
      removeLegacyGovernorPanel(root);
      simplifyRiverSemaphore(root);
      simplifyEstiaje(root);
      removeVerboseMethod(root);
    }finally{cleaning=false;}
  }

  function topNow(){
    window.scrollTo(0,0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    clean();
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>requestAnimationFrame(clean)).observe(content,{childList:true,subtree:true});
    document.getElementById('nav')?.addEventListener('click',()=>{
      topNow();
      setTimeout(()=>{clean();topNow();},80);
      setTimeout(()=>{clean();topNow();},350);
    });
  });
})();