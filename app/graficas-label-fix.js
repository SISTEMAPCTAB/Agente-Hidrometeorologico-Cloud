(() => {
  function moveReferenceLabel(t,newY){
    t.setAttribute('y',String(newY));
    const line=t.previousElementSibling;
    if(line?.tagName?.toLowerCase()==='line'){
      const lineY=newY+5;
      line.setAttribute('y1',String(lineY));
      line.setAttribute('y2',String(lineY));
    }
  }
  function referenceValue(t){
    const m=String(t.textContent||'').match(/\b(?:NAME|NAMO)\s+(-?\d+(?:\.\d+)?)/i);
    return m?Number(m[1]):null;
  }
  function fixSvg(svg){
    const labels=[...svg.querySelectorAll('text')].filter(t=>/\b(?:NAME|NAMO)\b.*fuera de escala/i.test(t.textContent||''));
    if(labels.length<2)return;
    const ys=labels.map(t=>Number(t.getAttribute('y'))).filter(Number.isFinite);
    if(!ys.length)return;
    const base=Math.max(24,Math.min(...ys));
    labels
      .sort((a,b)=>{
        const av=referenceValue(a),bv=referenceValue(b);
        if(Number.isFinite(av)&&Number.isFinite(bv)&&av!==bv)return bv-av;
        return (Number(a.getAttribute('y'))||0)-(Number(b.getAttribute('y'))||0);
      })
      .forEach((t,i)=>moveReferenceLabel(t,base+i*22));
  }
  function fixAll(root=document){
    root.querySelectorAll?.('.hydro48-card svg').forEach(fixSvg);
  }
  let scheduled=false;
  function schedule(root=document){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      fixAll(root);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    setTimeout(()=>schedule(),500);
    setTimeout(()=>schedule(),1500);
    const target=document.getElementById('content')||document.body;
    new MutationObserver(()=>schedule(target)).observe(target,{childList:true,subtree:true,attributes:true,attributeFilter:['y']});
  });
})();
