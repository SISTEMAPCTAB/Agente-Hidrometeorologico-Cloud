(() => {
  const URL='../data/weatherlink/extra_latest.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const fmt=(v,d=1)=>finite(v)?Number(v).toFixed(d):'s/d';
  const fToC=f=>finite(f)?(Number(f)-32)*5/9:null;
  const human=v=>{if(!v)return's/d';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})};
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';

  function row(x){
    const a=x.accumulations_mm||{};
    const q=[x.quality||'Cloud adicional'];if(x.estado&&x.estado!=='OK')q.push(x.estado);
    return `<tr data-extra-weather="${x.uuid}"><td><b>${x.nombre||'s/d'}</b></td><td>WeatherLink</td><td>${finite(a['1'])?fmt(a['1'])+' mm':'s/d'}</td><td>${finite(a['6'])?fmt(a['6'])+' mm':'s/d'}</td><td>${finite(a['24'])?fmt(a['24'])+' mm':'s/d'}</td><td>${finite(a['48'])?fmt(a['48'])+' mm':'s/d'}</td><td>${finite(x.temperature_f)?fmt(fToC(x.temperature_f))+' °C':'s/d'}</td><td>${finite(x.humidity_pct)?fmt(x.humidity_pct,0)+'%':'s/d'}</td><td>${human(x.observed_utc)}</td><td>${q.join(' · ')}</td></tr>`;
  }

  async function load(){
    try{const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});return r.ok?await r.json():null}catch{return null}
  }

  function blockByTitle(root,title){return [...root.querySelectorAll('.subcuenca-weather-block')].find(b=>norm(b.querySelector('h3')?.textContent)===norm(title))}

  async function render(){
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content)return;
    const wl=[...content.querySelectorAll('section.panel.wide')].find(s=>/WeatherLink · lluvia y temperatura/i.test(s.querySelector('h2')?.textContent||''));
    const groups=wl?.querySelector('.weather-source-groups');if(!groups)return;
    const doc=await load();const stations=Array.isArray(doc?.stations)?doc.stations:[];if(!stations.length)return;

    const presas=stations.filter(x=>x.grupo==='presas');
    const alto=[];

    const presasBlock=blockByTitle(groups,'Presas–Mezcalapa–Samaria y Carrizal');
    if(presasBlock){
      const body=presasBlock.querySelector('tbody');
      for(const x of presas){if(body&&!body.querySelector(`[data-extra-weather="${x.uuid}"]`))body.insertAdjacentHTML('beforeend',row(x))}
    }

    let altoBlock=blockByTitle(groups,'Alto Usumacinta');
    if(!altoBlock&&alto.length){
      const template=groups.querySelector('.subcuenca-weather-block table');
      if(template){
        altoBlock=document.createElement('div');altoBlock.className='subcuenca-weather-block';
        const t=template.cloneNode(true);const body=t.querySelector('tbody');if(body)body.innerHTML='';
        altoBlock.innerHTML='<h3>Alto Usumacinta</h3><div class="table-wrap"></div>';
        altoBlock.querySelector('.table-wrap').appendChild(t);
        const usu=blockByTitle(groups,'Usumacinta');
        if(usu)groups.insertBefore(altoBlock,usu);else groups.appendChild(altoBlock);
      }
    }
    const altoBody=altoBlock?.querySelector('tbody');
    for(const x of alto){if(altoBody&&!altoBody.querySelector(`[data-extra-weather="${x.uuid}"]`))altoBody.insertAdjacentHTML('beforeend',row(x))}
  }

  function reset(){document.querySelectorAll('[data-extra-weather]').forEach(x=>x.remove());setTimeout(render,900)}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(render,1600);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,1100));
    document.getElementById('refreshBtn')?.addEventListener('click',reset);
    const c=document.getElementById('content')||document.body;new MutationObserver(()=>{if(active()==='weather')render()}).observe(c,{childList:true,subtree:true});
  });
})();
