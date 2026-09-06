(() => {
  const IDS=new Set(['presas','serranos','tulija','usumacinta']);
  const BASE='..';
  const BASIN={presas:'Peñitas',serranos:'Bajo Grijalva-Ríos de la Sierra',tulija:null,usumacinta:'Usumacinta'};
  const TERMS={
    presas:['samaria','gonzalez','mezcalapa','carrizal','platanar','macayo','penitas'],
    serranos:['oxolotan','tapijulapa','teapa','puyacatengo','san joaquin','pueblo nuevo','rios de la sierra','pichucalco'],
    tulija:['salto de agua','tulija','puxcatan','chilapa'],
    usumacinta:['boca del cerro','usumacinta','san pedro']
  };
  let cache=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  async function get(u){const r=await fetch(`${u}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json();}
  async function load(){if(cache)return cache;const urls=[`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`,`${BASE}/data/weatherlink/latest.json`,`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`,`${BASE}/data/fuentes_publicas/latest.json`];const vals=await Promise.all(urls.map(u=>get(u).catch(()=>null)));return cache={levels:vals[0]||[],conagua:vals[1]||[],weather:vals[2]||{},weatherState:vals[3]||{},catalog:vals[4]||{},public:vals[5]||{}};}
  function current(){return document.querySelector('#nav button.active')?.dataset.section||'';}
  function systemLevels(id,d){const terms=TERMS[id]||[];return (Array.isArray(d.levels)?d.levels:[]).filter(r=>terms.some(t=>norm(`${r.estacion||''} ${r.rio||''}`).includes(t)));}
  function bestLevel(id,d){const rows=systemLevels(id,d).filter(r=>norm(r.estado_dato)==='observado');if(!rows.length)return null;return [...rows].sort((a,b)=>{
    const da=finite(a.delta_24h)?Number(a.delta_24h):(finite(a.delta_vs_06)?Number(a.delta_vs_06):-999);
    const db=finite(b.delta_24h)?Number(b.delta_24h):(finite(b.delta_vs_06)?Number(b.delta_vs_06):-999);
    return db-da;
  })[0];}
  function nearestNamo(id,d){return systemLevels(id,d).filter(r=>norm(r.estado_dato)==='observado'&&finite(r.distancia_namo)).sort((a,b)=>Math.abs(Number(a.distancia_namo))-Math.abs(Number(b.distancia_namo)))[0]||null;}
  function governors(id,d){return (d.catalog?.estaciones||[]).filter(x=>x.sistema===id&&x.gobierna_semaforo===true);}
  function bestRain(id,d){const vals=[];for(const g of governors(id,d)){
    if(norm(g.fuente)==='conagua'){
      const r=(Array.isArray(d.conagua)?d.conagua:[]).find(x=>norm(x.estacion)===norm(g.estacion));
      if(r&&norm(r.estado_24h)==='observado'&&finite(r.lluvia_24h_precedentes_mm))vals.push({mm:Number(r.lluvia_24h_precedentes_mm),station:r.estacion,source:'CONAGUA',period:'24 h'});
    }else if(norm(g.fuente)==='weatherlink'){
      const s=(d.weather?.stations||[]).find(x=>norm(x.nombre)===norm(g.estacion));
      if(!s||norm(s.quality).includes('rezagado')||norm(s.quality).includes('heredado'))continue;
      const mature=d.weatherState?.window_maturity?.['24h']===true;
      const mm=s.accumulations_mm?.['24'];
      if(mature&&finite(mm))vals.push({mm:Number(mm),station:s.nombre,source:'WeatherLink',period:'24 h'});
    }
  }return vals.sort((a,b)=>b.mm-a.mm)[0]||null;}
  function forecast(id,d){const basin=BASIN[id];if(!basin)return null;let best=null;for(const w of ['0-24','24-48','48-72','72-96']){const r=d.public?.smn96?.ventanas?.[w]?.[basin];if(r&&finite(r.max_mm)&&(!best||Number(r.max_mm)>best.max))best={min:Number(r.min_mm),max:Number(r.max_mm),win:w,text:r.texto||`${r.min_mm}–${r.max_mm}`};}return best;}
  function interpretation(r,l,n,f){const notes=[];if(r){if(r.mm>=75)notes.push(`lluvia intensa ${r.mm.toFixed(1)} mm`);else if(r.mm>=50)notes.push(`lluvia muy fuerte ${r.mm.toFixed(1)} mm`);else if(r.mm>0)notes.push(`lluvia ${r.mm.toFixed(1)} mm`);}if(l){const d=finite(l.delta_24h)?Number(l.delta_24h):null;if(d!==null&&d>0.10)notes.push(`${l.estacion} asciende ${d.toFixed(2)} m/24 h`);else if(d!==null&&d>0)notes.push(`${l.estacion} con ascenso leve`);else notes.push(`${l.estacion} sin ascenso relevante`);}if(n&&Number(n.distancia_namo)>-1)notes.push(`${n.estacion} a ${Math.abs(Number(n.distancia_namo)).toFixed(2)} m del NAMO`);if(f&&f.max>=75)notes.push(`SMN ${f.text} mm en ${f.win} h`);return notes.length?notes.join(' · '):'Sin señal operativa relevante en los datos válidos del corte.';}
  async function render(){const id=current();if(!IDS.has(id))return;const content=document.getElementById('content');if(!content)return;content.querySelector('#systemDetailSummary')?.remove();const d=await load().catch(()=>null);if(!d||current()!==id)return;const r=bestRain(id,d),l=bestLevel(id,d),n=nearestNamo(id,d),f=forecast(id,d);const bits=[];if(r)bits.push(`<div><span>Lluvia observada</span><b>${r.mm.toFixed(1)} mm · ${esc(r.station)}</b></div>`);if(l)bits.push(`<div><span>Nivel</span><b>${esc(l.estacion)} ${finite(l.ultimo_nivel)?Number(l.ultimo_nivel).toFixed(2)+' m':''}${finite(l.delta_24h)?` · Δ24 h ${Number(l.delta_24h)>=0?'+':''}${Number(l.delta_24h).toFixed(2)} m`:''}</b></div>`);if(n)bits.push(`<div><span>NAMO</span><b>${esc(n.estacion)} · ${Math.abs(Number(n.distancia_namo)).toFixed(2)} m ${Number(n.distancia_namo)<0?'abajo':'arriba'}</b></div>`);if(f)bits.push(`<div><span>SMN 0–96 h</span><b>${esc(f.text)} mm · ventana ${esc(f.win)} h</b></div>`);const sec=document.createElement('section');sec.id='systemDetailSummary';sec.className='panel wide system-detail-summary compact-detail';sec.innerHTML=`<div class="compact-detail-head"><div><span class="detail-eyebrow">Lectura rápida</span><h2>Situación del sistema</h2></div></div>${bits.length?`<div class="compact-detail-grid">${bits.join('')}</div>`:'<p class="muted">No hay datos válidos suficientes para una síntesis automática en este corte.</p>'}<div class="compact-analysis"><b>Interpretación:</b> ${esc(interpretation(r,l,n,f))}</div>`;const grid=content.querySelector('.grid')||content;grid.prepend(sec);setTimeout(()=>document.getElementById('systemDetailSummary')?.scrollIntoView({block:'start'}),20);}
  function refresh(){cache=null;render();}
  document.addEventListener('DOMContentLoaded',()=>{render();document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,40));document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(refresh,500));window.addEventListener('focus',()=>{if(IDS.has(current()))render();});});
})();