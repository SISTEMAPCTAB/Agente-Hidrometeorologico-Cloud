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
    if(nums.length<4)return null;
    // 22-oct-2026: el boletín a veces omite la lectura anterior (NAMO, nivel, gasto, lluvia…) y se tomaba la lluvia
    // como nivel (10.5 m). Los niveles se reconocen por rango (±15 m del NAMO): el último es el actual.
    const namo=nums[0], hs=nums.slice(1).filter(v=>Number.isFinite(namo)&&v>=namo-15&&v<=namo+10);
    if(!hs.length)return null;
    const actual=hs[hs.length-1], anterior=hs.length>1?hs[0]:null;
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

  function valuesFor(table,data){
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    return headers.map(h=>{
      if(h==='estacion')return 'Lacantún';
      if(h==='nivel')return `${fmt(data.actual)} m`;
      if(h.includes('δ24')||h.includes('Δ24')||h.includes('24 h'))return Number.isFinite(data.delta)?`${data.delta>=0?'+':''}${fmt(data.delta)} m`:'s/d';
      if(h==='tendencia')return Number.isFinite(data.delta)?(Math.abs(data.delta)<0.005?'Estable':data.delta>0?'Ascenso':'Descenso'):'s/d';
      if(h.includes('dist')&&h.includes('namo'))return Number.isFinite(data.dist)?`${Math.abs(data.dist).toFixed(2)} m ${data.dist<0?'abajo':'arriba'}`:'s/d';
      if(h==='estado')return 'Observado · Frontera Sur';
      return 's/d';
    });
  }

  function insertRow(data){
    const table=targetTable();
    if(!table)return false;
    const body=table.tBodies?.[0];if(!body)return false;
    const boca=[...body.rows].find(r=>norm(r.cells?.[0]?.textContent)==='boca del cerro');
    if(!boca)return false;
    const vals=valuesFor(table,data);
    let row=[...body.rows].find(r=>norm(r.cells?.[0]?.textContent)==='lacantun');
    if(!row){
      row=document.createElement('tr');
      body.insertBefore(row,boca);
    }
    const html=vals.map((v,i)=>`<td>${i===0?`<b>${v}</b>`:v}</td>`).join('');
    if(row.innerHTML!==html)row.innerHTML=html;
    // Lacantún debe encabezar el cuadro, también tras repintados de la app.
    if(body.firstElementChild!==row)body.insertBefore(row,body.firstElementChild);
    return true;
  }

  let cached=null,running=false;
  async function run(){
    if(running)return;
    running=true;
    try{
      if(!cached){
        const r=await fetch(`${FUENTE1}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return;
        cached=parseLacantun(await r.text());
      }
      if(cached)insertRow(cached);
    }catch{}finally{running=false;}
  }

  function schedule(){setTimeout(run,300);setTimeout(run,900);setTimeout(run,1700)}

  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    document.getElementById('nav')?.addEventListener('click',schedule);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{cached=null;schedule()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(run,250)});
  });
})();
