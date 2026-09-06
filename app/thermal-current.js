(() => {
  const URL='../data/weatherlink/latest.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const f2c=f=>(Number(f)-32)*5/9;
  const validTabasco=s=>{
    const q=norm(s?.quality),u=norm(s?.ubicacion),age=Number(s?.age_seconds),tf=Number(s?.temperature_f);
    return Number.isFinite(tf)&&!q.includes('rezagado')&&!q.includes('heredado')&&(!Number.isFinite(age)||age<=7200)&&(u.includes('tab.')||u.includes('tabasco')||u.includes('villahermosa'));
  };
  function findThermalCard(){
    return [...document.querySelectorAll('#content .op-alert')].find(el=>/Mayor (señal térmica|temperatura)/i.test(el.textContent||''))||null;
  }
  function render(data){
    if(document.getElementById('pageTitle')?.textContent?.trim()!=='Resumen operativo')return;
    const rows=(data?.stations||[]).filter(validTabasco).map(s=>({...s,_c:f2c(s.temperature_f)})).filter(s=>Number.isFinite(s._c)).sort((a,b)=>b._c-a._c);
    const top=rows[0],card=findThermalCard();
    if(!top||!card)return;
    const label=card.querySelector('span'),value=card.querySelector('strong'),detail=card.querySelector('small');
    if(label)label.textContent='Mayor temperatura actual registrada · Tabasco';
    if(value)value.textContent=`${top._c.toFixed(1)} °C`;
    if(detail)detail.textContent=`${top.nombre} · ${top.ubicacion||'Tabasco'} · lectura WeatherLink ${top.last_updated_at||top.observed_utc||'s/d'}`;
    card.classList.remove('op-danger','op-warn');
    if(top._c>=39.4)card.classList.add('op-danger'); else if(top._c>=32.2)card.classList.add('op-warn');
  }
  async function refresh(){
    try{const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});if(r.ok)render(await r.json());}catch(e){console.warn('Temperatura actual no actualizada',e)}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    refresh();
    const c=document.getElementById('content');
    if(c)new MutationObserver(()=>setTimeout(refresh,0)).observe(c,{childList:true,subtree:true});
    setInterval(refresh,60000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  });
})();
