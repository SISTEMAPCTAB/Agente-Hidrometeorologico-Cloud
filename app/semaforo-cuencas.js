(() => {
  const BASE='..';
  const URLS={
    catalog:`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`,
    conagua:`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`,
    weather:`${BASE}/data/weatherlink/latest.json`,
    weatherState:`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`
  };
  const RIVERS_BY_SECTION={
    'Ríos Serranos–Grijalva':['Oxolotán','Amatán','Tacotalpa','Teapa','Puyacatengo','La Sierra','Pichucalco'],
    'Tulijá–Puxcatán–Chilapa':['Tulijá','Puxcatán','Chilapa'],
    'Usumacinta':['Usumacinta'],
    'Presas–Mezcalapa–Samaria y Carrizal':['Mezcalapa','Samaria','Carrizal']
  };
  let latest={};
  let timer=null;

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}

  function conaguaObs(rows,name){
    const r=(Array.isArray(rows)?rows:[]).find(x=>norm(x.estacion)===norm(name));
    if(!r||r.estado_24h!=='observado'||r.lluvia_24h_precedentes_mm===null||r.lluvia_24h_precedentes_mm===undefined)return null;
    return {mm:Number(r.lluvia_24h_precedentes_mm),periodo:'24 h',hora:r.fecha_hora||'s/d',estado:r.estado_24h,fuente:'CONAGUA',estacion:r.estacion};
  }
  function weatherObs(payload,wstate,name){
    const r=(payload?.stations||[]).find(x=>norm(x.nombre)===norm(name));
    if(!r)return null;
    const stale=norm(r.quality).includes('rezagado');
    const inherited24=norm(r.quality).includes('24h heredado');
    const mature24=wstate?.window_maturity?.['24h']===true;
    const mm=r.accumulations_mm?.['24'];
    if(stale||inherited24||!mature24||mm===null||mm===undefined)return null;
    return {mm:Number(mm),periodo:'24 h',hora:r.last_updated_at||r.observed_utc||'s/d',estado:'observado',fuente:'WeatherLink',estacion:r.nombre};
  }
  function classify(mm){return window.RiverSemaphore?.classify(mm)||{categoria:'sin_dato',color:'gris',className:'river-signal nodata'};}

  function evaluateRiver(river){
    const cat=latest.catalog?.estaciones||[];
    const links=cat.filter(x=>x.gobierna_semaforo===true&&(x.rios_objetivo||[]).some(r=>norm(r)===norm(river)));
    const obs=[];
    for(const l of links){
      let o=null;
      if(norm(l.fuente)==='conagua')o=conaguaObs(latest.conagua,l.estacion);
      if(norm(l.fuente)==='weatherlink')o=weatherObs(latest.weather,latest.weatherState,l.estacion);
      if(o)obs.push({...o,subcuenca:l.subcuenca,confianza:l.confianza,influencia:l.influencia});
    }
    const valid=obs.filter(o=>Number.isFinite(o.mm));
    if(!valid.length)return {river,color:classify(null),obs:[],max:null};
    const max=Math.max(...valid.map(o=>o.mm));
    return {river,color:classify(max),obs:valid.sort((a,b)=>b.mm-a.mm),max};
  }

  function card(result){
    const c=result.color;
    const top=result.obs[0];
    const signalClass=c.className||`river-signal signal-${c.color}`;
    const value=result.max===null?'s/d':`${result.max.toFixed(1)} mm`;
    const details=result.obs.length?result.obs.slice(0,4).map(o=>`<li><b>${esc(o.estacion)}</b> · ${o.mm.toFixed(1)} mm / ${esc(o.periodo)} · ${esc(o.subcuenca)} · ${esc(o.hora)} · confianza ${esc(o.confianza)}</li>`).join(''):'<li>Sin observación aguas arriba válida de 24 h para gobernar el color.</li>';
    return `<article class="river-basin-card"><div class="river-basin-head"><h3>${esc(result.river)}</h3><span class="${signalClass}">${value} · ${esc(String(c.categoria||'sin_dato').replaceAll('_',' '))}</span></div><ul>${details}</ul>${top?`<small>Color gobernado por la mayor categoría observada válida dentro de estaciones vinculadas a la subcuenca. No es lluvia media areal.</small>`:'<small>Gris significa falta de observación aguas arriba válida, no 0 mm.</small>'}</article>`;
  }

  function render(){
    const title=document.getElementById('pageTitle')?.textContent?.trim();
    const rivers=RIVERS_BY_SECTION[title];
    const content=document.getElementById('content');
    if(!content||!rivers)return;
    content.querySelector('#riverBasinSemaphore')?.remove();
    const results=rivers.map(evaluateRiver);
    const wrap=document.createElement('section');
    wrap.id='riverBasinSemaphore';
    wrap.className='panel wide river-basin-panel';
    wrap.innerHTML=`<h2>Semáforo preventivo por lluvia aguas arriba</h2>${window.RiverSemaphore?.legend?.()||''}<div class="river-basin-grid">${results.map(card).join('')}</div><div class="section-note">Criterio: azul 0–50 mm; verde 50–75; amarillo 75–150; rojo 150–250; morado ≥250. El NAMO permanece como referencia del nivel y no determina este color. WeatherLink 24 h heredado o dato rezagado no gobierna el semáforo.</div>`;
    content.prepend(wrap);
  }

  async function refresh(){
    try{
      const [catalog,conagua,weather,weatherState]=await Promise.all([json(URLS.catalog),json(URLS.conagua),json(URLS.weather),json(URLS.weatherState)]);
      latest={catalog,conagua,weather,weatherState};
      render();
    }catch(e){console.warn('Semáforo por subcuenca no actualizado:',e);}
  }

  function watch(){
    const title=document.getElementById('pageTitle');
    const content=document.getElementById('content');
    if(title)new MutationObserver(()=>setTimeout(render,0)).observe(title,{childList:true,characterData:true,subtree:true});
    if(content)new MutationObserver(()=>{if(!content.querySelector('#riverBasinSemaphore'))setTimeout(render,0)}).observe(content,{childList:true});
    timer=setInterval(refresh,60000);
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
  }
  document.addEventListener('DOMContentLoaded',()=>{refresh();watch();});
  window.addEventListener('river-semaphore-ready',render);
})();