(() => {
  const URL='../data/weatherlink/latest.json';
  const SUMMARY_URL='../data/weatherlink/temperature_summary.json';
  let latest=null;
  let summary=null;
  let timer=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const f2c=f=>(Number(f)-32)*5/9;
  const mph2kmh=mph=>Number(mph)*1.609344;

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
    const tF=Number(st.temperature_f), rh=Number(st.humidity_pct);
    const hiF=heatIndexF(tF,rh);
    const valueF=Number.isFinite(hiF)?hiF:tF;
    const basis=Number.isFinite(hiF)?'Índice de calor':'Temperatura del aire';
    if(!Number.isFinite(valueF))return {level:'sin dato',cls:'temp-normal',valueC:null,basis};
    const valueC=f2c(valueF);
    if(valueC>=51.7)return {level:'Peligro extremo',cls:'temp-extreme-danger',valueC,basis,alert:'Riesgo extremo por calor. Evitar exposición y actividad física; vigilancia inmediata de población vulnerable.'};
    if(valueC>=39.4)return {level:'Peligro',cls:'temp-danger',valueC,basis,alert:'Condición peligrosa por calor con exposición prolongada o actividad física. Reforzar hidratación, sombra y vigilancia.'};
    if(valueC>=32.2)return {level:'Precaución extrema',cls:'temp-extreme-caution',valueC,basis,alert:'Puede presentarse agotamiento por calor o golpe de calor con exposición prolongada o actividad física.'};
    if(valueC>=26.7)return {level:'Precaución',cls:'temp-caution',valueC,basis,alert:'Fatiga posible con exposición prolongada o actividad física.'};
    return {level:'Normal',cls:'temp-normal',valueC,basis,alert:''};
  }

  function riskClass(level){
    const n=norm(level);
    if(n.includes('peligro extremo'))return 'temp-extreme-danger';
    if(n==='peligro')return 'temp-danger';
    if(n.includes('precaucion extrema'))return 'temp-extreme-caution';
    if(n==='precaucion')return 'temp-caution';
    return 'temp-normal';
  }

  function usable(st){
    if(!st||!Number.isFinite(Number(st.temperature_f)))return false;
    if(norm(st.quality).includes('rezagado'))return false;
    const age=Number(st.age_seconds);
    return !Number.isFinite(age)||age<=7200;
  }

  function dailyFor(name){
    return (summary?.stations||[]).find(x=>norm(x.estacion)===norm(name))||null;
  }

  function card(st){
    const r=risk(st), c=f2c(st.temperature_f), d=dailyFor(st.nombre);
    const hot=Number.isFinite(r.valueC)&&r.valueC>=39.4;
    return `<article class="temperature-card ${hot?'hot':''}"><h3>${esc(st.nombre)}</h3><div class="temperature-main"><strong>${c.toFixed(1)} °C</strong><span>${Number.isFinite(Number(st.humidity_pct))?`${Number(st.humidity_pct).toFixed(0)}% HR`:'HR s/d'}</span></div><div class="temperature-meta"><span>${r.basis}: ${Number.isFinite(r.valueC)?`${r.valueC.toFixed(1)} °C`:'s/d'}</span><span>${esc(st.ubicacion||'s/d')}</span><span>${esc(st.last_updated_at||st.observed_utc||'s/d')}</span><span>${Number.isFinite(Number(st.wind_mph))?`Viento ${mph2kmh(st.wind_mph).toFixed(1)} km/h`:'Viento s/d'}</span>${d?`<span>Máx. día: ${Number(d.max_temp_c).toFixed(1)} °C</span><span>Máx. índice de calor: ${Number(d.max_heat_index_c).toFixed(1)} °C</span>`:''}</div><div class="temperature-alert ${r.cls}">${esc(r.level)}${r.alert?` · ${esc(r.alert)}`:''}</div></article>`;
  }

  function territoryPanel(){
    const rows=summary?.territories||[];
    if(!rows.length)return '';
    return `<div class="temperature-territories"><h3>Resumen territorial del calor</h3><div class="temperature-territory-grid">${rows.map(r=>`<article><strong>${esc(r.territorio)}</strong><span>${Number(r.max_temp_c).toFixed(1)} °C máx.</span><span>${Number(r.max_heat_index_c).toFixed(1)} °C índice máx.</span><small>${esc(r.estacion_mas_caliente||'s/d')} · ${esc(r.nivel_riesgo||'s/d')} · ${Number(r.estaciones||0)} estación(es)</small></article>`).join('')}</div></div>`;
  }

  function render(){
    const title=document.getElementById('pageTitle')?.textContent?.trim();
    if(!['Resumen operativo','WeatherLink / CONAGUA'].includes(title))return;
    const content=document.getElementById('content');
    if(!content||!latest)return;
    content.querySelector('#temperaturePanel')?.remove();
    const stations=(latest.stations||[]).filter(usable).map(s=>({...s,_risk:risk(s)})).sort((a,b)=>(b._risk.valueC??-999)-(a._risk.valueC??-999));
    if(!stations.length)return;
    const danger=stations.filter(s=>(s._risk.valueC??-999)>=39.4);
    const max=stations[0];
    const maxC=f2c(max.temperature_f);
    const maxRisk=max._risk;
    const dailyRows=summary?.stations||[];
    const dailyTop=dailyRows.length?dailyRows[0]:null;
    const wrap=document.createElement('section');
    wrap.id='temperaturePanel'; wrap.className='panel wide temperature-panel';
    wrap.innerHTML=`<h2>Temperatura e índice de calor · estaciones automáticas</h2>${danger.length?`<div class="temperature-critical-banner">⚠ ${danger.length} estación(es) en nivel de peligro por calor<span>La alerta considera temperatura y humedad relativa; toda la visualización se expresa en grados Celsius.</span></div>`:''}<div class="temperature-summary"><span class="temp-chip ${maxRisk.cls}">Actual más alta: ${maxC.toFixed(1)} °C · ${esc(max.nombre)}</span><span class="temp-chip ${maxRisk.cls}">${esc(maxRisk.basis)}: ${Number.isFinite(maxRisk.valueC)?maxRisk.valueC.toFixed(1):'s/d'} °C · ${esc(maxRisk.level)}</span>${dailyTop?`<span class="temp-chip ${riskClass(dailyTop.nivel_riesgo_max)}">Máximo del día: ${Number(dailyTop.max_temp_c).toFixed(1)} °C · ${esc(dailyTop.estacion)}</span><span class="temp-chip ${riskClass(dailyTop.nivel_riesgo_max)}">Índice de calor máximo del día: ${Number(dailyTop.max_heat_index_c).toFixed(1)} °C</span>`:''}<span class="temp-chip temp-normal">Estaciones actuales: ${stations.length}</span></div>${territoryPanel()}<div class="temperature-grid">${stations.map(card).join('')}</div><div class="temperature-note">Toda la información térmica se presenta en °C. Escala preventiva: precaución desde 26.7 °C de índice de calor; precaución extrema desde 32.2 °C; peligro desde 39.4 °C; peligro extremo desde 51.7 °C. Las máximas diarias se construyen con las observaciones recibidas por el agente cloud durante el día; no se inventan horas previas que no hayan sido almacenadas.</div>`;
    content.prepend(wrap);
  }

  async function refresh(){
    try{
      const [r1,r2]=await Promise.all([fetch(URL,{cache:'no-store'}),fetch(SUMMARY_URL,{cache:'no-store'}).catch(()=>null)]);
      if(r1?.ok)latest=await r1.json();
      if(r2?.ok)summary=await r2.json();
      render();
    }catch(e){console.warn('Temperatura no actualizada:',e);}
  }
  function watch(){
    const title=document.getElementById('pageTitle'), content=document.getElementById('content');
    if(title)new MutationObserver(()=>setTimeout(render,0)).observe(title,{childList:true,subtree:true,characterData:true});
    if(content)new MutationObserver(()=>{if(['Resumen operativo','WeatherLink / CONAGUA'].includes(document.getElementById('pageTitle')?.textContent?.trim())&&!content.querySelector('#temperaturePanel'))setTimeout(render,0)}).observe(content,{childList:true});
    timer=setInterval(refresh,60000); window.addEventListener('focus',refresh); window.addEventListener('online',refresh);
  }
  document.addEventListener('DOMContentLoaded',()=>{refresh();watch();});
})();
