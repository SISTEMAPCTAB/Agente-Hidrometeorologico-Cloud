const BASE = '..';
const sources = {
  niveles: `${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,
  nivelesEstado: `${BASE}/data/niveles/Estado_Niveles_Cloud.json`,
  weather: `${BASE}/data/weatherlink/latest.json`,
  weatherEstado: `${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,
  conaguaRain: `${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`,
  conaguaRainEstado: `${BASE}/data/niveles/Lluvia_CONAGUA/Estado_Lluvia_CONAGUA.json`,
  analysis: `${BASE}/data/analysis/latest.md`,
  wordAnalysis: `${BASE}/data/analysis/Reportes/Estado_Word.json`,
  wordNiveles: `${BASE}/data/niveles/Reportes/Estado_Word.json`,
  wordWeather: `${BASE}/data/weatherlink/Reportes/Estado_Word.json`
};

const sections = [
  ['resumen','Resumen operativo'],
  ['presas','Presas–Mezcalapa–Samaria y Carrizal'],
  ['serranos','Ríos Serranos–Grijalva'],
  ['tulija','Tulijá–Puxcatán–Chilapa'],
  ['usumacinta','Usumacinta'],
  ['lluvia','Lluvia y humedad antecedente'],
  ['weather','WeatherLink / CONAGUA'],
  ['pronostico','Pronóstico SMN 96 / 360 h'],
  ['analisis','Análisis 11:00 h'],
  ['reportes','Reportes']
];

const state = { data:{}, current:'resumen' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const fmt = (n,d=2) => Number.isFinite(Number(n)) ? Number(n).toFixed(d) : 's/d';
const fmtRain = n => n===null || n===undefined || n==='' ? 'sin dato' : `${fmt(n,1)} mm`;
const trendBadge = t => { const x=(t||'').toLowerCase(); const c=x.includes('asc')?'warn':x.includes('desc')?'ok':''; return `<span class="badge ${c}">${esc(t||'s/d')}</span>` };

async function getJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function getText(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }
async function loadAll(){
  $('#content').innerHTML=$('#loadingTemplate').innerHTML;
  await Promise.all(Object.entries(sources).map(async([k,u])=>{try{state.data[k]=u.endsWith('.md')?await getText(u):await getJSON(u)}catch(e){state.data[k]={__error:e.message}}}));
  renderStatus(); render();
}
function buildNav(){ $('#nav').innerHTML=sections.map(([id,label])=>`<button data-section="${id}">${label}</button>`).join(''); $('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-section]');if(!b)return;state.current=b.dataset.section;document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x===b));$('#sidebar').classList.remove('open');render()}); $('#nav button').classList.add('active'); }
function renderStatus(){
  const ne=state.data.nivelesEstado||{},we=state.data.weatherEstado||{},ce=state.data.conaguaRainEstado||{};
  const nivelCut=Array.isArray(state.data.niveles)&&state.data.niveles[0]?.fecha_hora;
  const weatherCut=we.run_local||we.cut||we.generated_at||'s/d';
  const analysisCut=typeof state.data.analysis==='string'?(state.data.analysis.match(/^CORTE:\s*(.+)$/m)?.[1]||'s/d'):'s/d';
  const cloudOk=ne.complete===true&&we.complete===true&&ce.complete===true;
  const cards=[['Niveles',nivelCut||'s/d'],['WeatherLink',weatherCut],['Análisis 11:00',analysisCut],['Cloud',cloudOk?'Operativo':'Verificar']];
  $('#statusStrip').innerHTML=cards.map(([a,b])=>`<div class="status-card"><span>${a}</span><b>${esc(b)}</b></div>`).join('');
  $('#cloudState').textContent=cloudOk?'Cloud operativo':'Cloud con fuentes por verificar';
}
function levels(){return Array.isArray(state.data.niveles)?state.data.niveles:[]}
function weatherStations(){return Array.isArray(state.data.weather?.stations)?state.data.weather.stations:[]}
function conaguaRain(){return Array.isArray(state.data.conaguaRain)?state.data.conaguaRain:[]}
function byStations(names){const set=names.map(x=>x.toLowerCase());return levels().filter(r=>set.some(n=>(r.estacion||'').toLowerCase().includes(n)))}
function byRiver(words){return levels().filter(r=>words.some(w=>`${r.rio||''} ${r.estacion||''}`.toLowerCase().includes(w)))}
function uniqueRows(rows){const seen=new Set();return rows.filter(r=>{const k=`${r.estacion||''}|${r.rio||''}`.toLowerCase();if(seen.has(k))return false;seen.add(k);return true})}
function serranosRows(){return uniqueRows([...byStations(['oxolotán','oxolotan','amatán','amatan','tacotalpa','teapa','puyacatengo','la sierra','pichucalco']),...byRiver(['ríos de la sierra','rios de la sierra','oxolot','amat','tacotal','teapa','puyacat','la sierra','pichucal'])])}
function tulijaRows(){return uniqueRows([...byStations(['tulijá','tulija','puxcatán','puxcatan','chilapa']),...byRiver(['tulij','puxcat','chilapa'])])}
function presasRows(){return uniqueRows([...byStations(['samaria','gonzález','gonzalez','mezcalapa','carrizal','platanar','macayo','peñitas','penitas']),...byRiver(['mezcalapa','samaria','carrizal','platanar'])])}
function usumacintaRows(){return uniqueRows([...byStations(['boca del cerro','balancán','balancan','emiliano zapata','jonuta','tres brazos']),...byRiver(['usumacinta','san pedro'])])}

function levelTable(rows){
  if(!rows.length)return '<p class="muted">Sin datos disponibles para este sistema en el último corte.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Río</th><th>Nivel actual</th><th>Dif. NAMO</th><th>Δ vs 06:00</th><th>Δ anterior</th><th>Tendencia</th><th>Estado</th><th>Última actualización</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.estacion)}</td><td>${esc(r.rio||'s/d')}</td><td>${fmt(r.ultimo_nivel)} m</td><td>${r.distancia_namo==null?'s/d':`${fmt(Math.abs(r.distancia_namo))} m ${r.distancia_namo<0?'abajo':'arriba'}`}</td><td>${fmt(r.delta_vs_06)} m</td><td>${fmt(r.delta_reporte)} m</td><td>${trendBadge(r.tendencia)}</td><td><span class="badge ${r.estado_dato==='observado'?'ok':'warn'}">${esc(r.estado_dato||'s/d')}</span></td><td>${esc(r.ultima_actualizacion_real||r.fecha_hora||'s/d')}</td></tr>`).join('')}</tbody></table></div>`;
}
function graphGrid(rows,title='Evolución hidrométrica'){
  const withGraph=rows.filter(r=>r.grafica_png);
  if(!withGraph.length)return '';
  return `<div class="panel wide"><h2>${title}</h2><div class="hydro-graphs">${withGraph.map(r=>`<figure class="hydro-figure"><div class="figure-head"><strong>${esc(r.estacion)}</strong><span>${esc(r.rio||'')}</span></div><img loading="lazy" src="${BASE}/${esc(r.grafica_png)}" alt="Gráfica hidrométrica de ${esc(r.estacion)}"><figcaption>Fuente: CONAGUA / Agente Niveles · corte ${esc(r.fecha_hora||'s/d')} · ${esc(r.estado_dato||'s/d')}</figcaption></figure>`).join('')}</div><div class="section-note">Las series se muestran por estación. Un dato heredado se identifica expresamente y no se interpreta como una nueva observación.</div></div>`;
}
function systemBlock(title,rows,note=''){
  const clean=uniqueRows(rows);
  return `<div class="panel wide"><h2>${title}</h2>${levelTable(clean)}${note?`<div class="section-note">${note}</div>`:''}</div>${graphGrid(clean)}`;
}
function rainBand(mm){if(mm==null)return 'sin dato'; const x=Number(mm); if(x<5)return '0–5';if(x<25)return '5–25';if(x<50)return '25–50';if(x<75)return '50–75';if(x<150)return '75–150';return '≥150'}
function rainClass(mm){if(mm==null)return '';const x=Number(mm);return x>=75?'danger':x>=25?'warn':'ok'}
function barList(rows,key,label){
  const vals=rows.filter(r=>r[key]!=null&&Number.isFinite(Number(r[key]))).sort((a,b)=>Number(b[key])-Number(a[key]));
  if(!vals.length)return '<p class="muted">Sin datos válidos para graficar.</p>';
  const max=Math.max(...vals.map(r=>Number(r[key])),1);
  return `<div class="bar-chart" aria-label="${esc(label)}">${vals.map(r=>{const v=Number(r[key]);return `<div class="bar-row"><div class="bar-label">${esc(r.estacion||r.nombre||'s/d')}</div><div class="bar-track"><div class="bar-fill ${rainClass(v)}" style="width:${Math.max(1,(v/max)*100)}%"></div></div><div class="bar-value">${fmt(v,1)} mm</div></div>`}).join('')}</div>`;
}
function conaguaRainTable(){
  const rows=conaguaRain(); if(!rows.length)return '<p class="muted">Sin datos CONAGUA disponibles.</p>';
  const sorted=[...rows].sort((a,b)=>(Number(b.lluvia_24h_precedentes_mm)||0)-(Number(a.lluvia_24h_precedentes_mm)||0));
  return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>24 h precedentes</th><th>Desde 08:00</th><th>Banda 24 h</th><th>Estado</th><th>Corte</th></tr></thead><tbody>${sorted.map(r=>`<tr><td>${esc(r.estacion)}</td><td>${fmtRain(r.lluvia_24h_precedentes_mm)}</td><td>${fmtRain(r.lluvia_hoy_desde_08_mm)}</td><td>${esc(rainBand(r.lluvia_24h_precedentes_mm))}</td><td><span class="badge ${r.estado_24h==='observado'?'ok':'warn'}">${esc(r.estado_24h||'s/d')}</span></td><td>${esc(r.fecha_hora||'s/d')}</td></tr>`).join('')}</tbody></table></div>`;
}
function maturityPills(){
  const m=state.data.weatherEstado?.window_maturity||{};
  return `<div class="maturity-row">${['1h','6h','24h','48h','72h'].map(k=>`<span class="badge ${m[k]===true?'ok':'warn'}">${k}: ${m[k]===true?'maduro':'transición'}</span>`).join('')}</div>`;
}
function weatherTable(){
  const rows=weatherStations(); if(!rows.length)return '<p class="muted">Sin estaciones WeatherLink disponibles.</p>';
  const m=state.data.weatherEstado?.window_maturity||{};
  return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Ubicación</th><th>1 h</th><th>6 h</th><th>24 h</th><th>Calidad</th><th>Última actualización</th></tr></thead><tbody>${rows.map(r=>{const a=r.accumulations_mm||{};return `<tr><td>${esc(r.nombre)}</td><td>${esc(r.ubicacion||'s/d')}</td><td>${fmtRain(a['1'])}</td><td>${fmtRain(a['6'])}</td><td>${fmtRain(a['24'])}${m['24h']!==true?' <span class="badge warn">transicional</span>':''}</td><td>${esc(r.quality||'s/d')}</td><td>${esc(r.last_updated_at||r.observed_utc||'s/d')}</td></tr>`}).join('')}</tbody></table></div>`;
}
function weatherBars(){
  const m=state.data.weatherEstado?.window_maturity||{};
  const key=m['6h']===true?'6':'1'; const label=key==='6'?'Acumulado WeatherLink 6 h':'Acumulado WeatherLink 1 h';
  const rows=weatherStations().map(r=>({estacion:r.nombre,valor:r.accumulations_mm?.[key]}));
  return `<div class="panel wide"><h2>${label}</h2>${barList(rows,'valor',label)}<div class="section-note">Fuente: WeatherLink Cloud. Sólo se usa una ventana declarada madura por el estado cloud.</div></div>`;
}
function summary(){
  const ls=levels(),asc=ls.filter(x=>(x.tendencia||'').toLowerCase().includes('asc')).length,inherited=ls.filter(x=>x.estado_dato==='heredado').length;
  const crows=conaguaRain().filter(r=>r.lluvia_24h_precedentes_mm!=null); const cmax=crows.length?[...crows].sort((a,b)=>b.lluvia_24h_precedentes_mm-a.lluvia_24h_precedentes_mm)[0]:null;
  const wrows=weatherStations().filter(r=>r.accumulations_mm?.['6']!=null); const wmax=wrows.length?[...wrows].sort((a,b)=>(b.accumulations_mm?.['6']||0)-(a.accumulations_mm?.['6']||0))[0]:null;
  return `<div class="grid"><div class="panel"><h2>Lectura rápida</h2><div class="metric-row"><div class="metric"><strong>${ls.length}</strong><span>estaciones hidrométricas</span></div><div class="metric"><strong>${asc}</strong><span>en ascenso</span></div><div class="metric"><strong>${inherited}</strong><span>datos heredados</span></div></div></div><div class="panel"><h2>Lluvia destacada</h2><div class="cards"><div class="station-card"><h3>CONAGUA 24 h</h3><div class="value">${cmax?fmt(cmax.lluvia_24h_precedentes_mm,1)+' mm':'s/d'}</div><small>${esc(cmax?.estacion||'sin dato')}</small></div><div class="station-card"><h3>WeatherLink 6 h</h3><div class="value">${wmax?fmt(wmax.accumulations_mm?.['6'],1)+' mm':'s/d'}</div><small>${esc(wmax?.nombre||'sin dato')}</small></div></div></div><div class="panel wide"><h2>Orden operativo de sistemas</h2><div class="flow-order"><span>1 Presas–Mezcalapa–Samaria y Carrizal</span><span>2 Ríos Serranos–Grijalva</span><span>3 Tulijá–Puxcatán–Chilapa</span><span>4 Usumacinta</span></div><div class="section-note">Ríos Serranos: Oxolotán, Amatán, Tacotalpa, Teapa, Puyacatengo, La Sierra y Pichucalco.</div></div></div>`;
}
function markdownPreview(md){if(typeof md!=='string')return '<div class="error">El análisis de las 11:00 h aún no está disponible.</div>';const lines=md.split('\n');let html='';for(const l of lines){if(/^### /.test(l))html+=`<h3>${esc(l.slice(4))}</h3>`;else if(/^## /.test(l))html+=`<h2>${esc(l.slice(3))}</h2>`;else if(/^# /.test(l))html+=`<h2>${esc(l.slice(2))}</h2>`;else if(l.trim()&&!l.startsWith('|')&&!/^[-: ]+$/.test(l))html+=`<p>${esc(l)}</p>`}return html.slice(0,26000)}
function reportCards(){const cfg=[['Análisis 11:00',state.data.wordAnalysis,'../data/analysis/Reportes/Analisis_Hidrometeorologico_Ultimo.docx'],['Niveles',state.data.wordNiveles,'../data/niveles/Reportes/Reporte_Niveles_Hidrometricos_Ultimo.docx'],['WeatherLink',state.data.wordWeather,'../data/weatherlink/Reportes/Reporte_WeatherLink_Ultimo.docx']];return `<div class="cards">${cfg.map(([n,s,u])=>`<div class="station-card"><h3>${n}</h3><div>${s?.verified===true?'<span class="badge ok">Verificado</span>':'<span class="badge warn">Pendiente/no verificado</span>'}</div><p>${esc(s?.cut||'Corte s/d')}</p><a class="btn" href="${u}" target="_blank" rel="noopener">Abrir Word</a></div>`).join('')}</div>`}
function render(){
  const label=sections.find(x=>x[0]===state.current)?.[1]||'Resumen operativo';$('#pageTitle').textContent=label;let html='';
  switch(state.current){
    case'presas':html=`<div class="grid">${systemBlock('Presas–Mezcalapa–Samaria y Carrizal',presasRows(),'Cadena operativa: sistema de presas del Grijalva, con énfasis en Peñitas → Mezcalapa → bifurcación Samaria/Carrizal. Platanar y El Macayo se incorporan cuando exista dato compatible.')}</div>`;break;
    case'serranos':html=`<div class="grid">${systemBlock('Ríos Serranos (Oxolotán, Amatán, Tacotalpa, Teapa, Puyacatengo, La Sierra y Pichucalco)–Grijalva',serranosRows(),'El bloque se interpreta hasta su repercusión en el Grijalva. Tulijá–Puxcatán–Chilapa permanece separado.')}</div>`;break;
    case'tulija':html=`<div class="grid">${systemBlock('Tulijá–Puxcatán–Chilapa',tulijaRows(),'Sistema propio: Tulijá y Puxcatán → Chilapa → incorporación al Grijalva. No se mezcla con Ríos Serranos.')}</div>`;break;
    case'usumacinta':html=`<div class="grid">${systemBlock('Usumacinta',usumacintaRows(),'Cadena antecedente: Guatemala (Chixoy/Salinas, La Pasión y El Tigre) + Lacantún → Boca del Cerro → Balancán → Emiliano Zapata → Jonuta → Centla. Las estaciones de Guatemala/Lacantún se añadirán cuando el recolector las exponga en JSON consumible por la App.')}</div>`;break;
    case'weather':html=`<div class="grid"><div class="panel wide"><h2>WeatherLink · 32 estaciones</h2>${maturityPills()}${weatherTable()}<div class="section-note">La ausencia de dato se presenta como “sin dato”. Los acumulados no maduros se identifican como transicionales.</div></div>${weatherBars()}<div class="panel wide"><h2>CONAGUA · lluvia observada</h2>${conaguaRainTable()}<div class="section-note">Fuente separada: reporte horario CONAGUA. Blanco = sin dato; cero sólo cuando fue publicado explícitamente.</div></div></div>`;break;
    case'lluvia':{const rows=conaguaRain();html=`<div class="grid"><div class="panel wide"><h2>Lluvia antecedente y condición de humedad</h2>${barList(rows,'lluvia_24h_precedentes_mm','Lluvia CONAGUA 24 h')}<div class="section-note">No se suman estaciones puntuales para fabricar acumulados de cuenca. Esta vista representa observaciones por estación.</div></div><div class="panel wide"><h2>Detalle CONAGUA</h2>${conaguaRainTable()}</div></div>`;break;}
    case'pronostico':html='<div class="grid"><div class="panel wide"><h2>SMN 96 h y 360 h</h2><p>La interfaz queda preparada para mostrar por cuenca las ventanas 0–24, 24–48, 48–72 y 72–96 h, además de 96–168 y 168–360 h. Los rangos se conservarán como rangos; no se sumarán sus extremos como pronóstico puntual.</p><div class="empty-state">Pendiente de exponer los productos SMN en un JSON cloud estable para graficarlos sin depender de la PC.</div></div></div>';break;
    case'analisis':html=`<div class="grid"><div class="panel wide"><h2>Último análisis publicado</h2>${markdownPreview(state.data.analysis)}</div></div>`;break;
    case'reportes':html=`<div class="grid"><div class="panel wide"><h2>Reportes persistentes</h2>${reportCards()}</div></div>`;break;
    default:html=summary();
  }
  $('#content').innerHTML=html;
}
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#refreshBtn').addEventListener('click',loadAll);
buildNav();loadAll();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
