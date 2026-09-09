(() => {
  const URL='../data/fuentes_publicas/insivumeh_automaticas.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const codes={
    'el tigre':'INS171302AT','el porvenir':'INS171001AT','bethel':'INS171301AT',
    'machaquila':'INS171201AT','mactun':'INS170401AT','chixoy hidro':'INS161301AT',
    'playa grande met (ixcan)':'INS142201AT','santa maria cahabon':'INS161201CV',
    'panzos phc altaverapaz':'INS160701CV'
  };
  let busy=false;

  const match=(list,station,code)=>Array.isArray(list)?list.find(x=>
    (code&&String(x.codigo||'').toUpperCase()===String(code).toUpperCase())||
    norm(x.estacion)===station
  ):null;

  const localTime=v=>{
    if(!v)return null;
    const d=new Date(v);if(Number.isNaN(d.getTime()))return null;
    return d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  };

  async function fetchData(){
    try{
      const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
      return r.ok?await r.json():null;
    }catch{return null;}
  }

  function apply(d){
    const block=document.querySelector('[data-unified-alto="1"]');
    if(!block||!d)return false;
    const automaticas=Array.isArray(d.estaciones)?d.estaciones:[];
    const monthly=Array.isArray(d.acumulados_mes_actual)?d.acumulados_mes_actual:[];
    const season=Array.isArray(d.acumulados_epoca_lluviosa)?d.acumulados_epoca_lluviosa:[];
    let changed=false;

    for(const tr of block.querySelectorAll('tbody tr')){
      const td=tr.querySelectorAll('td');if(td.length<13)continue;
      const station=norm(td[0].textContent),source=norm(td[1].textContent);
      if(source!=='insivumeh')continue;
      const code=codes[station];
      if(!code)continue;

      const a=match(automaticas,station,code);
      const m=match(monthly,station,code);
      const s=match(season,station,code);
      const one=a?n(a.precipitacion_ultima_hora_mm):null;
      const rain24=a?n(a.precipitacion_24h_mm):null;
      const month=m?n(m.acumulado_mensual_mm):null;
      const acc=s?n(s.acumulado_epoca_lluviosa_mm):null;

      // Columnas: Estación, Fuente, Hoy, 1h, 6h, 24h, 48h, 72h, Semanal, Mensual, Época lluviosa, actualización, estado.
      if(one!==null){td[3].textContent=`${one.toFixed(1)} mm`;changed=true;}
      if(rain24!==null){td[5].textContent=`${rain24.toFixed(1)} mm`;changed=true;}
      if(month!==null){td[9].textContent=`${month.toFixed(1)} mm`;changed=true;}
      if(acc!==null){td[10].textContent=`${acc.toFixed(1)} mm`;changed=true;}

      if(one!==null||rain24!==null||month!==null||acc!==null){
        const parts=[];
        if(one!==null)parts.push('1 h observada preliminar');
        if(rain24!==null)parts.push('24 h observadas preliminares');
        if(month!==null)parts.push('acumulado mensual oficial');
        if(acc!==null)parts.push('acumulado oficial época lluviosa');
        td[12].textContent=parts.join(' · ');
        const stamp=localTime(d.consultado_utc);
        if(stamp)td[11].textContent=`${stamp} (consulta automática)`;
      }
    }
    return changed;
  }

  async function fill(){
    if(busy)return;
    const block=document.querySelector('[data-unified-alto="1"]');
    if(!block)return;
    busy=true;
    try{apply(await fetchData());}
    finally{busy=false;}
  }

  function scheduleFill(delay=150){setTimeout(fill,delay);}

  document.addEventListener('DOMContentLoaded',()=>{
    scheduleFill(1700);
    scheduleFill(3200);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>scheduleFill(1200));
    document.getElementById('nav')?.addEventListener('click',()=>scheduleFill(1000));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleFill(200);});
    const target=document.getElementById('content')||document.body;
    new MutationObserver(()=>scheduleFill(120)).observe(target,{childList:true,subtree:true});
    setInterval(()=>{if(!document.hidden)fill();},60000);
  });
})();
