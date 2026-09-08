(() => {
  const FUENTE1='../data/latest/FUENTE1.txt';

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const fmt=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'s/d';

  function parseLacantun(text){
    const line=String(text||'').split(/\r?\n/).find(x=>/\bBHG21\s+Lacant[uú]n\b/i.test(x));
    if(!line)return null;
    const m=line.match(/\bBHG21\s+Lacant[uú]n\b(.*)$/i);
    if(!m)return null;
    const segment=('Lacantún'+m[1]).replace(/^\s*BHG21\s+/i,'');
    const nums=[...segment.matchAll(/(?<!\S)-?\d+(?:,\d{3})*(?:\.\d+)?(?!\S)/g)].map(x=>Number(x[0].replace(/,/g,''))).filter(Number.isFinite);
    // FUENTE1: NAMO, nivel/gasto día anterior, nivel/gasto actual, precipitación, Tmax, Tmin.
    if(nums.length<5)return null;
    const namo=nums[0], anterior=nums[1], actual=nums[3];
    if(!Number.isFinite(actual))return null;
    const delta=Number.isFinite(anterior)?actual-anterior:null;
    const dist=Number.isFinite(namo)?actual-namo:null;
    return {actual,delta,dist};
  }

  function targetTable(){
    const panels=[...document.querySelectorAll('#content section.panel, #content .panel')];
    const panel=panels.find(p=>norm(p.querySelector('h2')?.textContent)==='usumacinta · niveles');
    return panel?.querySelector('table')||null;
  }

  function insertRow(data){
    const table=targetTable();
    if(!table)return false;
    const body=table.tBodies?.[0]; if(!body)return false;
    const existing=[...body.rows].find(r=>norm(r.cells?.[0]?.textContent)==='lacantun');
    if(existing)existing.remove();
    const boca=[...body.rows].find(r=>norm(r.cells?.[0]?.textContent)==='boca del cerro');
    if(!boca)return false;

    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const tr=document.createElement('tr');
    const values=headers.map(h=>{
      if(h==='estacion')return '<b>Lacantún</b>';
      if(h==='nivel')return `${fmt(data.actual)} m`;
      if(h.includes('δ24')||h.includes('Δ24')||h.includes('24 h'))return Number.isFinite(data.delta)?`${data.delta>=0?'+':''}${fmt(data.delta)} m`:'s/d';
      if(h==='tendencia')return Number.isFinite(data.delta)?(Math.abs(data.delta)<0.005?'Estable':data.delta>0?'Ascenso':'Descenso'):'s/d';
      if(h.includes('dist')&&h.includes('namo'))return Number.isFinite(data.dist)?`${Math.abs(data.dist).toFixed(2)} m ${data.dist<0?'abajo':'arriba'}`:'s/d';
      if(h==='estado')return 'Observado · Frontera Sur';
      return 's/d';
    });
    tr.innerHTML=values.map(v=>`<td>${v}</td>`).join('');
    body.insertBefore(tr,boca);
    return true;
  }

  let cached=null;
  async function run(){
    try{
      if(!cached){
        const r=await fetch(`${FUENTE1}?v=${Date.now()}`,{cache:'no-store'}); if(!r.ok)return;
        cached=parseLacantun(await r.text());
      }
      if(cached)insertRow(cached);
    }catch{}
  }

  function schedule(){setTimeout(run,250);setTimeout(run,800)}
  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    document.getElementById('nav')?.addEventListener('click',schedule);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{cached=null;schedule()});
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>schedule()).observe(content,{childList:true,subtree:true});
  });
})();
