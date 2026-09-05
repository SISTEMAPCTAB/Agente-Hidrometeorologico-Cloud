(() => {
  const URL='../data/niveles/Resumen_12h/resumen_12h.json';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let payload=null;
  const cls=e=>e==='deteriorándose'?'tl-worse':e==='mejorando'?'tl-better':e==='estable'?'tl-stable':'tl-mixed';
  function systemCard(s){
    const h=s.hidrometria||{};
    const stations=(s.estaciones||[]).filter(x=>x.delta_m!==null).sort((a,b)=>Math.abs(Number(b.delta_m))-Math.abs(Number(a.delta_m))).slice(0,4);
    return `<article class="timeline-card ${cls(s.evolucion_operativa_12h)}"><div class="timeline-head"><strong>${esc(s.sistema)}</strong><span>${esc(s.evolucion_operativa_12h||'s/d')}</span></div><div class="timeline-counts"><span>↑ ${Number(h.ascendentes||0)} asc.</span><span>→ ${Number(h.estables||0)} est.</span><span>↓ ${Number(h.descendentes||0)} desc.</span></div>${stations.length?`<div class="timeline-stations">${stations.map(x=>`<div><b>${esc(x.estacion)}</b><span>${Number(x.delta_m)>=0?'+':''}${Number(x.delta_m).toFixed(2)} m · ${esc(x.tendencia_12h)}</span><small>${esc(x.inicio)} → ${esc(x.fin)}</small></div>`).join('')}</div>`:'<p class="muted">Sin dos observaciones reales comparables en la ventana.</p>'}</article>`;
  }
  function render(){
    if(document.getElementById('pageTitle')?.textContent?.trim()!=='Resumen operativo'||!payload)return;
    const content=document.getElementById('content'); if(!content)return;
    content.querySelector('#timeline12h')?.remove();
    const el=document.createElement('section'); el.id='timeline12h'; el.className='panel wide timeline-panel';
    el.innerHTML=`<div class="timeline-title"><div><h2>Evolución reciente · últimas ${Number(payload.window_hours||12)} h</h2><p>Comparación hidrométrica construida exclusivamente con observaciones reales; los datos heredados no cuentan como nuevos registros.</p></div><span class="badge">${esc(payload.generated_from_latest_observation||'corte s/d')}</span></div><div class="timeline-grid">${(payload.systems||[]).map(systemCard).join('')}</div><div class="timeline-note"><b>Lectura:</b> “mejorando” significa predominio de descensos; “deteriorándose”, predominio de ascensos. La etiqueta describe dirección reciente del nivel y no constituye por sí sola una condición de riesgo. Debe leerse junto con lluvia, NAMO/NAMINO, pronóstico y estado de atención.</div><div class="trace-line"><span><b>Fuente:</b> histórico de niveles CONAGUA/OCFS procesado por el agente cloud</span><span><b>Ventana:</b> ${esc(payload.window_start||'s/d')} → ${esc(payload.generated_from_latest_observation||'s/d')}</span></div>`;
    const grid=content.querySelector('.grid'); (grid||content).append(el);
  }
  async function load(){try{const r=await fetch(URL,{cache:'no-store'});if(r.ok)payload=await r.json();render()}catch(e){console.warn('Timeline 12 h no disponible',e)}}
  document.addEventListener('DOMContentLoaded',()=>{load();const t=document.getElementById('pageTitle'),c=document.getElementById('content');if(t)new MutationObserver(()=>setTimeout(render,0)).observe(t,{childList:true,subtree:true});if(c)new MutationObserver(()=>{if(document.getElementById('pageTitle')?.textContent?.trim()==='Resumen operativo'&&!c.querySelector('#timeline12h'))setTimeout(render,0)}).observe(c,{childList:true});setInterval(()=>{if(!document.hidden)load()},60000)});
})();
