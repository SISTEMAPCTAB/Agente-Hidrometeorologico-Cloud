(() => {
  const BASE='..';
  const URLS={
    levels:`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,
    timeline:`${BASE}/data/niveles/Resumen_12h/resumen_12h.json`
  };
  const SYSTEMS=[
    {id:'presas',label:'Presas–Mezcalapa–Samaria/Carrizal',terms:['samaria','gonzalez','mezcalapa','carrizal','platanar','macayo','penitas']},
    {id:'serranos',label:'Ríos Serranos–Grijalva',terms:['oxolotan','tapijulapa','teapa','puyacatengo','pueblo nuevo','san joaquin','rios de la sierra','pichucalco','amatan']},
    {id:'tulija',label:'Tulijá–Puxcatán–Chilapa',terms:['salto de agua','tulija','puxcatan','chilapa','macuspana']},
    {id:'usumacinta',label:'Usumacinta',terms:['boca del cerro','usumacinta','san pedro','balancan','emiliano zapata','jonuta','tres brazos']}
  ];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  let data=null,loading=null;
  async function get(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()}
  async function ensure(){if(data)return;if(loading)return loading;loading=Promise.all([get(URLS.levels),get(URLS.timeline)]).then(([levels,timeline])=>{data={levels:Array.isArray(levels)?levels:[],timeline:timeline||{}}}).catch(()=>{data={levels:[],timeline:{}}}).finally(()=>loading=null);return loading}
  function systemOf(row){const txt=norm(`${row.estacion||''} ${row.rio||''}`);return SYSTEMS.find(s=>s.terms.some(t=>txt.includes(norm(t))))||null}
  function t12For(systemId,station){const sys=(data?.timeline?.systems||[]).find(s=>s.id===systemId);return (sys?.estaciones||[]).find(r=>norm(r.estacion)===norm(station))||null}
  function priority(row,sys){
    if(norm(row.estado_dato)!=='observado')return null;
    if(!row.grafica_png)return null;
    const d24=num(row.delta_24h),d12=num(t12For(sys.id,row.estacion)?.delta_m),dn=num(row.distancia_namo),cut=num(row.delta_reporte);
    let group=0,metric=0,reason='Seguimiento';
    if(d24!==null&&d24>0){group=4;metric=d24;reason='Ascenso 24 h'}
    else if(d12!==null&&d12>0){group=3;metric=d12;reason='Ascenso real 12 h'}
    else if(norm(row.tendencia).includes('asc')){group=2;metric=cut||0;reason='Ascenso en corte actual'}
    else if(dn!==null){group=1;metric=-Math.abs(dn);reason='Cercanía al NAMO'}
    return {row,sys,d24,d12,dn,group,metric,reason};
  }
  function select(items){
    const sorted=[...items].sort((a,b)=>b.group-a.group||b.metric-a.metric||((a.dn??-999)-(b.dn??-999))||String(a.row.estacion).localeCompare(String(b.row.estacion),'es'));
    const chosen=[],count={};
    for(const x of sorted){if(chosen.length>=4)break;if((count[x.sys.id]||0)>=2)continue;chosen.push(x);count[x.sys.id]=(count[x.sys.id]||0)+1;}
    if(chosen.length<2){for(const x of sorted){if(chosen.includes(x))continue;chosen.push(x);if(chosen.length>=2)break;}}
    return chosen;
  }
  const fmtDelta=v=>v===null?'s/d':`${v>0?'+':''}${v.toFixed(2)} m`;
  const fmtNamo=v=>v===null?'NAMO s/d':`${Math.abs(v).toFixed(2)} m ${v<0?'bajo':'sobre'} NAMO`;
  function card(x,i){return `<figure class="summary-hydro-figure"><div class="summary-hydro-head"><div><span class="summary-hydro-rank">#${i+1}</span><strong>${esc(x.row.estacion)}</strong><small>${esc(x.sys.label)} · ${esc(x.row.rio||'s/d')}</small></div><span class="summary-hydro-reason">${esc(x.reason)}</span></div><div class="summary-hydro-meta"><span><small>Δ24 h</small><b>${esc(fmtDelta(x.d24))}</b></span><span><small>Δ12 h real</small><b>${esc(fmtDelta(x.d12))}</b></span><span><small>Referencia</small><b>${esc(fmtNamo(x.dn))}</b></span><span><small>Dato</small><b>Observado</b></span></div><img loading="lazy" src="${BASE}/${esc(x.row.grafica_png)}" alt="Gráfica hidrométrica destacada de ${esc(x.row.estacion)}"><figcaption>Corte ${esc(x.row.fecha_hora||'s/d')} · última observación real ${esc(x.row.ultima_actualizacion_real||x.row.fecha_hora||'s/d')}</figcaption></figure>`}
  async function render(){
    if(document.querySelector('#nav button.active')?.dataset.section!=='resumen')return;
    const content=document.getElementById('content');if(!content)return;
    content.querySelector('#summaryHydroHighlights')?.remove();
    await ensure();if(document.querySelector('#nav button.active')?.dataset.section!=='resumen')return;
    const items=(data.levels||[]).map(r=>{const s=systemOf(r);return s?priority(r,s):null}).filter(Boolean);
    const picked=select(items);
    if(!picked.length)return;
    const section=document.createElement('section');section.id='summaryHydroHighlights';section.className='panel wide summary-hydro-panel';
    section.innerHTML=`<div class="summary-hydro-title"><div><span>Lectura hidrométrica priorizada</span><h2>Gráficas destacadas del estado</h2><p>Se muestran sólo 2–4 estaciones observadas que concentran la mayor señal operativa disponible.</p></div><span class="badge">Selección automática</span></div><div class="summary-hydro-grid">${picked.map(card).join('')}</div><div class="section-note"><b>Criterio:</b> primero ascensos válidos de 24 h; después ascensos reales de 12 h; luego ascensos del corte y cercanía al NAMO. Δ24 h y Δ12 h permanecen separados. Los datos heredados no pueden ser seleccionados como destacados y el NAMO se usa sólo como referencia, no como semáforo de riesgo.</div>`;
    const anchor=content.querySelector('#systemSemaphoreStrip')||content.querySelector('#priorityVisual')||content.querySelector('#operationalAlerts');
    if(anchor)anchor.insertAdjacentElement('afterend',section);else content.prepend(section);
  }
  function reset(){data=null;setTimeout(render,450)}
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(render,250);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,220));
    document.getElementById('refreshBtn')?.addEventListener('click',reset);
    const content=document.getElementById('content');if(content)new MutationObserver(()=>{if(document.querySelector('#nav button.active')?.dataset.section==='resumen'&&!content.querySelector('#summaryHydroHighlights'))setTimeout(render,100)}).observe(content,{childList:true,subtree:false});
  });
})();