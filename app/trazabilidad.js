(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let meta={},rendering=false,scheduled=false;
  async function j(url){try{const r=await fetch(url,{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
  async function load(){
    const [ne,we,ce,fp]=await Promise.all([
      j('../data/niveles/Estado_Niveles_Cloud.json'),
      j('../data/weatherlink/Estado_WeatherLink_Cloud.json'),
      j('../data/niveles/Lluvia_CONAGUA/Estado_Lluvia_CONAGUA.json'),
      j('../data/fuentes_publicas/Estado_Fuentes_Publicas.json')
    ]);
    meta={ne:ne||{},we:we||{},ce:ce||{},fp:fp||{}}; scheduleRender();
  }
  function cut(o){return o.cut||o.corte||o.fecha_hora||o.run_local||o.generated_at||o.generated_local||o.updated_at||'s/d'}
  function tag(source,period,state,time){return `<div class="trace-line" data-trace-managed="1"><span><b>Fuente:</b> ${esc(source)}</span><span><b>Periodo:</b> ${esc(period||'según producto')}</span><span><b>Dato:</b> ${esc(state||'observado')}</span><span><b>Corte:</b> ${esc(time||'s/d')}</span></div>`}
  function classify(panel,title){
    const t=norm(title);
    if(t.includes('pronostico')||t.includes('smn'))return ['SMN–CONAGUA','ventana indicada','pronosticado',cut(meta.fp)];
    if(t.includes('insivumeh')||t.includes('guatemala'))return ['INSIVUMEH','según boletín/producto','observado o producto oficial',cut(meta.fp)];
    if(t.includes('weatherlink')||t.includes('temperatura')||t.includes('indice de calor'))return ['WeatherLink · estaciones automáticas','tiempo real/acumulado indicado','observado',cut(meta.we)];
    if(t.includes('lluvia')||t.includes('conagua'))return ['CONAGUA / OCFS','periodo indicado','observado',cut(meta.ce)];
    if(t.includes('hidrometr')||t.includes('presas')||t.includes('serranos')||t.includes('tulija')||t.includes('usumacinta')||panel.querySelector('table th:nth-child(3)'))return ['CONAGUA / OCFS · Agente Niveles','último corte','observado/heredado según estación',cut(meta.ne)];
    return null;
  }
  function sameManagedMutation(m){
    const nodes=[...m.addedNodes,...m.removedNodes].filter(n=>n.nodeType===1);
    return nodes.length>0&&nodes.every(n=>n.matches?.('[data-trace-managed="1"],.trace-mini')||n.closest?.('[data-trace-managed="1"],.trace-mini'));
  }
  function scheduleRender(){if(rendering||scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render()})}
  function render(){
    if(rendering)return;const content=document.getElementById('content');if(!content)return;rendering=true;
    try{
      content.querySelectorAll('.trace-line[data-trace-managed="1"]').forEach(x=>x.remove());
      content.querySelectorAll('.panel').forEach(panel=>{
        if(panel.id==='sourceCredits')return;
        const h=panel.querySelector('h2,h3');if(!h)return;
        const c=classify(panel,h.textContent);if(!c)return;
        panel.insertAdjacentHTML('beforeend',tag(...c));
      });
      content.querySelectorAll('figure.hydro-figure').forEach(fig=>{
        if(fig.querySelector('.trace-mini'))return;
        const cap=fig.querySelector('figcaption');
        if(cap)cap.insertAdjacentHTML('beforeend','<span class="trace-mini" data-trace-managed="1"> · Trazabilidad: estación, fuente, corte y estado del dato.</span>');
      });
    } finally {rendering=false}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const content=document.getElementById('content');
    if(content)new MutationObserver(ms=>{if(rendering)return;if(ms.length&&ms.every(sameManagedMutation))return;scheduleRender()}).observe(content,{childList:true,subtree:true});
    load();setInterval(load,60000);window.addEventListener('focus',load);window.addEventListener('online',load);
  });
})();