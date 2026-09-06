(() => {
  const BASE='..';
  const REFRESH_MS=30*60*1000;
  const MAP={
    presas:['samaria','gonzalez','mezcalapa','carrizal','platanar','macayo','penitas'],
    serranos:['oxolotan','tapijulapa','teapa','puyacatengo','san joaquin','pueblo nuevo','rios de la sierra','pichucalco','gaviotas','el muelle','porvenir'],
    tulija:['salto de agua','tulija','puxcatan','chilapa'],
    usumacinta:['boca del cerro','san pedro','usumacinta']
  };
  let rows=[];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function load(){try{const r=await fetch(`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok)rows=await r.json()}catch(e){console.warn('No se pudo actualizar catálogo de gráficas',e)}}
  function current(){return document.querySelector('#nav button.active')?.dataset.section||''}
  function candidates(id){const terms=MAP[id]||[];return (Array.isArray(rows)?rows:[]).filter(r=>r.grafica_png&&terms.some(t=>norm(`${r.estacion||''} ${r.rio||''}`).includes(t)))}
  function existingStation(name){const n=norm(name);return [...document.querySelectorAll('#content .hydro-figure')].some(f=>norm(f.querySelector('figcaption')?.textContent||f.querySelector('.figure-head strong')?.textContent||'').includes(n))}
  function ensure(){const id=current(),content=document.getElementById('content');if(!MAP[id]||!content)return;const miss=candidates(id).filter(r=>!existingStation(r.estacion));let panel=content.querySelector('#guaranteedHydroGraphs');if(!miss.length){panel?.remove();return}if(!panel){panel=document.createElement('section');panel.id='guaranteedHydroGraphs';panel.className='panel wide';panel.innerHTML='<h2>Gráficas de nivel disponibles</h2><div class="hydro-graphs"></div>';content.appendChild(panel)}const grid=panel.querySelector('.hydro-graphs');grid.innerHTML=miss.map(r=>`<figure class="hydro-figure"><img loading="eager" decoding="async" src="${BASE}/${esc(r.grafica_png)}?v=${Date.now()}" alt="Gráfica de nivel de ${esc(r.estacion)}"><figcaption>${esc(r.estacion)} · ${esc(r.rio||'')} · corte ${esc(r.fecha_hora||'s/d')}</figcaption></figure>`).join('')}
  async function refresh(){await load();ensure()}
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(refresh,500);document.getElementById('nav')?.addEventListener('click',()=>setTimeout(refresh,650));document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(refresh,900));window.addEventListener('focus',()=>setTimeout(ensure,100));window.addEventListener('online',refresh);setInterval(refresh,REFRESH_MS)});
})();