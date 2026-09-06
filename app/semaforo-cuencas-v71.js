(() => {
  const BASE='..';
  const REFRESH_MS=30*60*1000;
  const SECTIONS={
    'Presas–Mezcalapa–Samaria y Carrizal':['Mezcalapa','Samaria','Carrizal'],
    'Ríos Serranos–Grijalva':['Oxolotán','Amatán','Tacotalpa','Teapa','Puyacatengo','La Sierra','Pichucalco'],
    'Tulijá–Puxcatán–Chilapa':['Tulijá','Puxcatán','Chilapa'],
    'Usumacinta':['Usumacinta']
  };
  const LEVEL_STATION={
    'Oxolotán':['Oxolotán'],'Tacotalpa':['Tapijulapa'],'Teapa':['Teapa'],'Puyacatengo':['Puyacatengo'],
    'La Sierra':['Pueblo Nuevo','Ríos de la Sierra'],'Pichucalco':['Pichucalco'],'Tulijá':['Salto de Agua'],
    'Puxcatán':['Puxcatán'],'Chilapa':['Chilapa'],'Usumacinta':['Boca del Cerro'],'Mezcalapa':['Mezcalapa'],
    'Samaria':['Samaria'],'Carrizal':['González']
  };
  let data={},timer=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  async function get(url){const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()}
  function title(){return document.getElementById('pageTitle')?.textContent?.trim()||''}
  function currentRivers(){return SECTIONS[title()]||null}
  function links(river){return (data.catalog?.estaciones||[]).filter(x=>x.gobierna_semaforo===true&&(x.rios_objetivo||[]).some(r=>norm(r)===norm(river))&&norm(x.confianza)!=='baja')}
  function conagua(name){const r=(Array.isArray(data.conagua)?data.conagua:[]).find(x=>norm(x.estacion)===norm(name));if(!r||norm(r.estado_24h)!=='observado'||!finite(r.lluvia_24h_precedentes_mm))return null;return {mm:Number(r.lluvia_24h_precedentes_mm),estacion:r.estacion,fuente:'CONAGUA',hora:r.fecha_hora||'s/d'}}
  function weather(name){if(data.weatherState?.window_maturity?.['24h']!==true)return null;const r=(data.weather?.stations||[]).find(x=>norm(x.nombre)===norm(name));if(!r)return null;const q=norm(r.quality);if(q.includes('rezagado')||q.includes('heredado')||!finite(r.accumulations_mm?.['24']))return null;return {mm:Number(r.accumulations_mm['24']),estacion:r.nombre,fuente:'WeatherLink',hora:r.last_updated_at||r.observed_utc||'s/d'}}
  function obs(river){const out=[];for(const l of links(river)){const o=norm(l.fuente)==='weatherlink'?weather(l.estacion):conagua(l.estacion);if(o)out.push(o)}return out.sort((a,b)=>b.mm-a.mm)}
  function classify(mm){if(mm===null)return {label:'sin dato',cls:'nodata'};if(mm<50)return {label:'normal',cls:'signal-azul'};if(mm<75)return {label:'muy fuertes',cls:'signal-verde'};if(mm<150)return {label:'intensas',cls:'signal-amarillo'};if(mm<250)return {label:'torrenciales',cls:'signal-rojo'};return {label:'extraordinarias',cls:'signal-morado'}}
  function levelRow(river){const names=LEVEL_STATION[river]||[river],rows=Array.isArray(data.levels)?data.levels:[];return rows.find(r=>names.some(n=>norm(r.estacion)===norm(n))&&norm(r.estado_dato)==='observado')||null}
  function lowSignal(river){const r=levelRow(river);if(!r||!finite(r.ultimo_nivel))return null;let namino=null;for(const k of ['namino','NAMINO','nivel_namino','namino_m','namino_msnm'])if(finite(r[k])){namino=Number(r[k]);break}if(namino===null&&finite(r.distancia_namino))namino=Number(r.ultimo_nivel)-Number(r.distancia_namino);if(namino===null)return null;const d=Number(r.ultimo_nivel)-namino;if(d<=0)return `Nivel bajo: ${r.estacion} en/debajo de NAMINO`;if(d<=0.50)return `Vigilancia de estiaje: ${r.estacion} a ${d.toFixed(2)} m sobre NAMINO`;return null}
  function card(river){const o=obs(river),top=o[0]||null,c=classify(top?.mm??null),low=lowSignal(river);const ref=top?`${top.estacion} · ${top.fuente} · 24 h`:'Sin observación válida de 24 h';return `<article class="river-basin-card compact"><div class="river-basin-head"><h3>${esc(river)}</h3><span class="river-signal ${esc(c.cls)}">${top?top.mm.toFixed(1)+' mm':'s/d'} · ${esc(c.label)}</span></div><div class="river-compact-ref">${esc(ref)}</div>${low?`<div class="river-low-alert">${esc(low)}</div>`:''}</article>`}
  function render(){const rivers=currentRivers(),content=document.getElementById('content');if(!rivers||!content)return;content.querySelector('#riverBasinSemaphore')?.remove();content.querySelectorAll('.legacy-governor-panel').forEach(x=>x.remove());const panel=document.createElement('section');panel.id='riverBasinSemaphore';panel.className='panel wide river-basin-panel';panel.innerHTML=`<div class="river-panel-head"><h2>Semáforo preventivo por lluvia aguas arriba</h2><small>Se muestra sólo la observación válida que gobierna cada río. NAMO/NAMINO permanecen como referencias de nivel.</small></div><div class="river-basin-grid">${rivers.map(card).join('')}</div>`;content.prepend(panel)}
  async function refresh(){if(!currentRivers())return;try{const [catalog,conagua,weather,weatherState,levels]=await Promise.all([get(`${BASE}/data/catalogos/estaciones_influencia_hidrologica.json`),get(`${BASE}/data/niveles/Lluvia_CONAGUA/ultimo_corte.json`),get(`${BASE}/data/weatherlink/latest.json`),get(`${BASE}/data/weatherlink/Estado_WeatherLink_Cloud.json`),get(`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`)]);data={catalog,conagua,weather,weatherState,levels};render()}catch(e){console.warn('Semáforo compacto no actualizado',e)}}
  function removeLegacy(){const root=document.getElementById('content');if(!root)return;[...root.querySelectorAll('h1,h2,h3,h4,strong')].forEach(h=>{if(norm(h.textContent).includes('estaciones que gobiernan el semaforo de lluvia')){const p=h.closest('section,.panel')||h.parentElement;if(p&&p.id!=='riverBasinSemaphore')p.remove()}})}
  document.addEventListener('DOMContentLoaded',()=>{refresh();document.getElementById('nav')?.addEventListener('click',()=>{setTimeout(()=>{removeLegacy();refresh();window.scrollTo(0,0)},120)});document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(refresh,700));window.addEventListener('focus',()=>{removeLegacy();refresh()});window.addEventListener('online',refresh);timer=setInterval(refresh,REFRESH_MS)});
})();