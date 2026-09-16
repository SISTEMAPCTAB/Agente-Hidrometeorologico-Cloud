(() => {
  const RAIN_URL='../data/niveles/Lluvia_CONAGUA/ultimo_corte.json';
  const INS_HIST_URL='../data/fuentes_publicas/insivumeh_historico.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const mm=v=>finite(v)?`${Number(v).toFixed(1)} mm`:'s/d';
  let rainMap=null,trendMap=null,loading=null;

  async function load(){
    if(rainMap&&trendMap)return;
    if(loading)return loading;
    loading=Promise.all([
      fetch(`${RAIN_URL}?v=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`${INS_HIST_URL}?v=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({}))
    ]).then(([rain,hist])=>{
      rainMap=new Map((Array.isArray(rain)?rain:[]).map(x=>[norm(x.estacion),x]));
      trendMap=new Map((Array.isArray(hist?.ultima_evolucion_real)?hist.ultima_evolucion_real:[]).map(x=>[norm(x.estacion),x]));
    }).finally(()=>{loading=null});
    return loading;
  }

  function trendLabel(v){
    const t=norm(v);
    if(t==='incrementando')return 'Ascenso';
    if(t==='disminuyendo')return 'Descenso';
    if(t==='estable')return 'Estable';
    return 's/d';
  }

  function standardize48(table){
    [...table.querySelectorAll('thead th')].forEach(th=>{
      const h=norm(th.textContent);
      if(h==='48 h'||h==='48h')th.textContent='48 h anteriores';
    });
  }

  function removeDuplicateLevelState(table){
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const trendIdx=headers.indexOf('tendencia');
    const stateIdx=headers.indexOf('estado');
    const isLevelTable=headers.includes('nivel')&&(headers.includes('δ24 h')||headers.includes('Δ24 h')||headers.includes('dist. namo'));
    if(!isLevelTable||trendIdx<0||stateIdx<0)return;

    [...table.querySelectorAll('tbody tr')].forEach(tr=>{
      const state=norm(tr.cells[stateIdx]?.textContent);
      if(state==='dato anterior'){
        const current=String(tr.cells[trendIdx]?.textContent||'s/d').trim();
        if(!/dato anterior/i.test(current))tr.cells[trendIdx].textContent=`${current} · dato anterior`;
      }
      tr.cells[stateIdx]?.remove();
    });
    table.querySelector('thead tr')?.cells[stateIdx]?.remove();
  }

  function addTodayToConaguaRain(table){
    const section=document.querySelector('#nav button.active')?.dataset.section||'';
    if(!['presas','serranos','tulija','usumacinta','weather'].includes(section))return;

    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const stationIdx=headers.indexOf('estacion');
    const h24Idx=headers.indexOf('24 h anteriores');
    if(stationIdx<0||h24Idx<0||headers.some(h=>h.includes('hoy desde 08:00')))return;

    const rows=[...table.querySelectorAll('tbody tr')];
    const conaguaRows=rows.filter(tr=>rainMap?.has(norm(tr.cells[stationIdx]?.textContent)));
    if(!conaguaRows.length)return;

    if(section==='weather'){
      const insideReference=!!table.closest('.conagua-all .weather-source-groups');
      if(!insideReference)return;
    }

    const th=document.createElement('th');th.textContent='HOY desde 08:00';
    const headRow=table.querySelector('thead tr');
    headRow.insertBefore(th,headRow.cells[stationIdx+1]||null);

    rows.forEach(tr=>{
      const station=norm(tr.cells[stationIdx]?.textContent);
      const r=rainMap?.get(station);
      const td=document.createElement('td');
      td.innerHTML=r&&r.estado_hoy==='observado'?`<b>${mm(r.lluvia_hoy_desde_08_mm)}</b>`:'s/d';
      tr.insertBefore(td,tr.cells[stationIdx+1]||null);

      if(r){
        const hs=[...table.querySelectorAll('thead th')].map(x=>norm(x.textContent));
        const idx48=hs.indexOf('48 h anteriores');
        if(idx48>=0&&r.estado_48h==='observado'&&finite(r.lluvia_48h_precedentes_mm))tr.cells[idx48].textContent=mm(r.lluvia_48h_precedentes_mm);
      }
    });
  }

  // Sólo iguala la PRESENTACIÓN de HOY / 24 h / 48 h en las tablas
  // de referencia diaria CONAGUA con la tabla horaria superior.
  // No cambia datos, orden, estaciones ni otros campos.
  function formatReferenceRainFields(table){
    if(!table.closest('.conagua-all .weather-source-groups'))return;
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    if(headers.includes('subcuenca'))return;
    const stationIdx=headers.indexOf('estacion');
    const todayIdx=headers.findIndex(h=>h.includes('hoy desde 08:00'));
    const h24Idx=headers.indexOf('24 h anteriores');
    const h48Idx=headers.indexOf('48 h anteriores');
    if(stationIdx<0||todayIdx<0||h24Idx<0||h48Idx<0)return;

    [...table.querySelectorAll('tbody tr')].forEach(tr=>{
      const r=rainMap?.get(norm(tr.cells[stationIdx]?.textContent));
      if(!r)return;
      const fields=[
        [todayIdx,r.lluvia_hoy_desde_08_mm,r.estado_hoy],
        [h24Idx,r.lluvia_24h_precedentes_mm,r.estado_24h],
        [h48Idx,r.lluvia_48h_precedentes_mm,r.estado_48h]
      ];
      fields.forEach(([idx,val,state])=>{
        const cell=tr.cells[idx];if(!cell)return;
        const observed=state==='observado'&&finite(val);
        cell.innerHTML=observed?`<b>${mm(val)}</b><br><small>observado</small>`:'<b>s/d</b><br><small>s/d</small>';
      });
    });
  }

  function addInsivumehTrend(){
    const table=document.querySelector('#insivumehHydroExtra table');
    if(!table)return;
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    if(headers.includes('tendencia'))return;
    const levelIdx=headers.indexOf('nivel actual');
    if(levelIdx<0)return;
    const th=document.createElement('th');th.textContent='Tendencia';
    const head=table.querySelector('thead tr');head.insertBefore(th,head.cells[levelIdx+1]||null);
    [...table.querySelectorAll('tbody tr')].forEach(tr=>{
      const station=norm(tr.cells[0]?.textContent);
      const ev=trendMap?.get(station);
      const td=document.createElement('td');td.textContent=trendLabel(ev?.tendencia_calculada);
      tr.insertBefore(td,tr.cells[levelIdx+1]||null);
    });
  }

  async function apply(){
    await load();
    document.querySelectorAll('#content table').forEach(table=>{
      standardize48(table);
      removeDuplicateLevelState(table);
      addTodayToConaguaRain(table);
      formatReferenceRainFields(table);
    });
    addInsivumehTrend();
  }

  function schedule(){setTimeout(apply,120);setTimeout(apply,700);setTimeout(apply,1600)}
  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    document.getElementById('nav')?.addEventListener('click',schedule);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{rainMap=null;trendMap=null;schedule()});
    const content=document.getElementById('content')||document.body;
    new MutationObserver(()=>setTimeout(apply,80)).observe(content,{childList:true,subtree:true});
  });
})();
