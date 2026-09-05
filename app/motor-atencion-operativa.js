(() => {
  const LEVELS={priority:'Atención prioritaria',reinforced:'Vigilancia reforzada',routine:'Seguimiento ordinario'};
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  function evaluate(input={}){
    const rain=num(input.rainMm), forecast=num(input.forecastMax), rise=num(input.riseValue), namo=num(input.minNamo);
    const asc=Number(input.currentAsc||0), up12=Number(input.persistentUp12||0), observed=Number(input.observedLevels||0);
    const coherence=input.coherenceKind||'neutral';
    const reasons=[];
    if(rain!==null&&rain>=150)reasons.push(`lluvia observada torrencial/extraordinaria: ${rain.toFixed(1)} mm/24 h`);
    if(rain!==null&&rain>=75&&coherence==='reflected')reasons.push('lluvia intensa con respuesta ascendente observada');
    if(asc>=2&&forecast!==null&&forecast>=75)reasons.push(`${asc} estaciones en ascenso y pronóstico SMN ≥75 mm`);
    if(up12>=2&&((rain!==null&&rain>=75)||(forecast!==null&&forecast>=75)))reasons.push(`ascenso persistente 12 h en ${up12} estaciones combinado con lluvia/pronóstico intenso`);
    let key='routine';
    if(reasons.length)key='priority';
    if(key==='routine'){
      if(rain!==null&&rain>=50)reasons.push(`lluvia observada ≥50 mm/24 h: ${rain.toFixed(1)} mm`);
      if(forecast!==null&&forecast>=75)reasons.push(`pronóstico SMN relevante: máximo ${forecast.toFixed(0)} mm`);
      if(asc>0)reasons.push(`${asc} estación(es) en ascenso en el último corte`);
      if(up12>=2)reasons.push(`persistencia de ascenso en ${up12} estaciones durante 12 h`);
      if(rain!==null&&rain>=25&&(coherence==='pending'||coherence==='unknown'))reasons.push('lluvia ≥25 mm/24 h con respuesta aún no reflejada/no determinable');
      if(rain===null&&observed===0&&forecast===null)reasons.push('información insuficiente');
      if(reasons.length)key='reinforced';
    }
    if(!reasons.length)reasons.push('sin señales de escalamiento con datos válidos');
    let score={priority:1000,reinforced:500,routine:0}[key];
    if(rain!==null){if(rain>=250)score+=220;else if(rain>=150)score+=180;else if(rain>=75)score+=120;else if(rain>=50)score+=70;else if(rain>=25)score+=35;}
    if(rise!==null){if(rise>=0.50)score+=180;else if(rise>=0.20)score+=120;else if(rise>0)score+=60;}
    score+=Math.min(120,Math.max(0,asc)*30);
    if(up12>=2)score+=100;if(up12>=3)score+=50;
    if(namo!==null){const d=Math.abs(namo);if(d<=0.50)score+=180;else if(d<=1.00)score+=120;else if(d<=2.00)score+=60;}
    if(forecast!==null){if(forecast>=150)score+=160;else if(forecast>=75)score+=100;else if(forecast>=50)score+=50;}
    if(coherence==='reflected')score+=80;
    return {key,level:LEVELS[key],reasons,score,version:'1.0'};
  }
  window.OperationalAttentionEngine={evaluate,LEVELS,version:'1.0'};
})();