(() => {
  const LEVELS = [
    {min:0, max:5, cls:'rain-isolated', label:'Lluvia aislada', range:'0.1–5 mm'},
    {min:5, max:25, cls:'rain-showers', label:'Intervalos de chubascos', range:'5–25 mm'},
    {min:25, max:50, cls:'rain-strong', label:'Lluvia fuerte', range:'25–50 mm'},
    {min:50, max:75, cls:'rain-very-strong', label:'Lluvia muy fuerte', range:'50–75 mm'},
    {min:75, max:150, cls:'rain-intense', label:'Lluvia intensa', range:'75–150 mm'},
    {min:150, max:250, cls:'rain-torrential', label:'Lluvia torrencial', range:'150–250 mm'},
    {min:250, max:Infinity, cls:'rain-extraordinary', label:'Lluvia extraordinaria', range:'>250 mm'}
  ];
  const rainClasses = LEVELS.map(x=>x.cls);
  const parseMM = txt => {
    if(!txt) return null;
    if(/sin dato|s\/d|transici/i.test(txt)) return null;
    const m = String(txt).replace(',','.').match(/(-?\d+(?:\.\d+)?)\s*mm/i);
    return m ? Number(m[1]) : null;
  };
  const levelFor = v => {
    if(v===null || !Number.isFinite(v) || v<=0) return null;
    return LEVELS.find(x => v > x.min && v <= x.max) || LEVELS[LEVELS.length-1];
  };
  function decorateElement(el){
    if(!el || el.dataset.rainDecorated==='1') return;
    const v=parseMM(el.textContent);
    if(v===null) return;
    const l=levelFor(v);
    rainClasses.forEach(c=>el.classList.remove(c));
    if(l){
      el.classList.add('rain-intensity',l.cls);
      el.title=`${l.label} · ${l.range} · clasificación operativa basada en rangos SMN`;
    }else{
      el.classList.add('rain-intensity','rain-none');
      el.title='Sin lluvia acumulada registrada';
    }
    el.dataset.rainDecorated='1';
  }
  function decorateBars(root){
    root.querySelectorAll('.bar-row').forEach(row=>{
      const value=row.querySelector('.bar-value');
      const fill=row.querySelector('.bar-fill');
      if(!value || !fill) return;
      const v=parseMM(value.textContent); const l=levelFor(v);
      rainClasses.forEach(c=>fill.classList.remove(c));
      fill.classList.remove('rain-none');
      fill.classList.add(l?l.cls:'rain-none');
      if(l) row.title=`${l.label} · ${l.range}`;
    });
  }
  function decorateTables(root){
    root.querySelectorAll('table').forEach(table=>{
      const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim().toLowerCase());
      const rainCols=headers.map((h,i)=>(/\b(1 h|6 h|24 h|48 h|72 h|desde 08:00|precedentes)\b/.test(h)?i:-1)).filter(i=>i>=0);
      if(!rainCols.length) return;
      table.querySelectorAll('tbody tr').forEach(tr=>{
        const cells=[...tr.children]; rainCols.forEach(i=>decorateElement(cells[i]));
      });
    });
  }
  function removeDuplicateLegends(root){
    root.querySelectorAll('.rain-legend').forEach(el=>el.remove());
  }
  function apply(){
    const root=document.getElementById('content'); if(!root) return;
    decorateBars(root); decorateTables(root); removeDuplicateLegends(root);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    apply(); const root=document.getElementById('content');
    if(root) new MutationObserver(()=>requestAnimationFrame(apply)).observe(root,{childList:true,subtree:true});
  });
})();
