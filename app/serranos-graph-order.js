(() => {
  const ORDER=[
    'oxolotan',
    'tapijulapa',
    'puyacatengo',
    'teapa',
    'san joaquin',
    'pueblo nuevo',
    'gaviotas',
    'el muelle',
    'porvenir'
  ];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const rank=name=>{
    const n=norm(name);
    const i=ORDER.findIndex(x=>n===x||n.includes(x));
    return i<0?999:i;
  };

  function isSerranosPanel(panel){
    const title=norm(panel.querySelector('h2,h3')?.textContent||'');
    const page=norm(document.getElementById('pageTitle')?.textContent||'');
    return page.includes('rios serranos') || title.includes('rios serranos') || title.includes('serranos-grijalva');
  }

  function reorderPanel(panel){
    if(!isSerranosPanel(panel))return;
    const grid=panel.querySelector('.hydro48-grid');if(!grid)return;
    const cards=[...grid.querySelectorAll(':scope > .hydro48-card')];
    if(cards.length<2)return;
    cards.sort((a,b)=>{
      const an=a.querySelector('.hydro48-head strong')?.textContent||'';
      const bn=b.querySelector('.hydro48-head strong')?.textContent||'';
      return rank(an)-rank(bn);
    }).forEach(card=>grid.appendChild(card));
  }

  function run(){
    document.querySelectorAll('#content .hydro48-panel, #content section.panel').forEach(reorderPanel);
  }
  let pending=false;
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;run()})}

  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    const content=document.getElementById('content')||document.body;
    new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(schedule,650));
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(schedule,650));
  });
})();
