(() => {
  function currentSection(){
    return document.querySelector('#nav button.active')?.dataset.section || 'resumen';
  }
  function enforce(){
    if(currentSection()==='resumen'){
      document.getElementById('hydro48Panel')?.remove();
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    enforce();
    setTimeout(enforce,900);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(enforce,700));
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(enforce,1100));
    const target=document.getElementById('content')||document.body;
    new MutationObserver(enforce).observe(target,{childList:true,subtree:true});
  });
})();
