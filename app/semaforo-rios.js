(() => {
  const CONFIG_URL = '../config/semaforo_rios.json';
  let config = null;

  const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

  function classify(mm){
    if(mm === null || mm === undefined || mm === '' || !Number.isFinite(Number(mm))){
      return {categoria:'sin_dato', descripcion:'sin dato', color:'gris', className:'river-signal nodata'};
    }
    const value = Number(mm);
    const scale = config?.escala_lluvia_smn || [
      {min_mm:0,max_mm:50,categoria:'normal',descripcion:'chubascos o puntuales fuertes',color:'azul'},
      {min_mm:50,max_mm:75,categoria:'muy_fuertes',descripcion:'puntuales muy fuertes',color:'verde'},
      {min_mm:75,max_mm:150,categoria:'intensas',descripcion:'puntuales intensas',color:'amarillo'},
      {min_mm:150,max_mm:250,categoria:'torrenciales',descripcion:'puntuales torrenciales',color:'rojo'},
      {min_mm:250,max_mm:null,categoria:'extraordinarias',descripcion:'puntuales extraordinarias',color:'morado'}
    ];
    const row = scale.find(r => value >= Number(r.min_mm) && (r.max_mm === null || value < Number(r.max_mm))) || scale[scale.length-1];
    return {...row, mm:value, className:`river-signal signal-${row.color}`};
  }

  function worst(values){
    const valid = (values || []).filter(v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))).map(Number);
    if(!valid.length) return classify(null);
    return classify(Math.max(...valid));
  }

  function badge(mm, label=''){
    const c = classify(mm);
    const value = c.mm === undefined ? 's/d' : `${c.mm.toFixed(1)} mm`;
    return `<span class="${c.className}" title="${c.descripcion}">${label ? `${label}: ` : ''}${value} · ${String(c.categoria).replaceAll('_',' ')}</span>`;
  }

  function legend(){
    const rows = config?.escala_lluvia_smn || [];
    if(!rows.length) return '';
    return `<div class="river-signal-legend"><strong>Semáforo preventivo por lluvia aguas arriba</strong>${rows.map(r=>{const range=r.max_mm===null?`≥ ${r.min_mm} mm`:`${r.min_mm}–${r.max_mm} mm`;return `<span class="river-signal signal-${r.color}">${range} · ${r.descripcion}</span>`}).join('')}<span class="river-signal nodata">sin dato</span><small>El NAMO se reporta como referencia; no determina por sí solo el color operativo del río.</small></div>`;
  }

  async function load(){
    try{
      const r = await fetch(CONFIG_URL,{cache:'no-store'});
      if(r.ok) config = await r.json();
    }catch(_e){}
    window.dispatchEvent(new CustomEvent('river-semaphore-ready',{detail:{config}}));
  }

  window.RiverSemaphore = {
    classify,
    worst,
    badge,
    legend,
    get config(){return config;},
    system(id){return config?.sistemas?.[id] || null;},
    normalize
  };

  document.addEventListener('DOMContentLoaded', load);
})();
