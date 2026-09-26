(() => {
  const BASE='..';
  const URLS={
    weather:`${BASE}/data/weatherlink/latest.json`,
    weatherExtra:`${BASE}/data/weatherlink/extra_latest.json`,
    conagua:`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`,
    climate:`${BASE}/data/niveles/Clima_CONAGUA/ultimo_corte.json`,
    catalog:`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`
  };
  const SYSTEM_ORDER=['presas','serranos','tulija','usumacinta'];
  const SYSTEM_FALLBACK={
    presas:'Presas–Mezcalapa–Samaria y Carrizal',
    serranos:'Ríos Serranos (Oxolotán, Amatán, Tacotalpa, Teapa, Puyacatengo, La Sierra y Pichucalco)–Grijalva',
    tulija:'Tulijá–Puxcatán–Chilapa',
    usumacinta:'Usumacinta'
  };
  const DIRECT_WEATHER=[
    ['OSTUACÁN PCIVILCHIAPAS','presas'],['JUÁREZ PCIVILCHIAPAS','presas'],['Impulsora','presas'],['PASO LA MINA','presas'],['Modesta_1','presas'],
    ['AMATÁN PCIVILCHIAPAS','serranos'],['PICHUCALCO PCIVILCHIAPAS','serranos'],['IXHUATAN PCIVILCHIAPAS','serranos'],['CHAPULTENANGO PCIVILCHIAPAS','serranos'],['ACALA PCIVILCHIAPAS','serranos'],['BERRIOZÁBAL PCIVILCHIAPAS','serranos'],['MAYA BERRIOZABAL PCIVILCHIAPAS','serranos'],['Cipat Chiapas','serranos'],['ASUR Villahermosa','serranos'],['Centro','serranos'],['SAN CAYETANO CONSOLA','serranos'],
    ['SALTO DE AGUA PCIVILCHIAPAS','tulija'],['PALENQUE PCIVILCHIAPAS','tulija'],['Sinai','tulija'],
    ['ETM Bertollini','usumacinta'],['IGeofisica-M2','usumacinta'],['Urrutia','usumacinta'],['Yaxhá - INSIVUMEH PETEN','usumacinta']
  ];

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const mm=v=>finite(v)?`${Number(v).toFixed(1)} mm`:'s/d';
  const celsius=f=>finite(f)?`${((Number(f)-32)*5/9).toFixed(1)} °C`:'s/d';
  const human=v=>{if(!v)return's/d';const d=new Date(v);return Number.isNaN(d.getTime())?esc(String(v).replace('T',' ')):d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})};
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'';

  let cache=null, cacheAt=0, inFlight=null, generation=0, timer=null;

  async function fetchJSON(url,fallback){
    try{const r=await fetch(url,{cache:'no-cache'});return r.ok?await r.json():fallback}catch{return fallback}
  }
  async function bundle(force=false){
    const now=Date.now();
    if(!force&&cache&&now-cacheAt<60000)return cache;
    if(inFlight)return inFlight;
    inFlight=Promise.all([
      fetchJSON(URLS.weather,{stations:[]}),
      fetchJSON(URLS.weatherExtra,{stations:[]}),
      fetchJSON(URLS.conagua,[]),
      fetchJSON(URLS.climate,{conagua_tabasco:[],frontera_sur:[]}),
      fetchJSON(URLS.catalog,{sistemas:{},estaciones:[]})
    ]).then(([weather,extra,conagua,climate,catalog])=>{
      cache={weather,extra,conagua,climate,catalog};cacheAt=Date.now();return cache;
    }).finally(()=>{inFlight=null});
    return inFlight;
  }

  function weatherMap(data){
    const all=[...(Array.isArray(data.weather?.stations)?data.weather.stations:[]),...(Array.isArray(data.extra?.stations)?data.extra.stations:[])];
    const map=new Map();
    for(const r of all){const k=norm(r.nombre);if(k&&!map.has(k))map.set(k,r)}
    return map;
  }
  function links(data,source){
    const rows=Array.isArray(data.catalog?.estaciones)?data.catalog.estaciones:[];
    const out=rows.filter(x=>norm(x.fuente)===norm(source)&&SYSTEM_ORDER.includes(x.sistema)).map(x=>({...x}));
    if(norm(source)==='weatherlink'){
      for(const [estacion,sistema] of DIRECT_WEATHER){
        if(!out.some(x=>x.sistema===sistema&&norm(x.estacion)===norm(estacion)))out.push({fuente:'WEATHERLINK',estacion,sistema});
      }
    }
    return out;
  }
  function systemTitle(data,id){return data.catalog?.sistemas?.[id]||SYSTEM_FALLBACK[id]||id}

  function rainValue(v,status){
    if(!finite(v))return's/d';
    return `${status==='minimo_observado'?'≥ ':''}${mm(v)}`;
  }
  function weatherRow(r){
    const a=r.accumulations_mm||{},s=r.accumulation_status||{};
    const qualityFull=[r.quality||'Cloud'];
    if(r.estado&&r.estado!=='OK')qualityFull.push(r.estado);
    const minHours=['1','6','24','48'].filter(h=>s[h]==='minimo_observado');
    const isStale=/rezagado|heredado/i.test(String(r.estado||'')+' '+String(r.quality||''));
    const qualityShort=`Cloud${minHours.length?' · ≥ '+minHours.join('/')+' h':''}${isStale?' · Rezagado':''}`;
    return `<tr>
      <td><b>${esc(r.nombre||'s/d')}</b></td>
      <td>WeatherLink</td>
      <td>${rainValue(a['1'],s['1'])}</td>
      <td>${rainValue(a['6'],s['6'])}</td>
      <td>${rainValue(a['24'],s['24'])}</td>
      <td>${rainValue(a['48'],s['48'])}</td>
      <td>${celsius(r.temperature_f)}</td>
      <td>${finite(r.humidity_pct)?Number(r.humidity_pct).toFixed(0)+'%':'s/d'}</td>
      <td>${human(r.observed_utc||r.last_updated_at)}</td>
      <td class="weather-quality-cell" title="${esc(qualityFull.join(' · '))}">${esc(qualityShort)}</td>
    </tr>`;
  }
  function weatherTable(rows){
    if(!rows.length)return '<p class="muted">Sin estaciones vinculadas disponibles en este corte.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Fuente</th><th>1 h</th><th>6 h</th><th>24 h anteriores</th><th>48 h anteriores</th><th>Temperatura</th><th>Humedad</th><th>Hora</th><th>Calidad</th></tr></thead><tbody>${rows.map(weatherRow).join('')}</tbody></table></div>`;
  }
  function weatherBlocks(data){
    const map=weatherMap(data),lnk=links(data,'weatherlink'),parts=[];
    for(const id of SYSTEM_ORDER){
      if(id==='usumacinta'){
        parts.push('<div class="subcuenca-weather-block" data-alto-placeholder="1"><h3>Alto Usumacinta</h3><p class="muted">Integrando observaciones de Guatemala, Lacantún y WeatherLink…</p></div>');
      }
      const rows=[],seen=new Set();
      for(const e of lnk.filter(x=>x.sistema===id)){
        const k=norm(e.estacion),r=map.get(k);if(!r||seen.has(k))continue;seen.add(k);rows.push(r);
      }
      parts.push(`<div class="subcuenca-weather-block" data-system="${id}"><h3>${esc(systemTitle(data,id))}</h3>${weatherTable(rows)}</div>`);
    }
    return parts.join('');
  }

  function conaguaByStation(data){
    const list=Array.isArray(data.conagua)?data.conagua:[];
    const map=new Map(list.map(r=>[norm(r.estacion),r]));
    return {map,list};
  }
  function conaguaBlocks(data){
    const src=conaguaByStation(data),by=src.map,lnk=links(data,'conagua'),parts=[];
    for(const id of SYSTEM_ORDER){
      const rows=[],seen=new Set();
      for(const e of lnk.filter(x=>x.sistema===id)){
        const k=norm(e.estacion);
        // Compatibilidad con cortes ya publicados donde el PDF unió texto
        // vecino al nombre de estación. Se acepta únicamente un sufijo exacto
        // del nombre catalogado; no modifica valores ni otras subcuencas.
        const r=by.get(k)||src.list.find(x=>{
          const n=norm(x.estacion);
          return n===k || n.endsWith(' '+k) || n.endsWith('* '+k);
        });
        if(!r||seen.has(k))continue;seen.add(k);
        rows.push(`<tr><td><b>${esc(r.estacion||e.estacion)}</b></td><td>${esc(e.subcuenca||'s/d')}</td><td><b>${r.estado_hoy==='observado'?mm(r.lluvia_hoy_desde_08_mm):'s/d'}</b></td><td>${r.estado_24h==='observado'?mm(r.lluvia_24h_precedentes_mm):'s/d'}</td><td>${r.estado_48h==='observado'?mm(r.lluvia_48h_precedentes_mm):'s/d'}</td><td>${human(r.fecha_hora)}</td></tr>`);
      }
      // No se dibuja una tabla vacía: si el reporte horario vigente no trae
      // estaciones estructuradas de ese sistema, se conserva el dato diario
      // en los apartados de referencia inferiores sin ocupar espacio operativo.
      if(!rows.length)continue;
      parts.push(`<div class="subcuenca-weather-block conagua-hourly-priority" data-system="${id}"><h3>${esc(systemTitle(data,id))}</h3><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Subcuenca</th><th>HOY desde 08:00</th><th>24 h anteriores</th><th>48 h anteriores</th><th>Hora de corte</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`);
    }
    return parts.join('');
  }

  function climateTable(rows){
    const a=Array.isArray(rows)?rows:[];
    if(!a.length)return '<p class="muted">Sin filas estructuradas disponibles.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Fuente</th><th>Lluvia 24 h</th><th>Temp. máx.</th><th>Temp. mín.</th><th>Mensaje</th></tr></thead><tbody>${a.map(r=>`<tr><td><b>${esc(r.codigo?`${r.codigo} · ${r.estacion}`:r.estacion)}</b></td><td>${esc(r.fuente||'s/d')}</td><td>${mm(r.lluvia_24h_mm)}</td><td>${finite(r.temp_max_c)?Number(r.temp_max_c).toFixed(1)+' °C':'s/d'}</td><td>${finite(r.temp_min_c)?Number(r.temp_min_c).toFixed(1)+' °C':'s/d'}</td><td>${esc(String(r.fecha_hora_mensaje||'s/d').replace('T',' '))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function styles(){
    if(document.getElementById('weatherStableStyle'))return;
    const s=document.createElement('style');s.id='weatherStableStyle';
    s.textContent='.weather-source-groups{display:block}.subcuenca-weather-block{display:block!important;min-height:0!important;height:auto!important;margin:18px 0 26px!important}.subcuenca-weather-block h3{display:block!important;visibility:visible!important;opacity:1!important;color:#6f112d!important;margin:0 0 10px!important;font-size:1.05rem!important}.subcuenca-weather-block .table-wrap{display:block!important;min-height:0!important;height:auto!important;margin:0!important}.weather-stable-panel{overflow:visible!important}.weather-stable-panel .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.weather-stable-panel .weather-quality-cell{width:145px;min-width:115px;max-width:175px;white-space:normal!important;overflow-wrap:anywhere;font-size:.86rem;line-height:1.35;vertical-align:top}.conagua-priority-note{border-left:4px solid #6f112d;padding:10px 12px;background:#faf6f7;margin:8px 0 16px}';
    document.head.appendChild(s);
  }

  async function render(force=false){
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content)return;
    const myGen=++generation;
    const data=await bundle(force);
    if(myGen!==generation||active()!=='weather'||document.getElementById('content')!==content)return;
    styles();

    const climate=data.climate||{};
    content.innerHTML=`<div class="grid weather-stable-grid" data-weather-complete="1">
      <section class="panel wide weather-stable-panel">
        <h2>WeatherLink · lluvia y temperatura</h2>
        <p class="muted">Estaciones vinculadas a los sistemas operativos. Los acumulados marcados con ≥ son mínimos observados cuando existe un cruce de medianoche no verificable.</p>
        <div class="weather-source-groups">${weatherBlocks(data)}</div>
      </section>
      <section class="panel wide weather-stable-panel">
        <h2>CONAGUA · lluvia horaria por subcuencas</h2>
        <div class="conagua-priority-note"><b>Prioridad operativa:</b> primero se presenta el acumulado <b>HOY desde 08:00</b>; 24 h y 48 h se conservan como antecedentes comparativos.</div>
        <div class="conagua-hourly-groups">${conaguaBlocks(data)}</div>
        <div class="conagua-all"><h3>Boletín CONAGUA Tabasco · referencia diaria</h3>${climateTable(climate.conagua_tabasco)}</div>
        <div class="conagua-all"><h3>Organismo de Cuenca Frontera Sur · referencia diaria</h3>${climateTable(climate.frontera_sur)}</div>
      </section>
    </div>`;
    content.dataset.weatherSplit='1';
    content.dispatchEvent(new CustomEvent('weather-layout-ready',{bubbles:false}));
  }

  function schedule(force=false,delay=80){clearTimeout(timer);timer=setTimeout(()=>render(force),delay)}
  document.addEventListener('DOMContentLoaded',()=>{
    const content=document.getElementById('content');
    content?.addEventListener('app-rendered',e=>{if(e.detail?.section==='weather')schedule(false,20)});
    content?.addEventListener('weather-data-updated',()=>schedule(true,20));
    document.getElementById('nav')?.addEventListener('click',()=>schedule(false,120));
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{cache=null;cacheAt=0;schedule(true,120)});
    schedule(false,250);
  });
})();