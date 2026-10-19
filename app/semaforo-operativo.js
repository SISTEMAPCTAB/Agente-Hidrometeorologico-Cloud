(() => {
  // Semáforo operativo por sistema (v2, 19-oct-2026).
  // Criterio: lluvia observada (máximo de 24 h o 48 h por estación) confirmada con más de una
  // estación o con respuesta hidrométrica. Una sola lectura extrema baja un escalón si no se confirma.
  //   ≥250 mm  → Atención del Desastre   si hay nivel sobre NAMO o ≥2 estaciones ≥150 mm; si no, Emergencia.
  //   150–250  → Atención de la Emergencia si hay respuesta hidrométrica o ≥2 estaciones ≥75 mm; si no, Prioritaria.
  //   75–150   → Atención prioritaria     si hay respuesta hidrométrica; si no, Vigilancia reforzada.
  //   <75      → Seguimiento ordinario; Vigilancia reforzada si alguna estación está sobre el NAMO.
  // Respuesta hidrométrica: ≥2 estaciones en ascenso, ascenso ≥0.20 m en 24 h, o nivel a ≤1 m del NAMO (o sobre él).
  // v4 (19-oct-2026): riesgo de desbordamiento del malecón de Villahermosa exportado por el Modelo (campo "malecon",
  // V106s). Sólo si la corrida tiene ≤6 h. Eleva Ríos Serranos–Grijalva: Desbordamiento probable → Emergencia;
  // Riesgo de desbordamiento → Atención prioritaria; Vigilar → Vigilancia reforzada. Nunca baja el nivel.
  const mm=v=>Number(v).toFixed(1),m2=v=>Number(v).toFixed(2);
  let MODELO=null;
  const cargarModelo=()=>fetch('../data/modelo_rubio/latest.json?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{
    const nuevo=JSON.stringify(d?.malecon||null)!==JSON.stringify(MODELO?.malecon||null);MODELO=d;
    try{if(nuevo&&state.current==='resumen'&&typeof render==='function')render()}catch(_e){}
  }).catch(()=>{});
  cargarModelo();setInterval(cargarModelo,10*60*1000);
  const RANGO={'Seguimiento ordinario':0,'Vigilancia reforzada':1,'Atención prioritaria':2,'Atención de la Emergencia':3,'Atención del Desastre':4};
  function malecon(){
    const d=MODELO,m=d?.malecon,age=(Date.now()-Date.parse(d?.calculado_utc||''))/3600000;
    if(!m||!m.estado||!Number.isFinite(age)||age>6)return null;
    const lvl={'Desbordamiento probable':['Atención de la Emergencia','danger'],'Riesgo de desbordamiento':['Atención prioritaria','danger'],'Vigilar':['Vigilancia reforzada','warn']}[m.estado];
    const g=m.gaviotas||{};
    return {lvl,txt:`Malecón: ${m.estado} (Gaviotas máx. ${Number.isFinite(g.max72_central_m)?m2(g.max72_central_m):'s/d'} m, nivel alto ${Number.isFinite(g.max72_alto_m)?m2(g.max72_alto_m):'s/d'} m; umbral ${m2(m.umbral_gaviotas_m)} m · Modelo ${d.version||''})`};
  }

  function systemRain(id){
    const c=SYSTEMS[id];const by=new Map();
    const put=(name,h24,h48,src)=>{
      const k=norm(name);const x=by.get(k)||{station:name,h24:null,h48:null,src};
      if(finite(h24))x.h24=Math.max(x.h24??-Infinity,Number(h24));
      if(finite(h48))x.h48=Math.max(x.h48??-Infinity,Number(h48));
      by.set(k,x);
    };
    for(const r of rainRows(id))put(r.station,r.h24,r.h48,r.source);
    // 48 h de CONAGUA (rainRows no lo trae). Si el reporte horario es del mismo día que el boletín vigente
    // (o no hay boletín), se usa su 48 h oficial. Si el boletín es más nuevo, el 48 h horario ya no aplica:
    // se estima ≈48 h = 24 h del boletín + bloque oficial de 24 h del reporte horario anterior.
    const bol=Array.isArray(state.data.climaConagua?.conagua_tabasco)?state.data.climaConagua.conagua_tabasco:[];
    const bolDay=bol.map(r=>String(r.fecha_hora_mensaje||'').slice(0,10)).sort().at(-1)||'';
    for(const r of conagua()){
      const t=norm(r.estacion);if(!c.terms.some(x=>t.includes(x)))continue;
      if(t==='penitas'&&(Number(r.lluvia_24h_precedentes_mm)>150||r.advertencia))continue;
      const x=by.get(t);if(!x)continue; // sólo completa estaciones que ya cuentan con 24 h vigente
      const stale=bolDay&&String(r.fecha_hora||'').slice(0,10)<bolDay;
      if(!stale){
        if(r.estado_48h==='observado'&&finite(r.lluvia_48h_precedentes_mm))put(r.estacion,null,r.lluvia_48h_precedentes_mm,'CONAGUA');
      }else if(r.estado_24h==='observado'&&finite(r.lluvia_24h_precedentes_mm)&&finite(x.h24)&&x.h24!==-Infinity){
        put(r.estacion,null,Number(x.h24)+Number(r.lluvia_24h_precedentes_mm),'boletín + bloque previo');
        by.get(t).approx48=true;
      }
    }
    return [...by.values()].map(x=>{
      const h24=x.h24===-Infinity?null:x.h24,h48=x.h48===-Infinity?null:x.h48;
      const max=Math.max(...[h24,h48].filter(finite),-Infinity);
      return {...x,h24,h48,max,win:finite(h48)&&h48>=(h24??-Infinity)?(x.approx48?'≈48 h':'48 h'):'24 h'};
    }).filter(x=>Number.isFinite(x.max)).sort((a,b)=>b.max-a.max);
  }

  function evaluate(id){
    const rr=systemRows(id).filter(r=>r.estado_dato==='observado');
    const rain=systemRain(id);const top=rain[0]||null;const L=top?top.max:-Infinity;
    const n150=rain.filter(r=>r.max>=150).length,n75=rain.filter(r=>r.max>=75).length;
    const asc=rr.filter(r=>/asc/i.test(r.tendencia||'')||(finite(r.delta_24h)&&Number(r.delta_24h)>0)).length;
    const rise=Math.max(0,...rr.map(r=>Number(r.delta_24h)||0));
    const withNamo=rr.filter(r=>finite(r.distancia_namo));
    const above=withNamo.filter(r=>Number(r.distancia_namo)>=0).sort((a,b)=>b.distancia_namo-a.distancia_namo);
    const near=withNamo.filter(r=>Number(r.distancia_namo)>=-1).sort((a,b)=>b.distancia_namo-a.distancia_namo);
    const hydro=asc>=2||rise>=0.20||near.length>0;
    const hydroTxt=above.length?`${above[0].estacion} ${m2(above[0].distancia_namo)} m sobre NAMO`
      :near.length?`${near[0].estacion} a ${m2(-near[0].distancia_namo)} m del NAMO`
      :rise>=0.20?`ascenso de ${rise.toFixed(2)} m en 24 h`:asc>=2?`${asc} estaciones en ascenso`:'sin respuesta hidrométrica relevante';
    let label='Seguimiento ordinario',cls='ok',why='';
    if(L>=250){
      if(above.length||n150>=2){label='Atención del Desastre';cls='danger';why=above.length?hydroTxt:`${n150} estaciones ≥150 mm`;}
      else{label='Atención de la Emergencia';cls='danger';why='una sola estación ≥150 mm y sin nivel sobre NAMO';}
    }else if(L>=150){
      if(hydro||n75>=2){label='Atención de la Emergencia';cls='danger';why=hydro?hydroTxt:`${n75} estaciones ≥75 mm`;}
      else{label='Atención prioritaria';cls='danger';why='una sola estación ≥75 mm y '+hydroTxt;}
    }else if(L>=75){
      if(hydro){label='Atención prioritaria';cls='danger';why=hydroTxt;}
      else{label='Vigilancia reforzada';cls='warn';why=hydroTxt;}
    }else if(above.length){label='Vigilancia reforzada';cls='warn';why=hydroTxt;}
    const rainTxt=top?`${top.station}: ${mm(top.max)} mm en ${top.win}`:'sin lluvia observada válida';
    if(id==='serranos'){const mc=malecon();if(mc){
      if(mc.lvl&&RANGO[mc.lvl[0]]>RANGO[label]){label=mc.lvl[0];cls=mc.lvl[1];why=mc.txt}
      else why=(why?why+' · ':'')+mc.txt}}
    return {label,cls,rainTxt,why};
  }

  function operationalSemaphore(){
    return `<div class="cards">${Object.entries(SYSTEMS).map(([id,c])=>{
      const e=evaluate(id);
      return `<div class="station-card"><strong>${esc(c.title)}</strong><span class="badge ${e.cls}">${e.label}</span>`+
        `<small class="muted" style="display:block;margin-top:6px;line-height:1.35">${esc(e.rainTxt)}${e.why?' · '+esc(e.why):''}</small></div>`;
    }).join('')}</div><p class="section-note" style="margin:10px 0 0">Criterio: lluvia observada máxima por estación (24 o 48 h). ≥250 mm = Desastre y 150–250 mm = Emergencia sólo si se confirma con nivel sobre NAMO, respuesta hidrométrica o más de una estación; una lectura aislada baja un escalón. 75–150 mm con respuesta hidrométrica = Atención prioritaria; sin ella, Vigilancia reforzada. Ríos Serranos–Grijalva sube de nivel si el Modelo pronostica riesgo de desbordamiento del malecón de Villahermosa (Gaviotas 7.70 m / El Muelle 7.60 m).</p>`;
  }

  // Sustituye únicamente el motor visual del semáforo; no crea apartados ni altera tablas/datos.
  window.semaforo=operationalSemaphore;
  try{semaforo=operationalSemaphore;}catch(_e){}

  const rename=()=>document.querySelectorAll('h2').forEach(h=>{if(h.textContent.trim()==='Semáforo ejecutivo')h.textContent='Semáforo operativo';});
  document.addEventListener('DOMContentLoaded',rename);
  new MutationObserver(rename).observe(document.documentElement,{childList:true,subtree:true});
})();
