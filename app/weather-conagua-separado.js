(() => {
  const BASE='..';
  const latestConaguaUrl=`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`;
  const climateUrl=`${BASE}/data/niveles/Clima_CONAGUA/ultimo_corte.json`;
  const catalogUrl=`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`;
  const SYSTEM_ORDER=['presas','serranos','tulija','usumacinta'];
  const SYSTEM_FALLBACK={
    presas:'Presas–Mezcalapa–Samaria y Carrizal',
    serranos:'Ríos Serranos–Grijalva',
    tulija:'Tulijá–Puxcatán–Chilapa',
    usumacinta:'Usumacinta'
  };

  // Control de concurrencia de render. Evita que una respuesta asíncrona vieja
  // modifique la vista después de pulsar Actualizar o cambiar de apartado.
  let renderGeneration=0;
  let splitInFlight=false;
  let splitTimer=null;

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const fmt=v=>finite(v)?`${Number(v).toFixed(1)} mm`:'s/d';
  const fmtC=v=>finite(v)?`${Number(v).toFixed(1)} °C`:'s/d';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));

  function active(){return document.querySelector('#nav button.active')?.dataset.section||'resumen'}

  function splitReady(content=document.getElementById('content')){
    if(!content)return false;
    const titles=[...content.querySelectorAll('section.panel.wide > h2')].map(h=>norm(h.textContent));
    return titles.some(t=>t==='weatherlink · lluvia y temperatura') &&
           titles.some(t=>t==='conagua · lluvia horaria por subcuencas');
  }

  function reorderNav(){
    const nav=document.getElementById('nav');if(!nav)return;
    const resumen=nav.querySelector('button[data-section="resumen"]');
    const pronostico=nav.querySelector('button[data-section="pronostico"]');
    const weather=nav.querySelector('button[data-section="weather"]');
    if(resumen&&pronostico&&resumen.nextElementSibling!==pronostico){nav.insertBefore(pronostico,resumen.nextElementSibling)}
    if(pronostico&&weather&&pronostico.nextElementSibling!==weather){nav.insertBefore(weather,pronostico.nextElementSibling)}
  }

  function cloneFilteredTable(table,source){
    const clone=table.cloneNode(true);
    const headers=[...clone.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const srcIdx=headers.findIndex(h=>h==='fuente');
    [...clone.querySelectorAll('tbody tr')].forEach(tr=>{
      const cell=srcIdx>=0?tr.cells[srcIdx]:null;
      if(!cell||norm(cell.textContent)!==norm(source))tr.remove();
    });
    return clone;
  }

  async function conaguaRows(){
    try{
      const r=await fetch(`${latestConaguaUrl}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return [];
      const rows=await r.json(); return Array.isArray(rows)?rows:[];
    }catch{return []}
  }
  async function climateRows(){
    try{
      const r=await fetch(`${climateUrl}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return {conagua_tabasco:[],frontera_sur:[]};
      const j=await r.json();return {conagua_tabasco:Array.isArray(j.conagua_tabasco)?j.conagua_tabasco:[],frontera_sur:Array.isArray(j.frontera_sur)?j.frontera_sur:[]};
    }catch{return {conagua_tabasco:[],frontera_sur:[]}}
  }
  async function hydrologicCatalog(){
    try{
      const r=await fetch(`${catalogUrl}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return {systems:SYSTEM_FALLBACK,rows:[]};
      const j=await r.json();
      return {systems:{...SYSTEM_FALLBACK,...(j.sistemas||{})},rows:Array.isArray(j.estaciones)?j.estaciones:[]};
    }catch{return {systems:SYSTEM_FALLBACK,rows:[]}}
  }

  function enrichConagua(table,map){
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const stationIdx=headers.findIndex(h=>h==='estacion');
    const qualityIdx=headers.findIndex(h=>h==='calidad');
    if(stationIdx<0||qualityIdx<0)return;
    [...table.querySelectorAll('tbody tr')].forEach(tr=>{
      const st=norm(tr.cells[stationIdx]?.textContent);const r=map.get(st);if(!r)return;
      const q=[];
      q.push(r.estado_24h==='observado'?'observado':'sin dato 24 h');
      if(r.estado_hoy==='observado'&&finite(r.lluvia_hoy_desde_08_mm))q.push(`HOY ${fmt(r.lluvia_hoy_desde_08_mm)} desde 08:00`);
      tr.cells[qualityIdx].textContent=q.join(' · ');
    });
  }

  function groupedTables(table,source,catalog){
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const stationIdx=headers.findIndex(h=>h==='estacion');
    const stateIdx=headers.findIndex(h=>h==='estado');
    if(stationIdx<0)return [];
    const byStation=new Map([...table.querySelectorAll('tbody tr')].map(tr=>[norm(tr.cells[stationIdx]?.textContent),tr]));
    const entries=catalog.rows.filter(x=>norm(x.fuente)===norm(source)&&SYSTEM_ORDER.includes(x.sistema));
    if(norm(source)==='weatherlink'){
      const direct=[
        ['OSTUACÁN PCIVILCHIAPAS','presas'],['JUÁREZ PCIVILCHIAPAS','presas'],['Impulsora','presas'],['PASO LA MINA','presas'],['Modesta_1','presas'],
        ['AMATÁN PCIVILCHIAPAS','serranos'],['PICHUCALCO PCIVILCHIAPAS','serranos'],['IXHUATAN PCIVILCHIAPAS','serranos'],['CHAPULTENANGO PCIVILCHIAPAS','serranos'],['ACALA PCIVILCHIAPAS','serranos'],['BERRIOZÁBAL PCIVILCHIAPAS','serranos'],['MAYA BERRIOZABAL PCIVILCHIAPAS','serranos'],['Cipat Chiapas','serranos'],['ASUR Villahermosa','serranos'],['Centro','serranos'],['SAN CAYETANO CONSOLA','serranos'],
        ['SALTO DE AGUA PCIVILCHIAPAS','tulija'],['PALENQUE PCIVILCHIAPAS','tulija'],['Sinai','tulija'],['IGeofisica-M2','usumacinta'],['Yaxhá - INSIVUMEH PETEN','usumacinta']
      ].map(([estacion,sistema])=>({fuente:'WEATHERLINK',estacion,sistema}));
      for(const e of direct){if(!entries.some(x=>x.sistema===e.sistema&&norm(x.estacion)===norm(e.estacion)))entries.push(e)}
    }
    const out=[];
    for(const system of SYSTEM_ORDER){
      const wanted=entries.filter(x=>x.sistema===system),rows=[],seen=new Set();
      for(const e of wanted){
        const key=norm(e.estacion),tr=byStation.get(key);if(!tr||seen.has(key))continue;
        // No ocultar estaciones WeatherLink rezagadas: sus acumulados recientes
        // pueden seguir siendo útiles como antecedente preventivo. Se conservan
        // visibles con su estado/calidad original, pero no deben tratarse como
        // observación actual en semáforo ni síntesis.
        rows.push(tr.cloneNode(true));seen.add(key);
      }
      if(!rows.length)continue;
      const t=table.cloneNode(true),body=t.querySelector('tbody');body.innerHTML='';rows.forEach(r=>body.appendChild(r));
      out.push({system,title:catalog.systems[system]||SYSTEM_FALLBACK[system]||system,table:t});
    }
    return out;
  }

  function conaguaHourlyGroups(rows,catalog){
    const byStation=new Map(rows.map(r=>[norm(r.estacion),r]));
    const entries=catalog.rows.filter(x=>norm(x.fuente)==='conagua'&&SYSTEM_ORDER.includes(x.sistema));
    const out=[];
    for(const system of SYSTEM_ORDER){
      const body=[];const seen=new Set();
      for(const e of entries.filter(x=>x.sistema===system)){
        const key=norm(e.estacion),r=byStation.get(key);if(!r||seen.has(key))continue;
        seen.add(key);
        const stateHoy=r.estado_hoy==='observado'?'observado':'s/d';
        const state24=r.estado_24h==='observado'?'observado':'s/d';
        const state48=r.estado_48h==='observado'?'observado':'s/d';
        const cut=String(r.fecha_hora||'s/d').replace('T',' ').replace('-06:00','');
        body.push(`<tr><td><b>${esc(r.estacion||e.estacion)}</b></td><td>${esc(e.subcuenca||'s/d')}</td><td><b>${fmt(r.lluvia_hoy_desde_08_mm)}</b><br><small>${stateHoy}</small></td><td>${fmt(r.lluvia_24h_precedentes_mm)}<br><small>${state24}</small></td><td>${fmt(r.lluvia_48h_precedentes_mm)}<br><small>${state48}</small></td><td>${esc(cut)}</td></tr>`);
      }
      if(!body.length)continue;
      const html=`<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Subcuenca</th><th>HOY desde 08:00</th><th>24 h anteriores</th><th>48 h</th><th>Hora de corte</th></tr></thead><tbody>${body.join('')}</tbody></table></div>`;
      out.push({system,title:catalog.systems[system]||SYSTEM_FALLBACK[system]||system,html});
    }
    return out;
  }

  function appendGrouped(container,groups){
    if(!groups.length){container.innerHTML='<p class="muted">Sin estaciones vinculadas a las subcuencas verificadas en este corte.</p>';return}
    groups.forEach(g=>{
      const block=document.createElement('div');block.className='subcuenca-weather-block';
      const h=document.createElement('h3');h.textContent=g.title;block.appendChild(h);
      const wrap=document.createElement('div');wrap.className='table-wrap';wrap.appendChild(g.table);block.appendChild(wrap);container.appendChild(block);
    });
  }

  function appendHourlyGrouped(container,groups){
    if(!groups.length){container.innerHTML='<p class="muted">Sin estaciones horarias CONAGUA vinculadas a las subcuencas verificadas en este corte.</p>';return}
    groups.forEach(g=>{
      const block=document.createElement('div');block.className='subcuenca-weather-block conagua-hourly-priority';
      const h=document.createElement('h3');h.textContent=g.title;block.appendChild(h);
      const body=document.createElement('div');body.innerHTML=g.html;while(body.firstChild)block.appendChild(body.firstChild);
      container.appendChild(block);
    });
  }

  function allConaguaTable(rows){
    const sorted=[...rows].sort((a,b)=>String(a.estacion||'').localeCompare(String(b.estacion||''),'es'));
    if(!sorted.length)return '<p class="muted">Sin corte horario CONAGUA disponible.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>HOY desde 08:00</th><th>24 h anteriores</th><th>48 h</th><th>Hora de corte</th><th>Estado</th></tr></thead><tbody>${sorted.map(r=>`<tr><td><b>${esc(r.estacion||'s/d')}</b></td><td><b>${fmt(r.lluvia_hoy_desde_08_mm)}</b></td><td>${fmt(r.lluvia_24h_precedentes_mm)}</td><td>${fmt(r.lluvia_48h_precedentes_mm)}</td><td>${esc(String(r.fecha_hora||'s/d').replace('T',' ').replace('-06:00',''))}</td><td>${r.estado_hoy==='observado'?'horario vigente':(r.estado_24h==='observado'?'referencia 24 h':'s/d')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function climateTable(rows){
    if(!rows.length)return '<p class="muted">Sin filas con lluvia y temperatura numéricas estructuradas en este boletín.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Fuente</th><th>Lluvia 24 h</th><th>Temp. máx.</th><th>Temp. mín.</th><th>Mensaje</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.codigo?`${r.codigo} · ${r.estacion}`:r.estacion)}</b></td><td>${esc(r.fuente||'s/d')}</td><td>${fmt(r.lluvia_24h_mm)}</td><td>${fmtC(r.temp_max_c)}</td><td>${fmtC(r.temp_min_c)}</td><td>${esc(String(r.fecha_hora_mensaje||'s/d').replace('T',' '))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function ensureStyles(){
    if(document.getElementById('weatherSubcuencaStyle'))return;
    const s=document.createElement('style');s.id='weatherSubcuencaStyle';
    s.textContent='.subcuenca-weather-block{margin:16px 0 22px}.subcuenca-weather-block:first-child{margin-top:8px}.subcuenca-weather-block h3{margin:0 0 8px;color:#6f112d;font-size:1rem}.subcuenca-weather-block .table-wrap{margin-top:0}.conagua-all{margin-top:20px}.conagua-all h3{color:#6f112d;margin:0 0 8px}.conagua-priority-note{border-left:4px solid #6f112d;padding:10px 12px;background:#faf6f7;margin:8px 0 16px}.conagua-hourly-priority th:nth-child(3),.conagua-hourly-priority td:nth-child(3){background:#faf6f7}';document.head.appendChild(s);
  }

  function scheduleSplit(delay=120){
    clearTimeout(splitTimer);
    splitTimer=setTimeout(()=>splitWeather(),delay);
  }

  async function splitWeather(){
    reorderNav();
    if(active()!=='weather')return;

    const content=document.getElementById('content');
    if(!content||splitInFlight)return;
    // app.js puede volver a pintar #content (p. ej. actualización WeatherLink
    // cada 15 min) sin reemplazar el elemento y, por tanto, conservar el
    // atributo dataset anterior. Sólo damos la vista por terminada si los
    // dos paneles separados realmente existen.
    if(content.dataset.weatherSplit==='1'&&splitReady(content))return;
    if(!splitReady(content))delete content.dataset.weatherSplit;

    const generation=renderGeneration;
    const panel=[...content.querySelectorAll('section.panel.wide')].find(s=>/weatherlink\s*\/\s*conagua/i.test(s.querySelector('h2')?.textContent||''));
    const table=panel?.querySelector('table');
    if(!panel||!table)return;

    // Guardamos la identidad de la vista base. Si app.js vuelve a renderizarla
    // durante las consultas, esta ejecución se descarta y no marca la nueva
    // vista como "ya procesada".
    const basePanel=panel;
    splitInFlight=true;
    try{
      const [conRows,climate,catalog]=await Promise.all([conaguaRows(),climateRows(),hydrologicCatalog()]);

      if(
        generation!==renderGeneration ||
        active()!=='weather' ||
        document.getElementById('content')!==content ||
        !basePanel.isConnected ||
        basePanel.parentElement==null ||
        content.dataset.weatherSplit==='1'
      ) return;

      const map=new Map(conRows.map(x=>[norm(x.estacion),x]));
      const wlTable=cloneFilteredTable(table,'WeatherLink');
      const conTable=cloneFilteredTable(table,'CONAGUA');
      enrichConagua(conTable,map);
      const wlGroups=groupedTables(wlTable,'WEATHERLINK',catalog);
      const conGroups=groupedTables(conTable,'CONAGUA',catalog);
      const hourlyGroups=conaguaHourlyGroups(conRows,catalog);

      ensureStyles();
      const grid=basePanel.parentElement;
      const wl=document.createElement('section');wl.className='panel wide';
      wl.innerHTML='<h2>WeatherLink · lluvia y temperatura</h2><p class="muted">Estaciones activas vinculadas a las subcuencas que se verifican operativamente. Se conservan las mismas columnas y las ventanas inmaduras se muestran como s/d.</p><div class="weather-source-groups"></div>';
      appendGrouped(wl.querySelector('.weather-source-groups'),wlGroups);

      const con=document.createElement('section');con.className='panel wide';
      con.innerHTML='<h2>CONAGUA · lluvia horaria por subcuencas</h2><div class="conagua-priority-note"><b>Prioridad operativa:</b> primero se presenta el corte horario vigente y el acumulado <b>HOY desde 08:00</b> por subcuenca. Los acumulados de 24 h y 48 h quedan como antecedentes comparativos; el boletín diario de 24 h no sustituye el seguimiento horario.</div><div class="conagua-hourly-groups"></div><div class="conagua-all"><h3>Referencia diaria por subcuencas</h3><p class="muted">Datos diarios conservados como contexto antecedente.</p><div class="weather-source-groups"></div></div><div class="conagua-all"><h3>Todas las estaciones del corte horario CONAGUA</h3>'+allConaguaTable(conRows)+'</div><div class="conagua-all"><h3>Boletín CONAGUA Tabasco · referencia diaria</h3>'+climateTable(climate.conagua_tabasco)+'</div><div class="conagua-all"><h3>Organismo de Cuenca Frontera Sur · referencia diaria</h3>'+climateTable(climate.frontera_sur)+'</div>';
      appendHourlyGrouped(con.querySelector('.conagua-hourly-groups'),hourlyGroups);
      appendGrouped(con.querySelector('.weather-source-groups'),conGroups);

      // Última validación justo antes de tocar el DOM.
      if(generation!==renderGeneration||!basePanel.isConnected||active()!=='weather')return;
      grid.insertBefore(wl,basePanel);
      grid.insertBefore(con,basePanel);
      basePanel.remove();
      content.dataset.weatherSplit='1';
      content.dispatchEvent(new CustomEvent('weather-layout-ready',{bubbles:false}));
    }finally{
      splitInFlight=false;
      // Si la vista fue reemplazada mientras esperábamos, el MutationObserver
      // habrá detectado el nuevo contenido; este intento adicional cubre también
      // redes lentas sin crear renderizados duplicados.
      const live=document.getElementById('content');
      if(active()==='weather'&&(!splitReady(live)||live?.dataset.weatherSplit!=='1'))scheduleSplit(100);
    }
  }

  function invalidateAndRun(){
    renderGeneration++;
    splitInFlight=false;
    const content=document.getElementById('content');
    if(content)delete content.dataset.weatherSplit;
    scheduleSplit(120);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    reorderNav();
    scheduleSplit(250);

    document.getElementById('nav')?.addEventListener('click',()=>{
      renderGeneration++;
      splitInFlight=false;
      setTimeout(()=>{reorderNav();scheduleSplit(80)},40);
    });

    document.getElementById('refreshBtn')?.addEventListener('click',invalidateAndRun);

    const nav=document.getElementById('nav');
    if(nav)new MutationObserver(reorderNav).observe(nav,{childList:true});

    const content=document.getElementById('content')||document.body;
    new MutationObserver(()=>{
      if(active()!=='weather')return;
      // No reaccionar a nuestras propias inserciones cuando la vista ya quedó lista.
      const live=document.getElementById('content');
      if(splitReady(live)&&live?.dataset.weatherSplit==='1')return;
      if(live&&!splitReady(live))delete live.dataset.weatherSplit;
      scheduleSplit(80);
    }).observe(content,{childList:true,subtree:true});
  });
})();
