(() => {
  const BASE='..';
  const HOURS=96;
  const MAP={
    presas:['samaria','gonzalez','mezcalapa','carrizal','platanar','macayo','penitas'],
    serranos:['oxolotan','tapijulapa','teapa','puyacatengo','san joaquin','pueblo nuevo','rios de la sierra','pichucalco','gaviotas','el muelle','porvenir'],
    tulija:['salto de agua','macuspana','tulija','puxcatan','chilapa'],
    usumacinta:['boca del cerro','san pedro','usumacinta']
  };
  let history=[];
  let loading=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  function current(){return document.querySelector('#nav button.active')?.dataset.section||'resumen'}
  async function load(){
    if(history.length)return history;
    if(loading)return loading;
    loading=fetch(`${BASE}/data/niveles/Historico/niveles_historicos.json?v=${Date.now()}`,{cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(new Error(r.status)))
      .then(j=>history=Array.isArray(j)?j:[])
      .catch(()=>history=[])
      .finally(()=>loading=null);
    return loading;
  }
  function stationRows(name){
    const n=norm(name);
    const all=history.filter(r=>norm(r.estacion)===n&&num(r.nivel)&&r.estado_dato==='observado'&&r.fecha_hora)
      .map(r=>({...r,_t:new Date(r.fecha_hora)})).filter(r=>!Number.isNaN(r._t.getTime())).sort((a,b)=>a._t-b._t);
    if(!all.length)return [];
    const end=all[all.length-1]._t.getTime();
    const start=end-HOURS*3600000;
    return all.filter(r=>r._t.getTime()>=start);
  }
  function stationNames(id){
    const terms=MAP[id]||[];
    const names=[];
    for(const r of history){
      if(!r.estacion)continue;
      const text=norm(`${r.estacion} ${r.rio||''}`);
      if(terms.some(t=>text.includes(t))&&!names.some(x=>norm(x)===norm(r.estacion)))names.push(r.estacion);
    }
    return names;
  }
  function svgFor(name){
    const rows=stationRows(name);if(rows.length<2)return '';
    const latest=rows[rows.length-1];
    const levels=rows.map(r=>Number(r.nivel));
    const obsMin=Math.min(...levels),obsMax=Math.max(...levels);
    let span=Math.max(obsMax-obsMin,0.12),pad=Math.max(span*.18,0.05),yMin=obsMin-pad,yMax=obsMax+pad;
    const namo=num(latest.namo)?Number(latest.namo):null;
    const nameRef=num(latest.name)?Number(latest.name):null;
    const W=760,H=340,L=58,R=22,T=42,B=46,pw=W-L-R,ph=H-T-B;
    const t0=rows[0]._t.getTime(),t1=rows[rows.length-1]._t.getTime()||t0+1;
    const x=t=>L+((t.getTime()-t0)/(t1-t0||1))*pw;
    const y=v=>T+(yMax-v)/(yMax-yMin||1)*ph;
    const pts=rows.map(r=>`${x(r._t).toFixed(1)},${y(Number(r.nivel)).toFixed(1)}`).join(' ');
    let ref='';
    function refLine(v,label,dash){
      if(v===null)return '';
      if(v>=yMin&&v<=yMax){const yy=y(v);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#7a1230" stroke-width="2" stroke-dasharray="${dash}"/><text x="${L+6}" y="${yy-5}" font-size="12" font-weight="700" fill="#7a1230">${label} ${v.toFixed(2)} m</text>`}
      const yy=T+12;return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#7a1230" stroke-width="2" stroke-dasharray="${dash}"/><text x="${L+6}" y="${yy-5}" font-size="11" font-weight="700" fill="#7a1230">${label} ${v.toFixed(2)} m · fuera de escala</text>`
    }
    ref+=refLine(namo,'NAMO','8 5');
    if(nameRef!==null&&nameRef!==namo)ref+=refLine(nameRef,'NAME','2 5');
    const grid=[0,.25,.5,.75,1].map(p=>{const yy=T+p*ph,val=yMax-p*(yMax-yMin);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#ddd" stroke-width="1"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#666">${val.toFixed(2)}</text>`}).join('');
    const dots=rows.map(r=>`<circle cx="${x(r._t)}" cy="${y(Number(r.nivel))}" r="3.6" fill="#1f77b4"/>`).join('');
    const fmt=d=>d.toLocaleString('es-MX',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const delta=Number(rows[rows.length-1].nivel)-Number(rows[0].nivel);
    const staleHours=(Date.now()-latest._t.getTime())/3600000;
    const stale=staleHours>12?` · último dato ${fmt(latest._t)}`:'';
    return `<div class="hydro48-card"><div class="hydro48-head"><strong>${esc(latest.estacion)}</strong><span>${esc(latest.rio||'')}</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de nivel de ${esc(latest.estacion)} en las últimas 96 horas">${grid}<line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" stroke="#777"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H-B}" stroke="#777"/>${ref}<polyline fill="none" stroke="#1f77b4" stroke-width="3" points="${pts}"/>${dots}<text x="${L}" y="${H-16}" font-size="11" fill="#666">${fmt(rows[0]._t)}</text><text x="${W-R}" y="${H-16}" text-anchor="end" font-size="11" fill="#666">${fmt(latest._t)}</text></svg><div class="hydro48-foot"><b>${Number(latest.nivel).toFixed(2)} m</b> · Δ96 h ${delta>=0?'+':''}${delta.toFixed(2)} m${stale}</div></div>`;
  }
  function injectStyles(){if(document.getElementById('hydro48Style'))return;const s=document.createElement('style');s.id='hydro48Style';s.textContent='.hydro48-panel{border-top:4px solid #b9955b}.hydro48-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.hydro48-card{border:1px solid #e2ded8;border-radius:14px;padding:10px;background:#fff}.hydro48-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:4px}.hydro48-head strong{color:#6f112d}.hydro48-head span,.hydro48-foot{font-size:11px;color:#666}.hydro48-card svg{display:block;width:100%;height:auto;background:#fff}.hydro48-foot{padding:4px 2px 0}.hydro48-foot b{color:#2d2d2d}.hydro-figure img{display:none!important}.hydro-figure{display:none!important}@media(max-width:760px){.hydro48-grid{grid-template-columns:1fr}}';document.head.appendChild(s)}
  async function render(){
    await load();injectStyles();
    const id=current(),content=document.getElementById('content');if(!content||!history.length)return;
    content.querySelector('#hydro48Panel')?.remove();
    const ids=id==='resumen'?['presas','serranos','tulija','usumacinta']:[id];
    if(!ids.some(x=>MAP[x]))return;
    const names=[];ids.forEach(x=>stationNames(x).forEach(n=>{if(!names.some(a=>norm(a)===norm(n)))names.push(n)}));
    const cards=names.map(svgFor).filter(Boolean);if(!cards.length)return;
    const panel=document.createElement('section');panel.id='hydro48Panel';panel.className='panel wide hydro48-panel';panel.innerHTML=`<h2>Niveles de ríos · últimas 96 h</h2><p class="muted">Se conserva la última serie válida hasta que exista una observación nueva.</p><div class="hydro48-grid">${cards.join('')}</div>`;
    const grid=content.querySelector('.grid')||content;grid.appendChild(panel);
  }
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(render,800);document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,500));document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(()=>{history=[];render()},900));window.addEventListener('hydro:soft-refresh',()=>setTimeout(render,250));});
})();