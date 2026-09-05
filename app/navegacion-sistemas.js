(() => {
  const IDS=['presas','serranos','tulija','usumacinta'];
  function decorate(){
    const cards=document.querySelectorAll('#systemSemaphoreStrip .system-card');
    cards.forEach((card,i)=>{
      const id=IDS[i]||null;
      if(!id||card.dataset.navReady==='1')return;
      card.dataset.navReady='1';
      card.dataset.section=id;
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label',`Abrir detalle operativo de ${card.querySelector('.system-card-head strong')?.textContent||id}`);
      const cta=document.createElement('div');
      cta.className='system-card-cta';
      cta.innerHTML='<span>Ver detalle operativo</span><b aria-hidden="true">→</b>';
      card.appendChild(cta);
    });
  }
  function openSection(id){
    const btn=document.querySelector(`#nav button[data-section="${id}"]`);
    if(!btn)return;
    btn.click();
    window.setTimeout(()=>{
      document.querySelector('.main')?.scrollTo?.({top:0,behavior:'smooth'});
      window.scrollTo({top:0,behavior:'smooth'});
      const content=document.getElementById('content');
      if(content){content.classList.add('detail-arrival');window.setTimeout(()=>content.classList.remove('detail-arrival'),900);}
    },40);
  }
  function activate(card,e){
    if(!card)return;
    if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
    if(e.type==='keydown')e.preventDefault();
    openSection(card.dataset.section);
  }
  document.addEventListener('click',e=>activate(e.target.closest('#systemSemaphoreStrip .system-card'),e));
  document.addEventListener('keydown',e=>activate(e.target.closest('#systemSemaphoreStrip .system-card'),e));
  document.addEventListener('DOMContentLoaded',()=>{
    decorate();
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>decorate()).observe(content,{childList:true,subtree:true});
  });
})();