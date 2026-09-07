(() => {
  function dedupeAltoUsumacinta(){
    const groups=[...document.querySelectorAll('.weather-source-groups')];
    for(const group of groups){
      const blocks=[...group.querySelectorAll('[data-unified-alto="1"]')];
      blocks.slice(1).forEach(b=>b.remove());
    }
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(dedupeAltoUsumacinta,1400));
  const root=document.getElementById('content')||document.body;
  if(root)new MutationObserver(dedupeAltoUsumacinta).observe(root,{childList:true,subtree:true});
})();
