(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function clean(){
    if(document.getElementById('pageTitle')?.textContent?.trim()!=='Resumen operativo')return;
    const content=document.getElementById('content');
    if(!content)return;
    content.querySelector('#timeline12h')?.remove();
    [...content.querySelectorAll('.panel')].forEach(panel=>{
      const h=panel.querySelector('h1,h2,h3');
      if(!h)return;
      const t=norm(h.textContent);
      if(t==='orden operativo de sistemas'||t.startsWith('evolucion reciente · ultimas'))panel.remove();
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    clean();
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>requestAnimationFrame(clean)).observe(content,{childList:true,subtree:true});
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(clean,80));
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(clean,700));
  });
})();
