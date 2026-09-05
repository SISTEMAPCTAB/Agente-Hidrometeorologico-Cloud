(() => {
  const BASE='..';
  const URLS={levels:`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,conagua:`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`,weather:`${BASE}/data/weatherlink/latest.json`,weatherState:`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,public:`${BASE}/data/fuentes_publicas/latest.json`};
  const SYSTEMS=[
    {id:'presas',name:'Presas–Mezcalapa–Samaria/Carrizal',terms:['peñitas','mezcalapa','platanar','samaria','macayo','gonzalez'],rivers:['mezcalapa','samaria','carrizal'],basin:'Peñitas'},
    {id:'serranos',name:'Ríos Serranos–Grijalva',terms:['oxolotan','tapijulapa','teapa','puyacatengo','pueblo nuevo','rios de la sierra','pichucalco','amatan'],rivers:['oxolotan','tacotalpa','teapa','puyacatengo','la sierra','pichucalco'],basin:'Bajo Grijalva-Ríos de la Sierra'},
    {id:'tulija',name:'Tulijá–Puxcatán–Chilapa',terms:['salto de agua','tulija','puxcatan','chilapa','chilon'],rivers:['tulija','puxcatan','chilapa'],basin:null},
    {id:'usumacinta',name:'Usumacinta',terms:['boca del cerro','tenosique','balancan','emiliano zapata','jonuta','centla','tres brazos'],rivers:['usumacinta','san pedro'],basin:'Usumacinta'}
  ];
  let data={};
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function json(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json();}
  function rows(p){return Array.isArray(p)?p:(p?.stations||p?.rows||p?.data||[]);}
  function relevant(sys,r){const t=norm(`${r.estacion||r.nombre||''} ${r.rio||''} ${r.ubicacion||''}`);return sys.terms.some(x=>t.includes(norm(x)))||sys.rivers.some(x=>t.includes(norm(x)));}
  function rain(sys){
    const vals=[];
    rows(data.conagua).filter(r=>relevant(sys,r)&&norm(r.estado_24h)==='observado'&&Number.isFinite(Number(r.lluvia_24h_precedentes_mm))).forEach(r=>vals.push({mm:Number(r.lluvia_24h_precedentes_mm),station:r.estacion,source:'CONAGUA',time:r.fecha_hora||'s/d'}));
    const mature=data.weatherState?.window_maturity?.['24h']===true;
    if(mature)(data.weather?.stations||[]).filter(r=>relevant(sys,r)&&!norm(r.quality).includes('rezagado')&&!norm(r.quality).includes('heredado')&&Number.isFinite(Number(r.accumulations_mm?.['24']))).forEach(r=>vals.push({mm:Number(r.accumulations_mm['24']),station:r.nombre,source:'WeatherLink',time:r.last_updated_at||r.observed_utc||'s/d'}));
    return vals.sort((a,b)=>b.mm-a.mm)[0]||null;
  }
  function hydro(sys){
    const rr=rows(data.levels).filter(r=>relevant(sys,r));
    const observed=rr.filter(r=>norm(r.estado_dato)==='observado');
    const asc=observed.filter(r=>norm(r.tendencia).includes('asc'));
    const desc=observed.filter(r=>norm(r.tendencia).includes('desc'));
    let state='Sin dato observado'; if(observed.length)state=asc.length?`${asc.length} en ascenso`:desc.length===observed.length?'Descenso':'Estable/mixto';
    return {state,observed:observed.length,total:rr.length,cut:observed[0]?.ultima_actualizacion_real||observed[0]?.fecha_hora||'s/d'};
  }
  function forecast(sys){
    if(!sys.basin)return null;
    const wins=['0-24','24-48','48-72','72-96']; let best=null;
    for(const w of wins){const r=data.public?.smn96?.ventanas?.[w]?.[sys.basin];if(r&&Number.isFinite(Number(r.max_mm))&&(!best||Number(r.max_mm)>best.max))best={win:w,max:Number(r.max_mm),text:r.texto||`${r.min_mm}–${r.max_mm} mm`};}
    return best;
  }
  function watch(sys,r,h,f){
    if(!r&&!f&&h.observed===0)return 'Información insuficiente: mantener vigilancia de fuentes.';
    if(r?.mm>=75&&h.state.includes('ascenso'))return 'Lluvia intensa y respuesta ascendente: vigilancia prioritaria.';
    if(r?.mm>=50)return 'Lluvia muy fuerte observada: verificar respuesta hidrométrica aguas abajo.';
    if(f?.max>=75)return `Pronóstico ${f.win} h relevante: vigilar evolución y actualización SMN.`;
    if(h.state.includes('ascenso'))return 'Ascenso observado: revisar persistencia y propagación aguas abajo.';
    return 'Sin señal combinada alta con los datos válidos disponibles.';
  }
  function render(){
    const content=document.getElementById('content'),title=document.getElementById('pageTitle')?.textContent?.trim(); if(!content||title!=='Resumen operativo')return;
    content.querySelector('#operationalSituation')?.remove();
    const items=SYSTEMS.map(s=>{const r=rain(s),h=hydro(s),f=forecast(s);return {s,r,h,f,w:watch(s,r,h,f)};});
    const el=document.createElement('section');el.id='operationalSituation';el.className='panel wide operational-situation';
    el.innerHTML=`<h2>Situación operativa por sistema</h2><p class="op-intro">Lectura encadenada de lluvia aguas arriba → comportamiento hidrométrico → pronóstico → condición a vigilar. Cada variable conserva su naturaleza; no se suman estaciones ni se convierte el pronóstico en observación.</p><div class="op-table-wrap"><table class="op-table"><thead><tr><th>Sistema</th><th>Lluvia observada 24 h</th><th>Comportamiento del río</th><th>SMN 0–96 h</th><th>Condición a vigilar</th></tr></thead><tbody>${items.map(({s,r,h,f,w})=>`<tr><th>${esc(s.name)}</th><td>${r?`<b>${r.mm.toFixed(1)} mm</b><small>${esc(r.station)} · ${esc(r.source)}</small>`:'<span class="muted">Sin dato válido 24 h</span>'}</td><td><b>${esc(h.state)}</b><small>${h.observed}/${h.total} registros observados · ${esc(h.cut)}</small></td><td>${f?`<b>${esc(f.text)}</b><small>Ventana ${esc(f.win)} h · ${esc(s.basin)}</small>`:'<span class="muted">Sin cuenca SMN específica / sin dato</span>'}</td><td><span class="op-watch">${esc(w)}</span></td></tr>`).join('')}</tbody></table></div><div class="trace-line"><span><b>Fuentes:</b> CONAGUA/OCFS · WeatherLink · SMN</span><span><b>Tipo:</b> observado + pronosticado, presentados por separado</span><span><b>Criterio:</b> apoyo operativo; no sustituye boletines oficiales</span></div>`;
    const grid=content.querySelector('.grid');(grid||content).append(el);
  }
  async function load(){const ent=Object.entries(URLS);const res=await Promise.all(ent.map(async([k,u])=>{try{return[k,await json(u)]}catch(e){return[k,null]}}));data=Object.fromEntries(res);render();}
  document.addEventListener('DOMContentLoaded',()=>{const content=document.getElementById('content'),title=document.getElementById('pageTitle');if(content)new MutationObserver(()=>{if(document.getElementById('pageTitle')?.textContent?.trim()==='Resumen operativo'&&!content.querySelector('#operationalSituation'))setTimeout(render,0)}).observe(content,{childList:true,subtree:false});if(title)new MutationObserver(()=>setTimeout(render,0)).observe(title,{childList:true,subtree:true});load();setInterval(()=>{if(!document.hidden)load()},60000);});
})();