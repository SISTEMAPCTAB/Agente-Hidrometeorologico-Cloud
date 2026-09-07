(() => {
  function operationalSemaphore(){
    return `<div class="cards">${Object.entries(SYSTEMS).map(([id,c])=>{
      const rr=systemRows(id);
      const rains=rainRows(id);
      const valid24=rains.filter(r=>finite(r.h24)).map(r=>Number(r.h24));
      const valid48=rains.filter(r=>finite(r.h48)).map(r=>Number(r.h48));
      const max24=valid24.length?Math.max(...valid24):null;
      const max48=valid48.length?Math.max(...valid48):null;
      const maxRain=Math.max(...[max24,max48].filter(finite),-Infinity);
      const asc=rr.filter(r=>r.estado_dato==='observado'&&(/asc/i.test(r.tendencia||'')||(finite(r.delta_24h)&&Number(r.delta_24h)>0))).length;
      const relevantRise=Math.max(0,...rr.filter(r=>r.estado_dato==='observado').map(r=>Number(r.delta_24h)||0));
      const nearNamo=rr.some(r=>r.estado_dato==='observado'&&finite(r.distancia_namo)&&Math.abs(Number(r.distancia_namo))<=1);
      let label='Seguimiento ordinario',cls='ok';

      // Criterio rector solicitado: lluvia acumulada/persistente y respuesta hidrométrica coherente.
      if(maxRain>=250){
        label='Atención del Desastre'; cls='danger';
      }else if(maxRain>=150){
        label='Atención de la Emergencia'; cls='danger';
      }else if(max48!==null&&max48>=75&&max48<150){
        // En la banda 75–150 mm, la persistencia/confirmación hidrométrica diferencia
        // Atención prioritaria de Vigilancia reforzada. Un ascenso aislado no escala por sí solo.
        const persistentResponse=(asc>=2)||(relevantRise>=0.20)||nearNamo;
        if(persistentResponse){label='Atención prioritaria';cls='danger';}
        else {label='Vigilancia reforzada';cls='warn';}
      }
      return `<div class="station-card"><strong>${esc(c.title)}</strong><span class="badge ${cls}">${label}</span></div>`;
    }).join('')}</div>`;
  }

  // Sustituye únicamente el motor visual del semáforo; no crea apartados ni altera tablas/datos.
  window.semaforo=operationalSemaphore;
  try{semaforo=operationalSemaphore;}catch(_e){}

  const rename=()=>document.querySelectorAll('h2').forEach(h=>{if(h.textContent.trim()==='Semáforo ejecutivo')h.textContent='Semáforo operativo';});
  document.addEventListener('DOMContentLoaded',rename);
  new MutationObserver(rename).observe(document.documentElement,{childList:true,subtree:true});
})();