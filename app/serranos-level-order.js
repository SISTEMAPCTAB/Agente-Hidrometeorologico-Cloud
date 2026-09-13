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

  function isSerranosLevelTable(table){
    const section=table.closest('section.panel, .panel');
    const title=norm(section?.querySelector('h2,h3')?.textContent||'');
    if(!title.includes('rios serranos')&&!title.includes('serranos-grijalva'))return false;
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    return headers.includes('estacion')&&headers.includes('nivel')&&headers.some(h=>h.includes('24 h')||h.includes('24h'));
  }

  function reorder(table){
    if(!isSerranosLevelTable(table))return;
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const stationIdx=headers.findIndex(h=>h==='estacion');
    if(stationIdx<0)return;
    const body=table.querySelector('tbody');if(!body)return;
    const rows=[...body.querySelectorAll('tr')];
    const sorted=[...rows].sort((a,b)=>{
      const ra=rank(a.cells[stationIdx]?.textContent),rb=rank(b.cells[stationIdx]?.textContent);
      return ra-rb;
    });
    sorted.forEach(tr=>body.appendChild(tr));
  }

  function run(){document.querySelectorAll('#content table').forEach(reorder)}
  let pending=false;
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;run()})}

  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    const content=document.getElementById('content')||document.body;
    new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(schedule,500));
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(schedule,500));
  });
})();
