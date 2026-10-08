const BASE='..';
const SRC={
 niveles:`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,
 history:`${BASE}/data/niveles/Historico/niveles_historicos.json`,
 weather:`${BASE}/data/weatherlink/latest.json`,
 weatherState:`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`,
 conagua:`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`,
 climaConagua:`${BASE}/data/niveles/Clima_CONAGUA/ultimo_corte.json`,
 publicas:`${BASE}/data/fuentes_publicas/latest.json`,
 analysis:`${BASE}/data/analysis/latest.md`,
 fuente2:`${BASE}/data/latest/FUENTE2.txt`,
 damHistory:`${BASE}/data/presas/historico_mensual.json`,
 sih:`${BASE}/data/sih_lluvia/latest.json`,
 sihSubcuencas:`${BASE}/data/sih_lluvia/subcuencas.json`
};
const SECTIONS=[['resumen','Resumen operativo'],['weather','WeatherLink / CONAGUA'],['sih','Lluvia SIH-CONAGUA'],['pronostico','Pronóstico SMN 96 / 360 h'],['tonala','Coatzacoalcos–Tonalá'],['presas','Presas–Mezcalapa–Samaria y Carrizal'],['serranos','Ríos Serranos–Grijalva'],['tulija','Tulijá–Puxcatán–Chilapa'],['usumacinta','Usumacinta'],['analisis','Análisis 11:00 h'],['reportes','Reportes']];
const SYSTEMS={
 presas:{title:'Presas–Mezcalapa–Samaria y Carrizal',terms:['samaria','gonzalez','carrizal','mezcalapa','platanar','macayo','penitas']},
 serranos:{title:'Ríos Serranos–Grijalva',terms:['oxolotan','tapijulapa','teapa','puyacatengo','san joaquin','pueblo nuevo','rios de la sierra','pichucalco','gaviotas','el muelle','porvenir']},
 tulija:{title:'Tulijá–Puxcatán–Chilapa',terms:['salto de agua','macuspana','tulija','puxcatan','chilapa']},
 usumacinta:{title:'Usumacinta',terms:['boca del cerro','san pedro','usumacinta']}
};
const SUMMARY_ORDER={
 presas:['samaria','gonzalez','macayo','mezcalapa','platanar','penitas'],
 serranos:['oxolotan','tapijulapa','teapa','puyacatengo','san joaquin','pueblo nuevo','pichucalco','gaviotas','el muelle','porvenir'],
 tulija:['salto de agua','macuspana','puxcatan','chilapa'],
 usumacinta:['boca del cerro','san pedro']
};
const state={current:'resumen',data:{},history:[],damHistory:[]};
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const fmt=(v,d=2)=>finite(v)?Number(v).toFixed(d):'s/d', fToC=f=>finite(f)?(Number(f)-32)*5/9:null;
function humanDate(v){if(!v)return's/d';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).replace('T',' ').replace(/\.\d+/,'');return d.toLocaleString('es-MX',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function levelCutDate(v){if(!v)return's/d';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).replace('T',' ').replace(/\.\d+/,'');return d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function monthLabel(d){return d.toLocaleDateString('es-MX',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())}
async function getJSON(u){const r=await fetch(`${u}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error(r.status);return r.json()}
async function getText(u){const r=await fetch(`${u}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error(r.status);return r.text()}
const arr=v=>Array.isArray(v)?v:[];
function levels(){return arr(state.data.niveles)} function weather(){return arr(state.data.weather?.stations)} function conagua(){return arr(state.data.conagua)}
function maxLevelCutRows(rows){return Math.max(0,...arr(rows).map(r=>Date.parse(r?.fecha_hora||r?.ultima_actualizacion_real)||0))}
function weatherStamp(obj){return Date.parse(obj?.run_utc||obj?.run_local||'')||0}
function historyStamp(rows){return Math.max(0,...arr(rows).map(r=>Date.parse(r?.fecha_hora)||0))}
function acceptMonotonic(key,next){
  const prev=state.data[key];
  if(key==='niveles')return !arr(prev).length||maxLevelCutRows(next)>=maxLevelCutRows(prev);
  if(key==='weather'||key==='weatherState')return !prev||weatherStamp(next)>=weatherStamp(prev);
  if(key==='history')return !arr(prev).length||historyStamp(next)>=historyStamp(prev);
  return true;
}
function systemRows(id){const c=SYSTEMS[id];return c?levels().filter(r=>c.terms.some(t=>norm(`${r.estacion||''} ${r.rio||''}`).includes(t))):[]}
function levelState(r){if(r.estado_dato!=='observado')return'Dato anterior';if(finite(r.delta_24h)&&Number(r.delta_24h)>.20)return'Ascenso relevante';if(/asc/i.test(r.tendencia||''))return'Ascenso';if(/desc/i.test(r.tendencia||''))return'Descenso';return'Estable'}
function levelTable(rows,summary=false,preserveOrder=false){if(!rows.length)return'<p class="muted">Sin datos válidos.</p>';const rr=preserveOrder?[...rows]:[...rows].sort((a,b)=>(Number(b.delta_24h)||0)-(Number(a.delta_24h)||0));return `<div class="table-wrap"><table><thead><tr>${summary?'<th>Sistema / río</th>':''}<th>Estación</th><th>Nivel</th><th>Δ24 h</th><th>Tendencia</th><th>Dist. NAMO</th><th>Estado</th></tr></thead><tbody>${rr.map(r=>`<tr>${summary?`<td>${esc(r.rio||'s/d')}</td>`:''}<td><b>${esc(r.estacion||'s/d')}</b></td><td>${fmt(r.ultimo_nivel)} m</td><td>${finite(r.delta_24h)?`${Number(r.delta_24h)>=0?'+':''}${fmt(r.delta_24h)} m`:'s/d'}</td><td>${esc(r.tendencia||'s/d')}</td><td>${finite(r.distancia_namo)?`${Math.abs(Number(r.distancia_namo)).toFixed(2)} m ${Number(r.distancia_namo)<0?'abajo':'arriba'}`:'s/d'}</td><td>${esc(levelState(r))}</td></tr>`).join('')}</tbody></table></div>`}
function validWeather(r){return Number(r.age_seconds)<7200&&!/rezagado|heredado/i.test(r.quality||'')}
function rainRows(id=null){
 const out=[],cfg=id?SYSTEMS[id]:null,m=state.data.weatherState?.window_maturity||{};
 const boletin=Array.isArray(state.data.climaConagua?.conagua_tabasco)?state.data.climaConagua.conagua_tabasco:[];
 const latestBoletin=boletin.map(r=>String(r.fecha_hora_mensaje||'').slice(0,10)).sort().at(-1)||'';
 const boletinStations=new Set();
 for(const r of boletin){
  const day=String(r.fecha_hora_mensaje||'').slice(0,10),v=r.lluvia_24h_mm,txt=norm(r.estacion);
  if(day!==latestBoletin||r.estado_dato!=='observado'||!finite(v)||Number(v)<0)continue;
  if(cfg&&!cfg.terms.some(t=>txt.includes(t)))continue;
  boletinStations.add(txt);
  out.push({station:r.estacion,source:'CONAGUA Tabasco · boletín',h1:null,h6:null,h24:Number(v),h48:null,temp:null,hum:null,time:r.fecha_hora_mensaje,quality:'observado'});
 }
 for(const r of conagua()){
  if(norm(r.estado_24h)!=='observado'||!finite(r.lluvia_24h_precedentes_mm))continue;
  if(norm(r.estacion)==='penitas'&&(Number(r.lluvia_24h_precedentes_mm)>150||r.advertencia))continue;
  const txt=norm(r.estacion);
  if(cfg&&!cfg.terms.some(t=>txt.includes(t)))continue;
  // No mezclar el corte anterior con el boletín vigente ni duplicar estaciones.
  if(latestBoletin&&(String(r.fecha_hora||'').slice(0,10)<latestBoletin||boletinStations.has(txt)))continue;
  out.push({station:r.estacion,source:'CONAGUA · reporte horario',h1:null,h6:null,h24:r.lluvia_24h_precedentes_mm,h48:null,temp:null,hum:null,time:r.fecha_hora,quality:'observado'});
 }
 for(const r of weather()){
  if(!validWeather(r))continue;
  const txt=norm(`${r.nombre||''} ${r.ubicacion||''}`);
  if(cfg&&!cfg.terms.some(t=>txt.includes(t)))continue;
  const a=r.accumulations_mm||{};
  out.push({station:r.nombre,source:'WeatherLink',h1:a['1'],h6:a['6'],h24:m['24h']===true?a['24']:null,h48:m['48h']===true?a['48']:null,temp:fToC(r.temperature_f),hum:r.humidity_pct,time:r.observed_utc||r.last_updated_at,quality:r.quality||'Cloud',accumulationStatus:r.accumulation_status||{}});
 }
 return out.filter(r=>finite(r.h24)).sort((a,b)=>Number(b.h24)-Number(a.h24));
}
function rainQuality(r){if(r.source!=='WeatherLink')return r.quality||'observado';const s=r.accumulationStatus||{},hours=['24','48'].filter(h=>s[h]==='minimo_observado');return 'Cloud'+(hours.length?' · ≥ '+hours.join('/')+' h':'')+(/rezagado|heredado/i.test(r.quality||'')?' · Rezagado':'')}
function rainTable(id=null,full=false){const rows=rainRows(id);if(!rows.length)return'<p class="muted">Sin lluvia observada válida para este apartado.</p>';return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Fuente</th>${full?'<th>1 h</th><th>6 h</th>':''}<th>24 h anteriores</th><th>48 h anteriores</th>${full?'<th>Temperatura</th><th>Humedad</th>':''}<th>Hora</th><th>Calidad</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.station)}</b></td><td>${r.source}</td>${full?`<td>${finite(r.h1)?fmt(r.h1,1)+' mm':'s/d'}</td><td>${finite(r.h6)?fmt(r.h6,1)+' mm':'s/d'}</td>`:''}<td>${finite(r.h24)?(r.accumulationStatus?.['24']==='minimo_observado'?'≥ ':'')+fmt(r.h24,1)+' mm':'s/d'}</td><td>${finite(r.h48)?(r.accumulationStatus?.['48']==='minimo_observado'?'≥ ':'')+fmt(r.h48,1)+' mm':'s/d'}</td>${full?`<td>${finite(r.temp)?fmt(r.temp,1)+' °C':'s/d'}</td><td>${finite(r.hum)?fmt(r.hum,0)+'%':'s/d'}</td>`:''}<td>${humanDate(r.time)}</td><td class="weather-quality-cell" style="max-width:160px;width:150px;min-width:110px;white-space:normal;overflow-wrap:anywhere;font-size:.86rem;line-height:1.35" title="${esc(r.quality)}">${esc(rainQuality(r))}</td></tr>`).join('')}</tbody></table></div>`}
function tabascoWeather(){return weather().filter(r=>validWeather(r)&&/tab\.|tabasco|villahermosa|paraiso|paraíso|comalcalco|centla|cunduacan|cunduacán|nacajuca|dos bocas|centro/i.test(`${r.ubicacion||''} ${r.nombre||''}`))}
function tempTop(){return tabascoWeather().filter(r=>finite(r.temperature_f)).map(r=>({...r,_c:fToC(r.temperature_f)})).sort((a,b)=>b._c-a._c)[0]||null}
function priorityLevels(){return levels().map(r=>({...r,_score:(Number(r.delta_24h)>0?100+Number(r.delta_24h)*100:0)+(finite(r.distancia_namo)&&Number(r.distancia_namo)>-1?50:0)})).sort((a,b)=>b._score-a._score).slice(0,10)}
function summaryLevelRows(){
  const selected=priorityLevels().map((r,i)=>({...r,_orig:i}));
  const required=['salto de agua','macuspana'];
  for(const name of required){
    const row=levels().find(r=>norm(r.estacion)===name);
    if(row&&!selected.some(x=>norm(x.estacion)===name))selected.push({...row,_orig:selected.length});
  }
  const groups=['presas','serranos','tulija','usumacinta'];
  const rank=r=>{const txt=norm(`${r.estacion||''} ${r.rio||''}`);for(let gi=0;gi<groups.length;gi++){const id=groups[gi];if(SYSTEMS[id].terms.some(t=>txt.includes(t))){const order=SUMMARY_ORDER[id]||[],si=order.findIndex(t=>txt.includes(t));return[gi,si<0?999:si,r._orig]}}return[999,999,r._orig]};
  const ordered=selected.sort((a,b)=>{const A=rank(a),B=rank(b);return A[0]-B[0]||A[1]-B[1]||A[2]-B[2]});
  const tulijaRows=ordered.filter(r=>required.includes(norm(r.estacion))).sort((a,b)=>required.indexOf(norm(a.estacion))-required.indexOf(norm(b.estacion)));
  const rest=ordered.filter(r=>!required.includes(norm(r.estacion)));
  let insertAt=rest.findIndex(r=>['gaviotas','el muelle','porvenir'].includes(norm(r.estacion))||norm(r.rio)==='rio grijalva');
  if(insertAt<0)insertAt=rest.findIndex(r=>SYSTEMS.usumacinta.terms.some(t=>norm(`${r.estacion||''} ${r.rio||''}`).includes(t)));
  if(insertAt<0)insertAt=rest.length;
  rest.splice(insertAt,0,...tulijaRows);
  return rest;
}
function synthesis(){const l=priorityLevels()[0],rain=rainRows()[0],t=tempTop(),lines=[];if(l)lines.push(`${l.estacion}: ${levelState(l).toLowerCase()}${finite(l.delta_24h)?`, Δ24 h ${Number(l.delta_24h)>=0?'+':''}${fmt(l.delta_24h)} m`:''}.`);if(rain&&finite(rain.h24))lines.push(`Mayor lluvia observada: ${fmt(rain.h24,1)} mm/24 h en ${rain.station} (${rain.source}).`);if(t)lines.push(`Mayor temperatura actual válida en Tabasco: ${fmt(t._c,1)} °C en ${t.nombre}.`);lines.push('Revisar primero lluvia observada y después la respuesta hidrométrica de cada subcuenca.');return `<ul>${lines.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`}
function semaforo(){return `<div class="cards">${Object.entries(SYSTEMS).map(([id,c])=>{const rr=systemRows(id),rise=Math.max(0,...rr.map(r=>Number(r.delta_24h)||0)),rain=rainRows(id)[0],label=rise>=.30||Number(rain?.h24)>=75?'Atención prioritaria':rise>0||Number(rain?.h24)>=50?'Vigilancia reforzada':'Seguimiento ordinario',cls=label==='Atención prioritaria'?'danger':label==='Vigilancia reforzada'?'warn':'ok';return `<div class="station-card"><strong>${esc(c.title)}</strong><span class="badge ${cls}">${label}</span></div>`}).join('')}</div>`}
function summaryHTML(){const t=tempTop(),rain=rainRows().slice(0,5);const met=rain.map(r=>`<tr><td>Lluvia 24 h</td><td>${esc(r.station)}</td><td>${finite(r.h24)?fmt(r.h24,1)+' mm':'s/d'}</td><td>${esc(humanDate(r.time))}</td><td>${esc(r.source)}</td></tr>`).join('')+(t?`<tr><td>Temperatura actual</td><td>${esc(t.nombre)}</td><td>${fmt(t._c,1)} °C · HR ${finite(t.humidity_pct)?fmt(t.humidity_pct,0)+'%':'s/d'}</td><td>${esc(humanDate(t.observed_utc||t.last_updated_at))}</td><td>WeatherLink</td></tr>`:'');return `<div class="grid"><section class="panel wide"><h2>Resumen de niveles</h2>${levelTable(summaryLevelRows(),true,true)}</section><section class="panel wide"><h2>Resumen de lluvia y temperatura</h2><p class="muted">Fuentes operativas vigentes del resumen. SIH-CONAGUA permanece separado en su propio apartado.</p><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Estación</th><th>Valor</th><th>Fecha / hora</th><th>Fuente</th></tr></thead><tbody>${met||'<tr><td colspan="5">Sin datos válidos</td></tr>'}</tbody></table></div></section><section class="panel wide"><h2>Síntesis operativa</h2>${synthesis()}</section><section class="panel wide"><h2>Semáforo ejecutivo</h2>${semaforo()}</section></div>`}
function hist48(name){const n=norm(name),a=state.history.filter(r=>norm(r.estacion)===n&&r.estado_dato==='observado'&&finite(r.nivel)&&r.fecha_hora).map(r=>({...r,_t:new Date(r.fecha_hora)})).filter(r=>!isNaN(r._t)).sort((a,b)=>a._t-b._t);if(!a.length)return[];const end=a.at(-1)._t.getTime();return a.filter(r=>r._t.getTime()>=end-48*3600000)}
function lineGraph(rows,title,sub,refs=[]){if(rows.length<2)return'';const vals=rows.map(r=>Number(r.v)),refVals=refs.flatMap(x=>x.values.filter(finite).map(Number)),all=[...vals,...refVals],lo0=Math.min(...all),hi0=Math.max(...all),span=Math.max(.2,hi0-lo0),lo=lo0-span*.08,hi=hi0+span*.08,W=760,H=320,L=60,R=22,T=38,B=42,pw=W-L-R,ph=H-T-B,t0=rows[0].t.getTime(),t1=rows.at(-1).t.getTime(),x=d=>L+((d.getTime()-t0)/(t1-t0||1))*pw,y=v=>T+(hi-v)/(hi-lo||1)*ph;const grid=[0,.25,.5,.75,1].map(p=>{const yy=T+p*ph,v=hi-p*(hi-lo);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#ddd"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#666">${v.toFixed(2)}</text>`}).join('');const main=`<polyline fill="none" stroke="#1f77b4" stroke-width="3" points="${rows.map(r=>`${x(r.t)},${y(r.v)}`).join(' ')}"/>${rows.map(r=>`<circle cx="${x(r.t)}" cy="${y(r.v)}" r="3.5" fill="#1f77b4"/>`).join('')}`;const colors=['#7a1230','#b7791f'];const extra=refs.map((ref,i)=>`<polyline fill="none" stroke="${colors[i%2]}" stroke-width="2" stroke-dasharray="${i?'8 5':'4 3'}" points="${rows.map((r,j)=>finite(ref.values[j])?`${x(r.t)},${y(Number(ref.values[j]))}`:'').filter(Boolean).join(' ')}"/><text x="${L+8}" y="${T+15+i*16}" font-size="11" font-weight="700" fill="${colors[i%2]}">${esc(ref.label)}</text>`).join('');return `<article class="hydro48-card"><div class="hydro48-head"><strong>${esc(title)}</strong><span>${esc(sub)}</span></div><svg viewBox="0 0 ${W} ${H}">${grid}${extra}${main}<text x="${L}" y="${H-12}" font-size="11" fill="#666">${humanDate(rows[0].t)}</text><text x="${W-R}" y="${H-12}" text-anchor="end" font-size="11" fill="#666">${humanDate(rows.at(-1).t)}</text></svg></article>`}
function hydroGraphs(id){const names=[];for(const r of state.history){const text=norm(`${r.estacion||''} ${r.rio||''}`);if(SYSTEMS[id].terms.some(t=>text.includes(t))&&!names.some(n=>norm(n)===norm(r.estacion)))names.push(r.estacion)}const cards=names.map(n=>{const h=hist48(n);if(h.length<2)return'';const last=h.at(-1),rows=h.map(r=>({t:r._t,v:Number(r.nivel)})),refs=[];if(finite(last.namo))refs.push({label:`NAMO ${fmt(last.namo)} m`,values:rows.map(()=>Number(last.namo))});if(finite(last.namino))refs.push({label:`NAMINO ${fmt(last.namino)} m`,values:rows.map(()=>Number(last.namino))});return lineGraph(rows,last.estacion,last.rio||'Nivel · 48 h',refs)}).filter(Boolean);return cards.length?`<section class="panel wide"><h2>Gráficas hidrométricas · 48 h</h2><div class="hydro48-grid">${cards.join('')}</div></section>`:'<section class="panel wide"><h2>Gráficas hidrométricas · 48 h</h2><p class="muted">Aún no hay dos observaciones válidas para graficar.</p></section>'}
function parseNum(s){let x=String(s).trim();if(x.includes(',')&&x.includes('.'))x=x.replace(/,/g,'');else x=x.replace(',','.');const n=Number(x);return Number.isFinite(n)?n:null}
function parseDams(txt){const ref={Angostura:533,Malpaso:182.5};return ['Angostura','Malpaso'].map(name=>{const m=txt.match(new RegExp(`^${name}\\s+(.+)$`,'mi'));if(!m)return null;const v=m[1].trim().split(/\s+/).map(parseNum).filter(x=>x!==null);if(v.length<12)return null;return{name,actual:v[4],pct:v[5],difCurva:v[7],guia:v[4]-v[7],namo:ref[name]}}).filter(Boolean)}
function parsePenitas(txt){const m=txt.match(/^Peñitas\s+(.+)$/mi);if(!m)return null;const v=m[1].trim().split(/\s+/).map(parseNum).filter(x=>x!==null);return v.length>=10?{nivel:v[4],pct:v[5],extr:v.at(-4)}:null}
function damTable(){const d=parseDams(state.data.fuente2||''),p=parsePenitas(state.data.fuente2||'');if(!d.length&&!p)return'';return `<section class="panel wide"><h2>Presas · nivel, Curva Guía y extracción</h2>${d.length?`<div class="table-wrap"><table><thead><tr><th>Presa</th><th>Nivel actual</th><th>NAMO</th><th>Curva Guía del día</th><th>Dif. vs Curva Guía</th><th>% llenado</th></tr></thead><tbody>${d.map(x=>`<tr><td><b>${x.name}</b></td><td>${fmt(x.actual)} msnm</td><td>${fmt(x.namo)} msnm</td><td>${fmt(x.guia)} msnm</td><td>${x.difCurva>=0?'+':''}${fmt(x.difCurva)} m</td><td>${fmt(x.pct,2)}%</td></tr>`).join('')}</tbody></table></div>`:''}${p?`<p><b>Peñitas:</b> nivel ${fmt(p.nivel)} msnm · extracción promedio ${fmt(p.extr,0)} m³/s${finite(p.pct)?` · ${fmt(p.pct,2)}% al NAMO`:''}.</p>`:''}</section>`}
function damMonthGraph(h,name,label){if(h.length<2)return'';const rows=h.map(r=>({...r,_t:new Date(r.fecha_hora)})).filter(r=>!isNaN(r._t)).sort((a,b)=>a._t-b._t);if(rows.length<2)return'';const observed=rows.map(r=>Number(r.nivel)),guide=rows.filter(r=>finite(r.curva_guia)).map(r=>Number(r.curva_guia)),plot=[...observed,...guide],lo0=Math.min(...plot),hi0=Math.max(...plot),span=Math.max(.5,hi0-lo0),lo=lo0-span*.08,hi=hi0+span*.08,W=760,H=330,L=62,R=24,T=54,B=44,pw=W-L-R,ph=H-T-B,t0=rows[0]._t.getTime(),t1=rows.at(-1)._t.getTime(),x=d=>L+((d.getTime()-t0)/(t1-t0||1))*pw,y=v=>T+(hi-v)/(hi-lo||1)*ph;const grid=[0,.25,.5,.75,1].map(p=>{const yy=T+p*ph,v=hi-p*(hi-lo);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#ddd"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#666">${v.toFixed(2)}</text>`}).join('');const obsPts=rows.map(r=>`${x(r._t)},${y(Number(r.nivel))}`).join(' '),guidePts=rows.map(r=>finite(r.curva_guia)?`${x(r._t)},${y(Number(r.curva_guia))}`:'').filter(Boolean).join(' '),last=rows.at(-1),namo=finite(last.namo)?Number(last.namo):null,namoIn=namo!==null&&namo>=lo&&namo<=hi;const namoLine=namoIn?`<line x1="${L}" y1="${y(namo)}" x2="${W-R}" y2="${y(namo)}" stroke="#b7791f" stroke-width="2.5" stroke-dasharray="2 6"/><text x="${W-R}" y="${y(namo)-6}" text-anchor="end" font-size="11" font-weight="700" fill="#8a5b12">NAMO ${fmt(namo)} msnm</text>`:`<text x="${W-R}" y="${T-10}" text-anchor="end" font-size="11" font-weight="700" fill="#8a5b12">NAMO ${fmt(namo)} msnm · fuera de escala</text>`;const footer=`Último nivel ${fmt(last.nivel)} msnm · Curva Guía ${fmt(last.curva_guia)} msnm · Dif. ${Number(last.dif_curva)>=0?'+':''}${fmt(last.dif_curva)} m · NAMO ${fmt(last.namo)} msnm · ${fmt(last.pct_llenado,2)}% llenado`;return `<article class="hydro48-card"><div class="hydro48-head"><strong>${esc(name)} · ${esc(label)}</strong><span>Nivel, Curva Guía y NAMO</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)} ${esc(label)}"><line x1="${L}" y1="18" x2="${L+38}" y2="18" stroke="#1f77b4" stroke-width="3"/><circle cx="${L+19}" cy="18" r="3.5" fill="#1f77b4"/><text x="${L+46}" y="22" font-size="11">Nivel observado</text><line x1="${L+160}" y1="18" x2="${L+198}" y2="18" stroke="#7a1230" stroke-width="2.5" stroke-dasharray="8 5"/><text x="${L+206}" y="22" font-size="11">Curva Guía</text><line x1="${L+300}" y1="18" x2="${L+338}" y2="18" stroke="#b7791f" stroke-width="2.5" stroke-dasharray="2 6"/><text x="${L+346}" y="22" font-size="11">NAMO</text>${grid}${namoLine}<polyline fill="none" stroke="#7a1230" stroke-width="2.5" stroke-dasharray="8 5" points="${guidePts}"/><polyline fill="none" stroke="#1f77b4" stroke-width="3" points="${obsPts}"/>${rows.map(r=>`<circle cx="${x(r._t)}" cy="${y(Number(r.nivel))}" r="3.5" fill="#1f77b4"/>`).join('')}<text x="${L}" y="${H-12}" font-size="11" fill="#666">${humanDate(rows[0].fecha_hora)}</text><text x="${W-R}" y="${H-12}" text-anchor="end" font-size="11" fill="#666">${humanDate(last.fecha_hora)}</text></svg><div class="hydro48-foot"><b>${esc(footer)}</b></div></article>`}
function damGraphs(){const cards=[];for(const name of ['Angostura','Malpaso']){const h=state.damHistory.filter(r=>r.presa===name&&finite(r.nivel)&&r.fecha_hora).map(r=>({...r,_t:new Date(r.fecha_hora)})).filter(r=>!isNaN(r._t)).sort((a,b)=>a._t-b._t);const months=[...new Set(h.map(r=>`${r._t.getFullYear()}-${String(r._t.getMonth()+1).padStart(2,'0')}`))].sort().reverse().slice(0,2);for(const key of months){const m=h.filter(r=>`${r._t.getFullYear()}-${String(r._t.getMonth()+1).padStart(2,'0')}`===key);const g=damMonthGraph(m,name,monthLabel(m[0]._t));if(g)cards.push(g)}}return cards.length?`<section class="panel wide"><h2>Angostura y Malpaso · evolución mensual</h2><div class="hydro48-grid">${cards.join('')}</div></section>`:''}
function systemPage(id){const rain=`<section class="panel wide"><h2>Lluvia observada · 24 y 48 h</h2>${rainTable(id,false)}</section>`;const levelsSec=`<section class="panel wide"><h2>${SYSTEMS[id].title} · niveles</h2>${levelTable(systemRows(id),false)}</section>`;if(id==='presas')return `<div class="grid">${rain}${damTable()}${levelsSec}${damGraphs()}${hydroGraphs(id)}</div>`;return `<div class="grid">${rain}${levelsSec}${hydroGraphs(id)}</div>`}
function weatherPage(){return `<div class="grid" data-weather-shell="1"><section class="panel wide"><h2>WeatherLink / CONAGUA</h2><p class="muted">Preparando la vista por sistemas y fuentes…</p></section></div>`}
function sihDateTime(d){const iso=d?.fecha_hora_dato;if(iso){const dt=new Date(iso);if(!Number.isNaN(dt.getTime()))return dt.toLocaleString('es-MX',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' h'}return (d?.fecha_fuente||'s/d')+(d?.hora_dato?' '+d.hora_dato+' h':' 08:00 h')}
function sihInfluence(name){const n=norm(name);for(const r of arr(state.data.sihSubcuencas?.reglas)){if(arr(r.aliases).some(a=>n.includes(norm(a))))return arr(r.subcuencas).join(' / ')}return 'Por clasificar'}
function sihGroup(title,rows,d,empty){const rr=arr(rows);const body=rr.length?rr.map(r=>{const inf=sihInfluence(r.estacion);return `<tr><td><b>${esc(r.estacion)}</b></td><td>${finite(r.precipitacion_24h_mm)?fmt(r.precipitacion_24h_mm,1)+' mm':'s/d'}</td><td>${esc(inf)}</td><td>${esc(sihDateTime(d))}</td><td>SIH-CONAGUA</td></tr>`}).join(''):`<tr><td colspan="5">${esc(empty)}</td></tr>`;return `<section class="panel wide"><h2>${esc(title)}</h2><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Precipitación 24 h</th><th>Subcuenca / sistema de influencia</th><th>Fecha y hora del dato</th><th>Fuente</th></tr></thead><tbody>${body}</tbody></table></div></section>`}
function sihPage(){const d=state.data.sih||{};const chi=arr(d.estaciones_chiapas_interes),tab=arr(d.estaciones_tabasco),ver=arr(d.estaciones_veracruz_interes);return `<div class="grid"><section class="panel wide"><h2>SIH-CONAGUA · lluvia acumulada 24 h</h2><p><b>Fecha y hora real del dato:</b> ${esc(sihDateTime(d))} · selección operativa para cuencas de interés de Tabasco.</p><p class="muted">Orden: Chiapas → Tabasco → Veracruz. La relación con subcuencas es una capa operativa independiente: si una estación aún no está validada se muestra como “Por clasificar” y el dato SIH se conserva sin alteración.</p></section>${sihGroup('Chiapas · estaciones de interés para Tabasco',chi,d,'Sin estaciones de interés detectadas en este corte.')}${sihGroup('Tabasco',tab,d,'Sin registros válidos de Tabasco.')}${sihGroup('Veracruz · estaciones de interés para Tabasco',ver,d,'Sin estaciones de interés detectadas en este corte.')}</div>`}
function forecastPage(){const p=state.data.publicas||{},v=p.smn96?.ventanas||{};return `<div class="grid"><section class="panel wide"><h2>SMN · 96 h</h2><div class="table-wrap"><table><thead><tr><th>Ventana</th><th>Peñitas</th><th>Malpaso</th><th>La Angostura</th><th>Ríos de la Sierra</th><th>Usumacinta</th></tr></thead><tbody>${['0-24','24-48','48-72','72-96'].map(w=>`<tr><td>${w} h</td><td>${esc(v[w]?.Peñitas?.texto||'s/d')} mm</td><td>${esc(v[w]?.Malpaso?.texto||'s/d')} mm</td><td>${esc(v[w]?.['La Angostura']?.texto||'s/d')} mm</td><td>${esc(v[w]?.['Bajo Grijalva-Ríos de la Sierra']?.texto||'s/d')} mm</td><td>${esc(v[w]?.Usumacinta?.texto||'s/d')} mm</td></tr>`).join('')}</tbody></table></div></section><section class="panel wide"><h2>SMN · 360 h</h2>${arr(p.smn360?.periodos).map(x=>`<p><b>${esc(x.ventana)}</b> · ${esc(x.descripcion||'s/d')}</p>`).join('')||'<p class="muted">Sin datos.</p>'}</section></div>`}
function analysisPage(){const md=String(state.data.analysis||'');const html=esc(md).replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h2>$1</h2>').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');return `<div class="grid"><section class="panel wide analysis-body"><h2>Análisis 11:00 h</h2><p>${html||'Sin análisis disponible.'}</p></section></div>`}
function reportsPage(){return `<div class="grid"><section class="panel wide"><h2>Reportes</h2><div class="cards"><a class="station-card" href="https://github.com/SISTEMAPCTAB/Agente-Hidrometeorologico-Cloud/blob/main/data/analysis/Reportes/Analisis_Hidrometeorologico_Ultimo.docx" target="_blank"><strong>Análisis hidrometeorológico</strong><span>Word vigente</span></a><a class="station-card" href="https://github.com/SISTEMAPCTAB/Agente-Hidrometeorologico-Cloud/blob/main/data/weatherlink/Reportes/Reporte_WeatherLink_Ultimo.docx" target="_blank"><strong>WeatherLink</strong><span>Word vigente</span></a></div></section></div>`}
function render(){const c=$('#content');if(!c)return;try{const map={resumen:summaryHTML,sih:sihPage,tonala:()=>'<div id="tonala-root" class="grid"><section class="panel wide"><h2>Coatzacoalcos–Tonalá</h2><p>Consultando último informe oficial…</p></section></div>',presas:()=>systemPage('presas'),serranos:()=>systemPage('serranos'),tulija:()=>systemPage('tulija'),usumacinta:()=>systemPage('usumacinta'),weather:weatherPage,pronostico:forecastPage,analisis:analysisPage,reportes:reportsPage};c.innerHTML=(map[state.current]||summaryHTML)()}catch(e){console.error(e);c.innerHTML='<div class="panel wide"><h2>Información temporalmente no disponible</h2><p>La App conserva sus demás apartados. Pulse Actualizar para reintentar.</p></div>'}finally{c.dispatchEvent(new CustomEvent('app-rendered',{detail:{section:state.current}}))}}
function buildNav(){const n=$('#nav');n.innerHTML=SECTIONS.map(([id,l])=>`<button type="button" data-section="${id}">${l}</button>`).join('');n.addEventListener('click',e=>{const b=e.target.closest('button[data-section]');if(!b)return;state.current=b.dataset.section;n.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));$('#pageTitle').textContent=SECTIONS.find(x=>x[0]===state.current)?.[1]||'Monitoreo';$('#sidebar').classList.remove('open');render();window.scrollTo(0,0)});n.querySelector('button')?.classList.add('active')}
function latestLevelCut(){const dates=levels().map(r=>new Date(r.fecha_hora)).filter(d=>!Number.isNaN(d.getTime()));return dates.length?new Date(Math.max(...dates.map(d=>d.getTime()))):null}
function status(){const lv=latestLevelCut(),w=state.data.weatherState?.run_local||state.data.weather?.run_local;$('#statusStrip').innerHTML=`<div class="status-card"><span>Niveles</span><b>${levelCutDate(lv)}</b></div><div class="status-card"><span>WeatherLink</span><b>${humanDate(w)}</b></div><div class="status-card"><span>Actualización WeatherLink</span><b>Cada 2 h · 24/7</b></div>`}
async function refreshWeatherOnly(){
  try{
    const ws=await getJSON(SRC.weatherState);
    const prev=state.data.weatherState?.run_utc||state.data.weather?.run_utc||null;
    const next=ws?.run_utc||null;
    state.data.weatherState=ws;
    if(next&&next!==prev){
      const nw=await getJSON(SRC.weather);
      if(acceptMonotonic('weather',nw))state.data.weather=nw;
    }
    // Evitar que el refresco WeatherLink repinte niveles antiguos.
    // Recuperar niveles antes de redibujar y nunca aceptar un corte anterior.
    try {
      const latest=await getJSON(SRC.niveles);
      if(Array.isArray(latest)&&latest.length){
        const maxCut=rows=>Math.max(0,...rows.map(r=>Date.parse(r.fecha_hora)||0));
        if(maxCut(latest)>=maxCut(levels()))state.data.niveles=latest;
      }
    }catch(_){/* Mantener último nivel ya cargado */ }
    status();
    if(state.current==='weather'){
      document.getElementById('content')?.dispatchEvent(new CustomEvent('weather-data-updated'));
    }else if(state.current==='resumen'||['presas','serranos','tulija','usumacinta'].includes(state.current)){
      render();
    }
  }catch(_){/* conserva último corte válido; reintenta en el siguiente ciclo */}
}
async function loadAll(){
 const c=$('#content');if(c)c.innerHTML='<div class="panel"><p>Cargando información operativa…</p></div>';
 const tasks=[['niveles',SRC.niveles,'json'],['weather',SRC.weather,'json'],['weatherState',SRC.weatherState,'json'],['conagua',SRC.conagua,'json'],['climaConagua',SRC.climaConagua,'json'],['publicas',SRC.publicas,'json'],['analysis',SRC.analysis,'text'],['history',SRC.history,'json'],['fuente2',SRC.fuente2,'text'],['damHistory',SRC.damHistory,'json'],['sih',SRC.sih,'json'],['sihSubcuencas',SRC.sihSubcuencas,'json']];
 const fresh={};
 await Promise.all(tasks.map(async([k,u,t])=>{try{fresh[k]=t==='json'?await getJSON(u):await getText(u)}catch{fresh[k]=undefined}}));
 for(const [k] of tasks){
   const v=fresh[k];
   if(v===undefined)continue;
   if(acceptMonotonic(k,v))state.data[k]=v;
 }
 state.history=arr(state.data.history);state.damHistory=arr(state.data.damHistory);status();render()
}
document.addEventListener('DOMContentLoaded',()=>{buildNav();$('#menuBtn')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));$('#refreshBtn')?.addEventListener('click',loadAll);loadAll();setInterval(loadAll,5*60*1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadAll()});if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=79').catch(()=>{})});
