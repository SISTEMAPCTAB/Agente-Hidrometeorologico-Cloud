const BASE = '..';
const sources = {
  niveles: `${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,
  nivelesEstado: `${BASE}/data/niveles/Estado_Niveles_Cloud.json`,
  weather: `${BASE}/data/weatherlink/latest.json`,
  weatherEstado: `${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,
  analysis: `${BASE}/data/analysis/latest.md`,
  wordAnalysis: `${BASE}/data/analysis/Reportes/Estado_Word.json`,
  wordNiveles: `${BASE}/data/niveles/Reportes/Estado_Word.json`,
  wordWeather: `${BASE}/data/weatherlink/Reportes/Estado_Word.json`
};

const sections = [
  ['resumen','Resumen operativo'],
  ['presas','Presas–Mezcalapa–Samaria y Carrizal'],
  ['bajogrijalva','Bajo Grijalva–Villahermosa'],
  ['serranos','Ríos Serranos'],
  ['tulija','Tulijá–Puxcatán'],
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
const trendBadge = t => { const x=(t||'').toLowerCase(); const c=x.includes('asc')?'warn':x.includes('desc')?'ok':''; return `<span class="badge ${c}">${esc(t||'s/d')}</span>` };

async function getJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function getText(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }

async function loadAll(){
  $('#content').innerHTML = $('#loadingTemplate').innerHTML;
  const tasks = Object.entries(sources).map(async ([k,u])=>{
    try { state.data[k] = u.endsWith('.md') ? await getText(u) : await getJSON(u); }
    catch(e){ state.data[k] = {__error:e.message}; }
  });
  await Promise.all(tasks);
  renderStatus(); render();
}

function buildNav(){
  $('#nav').innerHTML = sections.map(([id,label])=>`<button data-section="${id}">${label}</button>`).join('');
  $('#nav').addEventListener('click',e=>{ const b=e.target.closest('button[data-section]'); if(!b)return; state.current=b.dataset.section; document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x===b)); $('#sidebar').classList.remove('open'); render(); });
  $('#nav button').classList.add('active');
}

function renderStatus(){
  const ne=state.data.nivelesEstado||{}, we=state.data.weatherEstado||{};
  const nivelCut = Array.isArray(state.data.niveles) && state.data.niveles[0]?.fecha_hora;
  const weatherCut = we.cut || we.generated_at || we.run_local || 's/d';
  const analysisCut = typeof state.data.analysis==='string' ? (state.data.analysis.match(/^CORTE:\s*(.+)$/m)?.[1]||'s/d') : 's/d';
  const cards=[['Niveles',nivelCut||'s/d'],['WeatherLink',weatherCut],['Análisis 11:00',analysisCut],['Cloud',ne.complete===true&&we.complete===true?'Operativo':'Verificar']];
  $('#statusStrip').innerHTML=cards.map(([a,b])=>`<div class="status-card"><span>${a}</span><b>${esc(b)}</b></div>`).join('');
  $('#cloudState').textContent = ne.complete===true&&we.complete===true ? 'Cloud operativo' : 'Cloud con fuentes por verificar';
}

function levels(){ return Array.isArray(state.data.niveles)?state.data.niveles:[]; }
function byStations(names){ const set=names.map(x=>x.toLowerCase()); return levels().filter(r=>set.some(n=>(r.estacion||'').toLowerCase().includes(n))); }
function byRiver(words){ return levels().filter(r=>words.some(w=>`${r.rio||''} ${r.estacion||''}`.toLowerCase().includes(w))); }

function levelTable(rows){
  if(!rows.length) return '<p class="muted">Sin datos disponibles para este sistema en el último corte.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Nivel actual</th><th>Dif. NAMO</th><th>Δ vs 06:00</th><th>Δ anterior</th><th>Tendencia</th><th>Estado</th><th>Última actualización</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.estacion)}</td><td>${fmt(r.ultimo_nivel)} m</td><td>${r.distancia_namo==null?'s/d':`${fmt(Math.abs(r.distancia_namo))} m ${r.distancia_namo<0?'abajo':'arriba'}`}</td><td>${fmt(r.delta_vs_06)} m</td><td>${fmt(r.delta_reporte)} m</td><td>${trendBadge(r.tendencia)}</td><td><span class="badge ${r.estado_dato==='observado'?'ok':'warn'}">${esc(r.estado_dato||'s/d')}</span></td><td>${esc(r.ultima_actualizacion_real||r.fecha_hora||'s/d')}</td></tr>`).join('')}</tbody></table></div>`;
}

function systemPanel(title,rows,note=''){ return `<div class="panel wide"><h2>${title}</h2>${levelTable(rows)}${note?`<div class="section-note">${note}</div>`:''}</div>`; }
function summary(){
  const ls=levels(); const asc=ls.filter(x=>(x.tendencia||'').toLowerCase().includes('asc')).length; const inherited=ls.filter(x=>x.estado_dato==='heredado').length;
  const boca=byStations(['boca del cerro'])[0], sam=byStations(['samaria'])[0], gon=byStations(['gonzález','gonzalez'])[0];
  return `<div class="grid"><div class="panel"><h2>Lectura rápida</h2><div class="metric-row"><div class="metric"><strong>${ls.length}</strong><span>estaciones hidrométricas</span></div><div class="metric"><strong>${asc}</strong><span>en ascenso</span></div><div class="metric"><strong>${inherited}</strong><span>datos heredados</span></div></div></div><div class="panel"><h2>Puntos clave</h2><div class="cards">${[boca,sam,gon].filter(Boolean).map(r=>`<div class="station-card"><h3>${esc(r.estacion)}</h3><div class="value">${fmt(r.ultimo_nivel)} m</div><small>${esc(r.rio)} · ${esc(r.tendencia)}</small></div>`).join('')||'<p class="muted">Sin datos.</p>'}</div></div>${systemPanel('Sistemas prioritarios',ls.slice(0,12),'Los cuadros mantienen observado/heredado, fecha real del dato, variación y referencia NAMO cuando existe.')}</div>`;
}

function markdownPreview(md){ if(typeof md!=='string') return '<div class="error">El análisis de las 11:00 h aún no está disponible.</div>'; const lines=md.split('\n'); let html=''; for(const l of lines){ if(/^### /.test(l))html+=`<h3>${esc(l.slice(4))}</h3>`; else if(/^## /.test(l))html+=`<h2>${esc(l.slice(3))}</h2>`; else if(/^# /.test(l))html+=`<h2>${esc(l.slice(2))}</h2>`; else if(l.trim()&&!l.startsWith('|')&&!/^[-: ]+$/.test(l))html+=`<p>${esc(l)}</p>`; } return html.slice(0,22000); }

function reportCards(){ const cfg=[['Análisis 11:00',state.data.wordAnalysis,'../data/analysis/Reportes/Analisis_Hidrometeorologico_Ultimo.docx'],['Niveles',state.data.wordNiveles,'../data/niveles/Reportes/Reporte_Niveles_Hidrometricos_Ultimo.docx'],['WeatherLink',state.data.wordWeather,'../data/weatherlink/Reportes/Reporte_WeatherLink_Ultimo.docx']]; return `<div class="cards">${cfg.map(([n,s,u])=>`<div class="station-card"><h3>${n}</h3><div>${s?.verified===true?'<span class="badge ok">Verificado</span>':'<span class="badge warn">Pendiente/no verificado</span>'}</div><p>${esc(s?.cut||'Corte s/d')}</p><a class="btn" href="${u}" target="_blank" rel="noopener">Abrir Word</a></div>`).join('')}</div>`; }

function render(){
  const label=sections.find(x=>x[0]===state.current)?.[1]||'Resumen operativo'; $('#pageTitle').textContent=label;
  let html='';
  switch(state.current){
    case 'presas': html=`<div class="grid">${systemPanel('Samaria y Carrizal',byStations(['samaria','gonzález','gonzalez']),'La siguiente fase integrará Peñitas, Mezcalapa, Platanar y El Macayo en el mismo bloque operativo, respetando sus unidades y fuentes.')}</div>`; break;
    case 'bajogrijalva': html=`<div class="grid">${systemPanel('Bajo Grijalva–Villahermosa',byStations(['gaviotas','el muelle','porvenir']))}</div>`; break;
    case 'serranos': html=`<div class="grid">${systemPanel('Ríos Serranos',byStations(['oxolotán','oxolotan','tapijulapa','teapa','puyacatengo','san joaquín','san joaquin','pueblo nuevo']))}</div>`; break;
    case 'tulija': html=`<div class="grid">${systemPanel('Tulijá–Puxcatán',byRiver(['tulij','puxcat','chilapa','salto de agua']),'Sistema independiente de Ríos Serranos. No se mezclarán series ni caudales incompatibles.')}</div>`; break;
    case 'usumacinta': html=`<div class="grid">${systemPanel('Usumacinta',byRiver(['usumacinta','boca del cerro','san pedro']),'La app reservará un bloque específico para Guatemala → Lacantún → Boca del Cerro → propagación en Tabasco.')}</div>`; break;
    case 'weather': html=`<div class="grid"><div class="panel wide"><h2>WeatherLink / CONAGUA</h2><p>La conexión cloud está preparada. La siguiente fase mostrará las 32 estaciones, madurez de 1/6/24/48/72 h, calidad y complemento CONAGUA sin convertir blancos en cero.</p></div></div>`; break;
    case 'lluvia': html=`<div class="grid"><div class="panel wide"><h2>Lluvia antecedente y condición de humedad</h2><p>Se mostrará lluvia OCFS de 24 h agrupada por cuenca que drena hacia Tabasco, más Guatemala alta del Usumacinta y los indicadores antecedentes disponibles. La ausencia de un mapa oficial específico de saturación para Tabasco se distinguirá de una inferencia por lluvia antecedente.</p></div></div>`; break;
    case 'pronostico': html=`<div class="grid"><div class="panel wide"><h2>SMN 96 h y 360 h</h2><p>Vista prevista para ventanas 0–24, 24–48, 48–72 y 72–96 h, seguida del escenario 96–168 y 168–360 h. Los rangos no se sumarán como valores puntuales.</p></div></div>`; break;
    case 'analisis': html=`<div class="grid"><div class="panel wide"><h2>Último análisis publicado</h2>${markdownPreview(state.data.analysis)}</div></div>`; break;
    case 'reportes': html=`<div class="grid"><div class="panel wide"><h2>Reportes persistentes</h2>${reportCards()}</div></div>`; break;
    default: html=summary();
  }
  $('#content').innerHTML=html;
}

$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#refreshBtn').addEventListener('click',loadAll);
buildNav(); loadAll();
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
