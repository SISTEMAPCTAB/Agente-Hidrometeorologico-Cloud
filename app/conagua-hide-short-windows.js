(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

  function isConaguaSection(table){
    const section=table.closest('section.panel.wide');
    const title=norm(section?.querySelector('h2')?.textContent||'');
    if(title.startsWith('conagua'))return true;
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const sourceIdx=headers.findIndex(h=>h==='fuente');
    if(sourceIdx<0)return false;
    const rows=[...table.querySelectorAll('tbody tr')];
    return rows.length>0 && rows.every(tr=>norm(tr.cells[sourceIdx]?.textContent)==='conagua');
  }

  function removeColumns(table){
    if(!isConaguaSection(table))return;
    const headers=[...table.querySelectorAll('thead th')];
    const idx=[];
    headers.forEach((th,i)=>{
      const h=norm(th.textContent);
      if(h==='1 h'||h==='6 h')idx.push(i);
    });
    if(!idx.length)return;
    idx.sort((a,b)=>b-a).forEach(i=>{
      table.querySelectorAll('tr').forEach(tr=>{
        const cell=tr.children[i];
        if(cell)cell.remove();
      });
    });
  }

  function clean(root=document){
    root.querySelectorAll?.('#content table').forEach(removeColumns);
  }

  let pending=false;
  function schedule(){
    if(pending)return;
    pending=true;
    requestAnimationFrame(()=>{
      pending=false;
      clean();
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    const content=document.getElementById('content')||document.body;
    new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(schedule,700));
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(schedule,550));
  });
})();
