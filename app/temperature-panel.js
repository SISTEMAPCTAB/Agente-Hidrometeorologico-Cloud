(() => {
  const URL='../data/weatherlink/latest.json';
  let latest=null;
  let timer=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const f2c=f=>(Number(f)-32)*5/9;

  function heatIndexF(t,rh){
    t=Number(t); rh=Number(rh);
    if(!Number.isFinite(t)||!Number.isFinite(rh))return null;
    if(t<80||rh<40)return null;
    let hi=-42.379+2.04901523*t+10.14333127*rh-0.22475541*t*rh-0.00683783*t*t-0.05481717*rh*rh+0.00122874*t*t*rh+0.00085282*t*rh*rh-0.00000199*t*t*rh*rh;
    if(rh<13&&t>=80&&t<=112){hi-=((13-rh)/4)*Math.sqrt((17-Math.abs(t-95))/17);}
    if(rh>85&&t>=80&&t<=87){hi+=((rh-85)/10)*((87-t)/5);}
    return hi;
  }

  function risk(st){
    const t=Number(st.temperature_f), rh=Number(st.humidity_pct);
    const hi=heatIndexF(t,rh);
    const value=Number.isFinite(hi)?hi:t;
    const basis=Number.isFinite(hi)?'Índice de calor':'Temperatura del aire';
    if(!Number.isFinite(value))return {level:'sin dato',cls:'temp-normal',value:null,basis};
    if(value>=125)return {level:'Peligro extremo',cls:'temp-extreme-danger',value,basis,alert:'Riesgo extremo por calor. Evitar exposición y actividad física; vigilancia inmediata de población vulnerable.'};
    if(value>=103)return {level:'Peligro',cls:'temp-danger',value,basis,alert:'Condición peligrosa por calor con exposición prolongada o actividad física. Reforzar hidratación, sombra y vigilancia.'};
    if(value>=90)return {level:'Precaución extrema',cls:'temp-extreme-caution',value,basis,alert:'Puede presentarse agotamiento por calor o golpe de calor con exposición prolongada o actividad física.'};
    if(value>=80)return {level:'Precaución',cls:'temp-caution',value,basis,alert:'Fatiga posible con exposición prolongada o actividad física.'};
    return {level:'Normal',cls:'temp-normal',value,basis,alert:''};
  }

  function usable(st){
    if(!st||!Number.isFinite(Number(st.temperature_f)))return false;
    if(norm(st.quality).includes('rezagado'))return false;
    const age=Number(st.age_seconds);
    return !Number.isFinite(age)||age<=7200;
  }

  function card(st){
    const r=risk(st), c=f2c(st.temperature_f), hi=r.basis==='Índice de calor'?f2c(r.value):null;
    return `<article class="temperature-card ${r.value>=103?'hot':''}"><h3>${esc(st.nombre)}</h3><div class="temperature-main"><strong>${c.toFixed(1)} °C</strong><span>${Number.isFinite(Number(st.humidity_pct))?`${Number(st.humidity_pct).toFixed(0)}% HR`:'HR s/d'}</span></div><div class="temperature-meta"><span>${r.basis}: ${hi!==null?`${hi.toFixed(1)} °C`:`${c.toFixed(1)} °C`}</span><span>${esc(st.ubicacion||'s/d')}</span><span>${esc(st.last_updated_at||st.observed_utc||'s/d')}</span><span>${Number.isFinite(Number(st.wind_mph))?`Viento ${Number(st.wind_mph).toFixed(1)} mph`:'Viento s/d'}</span></div><div class="temperature-alert ${r.cls}">${esc(r.level)}${r.alert?` · ${esc(r.alert)}`:''}</div></article>`;
  }

  function render(){
    const title=document.getElementById('pageTitle')?.textContent?.trim();
    if(!['Resumen operativo','WeatherLink / CONAGUA'].includes(title))return;
    const content=document.getElementById('content');
    if(!content||!latest)return;
    content.querySelector('#temperaturePanel')?.remove();
    const stations=(latest.stations||[]).filter(usable).map(s=>({...s,_risk:risk(s)})).sort((a,b)=>(b._risk.value??-999)-(a._risk.value??-999));
    if(!stations.length)return;
    const danger=stations.filter(s=>(s._risk.value??0)>=103);
    const max=stations[0];
    const maxC=f2c(max.temperature_f);
    const maxRisk=max._risk;
    const wrap=document.createElement('section');
    wrap.id='temperaturePanel'; wrap.className='panel wide temperature-panel';
    wrap.innerHTML=`<h2>Temperatura e índice de calor · estaciones automáticas</h2>${danger.length?`<div class="temperature-critical-banner">⚠ ${danger.length} estación(es) en nivel de peligro por calor<span>La alerta usa índice de calor cuando temperatura ≥80 °F y humedad ≥40%; en caso contrario se usa la temperatura observada como referencia.</span></div>`:''}<div class="temperature-summary"><span class="temp-chip ${maxRisk.cls}">Máxima observada: ${maxC.toFixed(1)} °C · ${esc(max.nombre)}</span><span class="temp-chip ${maxRisk.cls}">${esc(maxRisk.basis)}: ${f2c(maxRisk.value).toFixed(1)} °C · ${esc(maxRisk.level)}</span><span class="temp-chip temp-normal">Estaciones actuales: ${stations.length}</span></div><div class="temperature-grid">${stations.map(card).join('')}</div><div class="temperature-note">Escala operativa basada en índice de calor NWS: precaución 80–90 °F, precaución extrema 90–103 °F, peligro 103–125 °F y peligro extremo ≥125 °F. La Secretaría de Salud de México advierte que el golpe de calor puede ser mortal y recomienda evitar exposición prolongada al sol, especialmente durante las horas de mayor intensidad. Este panel es preventivo y no sustituye valoración médica.</div>`;
    content.prepend(wrap);
  }

  async function refresh(){try{const r=await fetch(URL,{cache:'no-store'});if(r.ok){latest=await r.json();render();}}catch(e){console.warn('Temperatura no actualizada:',e);}}
  function watch(){
    const title=document.getElementById('pageTitle'), content=document.getElementById('content');
    if(title)new MutationObserver(()=>setTimeout(render,0)).observe(title,{childList:true,subtree:true,characterData:true});
    if(content)new MutationObserver(()=>{if(['Resumen operativo','WeatherLink / CONAGUA'].includes(document.getElementById('pageTitle')?.textContent?.trim())&&!content.querySelector('#temperaturePanel'))setTimeout(render,0)}).observe(content,{childList:true});
    timer=setInterval(refresh,60000); window.addEventListener('focus',refresh); window.addEventListener('online',refresh);
  }
  document.addEventListener('DOMContentLoaded',()=>{refresh();watch();});
})();
