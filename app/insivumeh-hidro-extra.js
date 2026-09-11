(() => {
  const URL='../data/fuentes_publicas/insivumeh_alto_hidro.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt=(v,d=2)=>n(v)===null?'s/d':Number(v).toFixed(d);
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';
  const wanted=['el tigre','el porvenir','machaquila','san pedro mactun','san agustin chixoy','playa grande','san luis ixcan'];
  let busy=false;

  async function data(){
    try{
      const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
      return r.ok?await r.json():null;
    }catch{return null;}
  }

  function makeTable(d){
    const rows=(d?.estaciones||[]).filter(x=>wanted.includes(norm(x.estacion)));
    if(!rows.length)return '';
    const body=rows.map(x=>{
      const st=norm(x.estado_dato);
      const badge=st==='observado'?'observado':st==='heredado'?'último dato válido':'sin dato oficial en corte';
      return `<tr>
        <td><b>${esc(x.estacion)}</b></td>
        <td>${esc(x.rio||'s/d')}</td>
        <td>${esc(x.ubicacion||'s/d')}</td>
        <td>${n(x.nivel_instantaneo_m)===null?'s/d':fmt(x.nivel_instantaneo_m)+' m'}</td>
        <td>${n(x.caudal_instantaneo_m3s)===null?'s/d':fmt(x.caudal_instantaneo_m3s)+' m³/s'}</td>
        <td>${n(x.nivel_referencia_max_m)===null?'s/d':fmt(x.nivel_referencia_max_m)+' m'}</td>
        <td>${n(x.caudal_referencia_max_m3s)===null?'s/d':fmt(x.caudal_referencia_max_m3s)+' m³/s'}</td>
        <td>${esc(badge)}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Estación</th><th>Río</th><th>Ubicación</th><th>Nivel actual</th><th>Gasto actual</th><th>Nivel máx. ref.</th><th>Gasto máx. ref.</th><th>Estado del dato</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  async function renderHydro(){
    if(active()!=='usumacinta')return;
    const content=document.getElementById('content');if(!content)return;
    const d=await data();if(!d)return;
    let sec=document.getElementById('upperUsumacintaLevels');
    if(!sec){
      sec=document.createElement('section');sec.id='upperUsumacintaLevels';sec.className='panel wide usu-upper-levels';
      content.insertBefore(sec,content.firstElementChild||null);
    }
    sec.innerHTML=`<h2>Alto Usumacinta · niveles y gastos INSIVUMEH</h2>
      <p class="source-note">BHVGM de INSIVUMEH. Si una estación no trae valor nuevo, se conserva el último dato válido y se marca como heredado; ausencia nunca equivale a cero. Corte fuente: ${esc(`${d.fecha||'s/d'} ${d.hora||''}`.trim())}.</p>
      ${makeTable(d)}`;
  }

  function clarifyRainRows(){
    const block=document.querySelector('[data-unified-alto="1"]');if(!block)return;
    const hydros=new Set(['el tigre','el porvenir','machaquila','mactun','san pedro mactun']);
    for(const tr of block.querySelectorAll('tbody tr')){
      const td=tr.querySelectorAll('td');if(td.length<13)continue;
      const name=norm(td[0].textContent),source=norm(td[1].textContent);
      if(source!=='insivumeh')continue;
      if(hydros.has(name)){
        const anyRain=[2,3,4,5,6,7,8,9,10].some(i=>td[i]&&norm(td[i].textContent)!=='s/d');
        if(!anyRain){
          td[12].textContent='estación hidrométrica; sin precipitación puntual publicada en esta fuente · ver niveles INSIVUMEH';
        }
      }else if(name==='bethel' && [2,3,4,5,6,7,8,9,10].every(i=>td[i]&&norm(td[i].textContent)==='s/d')){
        td[12].textContent='sin valor pluviométrico puntual estructurado en la publicación vigente';
      }
    }
  }

  async function run(){
    if(busy)return;busy=true;
    try{await renderHydro();clarifyRainRows();}finally{busy=false;}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(run,1800);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(run,900));
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(run,800));
    const target=document.getElementById('content')||document.body;
    new MutationObserver(()=>setTimeout(run,120)).observe(target,{childList:true,subtree:true});
    setInterval(()=>{if(!document.hidden)run();},60000);
  });
})();
