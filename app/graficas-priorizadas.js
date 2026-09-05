(() => {
  const BASE='..';
  const SYSTEMS=new Set(['presas','serranos','tulija','usumacinta']);
  let levels=null,timeline=null,loading=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  async function get(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()}
  async function ensure(){
    if(levels&&timeline)return;
    if(loading)return loading;
    loading=Promise.all([
      get(`${BASE}/data/niveles/Ultimo_Corte/ultimo_resumen.json`),
      get(`${BASE}/data/niveles/Resumen_12h/resumen_12h.json`)
    ]).then(([l,t])=>{levels=Array.isArray(l)?l:[];timeline=t||{};}).catch(()=>{}).finally(()=>loading=null);
    return loading;
  }
  function current(){return document.querySelector('#nav button.active')?.dataset.section||''}
  function levelRow(station){const n=norm(station);return (levels||[]).find(r=>norm(r.estacion)===n)||null}
  function twelveRow(id,station){const n=norm(station);const sys=(timeline?.systems||[]).find(s=>s.id===id);return (sys?.estaciones||[]).find(r=>norm(r.estacion)===n)||null}
  function priority(row,t12){
    const observed=norm(row?.estado_dato)==='observado';
    if(!observed)return {group:-1,a:-Infinity,b:-Infinity,c:-Infinity,label:'Contexto · dato no actual'};
    const d24=num(row?.delta_24h),d12=num(t12?.delta_m),dn=num(row?.distancia_namo);
    const asc=norm(row?.tendencia).includes('asc');
    if(d24!==null&&d24>0)return {group:4,a:d24,b:d12||0,c:dn===null?-Infinity:-Math.abs(dn),label:'Ascenso 24 h'};
    if(d12!==null&&d12>0)return {group:3,a:d12,b:0,c:dn===null?-Infinity:-Math.abs(dn),label:'Ascenso persistente 12 h'};
    if(asc)return {group:2,a:num(row?.delta_reporte)||0,b:0,c:dn===null?-Infinity:-Math.abs(dn),label:'Ascenso en corte actual'};
    if(dn!==null)return {group:1,a:-Math.abs(dn),b:0,c:0,label:'Referencia NAMO disponible'};
    return {group:0,a:0,b:0,c:0,label:'Seguimiento'};
  }
  function cmp(a,b){return b.p.group-a.p.group||b.p.a-a.p.a||b.p.b-a.p.b||b.p.c-a.p.c||a.station.localeCompare(b.station,'es')}
  function chip(label,value,cls=''){
    return `<span class="graph-priority-chip ${cls}"><small>${esc(label)}</small><b>${esc(value)}</b></span>`;
  }
  function decorateFigure(item,index){
    const {fig,row,t12,p}=item;
    fig.dataset.graphPriorityReady='1';
    const old=fig.querySelector('.graph-priority-meta');if(old)old.remove();
    const d24=num(row?.delta_24h),d12=num(t12?.delta_m),dn=num(row?.distancia_namo);
    const meta=document.createElement('div');meta.className='graph-priority-meta';
    const d24Text=d24===null?'s/d':`${d24>0?'+':''}${d24.toFixed(2)} m`;
    const d12Text=d12===null?'s/d':`${d12>0?'+':''}${d12.toFixed(2)} m`;
    const namoText=dn===null?'NAMO s/d':`${Math.abs(dn).toFixed(2)} m ${dn<0?'bajo':'sobre'}`;
    const state=norm(row?.estado_dato)==='observado'?'Observado':(row?.estado_dato||'s/d');
    meta.innerHTML=`<div class="graph-priority-rank"><span>#${index+1}</span><b>${esc(p.label)}</b></div><div class="graph-priority-chips">${chip('Δ24 h',d24Text,d24!==null&&d24>0?'rise':'')}${chip('Δ12 h real',d12Text,d12!==null&&d12>0?'rise':'')}${chip('NAMO',namoText,dn!==null&&dn>=0?'namo-over':'')}${chip('Dato',state,norm(row?.estado_dato)==='observado'?'valid':'stale')}</div>`;
    const head=fig.querySelector('.figure-head');if(head)head.insertAdjacentElement('afterend',meta);else fig.prepend(meta);
  }
  async function apply(){
    const id=current();if(!SYSTEMS.has(id))return;
    await ensure();if(current()!==id)return;
    document.querySelectorAll('#content .hydro-graphs').forEach(grid=>{
      const figures=[...grid.querySelectorAll(':scope > .hydro-figure')];
      if(!figures.length)return;
      const items=figures.map(fig=>{
        const station=fig.querySelector('.figure-head strong')?.textContent?.trim()||'';
        const row=levelRow(station),t12=twelveRow(id,station),p=priority(row,t12);
        return {fig,station,row,t12,p};
      }).sort(cmp);
      items.forEach((x,i)=>{grid.appendChild(x.fig);decorateFigure(x,i)});
      const panel=grid.closest('.panel');
      if(panel){
        const h2=panel.querySelector('h2');if(h2&&!h2.dataset.priorityTitle){h2.dataset.priorityTitle='1';h2.textContent=`${h2.textContent.replace(/\s*·\s*orden operativo$/i,'')} · orden operativo`;}
        let note=panel.querySelector('.graph-priority-method');
        if(!note){note=document.createElement('div');note.className='section-note graph-priority-method';panel.appendChild(note);}
        note.innerHTML='<b>Orden de lectura:</b> primero ascensos válidos de 24 h; después ascensos reales persistentes en 12 h; luego ascenso del corte y cercanía al NAMO. Los periodos se muestran separados y no se mezclan en una sola magnitud. Datos heredados o no actuales no encabezan la prioridad.';
      }
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(apply,120);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(apply,180));
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>{if(SYSTEMS.has(current()))setTimeout(apply,80)}).observe(content,{childList:true,subtree:true});
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{levels=null;timeline=null;setTimeout(apply,500)});
  });
})();