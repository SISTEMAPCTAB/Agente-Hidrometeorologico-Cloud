(() => {
  const BASE='..';
  const URLS={
    namino:`${BASE}/data/catalogos/namino_estaciones.json`,
    levels:`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,
    catalog:`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`,
    weather:`${BASE}/data/weatherlink/latest.json`,
    weatherState:`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,
    publicSources:`${BASE}/data/fuentes_publicas/latest.json`
  };
  const SECTIONS={
    'Presas–Mezcalapa–Samaria y Carrizal':['Mezcalapa','Samaria','Carrizal'],
    'Ríos Serranos–Grijalva':['Oxolotán','Amatán','Tacotalpa','Teapa','Puyacatengo','La Sierra','Pichucalco'],
    'Tulijá–Puxcatán–Chilapa':['Tulijá','Puxcatán','Chilapa'],
    'Usumacinta':['Usumacinta']
  };
  const SMN_BASIN={
    'Presas–Mezcalapa–Samaria y Carrizal':'Peñitas',
    'Ríos Serranos–Grijalva':'Bajo Grijalva-Ríos de la Sierra',
    'Usumacinta':'Usumacinta'
  };
  let data={};
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}

  function riverNaminoRows(river){
    return (data.namino?.estaciones||[]).filter(x=>norm(x.rio)===norm(river));
  }
  function levelFor(entry){
    const rows=Array.isArray(data.levels)?data.levels:[];
    return rows.find(r=>norm(r.estacion)===norm(entry.estacion))||null;
  }
  function levelSignal(river){
    const candidates=riverNaminoRows(river);
    if(!candidates.length)return {kind:'nodata',html:'<span class="river-signal nodata">NAMINO s/d</span>',detail:'Sin referencia NAMINO catalogada para este río.'};
    const valid=[];
    for(const e of candidates){
      if(!Number.isFinite(Number(e.namino)))continue;
      const l=levelFor(e); if(!l||!Number.isFinite(Number(l.ultimo_nivel)))continue;
      valid.push({entry:e,row:l,d:Number(l.ultimo_nivel)-Number(e.namino)});
    }
    if(!valid.length){
      const first=candidates[0];
      return {kind:'nodata',html:'<span class="river-signal nodata">NAMINO s/d</span>',detail:`${first.estacion}: pendiente referencia mínima oficial específica; café/gris desactivados.`};
    }
    valid.sort((a,b)=>a.d-b.d);
    const x=valid[0], level=Number(x.row.ultimo_nivel), namino=Number(x.entry.namino), d=x.d;
    if(d<=0)return {kind:'gray',html:`<span class="river-signal signal-gris-bajo">Gris · ${level.toFixed(2)} m ≤ NAMINO ${namino.toFixed(2)} m</span>`,detail:`${x.entry.estacion} igual o por debajo del NAMINO oficial.`};
    if(d<=Number(data.namino?.margen_cafe_m??0.5))return {kind:'brown',html:`<span class="river-signal signal-cafe">Café · ${d.toFixed(2)} m sobre NAMINO</span>`,detail:`${x.entry.estacion} se aproxima al NAMINO.`};
    return {kind:'none',html:`<span class="river-signal signal-azul">Sin señal de nivel bajo · ${d.toFixed(2)} m sobre NAMINO</span>`,detail:`${x.entry.estacion} permanece fuera del margen café.`};
  }

  function links(river){
    return (data.catalog?.estaciones||[]).filter(x=>x.gobierna_semaforo===true&&(x.rios_objetivo||[]).some(r=>norm(r)===norm(river)));
  }
  function observedDry(river){
    const mature=data.weatherState?.window_maturity?.['96h']===true || Number(data.weather?.coverage_hours)>=96;
    if(!mature)return {active:false,available:false,reason:'ventana observada de 96 h no madura'};
    const wx=links(river).filter(x=>norm(x.fuente)==='weatherlink' && norm(x.confianza)!=='baja');
    if(!wx.length)return {active:false,available:false,reason:'sin estaciones automáticas aguas arriba de confianza suficiente'};
    const vals=[];
    for(const l of wx){
      const s=(data.weather?.stations||[]).find(x=>norm(x.nombre)===norm(l.estacion));
      if(!s||norm(s.quality).includes('rezagado'))continue;
      const v=s.accumulations_mm?.['96'];
      if(v!==null&&v!==undefined&&Number.isFinite(Number(v)))vals.push({name:s.nombre,mm:Number(v)});
    }
    if(!vals.length)return {active:false,available:false,reason:'sin acumulados válidos de 96 h'};
    const max=Math.max(...vals.map(v=>v.mm));
    return {active:max<=0.1,available:true,max,vals,reason:max<=0.1?'>96 h sin precipitación relevante observada':'hay precipitación en la ventana de 96 h'};
  }
  function modelDry(section){
    const basin=SMN_BASIN[section];
    if(!basin)return {active:false,available:false,reason:'sin cuenca SMN específica para este sistema'};
    const wins=['0-24','24-48','48-72','72-96'];
    const rows=wins.map(w=>data.publicSources?.smn96?.ventanas?.[w]?.[basin]);
    if(rows.some(r=>!r||!Number.isFinite(Number(r.max_mm))))return {active:false,available:false,reason:'pronóstico SMN 96 h incompleto'};
    const active=rows.every(r=>Number(r.max_mm)<=5);
    return {active,available:true,reason:active?'SMN mantiene máximos ≤5 mm en las cuatro ventanas de 0–96 h':'SMN no mantiene tendencia seca continua 0–96 h'};
  }
  function drySignal(river,section){
    const o=observedDry(river), m=modelDry(section), active=o.active||m.active;
    return {active,o,m,html:active?'<span class="river-signal signal-negro">Negro · persistencia seca</span>':'<span class="river-signal nodata">Negro no activo</span>'};
  }
  function card(river,section){
    const l=levelSignal(river), d=drySignal(river,section);
    const dryDetail=[d.o.reason,d.m.reason].filter(Boolean).join(' · ');
    return `<article class="estiaje-card"><h3>${esc(river)}</h3><div class="estiaje-signals">${l.html}${d.html}</div><p>${esc(l.detail)}</p><small>${esc(dryDetail)}</small></article>`;
  }
  function render(){
    const title=document.getElementById('pageTitle')?.textContent?.trim();
    const rivers=SECTIONS[title];
    const content=document.getElementById('content');
    if(!rivers||!content)return;
    content.querySelector('#estiajePanel')?.remove();
    const el=document.createElement('section');
    el.id='estiajePanel'; el.className='panel wide estiaje-panel';
    el.innerHTML=`<h2>Indicador complementario de estiaje y persistencia seca</h2><div class="estiaje-legend"><span class="river-signal signal-cafe">Café · ≤0.50 m sobre NAMINO</span><span class="river-signal signal-gris-bajo">Gris · nivel ≤ NAMINO</span><span class="river-signal signal-negro">Negro · >96 h sin lluvia relevante o tendencia seca 0–96 h</span></div><div class="estiaje-grid">${rivers.map(r=>card(r,title)).join('')}</div><div class="section-note">Este indicador es independiente del semáforo de lluvia para crecientes. Café y gris sólo se activan con NAMINO oficial validado para la estación; si el dato no existe se muestra NAMINO s/d. Negro es una señal operativa de persistencia seca y no sustituye al Monitor de Sequía.</div>`;
    const anchor=content.querySelector('#riverBasinSemaphore');
    if(anchor&&anchor.nextSibling)content.insertBefore(el,anchor.nextSibling); else content.prepend(el);
  }
  async function refresh(){
    try{
      const [namino,levels,catalog,weather,weatherState,publicSources]=await Promise.all([get(URLS.namino),get(URLS.levels),get(URLS.catalog),get(URLS.weather),get(URLS.weatherState),get(URLS.publicSources)]);
      data={namino,levels,catalog,weather,weatherState,publicSources}; render();
    }catch(e){console.warn('Indicador de estiaje no actualizado:',e);}
  }
  function watch(){
    const title=document.getElementById('pageTitle'), content=document.getElementById('content');
    if(title)new MutationObserver(()=>setTimeout(render,0)).observe(title,{childList:true,subtree:true,characterData:true});
    if(content)new MutationObserver(()=>{if(SECTIONS[document.getElementById('pageTitle')?.textContent?.trim()]&&!content.querySelector('#estiajePanel'))setTimeout(render,0)}).observe(content,{childList:true});
    setInterval(refresh,60000); window.addEventListener('focus',refresh); window.addEventListener('online',refresh);
  }
  document.addEventListener('DOMContentLoaded',()=>{refresh();watch();});
})();
