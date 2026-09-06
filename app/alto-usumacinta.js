(() => {
  const BASE='..';
  const DATA_URL=`${BASE}/data/fuentes_publicas/latest.json`;
  const FUENTE1_URL=`${BASE}/data/latest/FUENTE1.txt`;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const fmt=(v,d=1)=>n(v)===null?'s/d':Number(v).toFixed(d);
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';

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

  function altoRainRows(doc,fuente1){
    const d24=findPeriodStations(doc,'24h');
    const week=findPeriodStations(doc,'semanal');
    const month=findPeriodStations(doc,'mensual');
    const season=findPeriodStations(doc,'epoca_lluviosa');
    const rows=RAIN_STATIONS.map(([name,code,branch])=>{
      const v24=valueFor(d24,name,code),vw=valueFor(week,name,code),vm=valueFor(month,name,code),vs=valueFor(season,name,code);
      const recent=[v24,vw,vm].some(v=>v!==null);
      return [
        esc(name),esc(code),esc(branch),
        's/d','s/d',
        v24===null?'s/d':`${fmt(v24)} mm`,
        vw===null?'s/d':`${fmt(vw)} mm`,
        vm===null?'s/d':`${fmt(vm)} mm`,
        vs===null?'s/d':`${fmt(vs)} mm`,
        'INSIVUMEH · Mapas últimas 24 h / resumen de estaciones',
        recent?'dato puntual estructurado':'sin dato puntual estructurado en productos recientes'
      ];
    });

    const clean=String(fuente1||'').replace(/,/g,'');
    const m=clean.match(/BHG21\s+Lacant[uú]n\s+Ocosingo\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
    if(m){
      rows.push(['Lacantún','BHG21','Lacantún · Ocosingo','s/d','s/d',`${Number(m[6]).toFixed(1)} mm`,'s/d','s/d','s/d','OCFS/CONAGUA · Boletín Frontera Sur','precipitación 24 h del boletín']);
    }
    return rows;
  }

  function levelRows(doc){
    const ins=doc?.insivumeh||{};
    const evo=new Map((doc?.insivumeh_evolucion_real||[]).map(x=>[norm(x.estacion),x]));
    const wanted=['El Porvenir','El Tigre'];
    const rows=[];
    for(const name of wanted){
      const x=(ins.estaciones_estructuradas||[]).find(y=>norm(y.estacion)===norm(name));
      if(!x)continue;
      const e=evo.get(norm(name));
      const nivel=n(x.nivel_instantaneo_m),nivelMax=n(x.nivel_referencia_max_m);
      const gasto=n(x.caudal_instantaneo_m3s),gastoMax=n(x.caudal_referencia_max_m3s);
      const dn=nivel!==null&&nivelMax!==null?nivel-nivelMax:null;
      const dg=gasto!==null&&gastoMax!==null?gasto-gastoMax:null;
      rows.push([
        esc(x.estacion),esc(x.rio),esc(x.ubicacion),
        nivel===null?'s/d':`${nivel.toFixed(2)} m`,
        nivelMax===null?'s/d':`${nivelMax.toFixed(2)} m`,
        dn===null?'s/d':`${dn.toFixed(2)} m`,
        nivel!==null&&nivelMax?`${(nivel/nivelMax*100).toFixed(1)} %`:'s/d',
        gasto===null?'s/d':`${gasto.toFixed(2)} m³/s`,
        gastoMax===null?'s/d':`${gastoMax.toFixed(2)} m³/s`,
        dg===null?'s/d':`${dg.toFixed(2)} m³/s`,
        gasto!==null&&gastoMax?`${(gasto/gastoMax*100).toFixed(1)} %`:'s/d',
        esc(e?.tendencia_calculada||'s/d'),
        esc(`${ins.fecha||'s/d'} ${ins.hora||''}`.trim()),
        'INSIVUMEH · BHVGM'
      ]);
    }
    return rows;
  }

  function styles(){
    if(document.getElementById('altoUsuStyle'))return;
    const s=document.createElement('style');s.id='altoUsuStyle';
    s.textContent='.alto-usu{margin:16px 0 22px}.alto-usu h3{color:#6f112d;margin:0 0 6px}.alto-usu .source-note{font-size:12px;color:#666;line-height:1.45;margin:6px 0 12px}.usu-upper-levels{margin-bottom:18px}.usu-upper-levels h2{color:#6f112d}';
    document.head.appendChild(s);
  }

  async function loadData(){
    const [dr,tr]=await Promise.all([
      fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'}),
      fetch(`${FUENTE1_URL}?v=${Date.now()}`,{cache:'no-store'})
    ]);
    return {doc:dr.ok?await dr.json():{},txt:tr.ok?await tr.text():''};
  }

  async function renderWeather(){
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content||content.querySelector('#altoUsumacintaRain'))return;
    const con=[...content.querySelectorAll('section.panel.wide')].find(s=>/CONAGUA · lluvia/i.test(s.querySelector('h2')?.textContent||''));
    if(!con)return;
    try{
      const {doc,txt}=await loadData();
      const rows=altoRainRows(doc,txt);
      styles();
      const sec=document.createElement('section');sec.id='altoUsumacintaRain';sec.className='panel wide alto-usu';
      sec.innerHTML=`<h2>Alto Usumacinta · precipitación observada</h2>
        <p class="source-note">Sólo precipitación de estaciones/productos que aportan al Alto Usumacinta. No se presentan aquí niveles ni caudales. Los acumulados de época lluviosa se identifican en su propia columna y no se muestran como lluvia reciente.</p>
        ${table(['Estación','Código','Rama aportante','1 h','6 h','24 h','Semanal','Mensual','Acum. época lluviosa','Fuente','Calidad / disponibilidad'],rows)}
        <p class="source-note">INSIVUMEH publica el mapa diario de 24 h y productos semanal/mensual. El agente los consulta cada 10 minutos. Cuando el producto es sólo mapa y no ofrece un valor puntual estructurado para la estación, se conserva s/d; no se estima a partir del color del mapa. Lacantún usa únicamente la precipitación de 24 h publicada por OCFS/CONAGUA.</p>`;

      const conGroups=con.querySelector('.weather-source-groups');
      const usuBlock=conGroups?[...conGroups.querySelectorAll('.subcuenca-weather-block')].find(b=>/^usumacinta$/i.test((b.querySelector('h3')?.textContent||'').trim())):null;
      if(conGroups){
        if(usuBlock)conGroups.insertBefore(sec,usuBlock);else conGroups.appendChild(sec);
        if(usuBlock)conGroups.appendChild(usuBlock);
      }else{
        con.insertAdjacentElement('afterend',sec);
      }
    }catch(e){/* no altera el resto de la página si una fuente falla */}
  }

  async function renderUsumacintaLevels(){
    if(active()!=='usumacinta')return;
    const content=document.getElementById('content');if(!content||content.querySelector('#upperUsumacintaLevels'))return;
    try{
      const {doc}=await loadData();const rows=levelRows(doc);if(!rows.length)return;
      styles();
      const sec=document.createElement('section');sec.id='upperUsumacintaLevels';sec.className='panel wide usu-upper-levels';
      sec.innerHTML=`<h2>Alto Usumacinta · niveles y gastos de referencia</h2>
        <p class="source-note">Comparación operativa de La Pasión (El Porvenir) y Usumacinta (El Tigre) con los máximos de referencia publicados en el BHVGM de INSIVUMEH. Los máximos son referencias estadísticas del boletín y no se interpretan como umbrales de inundación.</p>
        ${table(['Estación','Río','Ubicación','Nivel actual','Nivel máx. ref.','Dif. nivel','% nivel ref.','Gasto actual','Gasto máx. ref.','Dif. gasto','% gasto ref.','Tendencia','Corte fuente','Fuente'],rows)}`;
      content.insertBefore(sec,content.firstElementChild||null);
    }catch(e){/* no altera el resto de la página si una fuente falla */}
  }

  function render(){renderWeather();renderUsumacintaLevels()}
  function reset(){document.getElementById('altoUsumacintaRain')?.remove();document.getElementById('upperUsumacintaLevels')?.remove();setTimeout(render,700)}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(render,1200);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,800));
    document.getElementById('refreshBtn')?.addEventListener('click',reset);
    const c=document.getElementById('content')||document.body;new MutationObserver(render).observe(c,{childList:true,subtree:true});
  });
})();
