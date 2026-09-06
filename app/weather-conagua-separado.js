(() => {
  const BASE='..';
  const latestConaguaUrl=`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`;

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

  async function splitWeather(){
    reorderNav();
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content||content.dataset.weatherSplit==='1')return;
    const panel=[...content.querySelectorAll('section.panel.wide')].find(s=>/weatherlink\s*\/\s*conagua/i.test(s.querySelector('h2')?.textContent||''));
    const table=panel?.querySelector('table');if(!panel||!table)return;
    const map=await conaguaMap();
    const wlTable=cloneFilteredTable(table,'WeatherLink');
    const conTable=cloneFilteredTable(table,'CONAGUA');
    enrichConagua(conTable,map);

    const grid=panel.parentElement;
    const wl=document.createElement('section');wl.className='panel wide';
    wl.innerHTML='<h2>WeatherLink · lluvia y temperatura</h2><p class="muted">WeatherLink se recolecta en GitHub Cloud cada 30 minutos. Se conservan las mismas columnas y las ventanas inmaduras se muestran como s/d.</p><div class="table-wrap"></div>';
    wl.querySelector('.table-wrap').appendChild(wlTable);

    const con=document.createElement('section');con.className='panel wide';
    con.innerHTML='<h2>CONAGUA · lluvia reportada en informes de niveles</h2><p class="muted">La lluvia CONAGUA se toma de la página de precipitación del mismo informe horario de niveles. “24 h anteriores” conserva el acumulado oficial de las 24 h precedentes; cuando el formato trae “HOY”, se conserva el acumulado desde las 08:00 h y se actualiza en cada corte horario hasta completar el ciclo de 24 h, sin convertir blancos en cero.</p><div class="table-wrap"></div>';
    con.querySelector('.table-wrap').appendChild(conTable);

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
