(() => {
  const BASE='..';
  const DATA_URL=`${BASE}/data/fuentes_publicas/latest.json`;
  const FUENTE1_URL=`${BASE}/data/latest/FUENTE1.txt`;
  const WEATHER_EXTRA_URL=`${BASE}/data/weatherlink/extra_latest.json`;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const fmt=(v,d=1)=>n(v)===null?'s/d':Number(v).toFixed(d);
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';
  const human=v=>{if(!v)return's/d';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})};

  const RAIN_STATIONS=[
    ['El Tigre','INS171302AT','Usumacinta directo'],
    ['El Porvenir','INS171001AT','La Pasión'],
    ['Bethel','INS171301AT','Usumacinta/Lacantún-frontera'],
    ['Machaquilá','INS171201AT','La Pasión–Machaquilá'],
    ['Mactún','INS170401AT','San Pedro'],
    ['Chixoy Hidro','INS161301AT','Chixoy/Salinas'],
    ['Playa Grande Met (Ixcan)','INS142201AT','Chixoy/Salinas–Ixcán'],
    ['Santa María Cahabón','INS161201CV','Chixoy/Salinas'],
    ['Panzos PHC Altaverapaz','INS160701CV','Chixoy/Salinas']
  ];

  function table(headers,rows){
    return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??'s/d'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function findPeriodStations(doc,period){
    const g=doc?.guatemala_acumulados||{};
    if(period==='epoca_lluviosa')return g?.epoca_lluviosa?.estaciones_relevantes||[];
    const p=(g?.mapas||[]).find(x=>norm(x.periodo)===norm(period));
    return p?.estaciones_relevantes||[];
  }

  function valueFor(list,name,code){
    const x=(list||[]).find(r=>norm(r.estacion)===norm(name)||norm(r.codigo)===norm(code));
    return x&&n(x.acumulado_mm)!==null?Number(x.acumulado_mm):null;
  }

  function safeMonthValue(extra,x){
    const cov=n(extra?.coverage_hours);
    if(cov===null||n(x?.month_mm)===null||!extra?.run_local)return null;
    const d=new Date(extra.run_local);if(Number.isNaN(d.getTime()))return null;
    const local=new Date(d.toLocaleString('en-US',{timeZone:'America/Mexico_City'}));
    const elapsed=(local.getDate()-1)*24+local.getHours()+local.getMinutes()/60;
    return cov+0.5>=elapsed?Number(x.month_mm):null;
  }

  function weatherRows(extra){
    const stations=(Array.isArray(extra?.stations)?extra.stations:[]).filter(x=>x.grupo==='alto_usumacinta');
    return stations.map(x=>{
      const a=x.accumulations_mm||{};
      const q=[];
      if(x.estado)q.push(x.estado);
      if(x.quality)q.push(x.quality);
      const today=n(x.daily_mm);
      const month=safeMonthValue(extra,x);
      return [
        `<b>${esc(x.nombre||'s/d')}</b>`,
        'WeatherLink',
        today===null?'s/d':`${fmt(today)} mm`,
        n(a['1'])===null?'s/d':`${fmt(a['1'])} mm`,
        n(a['6'])===null?'s/d':`${fmt(a['6'])} mm`,
        n(a['24'])===null?'s/d':`${fmt(a['24'])} mm`,
        n(a['48'])===null?'s/d':`${fmt(a['48'])} mm`,
        n(a['72'])===null?'s/d':`${fmt(a['72'])} mm`,
        's/d',
        month===null?'s/d':`${fmt(month)} mm`,
        's/d',
        esc(human(x.observed_utc)),
        esc(q.join(' · ')||'s/d')
      ];
    });
  }

  function publicRows(doc,fuente1){
    const d24=findPeriodStations(doc,'24h');
    const week=findPeriodStations(doc,'semanal');
    const month=findPeriodStations(doc,'mensual');
    const season=findPeriodStations(doc,'epoca_lluviosa');
    const generated=human(doc?.generated_utc);
    const rows=RAIN_STATIONS.map(([name,code])=>{
      const v24=valueFor(d24,name,code),vw=valueFor(week,name,code),vm=valueFor(month,name,code),vs=valueFor(season,name,code);
      const recent=[v24,vw,vm].some(v=>v!==null);
      return [
        `<b>${esc(name)}</b>`,
        'INSIVUMEH',
        's/d','s/d','s/d',
        v24===null?'s/d':`${fmt(v24)} mm`,
        's/d','s/d',
        vw===null?'s/d':`${fmt(vw)} mm`,
        vm===null?'s/d':`${fmt(vm)} mm`,
        vs===null?'s/d':`${fmt(vs)} mm`,
        generated==='s/d'?'s/d':`${esc(generated)} (consulta)`,
        recent?'dato puntual estructurado':'sin dato puntual estructurado reciente'
      ];
    });

    const clean=String(fuente1||'').replace(/,/g,'');
    const m=clean.match(/BHG21\s+Lacant[uú]n\s+Ocosingo\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
    if(m){
      rows.push([
        '<b>Lacantún</b>','OCFS/CONAGUA','s/d','s/d','s/d',`${Number(m[6]).toFixed(1)} mm`,'s/d','s/d','s/d','s/d','s/d','corte boletín','precipitación 24 h publicada'
      ]);
    }
    return rows;
  }

  function styles(){
    if(document.getElementById('altoUsuStyle'))return;
    const s=document.createElement('style');s.id='altoUsuStyle';
    s.textContent='.alto-usu{margin:16px 0 22px}.alto-usu h3{color:#6f112d;margin:0 0 6px}.alto-usu .source-note{font-size:12px;color:#666;line-height:1.45;margin:6px 0 12px}.alto-usu table{min-width:1280px}.usu-upper-levels{margin-bottom:18px}.usu-upper-levels h2{color:#6f112d}';
    document.head.appendChild(s);
  }

  async function loadData(){
    const [dr,tr,wr]=await Promise.all([
      fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'}),
      fetch(`${FUENTE1_URL}?v=${Date.now()}`,{cache:'no-store'}),
      fetch(`${WEATHER_EXTRA_URL}?v=${Date.now()}`,{cache:'no-store'})
    ]);
    return {doc:dr.ok?await dr.json():{},txt:tr.ok?await tr.text():'',extra:wr.ok?await wr.json():{}};
  }

  async function renderWeather(){
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content)return;
    const wl=[...content.querySelectorAll('section.panel.wide')].find(s=>/WeatherLink · lluvia y temperatura/i.test(s.querySelector('h2')?.textContent||''));
    const groups=wl?.querySelector('.weather-source-groups');if(!groups)return;
    if(groups.querySelector('[data-unified-alto="1"]'))return;
    try{
      const {doc,txt,extra}=await loadData();
      const rows=[...weatherRows(extra),...publicRows(doc,txt)];
      if(!rows.length)return;
      styles();
      const old=[...groups.querySelectorAll('.subcuenca-weather-block')].find(b=>norm(b.querySelector('h3')?.textContent)==='alto usumacinta');
      if(old)old.remove();
      document.getElementById('altoUsumacintaRain')?.remove();
      const block=document.createElement('div');block.className='subcuenca-weather-block alto-usu';block.dataset.unifiedAlto='1';
      block.innerHTML=`<h3>Alto Usumacinta · precipitación observada</h3>
        <p class="source-note">Vista única, sin duplicidades. WeatherLink aporta el acumulado diario observado (“Hoy”) y, cuando existe cobertura histórica suficiente, acumulados móviles de 1/6/24/48/72 h. INSIVUMEH y OCFS/CONAGUA sólo ocupan las columnas para las que publican un valor puntual verificable. s/d significa sin dato; nunca se convierte una ausencia en 0.0 mm.</p>
        ${table(['Estación','Fuente','Hoy','1 h','6 h','24 h','48 h','72 h','Semanal','Mensual','Acum. época lluviosa','Última actualización','Estado del dato'],rows)}
        <p class="source-note">El valor “Hoy” de WeatherLink es el acumulado diario reportado por la estación y no equivale a una ventana móvil de 24 h. Los acumulados móviles aparecen sólo después de reunir cobertura real suficiente. Los acumulados de época lluviosa de INSIVUMEH se mantienen separados de la lluvia reciente. Cuando INSIVUMEH publica únicamente un mapa sin valor puntual estructurado, se conserva s/d y no se estima por color.</p>`;
      const usu=[...groups.querySelectorAll('.subcuenca-weather-block')].find(b=>norm(b.querySelector('h3')?.textContent)==='usumacinta');
      if(usu)groups.insertBefore(block,usu);else groups.appendChild(block);
    }catch(e){/* no altera el resto de la página si una fuente falla */}
  }

  // Los niveles y gastos de Alto Usumacinta se muestran exclusivamente en
  // insivumeh-hidro-extra.js para evitar duplicar El Porvenir y El Tigre.
  function render(){renderWeather()}
  function reset(){document.querySelector('[data-unified-alto="1"]')?.remove();document.getElementById('altoUsumacintaRain')?.remove();document.getElementById('upperUsumacintaLevels')?.remove();setTimeout(render,700)}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(render,1200);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,800));
    document.getElementById('refreshBtn')?.addEventListener('click',reset);
    const c=document.getElementById('content')||document.body;new MutationObserver(render).observe(c,{childList:true,subtree:true});
  });
})();
