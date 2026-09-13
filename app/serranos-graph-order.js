(() => {
  const ORDER=['oxolotan','tapijulapa','puyacatengo','teapa','san joaquin','pueblo nuevo','gaviotas','el muelle','porvenir'];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const rank=name=>{const n=norm(name),i=ORDER.findIndex(x=>n===x||n.includes(x));return i<0?999:i};
  let applying=false,pending=false;

  function isSerranosPanel(panel){
    const title=norm(panel.querySelector('h2,h3')?.textContent||'');
    const page=norm(document.getElementById('pageTitle')?.textContent||'');
    return page.includes('rios serranos')||title.includes('rios serranos')||title.includes('serranos-grijalva');
  }

  function reorderPanel(panel){
    if(!isSerranosPanel(panel))return;
    const grid=panel.querySelector('.hydro48-grid');if(!grid)return;
    const cards=[...grid.querySelectorAll(':scope > .hydro48-card')];if(cards.length<2)return;
    const sorted=[...cards].sort((a,b)=>rank(a.querySelector('.hydro48-head strong')?.textContent)-rank(b.querySelector('.hydro48-head strong')?.textContent));
    const changed=cards.some((card,i)=>card!==sorted[i]);
    if(!changed)return;
    applying=true;
    const frag=document.createDocumentFragment();sorted.forEach(card=>frag.appendChild(card));grid.appendChild(frag);
    applying=false;
  }

  function run(){if(applying)return;document.querySelectorAll('#content .hydro48-panel, #content section.panel').forEach(reorderPanel)}
  function schedule(){if(applying||pending)return;pending=true;requestAnimationFrame(()=>{pending=false;run()})}

  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    const content=document.getElementById('content')||document.body;
    new MutationObserver(()=>{if(!applying)schedule()}).observe(content,{childList:true,subtree:true});
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(schedule,300));
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(schedule,300));
  });
})();
