(() => {
  const BASE='..';
  const URLS={
    levels:`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`,
    timeline:`${BASE}/data/niveles/Resumen_12h/resumen_12h.json`
  };
  const SYSTEMS=[
    {id:'presas',label:'Presas–Mezcalapa–Samaria y Carrizal',terms:['samaria','gonzalez','mezcalapa','carrizal','platanar','macayo','penitas']},
    {id:'serranos',label:'Ríos Serranos–Grijalva',terms:['oxolotan','tapijulapa','teapa','puyacatengo','pueblo nuevo','san joaquin','rios de la sierra','pichucalco','amatan','tacotalpa']},
    {id:'tulija',label:'Tulijá–Puxcatán–Chilapa',terms:['salto de agua','tulija','puxcatan','chilapa','macuspana']},
    {id:'usumacinta',label:'Usumacinta',terms:['boca del cerro','usumacinta','san pedro']}
  ];
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  let data=null,loading=null;
  async function get(u){const r=await fetch(`${u}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()}
  async function ensure(){if(data)return;if(loading)return loading;loading=Promise.all([get(URLS.levels),get(URLS.timeline)]).then(([levels,timeline])=>{data={levels:Array.isArray(levels)?levels:[],timeline:timeline||{}}}).catch(()=>{data={levels:[],timeline:{}}}).finally(()=>loading=null);return loading}
  function systemOf(row){
    const txt=norm(`${row.estacion||''} ${row.rio||''}`);
    if(txt.includes('pichucalco'))return SYSTEMS.find(s=>s.id==='serranos');
    return SYSTEMS.find(s=>s.terms.some(t=>txt.includes(norm(t))))||null;
  }
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
  function dedupe(items){
    const seen=new Set();
    return items.filter(x=>{
      const key=norm(x.row.grafica_png||`${x.row.estacion}|${x.row.rio||''}`);
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
  }
  function grouped(items){
    const clean=dedupe(items);
    const out=[];
    for(const sys of SYSTEMS){
      const rows=clean.filter(x=>x.sys.id===sys.id).sort((a,b)=>b.group-a.group||b.metric-a.metric||Math.abs(a.dn??999)-Math.abs(b.dn??999)||String(a.row.estacion).localeCompare(String(b.row.estacion),'es'));
      if(rows.length)out.push({sys,rows:rows.slice(0,2)});
    }
    return out;
  }
  const fmtDelta=v=>v===null?'s/d':`${v>0?'+':''}${v.toFixed(2)} m`;
  const fmtNamo=v=>v===null?'NAMO s/d':`${Math.abs(v).toFixed(2)} m ${v<0?'bajo':'sobre'} NAMO`;
  function graphUrl(row){const stamp=encodeURIComponent(row.ultima_actualizacion_real||row.fecha_hora||Date.now());return `${BASE}/${esc(row.grafica_png)}?corte=${stamp}`}
  function card(x){return `<figure class="summary-hydro-figure"><div class="summary-hydro-head"><div><strong>${esc(x.row.estacion)}</strong><small>${esc(x.row.rio||'s/d')}</small></div><span class="summary-hydro-reason">${esc(x.reason)}</span></div><div class="summary-hydro-meta"><span><small>Δ24 h</small><b>${esc(fmtDelta(x.d24))}</b></span><span><small>Δ12 h real</small><b>${esc(fmtDelta(x.d12))}</b></span><span><small>Referencia</small><b>${esc(fmtNamo(x.dn))}</b></span><span><small>Dato</small><b>Observado</b></span></div><img loading="lazy" src="${graphUrl(x.row)}" alt="Gráfica hidrométrica de ${esc(x.row.estacion)}"><figcaption>Corte ${esc(x.row.fecha_hora||'s/d')} · observaciones válidas unidas punto a punto.</figcaption></figure>`}
  async function render(){
    if(document.querySelector('#nav button.active')?.dataset.section!=='resumen')return;
    const content=document.getElementById('content');if(!content)return;
    content.querySelector('#summaryHydroHighlights')?.remove();
    await ensure();if(document.querySelector('#nav button.active')?.dataset.section!=='resumen')return;
    const items=(data.levels||[]).map(r=>{const s=systemOf(r);return s?priority(r,s):null}).filter(Boolean);
    const groups=grouped(items);
    if(!groups.length)return;
    const section=document.createElement('section');section.id='summaryHydroHighlights';section.className='panel wide summary-hydro-panel';
    section.innerHTML=`<div class="summary-hydro-title"><div><span>Lectura hidrométrica por cuenca</span><h2>Gráficas destacadas del estado</h2><p>Sin duplicados y ordenadas por sistema hidrológico. Se muestran hasta dos estaciones observadas por cuenca, priorizando la mayor señal operativa.</p></div><span class="badge">Orden hidrológico</span></div>${groups.map(g=>`<section class="summary-hydro-basin"><h3>${esc(g.sys.label)}</h3><div class="summary-hydro-grid">${g.rows.map(card).join('')}</div></section>`).join('')}<div class="section-note"><b>Orden:</b> Presas–Mezcalapa–Samaria y Carrizal → Ríos Serranos–Grijalva → Tulijá–Puxcatán–Chilapa → Usumacinta. Pichucalco se clasifica explícitamente dentro de Ríos Serranos–Grijalva. No se repite una misma gráfica en el panel inicial.</div>`;
    const anchor=content.querySelector('#systemSemaphoreStrip')||content.querySelector('#operationalAlerts');
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