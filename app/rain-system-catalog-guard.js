(() => {
  const BASE='..';
  const URLS={
    catalog:`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`,
    weather:`${BASE}/data/weatherlink/latest.json`,
    weatherState:`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,
    conagua:`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`
  };
  const SYSTEMS=new Set(['presas','serranos','tulija','usumacinta']);
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const fmt=v=>finite(v)?`${Number(v).toFixed(1)} mm`:'s/d';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const humanDate=v=>{if(!v)return's/d';const d=new Date(v);if(Number.isNaN(d.getTime()))return esc(String(v).replace('T',' '));return d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})};
  let bundlePromise=null;

  function active(){return document.querySelector('#nav button.active')?.dataset.section||''}
  function storageKey(k){return `ipcet-rain-guard:${k}`}
  async function readJSON(key,url){
    try{
      const r=await fetch(url,{cache:'default'});
      if(!r.ok)throw new Error(String(r.status));
      const j=await r.json();
      try{sessionStorage.setItem(storageKey(key),JSON.stringify(j))}catch{}
      return j;
    }catch(e){
      try{const s=sessionStorage.getItem(storageKey(key));if(s)return JSON.parse(s)}catch{}
      throw e;
    }
  }
  async function bundle(){
    if(bundlePromise)return bundlePromise;
    bundlePromise=Promise.all([
      readJSON('catalog',URLS.catalog),readJSON('weather',URLS.weather),readJSON('weatherState',URLS.weatherState),readJSON('conagua',URLS.conagua)
    ]).then(([catalog,weather,weatherState,conagua])=>({catalog,weather,weatherState,conagua})).catch(()=>null);
    return bundlePromise;
  }
  function validWeather(r){
    const age=Number(r?.age_seconds);
    return Number.isFinite(age)&&age<7200&&!/rezagado|heredado/i.test(String(r?.quality||''));
  }
  function weatherStations(j){return Array.isArray(j?.stations)?j.stations:[]}
  function catalogRows(j){return Array.isArray(j?.estaciones)?j.estaciones:[]}
  function conaguaRows(j){return Array.isArray(j)?j:[]}

  function rowsFor(system,data){
    const links=catalogRows(data.catalog).filter(x=>x?.sistema===system);
    const wantedW=new Set(links.filter(x=>norm(x.fuente)==='weatherlink').map(x=>norm(x.estacion)));
    const wantedC=new Set(links.filter(x=>norm(x.fuente)==='conagua').map(x=>norm(x.estacion)));
    const maturity=data.weatherState?.window_maturity||{};
    const rows=[];

    for(const r of weatherStations(data.weather)){
      if(!wantedW.has(norm(r.nombre))||!validWeather(r))continue;
      const a=r.accumulations_mm||{};
      rows.push({station:r.nombre,source:'WeatherLink',h24:maturity['24h']===true?a['24']:null,h48:maturity['48h']===true?a['48']:null,time:r.observed_utc||r.last_updated_at,quality:r.quality||'Cloud'});
    }
    for(const r of conaguaRows(data.conagua)){
      if(!wantedC.has(norm(r.estacion))||norm(r.estado_24h)!=='observado')continue;
      rows.push({station:r.estacion,source:'CONAGUA',h24:r.lluvia_24h_precedentes_mm,h48:r.estado_48h==='observado'?r.lluvia_48h_precedentes_mm:null,time:r.fecha_hora,quality:'observado'});
    }
    return rows.sort((a,b)=>(Number(b.h24)||0)-(Number(a.h24)||0)||String(a.station).localeCompare(String(b.station),'es'));
  }

  function table(rows){
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Fuente</th><th>24 h anteriores</th><th>48 h anteriores</th><th>Hora</th><th>Calidad</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.station)}</b></td><td>${esc(r.source)}</td><td>${fmt(r.h24)}</td><td>${fmt(r.h48)}</td><td>${humanDate(r.time)}</td><td>${esc(r.quality)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function rainPanel(){
    const content=document.getElementById('content');if(!content)return null;
    return [...content.querySelectorAll('section.panel, .panel')].find(p=>/lluvia\s+observada\s*[·\-]\s*24\s*y\s*48\s*h/i.test(p.querySelector('h2,h3')?.textContent||''))||null;
  }

  async function apply(){
    const system=active();if(!SYSTEMS.has(system))return;
    const panel=rainPanel();if(!panel||panel.dataset.catalogRainGuard==='1')return;
    const empty=[...panel.querySelectorAll('p')].some(p=>/sin lluvia observada válida para este apartado/i.test(p.textContent||''));
    if(!empty)return;
    panel.dataset.catalogRainGuard='1';
    const data=await bundle();
    if(!data){panel.dataset.catalogRainGuard='';return}
    const rows=rowsFor(system,data);
    if(!rows.length){panel.dataset.catalogRainGuard='';return}
    const p=[...panel.querySelectorAll('p')].find(x=>/sin lluvia observada válida para este apartado/i.test(x.textContent||''));
    if(p)p.outerHTML=table(rows);
  }

  function schedule(){setTimeout(apply,80);setTimeout(apply,350);setTimeout(apply,900)}
  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    document.getElementById('nav')?.addEventListener('click',schedule);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{bundlePromise=null;schedule()});
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>setTimeout(apply,60)).observe(content,{childList:true,subtree:true});
  });
})();
