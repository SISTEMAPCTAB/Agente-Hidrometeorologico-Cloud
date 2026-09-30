(() => {
  const URL='../data/fuentes_publicas/insivumeh_alto_hidro.json';
  const SECTION_ID='insivumehHydroExtra';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=(v,d=2)=>n(v)===null?'s/d':Number(v).toFixed(d);
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';
  const wanted=['el tigre','el porvenir','machaquila','san pedro mactun','san agustin chixoy','playa grande','san luis ixcan'];
  let busy=false,lastSignature='';
  function ensureScroll(){
    if(document.getElementById('insivumehHydroScrollFix'))return;
    const style=document.createElement('style');style.id='insivumehHydroScrollFix';
    style.textContent='#insivumehHydroExtra{min-width:0;max-width:100%;overflow:hidden} #insivumehHydroExtra .table-wrap{display:block;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;touch-action:auto;overscroll-behavior:auto} #insivumehHydroExtra table{min-width:1100px;width:max-content}';
    document.head.appendChild(style);
  }

  function protectTableScroll(){
    const w=document.querySelector('#insivumehHydroExtra .table-wrap');
    if(!w)return;
    w.style.overflowX='auto';
    w.style.overflowY='hidden';
    w.style.webkitOverflowScrolling='touch';
    w.style.touchAction='auto';
  }

  async function data(){
    try{const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});return r.ok?await r.json():null;}catch{return null;}
  }

  function makeTable(d){
    const rows=(d?.estaciones||[]).filter(x=>wanted.includes(norm(x.estacion)));
    if(!rows.length)return '';
    const body=rows.map(x=>{
      const st=norm(x.estado_dato);
      const badge=st==='observado'?'observado':st==='heredado'?'último dato válido':'sin dato oficial en corte';
      const obs=x.ultima_observacion_fuente?` · ${esc(x.ultima_observacion_fuente)}`:'';
      return `<tr><td><b>${esc(x.estacion)}</b></td><td>${esc(x.rio||'s/d')}</td><td>${esc(x.ubicacion||'s/d')}</td><td>${n(x.nivel_instantaneo_m)===null?'s/d':fmt(x.nivel_instantaneo_m)+' m'}</td><td>${n(x.caudal_instantaneo_m3s)===null?'s/d':fmt(x.caudal_instantaneo_m3s)+' m³/s'}</td><td>${n(x.nivel_referencia_max_m)===null?'s/d':fmt(x.nivel_referencia_max_m)+' m'}</td><td>${n(x.caudal_referencia_max_m3s)===null?'s/d':fmt(x.caudal_referencia_max_m3s)+' m³/s'}</td><td>${esc(badge)}${obs}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Río</th><th>Ubicación</th><th>Nivel actual</th><th>Gasto actual</th><th>Nivel máx. ref.</th><th>Gasto máx. ref.</th><th>Estado del dato</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function signature(d){return JSON.stringify({fecha:d?.fecha,hora:d?.hora,estaciones:(d?.estaciones||[]).map(x=>[x.estacion,x.nivel_instantaneo_m,x.caudal_instantaneo_m3s,x.estado_dato,x.ultima_observacion_fuente])});}

  function rainAnchor(content){
    const panels=[...content.querySelectorAll(':scope > section.panel, :scope > .panel')];
    return panels.find(p=>/lluvia\s+observada/i.test(p.querySelector('h2,h3')?.textContent||''))||null;
  }

  function placeAfterRain(content,sec){
    const rain=rainAnchor(content);
    if(!rain||rain.parentNode!==content)return false;
    const target=rain.nextElementSibling;
    if(target!==sec)content.insertBefore(sec,target);
    return true;
  }

  async function renderHydro(force=false){
    if(active()!=='usumacinta')return false;
    const content=document.getElementById('content');if(!content)return false;
    const d=await data();if(!d)return false;
    ensureScroll();
    const sig=signature(d);
    let sec=document.getElementById(SECTION_ID);
    if(!sec){sec=document.createElement('section');sec.id=SECTION_ID;sec.className='panel wide usu-upper-levels';}

    const placed=placeAfterRain(content,sec);
    if(!placed){
      const panels=[...content.querySelectorAll(':scope > section.panel, :scope > .panel')];
      const anchor=panels.find(p=>norm(p.querySelector('h2')?.textContent)==='usumacinta · niveles')||content.firstElementChild;
      if(anchor?.parentNode===content)content.insertBefore(sec,anchor);else content.insertBefore(sec,content.firstElementChild||null);
    }

    if(force||sig!==lastSignature||!sec.querySelector('table')){
      const html=`<h2>Alto Usumacinta · niveles y gastos INSIVUMEH</h2><p class="source-note">BHVGM de INSIVUMEH. Si una estación no trae valor nuevo, se conserva el último dato válido y se marca como heredado; ausencia nunca equivale a cero. Corte fuente: ${esc(`${d.fecha||'s/d'} ${d.hora||''}`.trim())}.</p>${makeTable(d)}`;
      if(sec.innerHTML!==html)sec.innerHTML=html;
      lastSignature=sig;
    }
    protectTableScroll();
    return placed;
  }

  function clarifyRainRows(){
    const block=document.querySelector('[data-unified-alto="1"]');if(!block)return;
    const hydros=new Set(['el tigre','el porvenir','machaquila','mactun','san pedro mactun']);
    for(const tr of block.querySelectorAll('tbody tr')){
      const td=tr.querySelectorAll('td');if(td.length<13)continue;
      const name=norm(td[0].textContent),source=norm(td[1].textContent);if(source!=='insivumeh')continue;
      if(hydros.has(name)){
        const anyRain=[2,3,4,5,6,7,8,9,10].some(i=>td[i]&&norm(td[i].textContent)!=='s/d');
        if(!anyRain)td[12].textContent='estación hidrométrica; sin precipitación puntual publicada en esta fuente · ver niveles INSIVUMEH';
      }else if(name==='bethel'&&[2,3,4,5,6,7,8,9,10].every(i=>td[i]&&norm(td[i].textContent)==='s/d'))td[12].textContent='sin valor pluviométrico puntual estructurado en la publicación vigente';
    }
  }

  async function run(force=false){if(busy)return false;busy=true;try{const placed=await renderHydro(force);clarifyRainRows();return placed;}finally{busy=false;}}

  function settleOrder(force=false){
    const delays=[300,900,1800,3200,5000,8000];
    delays.forEach((ms,i)=>setTimeout(()=>run(force&&i===0),ms));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    settleOrder(true);
    const root=document.getElementById('content');
    if(root){let retry=null;new MutationObserver(()=>{
      if(active()!=='usumacinta'||busy)return;
      if(document.getElementById(SECTION_ID)?.isConnected)return;
      clearTimeout(retry);retry=setTimeout(()=>run(false),180);
    }).observe(root,{childList:true,subtree:false});}
    document.getElementById('refreshBtn')?.addEventListener('click',()=>settleOrder(true));
    document.getElementById('nav')?.addEventListener('click',()=>settleOrder(true));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)settleOrder(false);});
  });
})();
