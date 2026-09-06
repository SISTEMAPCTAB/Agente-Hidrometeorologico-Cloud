(() => {
  const BASE='..';
  const latestConaguaUrl=`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`;
  const catalogUrl=`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`;
  const SYSTEM_ORDER=['presas','serranos','tulija','usumacinta'];
  const SYSTEM_FALLBACK={
    presas:'Presas–Mezcalapa–Samaria y Carrizal',
    serranos:'Ríos Serranos–Grijalva',
    tulija:'Tulijá–Puxcatán–Chilapa',
    usumacinta:'Usumacinta'
  };

  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const fmt=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?'s/d':`${Number(v).toFixed(1)} mm`;

  function active(){return document.querySelector('#nav button.active')?.dataset.section||'resumen'}

  function reorderNav(){
    const nav=document.getElementById('nav');if(!nav)return;
    const resumen=nav.querySelector('button[data-section="resumen"]');
    const weather=nav.querySelector('button[data-section="weather"]');
    if(resumen&&weather&&resumen.nextElementSibling!==weather){nav.insertBefore(weather,resumen.nextElementSibling)}
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

  async function conaguaMap(){
    try{
      const r=await fetch(`${latestConaguaUrl}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return new Map();
      const rows=await r.json();
      return new Map((Array.isArray(rows)?rows:[]).map(x=>[norm(x.estacion),x]));
    }catch{return new Map()}
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
      if(r.estado_hoy==='observado'&&Number.isFinite(Number(r.lluvia_hoy_desde_08_mm))){
        q.push(`HOY ${fmt(r.lluvia_hoy_desde_08_mm)} desde 08:00`);
      }
      tr.cells[qualityIdx].textContent=q.join(' · ');
    });
  }

  function groupedTables(table,source,catalog){
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const stationIdx=headers.findIndex(h=>h==='estacion');
    if(stationIdx<0)return [];
    const byStation=new Map([...table.querySelectorAll('tbody tr')].map(tr=>[norm(tr.cells[stationIdx]?.textContent),tr]));
    const entries=catalog.rows.filter(x=>norm(x.fuente)===norm(source)&&SYSTEM_ORDER.includes(x.sistema));
    const out=[];
    for(const system of SYSTEM_ORDER){
      const wanted=entries.filter(x=>x.sistema===system);
      const rows=[];
      const seen=new Set();
      for(const e of wanted){
        const key=norm(e.estacion),tr=byStation.get(key);
        if(tr&&!seen.has(key)){rows.push(tr.cloneNode(true));seen.add(key)}
      }
      if(!rows.length)continue;
      const t=table.cloneNode(true);
      const body=t.querySelector('tbody');body.innerHTML='';rows.forEach(r=>body.appendChild(r));
      out.push({system,title:catalog.systems[system]||SYSTEM_FALLBACK[system]||system,table:t});
    }
    return out;
  }

  function appendGrouped(container,groups){
    if(!groups.length){container.innerHTML='<p class="muted">Sin estaciones vinculadas a las subcuencas verificadas en este corte.</p>';return}
    groups.forEach(g=>{
      const block=document.createElement('div');block.className='subcuenca-weather-block';
      const h=document.createElement('h3');h.textContent=g.title;block.appendChild(h);
      const wrap=document.createElement('div');wrap.className='table-wrap';wrap.appendChild(g.table);block.appendChild(wrap);
      container.appendChild(block);
    });
  }

  function ensureStyles(){
    if(document.getElementById('weatherSubcuencaStyle'))return;
    const s=document.createElement('style');s.id='weatherSubcuencaStyle';
    s.textContent='.subcuenca-weather-block{margin:16px 0 22px}.subcuenca-weather-block:first-child{margin-top:8px}.subcuenca-weather-block h3{margin:0 0 8px;color:#6f112d;font-size:1rem}.subcuenca-weather-block .table-wrap{margin-top:0}';
    document.head.appendChild(s);
  }

  async function splitWeather(){
    reorderNav();
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content||content.dataset.weatherSplit==='1')return;
    const panel=[...content.querySelectorAll('section.panel.wide')].find(s=>/weatherlink\s*\/\s*conagua/i.test(s.querySelector('h2')?.textContent||''));
    const table=panel?.querySelector('table');if(!panel||!table)return;
    const [map,catalog]=await Promise.all([conaguaMap(),hydrologicCatalog()]);
    const wlTable=cloneFilteredTable(table,'WeatherLink');
    const conTable=cloneFilteredTable(table,'CONAGUA');
    enrichConagua(conTable,map);
    const wlGroups=groupedTables(wlTable,'WEATHERLINK',catalog);
    const conGroups=groupedTables(conTable,'CONAGUA',catalog);

    ensureStyles();
    const grid=panel.parentElement;
    const wl=document.createElement('section');wl.className='panel wide';
    wl.innerHTML='<h2>WeatherLink · lluvia y temperatura</h2><p class="muted">Estaciones vinculadas a las subcuencas que se verifican operativamente. Se conservan las mismas columnas y las ventanas inmaduras se muestran como s/d.</p><div class="weather-source-groups"></div>';
    appendGrouped(wl.querySelector('.weather-source-groups'),wlGroups);

    const con=document.createElement('section');con.className='panel wide';
    con.innerHTML='<h2>CONAGUA · lluvia reportada en informes de niveles</h2><p class="muted">Estaciones vinculadas a las mismas subcuencas de seguimiento. “24 h anteriores” conserva el acumulado oficial; cuando el formato trae “HOY”, se conserva el acumulado desde las 08:00 h, sin convertir blancos en cero.</p><div class="weather-source-groups"></div>';
    appendGrouped(con.querySelector('.weather-source-groups'),conGroups);

    grid.insertBefore(wl,panel);grid.insertBefore(con,panel);panel.remove();content.dataset.weatherSplit='1';
  }

  function resetAndRun(){const c=document.getElementById('content');if(c)delete c.dataset.weatherSplit;setTimeout(splitWeather,450)}

  document.addEventListener('DOMContentLoaded',()=>{
    reorderNav();setTimeout(splitWeather,900);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(()=>{reorderNav();splitWeather()},550));
    document.getElementById('refreshBtn')?.addEventListener('click',resetAndRun);
    const nav=document.getElementById('nav');if(nav)new MutationObserver(reorderNav).observe(nav,{childList:true});
    const content=document.getElementById('content')||document.body;
    new MutationObserver(()=>{if(active()==='weather')splitWeather()}).observe(content,{childList:true,subtree:true});
  });
})();
