(() => {
  const LEVELS={disaster:'Atención del Desastre',emergency:'Atención de la Emergencia',priority:'Atención prioritaria',reinforced:'Vigilancia reforzada',routine:'Seguimiento ordinario'};
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  function evaluate(input={}){
    const rain24=num(input.rain24??input.rainMm), rain48=num(input.rain48), forecast48=num(input.forecast48??input.forecastMax);
    const rise=num(input.riseValue), namo=num(input.minNamo);
    const asc=Number(input.currentAsc||0), up12=Number(input.persistentUp12||0);
    const reasons=[];
    const maxRain=Math.max(...[rain24,rain48].filter(v=>v!==null),-Infinity);
    let key='routine';

    // Criterio rector: intensidad y persistencia de lluvia en la cuenca aportante.
    if(maxRain>=250){key='disaster';reasons.push(`lluvia extraordinaria: ${maxRain.toFixed(1)} mm`);}
    else if(maxRain>=150){key='emergency';reasons.push(`lluvia torrencial: ${maxRain.toFixed(1)} mm`);}
    else {
      // 75–150 mm: reforzada cuando la señal corresponde a una ventana de hasta 48 h;
      // prioritaria cuando existe persistencia/confirmación de 48 h o más, apoyada por respuesta hidrométrica.
      const band48=rain48!==null&&rain48>=75&&rain48<150;
      const band24=rain24!==null&&rain24>=75&&rain24<150;
      const persistent48=band48&&(band24||up12>=2||asc>=2||(rise!==null&&rise>=0.20));
      if(persistent48){key='priority';reasons.push('lluvia de 75–150 mm con persistencia/confirmación de 48 h y respuesta hidrométrica');}
      else if(band48||(forecast48!==null&&forecast48>=75&&forecast48<150)){
        key='reinforced';
        reasons.push(band48?'lluvia acumulada de 75–150 mm en ventana de 48 h':'pronóstico de 75–150 mm dentro de las próximas 48 h');
      }
    }
    if(!reasons.length)reasons.push('lluvia menor de 75 mm en 48 h y sin criterio superior confirmado');

    // Variables complementarias sólo aumentan la atención dentro del criterio de lluvia; no escalan por sí solas.
    if(asc>0)reasons.push(`${asc} estación(es) hidrométrica(s) en ascenso`);
    if(up12>=2)reasons.push(`ascenso persistente 12 h en ${up12} estaciones`);
    if(namo!==null&&Math.abs(namo)<=1)reasons.push(`nivel a ${Math.abs(namo).toFixed(2)} m del NAMO`);
    return {key,level:LEVELS[key],reasons,version:'2.0'};
  }
  window.OperationalAttentionEngine={evaluate,LEVELS,version:'2.0'};
})();