(() => {
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function sectionFromCard(card){
    const t=norm(card.querySelector('.system-card-head strong')?.textContent);
    if(t.includes('presas')||t.includes('samaria')||t.includes('carrizal'))return 'presas';
    if(t.includes('serranos')||t.includes('grijalva'))return 'serranos';
    if(t.includes('tulija')||t.includes('puxcatan')||t.includes('chilapa'))return 'tulija';
    if(t.includes('usumacinta'))return 'usumacinta';
    return null;
  }
  function decorate(){
    document.querySelectorAll('#systemSemaphoreStrip .system-card').forEach(card=>{
      const id=sectionFromCard(card);
      if(!id)return;
      card.dataset.section=id;
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label',`Abrir detalle operativo de ${card.querySelector('.system-card-head strong')?.textContent||id}`);
      if(!card.querySelector('.system-card-cta')){
        const cta=document.createElement('div');
        cta.className='system-card-cta';
        cta.innerHTML='<span>Ver detalle operativo</span><b aria-hidden="true">→</b>';
        card.appendChild(cta);
      }
    });
  }
  function goTop(){
    window.scrollTo(0,0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  }
  function openSection(id){
    const btn=document.querySelector(`#nav button[data-section="${id}"]`);
    if(!btn)return;
    goTop();
    btn.click();
    goTop();
    [40,120,350,700].forEach(ms=>window.setTimeout(()=>{
      goTop();
      const content=document.getElementById('content');
      if(content&&ms===120){content.classList.add('detail-arrival');window.setTimeout(()=>content.classList.remove('detail-arrival'),700);}
    },ms));
  }
  function activate(card,e){
    if(!card)return;
    if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
    if(e.type==='keydown')e.preventDefault();
    openSection(card.dataset.section||sectionFromCard(card));
  }
  document.addEventListener('click',e=>activate(e.target.closest('#systemSemaphoreStrip .system-card'),e));
  document.addEventListener('keydown',e=>activate(e.target.closest('#systemSemaphoreStrip .system-card'),e));
  document.addEventListener('DOMContentLoaded',()=>{
    decorate();
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>decorate()).observe(content,{childList:true,subtree:true});
  });
})();