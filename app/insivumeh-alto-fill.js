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
  async function fill(){
    if(busy)return;
    const block=document.querySelector('[data-unified-alto="1"]');
    if(!block)return;
    busy=true;
    try{
      const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return;
      const d=await r.json();
      const automaticas=Array.isArray(d.estaciones)?d.estaciones:[];
      const monthly=Array.isArray(d.acumulados_mes_actual)?d.acumulados_mes_actual:[];
      const season=Array.isArray(d.acumulados_epoca_lluviosa)?d.acumulados_epoca_lluviosa:[];
      for(const tr of block.querySelectorAll('tbody tr')){
        const td=tr.querySelectorAll('td');if(td.length<13)continue;
        const station=norm(td[0].textContent),source=norm(td[1].textContent);
        if(source!=='insivumeh')continue;
        const code=codes[station];
        const a=automaticas.find(x=>(code&&String(x.codigo||'').toUpperCase()===code)||norm(x.estacion)===station);
        const m=monthly.find(x=>(code&&String(x.codigo||'').toUpperCase()===code)||norm(x.estacion)===station);
        const s=season.find(x=>(code&&String(x.codigo||'').toUpperCase()===code)||norm(x.estacion)===station);
        const one=a?n(a.precipitacion_ultima_hora_mm):null;
        const rain24=a?n(a.precipitacion_24h_mm):null;
        const month=m?n(m.acumulado_mensual_mm):null;
        const acc=s?n(s.acumulado_epoca_lluviosa_mm):null;
        // Columnas: Estación, Fuente, Hoy, 1h, 6h, 24h, 48h, 72h, Semanal, Mensual, Época lluviosa, actualización, estado.
        if(one!==null)td[3].textContent=`${one.toFixed(1)} mm`;
        if(rain24!==null)td[5].textContent=`${rain24.toFixed(1)} mm`;
        if(month!==null)td[9].textContent=`${month.toFixed(1)} mm`;
        if(acc!==null)td[10].textContent=`${acc.toFixed(1)} mm`;
        if(one!==null||rain24!==null||month!==null||acc!==null){
          const parts=[];
          if(one!==null)parts.push('1 h observada preliminar');
          if(rain24!==null)parts.push('24 h observadas preliminares');
          if(month!==null)parts.push('acumulado mensual oficial');
          if(acc!==null)parts.push('acumulado oficial época lluviosa');
          td[12].textContent=parts.join(' · ');
          if(d.consultado_utc){const z=new Date(d.consultado_utc);if(!Number.isNaN(z.getTime()))td[11].textContent=z.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' (consulta)';}
        }
      }
    }catch(e){/* La falla de INSIVUMEH no altera ninguna otra fuente ni fila. */}
    finally{busy=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(fill,1800);
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(fill,1200));
    const target=document.getElementById('content')||document.body;
    new MutationObserver(()=>setTimeout(fill,100)).observe(target,{childList:true,subtree:true});
  });
})();
