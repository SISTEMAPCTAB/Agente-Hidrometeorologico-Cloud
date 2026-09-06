(() => {
  function fixSvg(svg){
    const labels=[...svg.querySelectorAll('text')].filter(t=>/fuera de escala/i.test(t.textContent||''));
    if(labels.length<2)return;
    const groups=[];
    for(const t of labels){
      const y=Number(t.getAttribute('y'));
      if(!Number.isFinite(y))continue;
      let g=groups.find(x=>Math.abs(x.y-y)<1);
      if(!g){g={y,items:[]};groups.push(g)}
      g.items.push(t);
    }
    for(const g of groups){
      if(g.items.length<2)continue;
      g.items.forEach((t,i)=>{
        const newY=g.y+i*16;
        t.setAttribute('y',String(newY));
        const line=t.previousElementSibling;
        if(line?.tagName?.toLowerCase()==='line'){
          const lineY=newY+5;
          line.setAttribute('y1',String(lineY));
          line.setAttribute('y2',String(lineY));
        }
      });
    }
  }
  function fixAll(root=document){
    root.querySelectorAll?.('.hydro48-card svg').forEach(fixSvg);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    fixAll();
    setTimeout(fixAll,1000);
    const target=document.getElementById('content')||document.body;
    new MutationObserver(()=>fixAll(target)).observe(target,{childList:true,subtree:true});
  });
})();
