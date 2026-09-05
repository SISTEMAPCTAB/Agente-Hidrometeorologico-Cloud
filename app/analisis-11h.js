(()=>{
  const ANALYSIS_URL='../data/analysis/latest.md';
  const WORD_STATE_URL='../data/analysis/Reportes/Estado_Word.json';
  const WORD_URL='../data/analysis/Reportes/Analisis_Hidrometeorologico_Ultimo.docx';
  const MAX_AGE_HOURS=30;
  let rendering=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const inline=s=>esc(String(s||'')).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>');
  const parseCut=md=>{
    const m=String(md||'').match(/^CORTE:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/m);
    if(!m)return null;
    const d=new Date(`${m[1]}T${m[2]}:00-06:00`);
    return Number.isNaN(d.getTime())?null:d;
  };
  const ageHours=d=>d?((Date.now()-d.getTime())/3600000):Infinity;

  function markdown(md){
    const lines=String(md||'').split(/\r?\n/); let out=''; let i=0;
    while(i<lines.length){
      const l=lines[i].trimEnd();
      if(!l.trim()){i++;continue;}
      if(/^CORTE:/.test(l)){i++;continue;}
      if(/^### /.test(l)){out+=`<h3>${inline(l.slice(4))}</h3>`;i++;continue;}
      if(/^## /.test(l)){out+=`<h2>${inline(l.slice(3))}</h2>`;i++;continue;}
      if(/^# /.test(l)){out+=`<h2>${inline(l.slice(2))}</h2>`;i++;continue;}
      if(l.trim().startsWith('|')){
        const block=[]; while(i<lines.length&&lines[i].trim().startsWith('|'))block.push(lines[i++].trim());
        const rows=block.map(x=>x.replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
        if(rows.length>1&&rows[1].every(c=>/^:?-{3,}:?$/.test(c)))rows.splice(1,1);
        if(rows.length){out+='<div class="analysis-table-wrap"><table class="analysis-table"><thead><tr>'+rows[0].map(c=>`<th>${inline(c)}</th>`).join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+r.map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>';}
        continue;
      }
      if(/^[-*]\s+/.test(l.trim())){
        const items=[]; while(i<lines.length&&/^[-*]\s+/.test(lines[i].trim()))items.push(lines[i++].trim().replace(/^[-*]\s+/,''));
        out+='<ul>'+items.map(x=>`<li>${inline(x)}</li>`).join('')+'</ul>';continue;
      }
      const para=[]; while(i<lines.length&&lines[i].trim()&&!/^#{1,3}\s+/.test(lines[i].trim())&&!/^[-*]\s+/.test(lines[i].trim())&&!lines[i].trim().startsWith('|')&&!/^CORTE:/.test(lines[i].trim()))para.push(lines[i++].trim());
      out+=`<p>${inline(para.join(' '))}</p>`;
    }
    return out;
  }

  async function fetchNoStore(url,type='text'){
    const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'}); if(!r.ok)throw new Error(`${r.status}`); return type==='json'?r.json():r.text();
  }

  async function renderAnalysis(force=false){
    const content=document.querySelector('#content'); const title=document.querySelector('#pageTitle');
    if(!content||!title||!title.textContent.includes('Análisis 11:00')||rendering)return;
    if(!force&&content.querySelector('[data-analysis-view="true"]'))return;
    rendering=true;
    content.innerHTML='<div class="grid" data-analysis-view="true"><div class="panel wide analysis-shell"><h2>Análisis hidrometeorológico · 11:00 h</h2><p class="muted">Cargando último análisis vigente…</p></div></div>';
    try{
      const [md,wordState]=await Promise.all([fetchNoStore(ANALYSIS_URL),fetchNoStore(WORD_STATE_URL,'json').catch(()=>null)]);
      const cut=parseCut(md); const stale=!cut||ageHours(cut)>MAX_AGE_HOURS;
      const cutLabel=cut?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}).format(cut):'sin corte identificable';
      const wordOk=wordState?.verified===true;
      content.innerHTML=`<div class="grid" data-analysis-view="true"><article class="panel wide analysis-shell">
        <div class="analysis-head"><div><h2>Análisis hidrometeorológico · 11:00 h</h2><p>Último análisis operativo integrado disponible en GitHub Cloud.</p></div><div class="analysis-cut ${stale?'stale':'current'}"><span>${stale?'No vigente':'Vigente'}</span><strong>${esc(cutLabel)}</strong></div></div>
        ${stale?'<div class="analysis-warning"><strong>Análisis 11:00 h no disponible para el corte actual.</strong> Se muestra el último análisis localizado sólo como antecedente y no debe interpretarse como situación vigente.</div>':''}
        <div class="analysis-body">${markdown(md)}</div>
        <div class="analysis-actions"><button class="btn" id="analysisRefreshBtn" type="button">Actualizar análisis</button>${wordOk?`<a class="btn secondary" href="${WORD_URL}" download>Word actual (opcional)</a>`:''}</div>
        <div class="section-note">La consulta operativa principal es esta vista de la App. El Word se conserva sólo como salida complementaria; no es necesario navegar un historial de análisis.</div>
      </article></div>`;
      document.querySelector('#analysisRefreshBtn')?.addEventListener('click',()=>renderAnalysis(true));
    }catch(e){
      content.innerHTML='<div class="grid" data-analysis-view="true"><div class="panel wide"><div class="analysis-warning"><strong>Análisis 11:00 h no disponible para el corte actual.</strong> No fue posible cargar el último análisis desde GitHub Cloud.</div></div></div>';
    }finally{rendering=false;}
  }

  const observer=new MutationObserver(()=>{
    const title=document.querySelector('#pageTitle'); const content=document.querySelector('#content');
    if(title?.textContent.includes('Análisis 11:00')&&content&&!content.querySelector('[data-analysis-view="true"]'))renderAnalysis();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-section="analisis"]'))setTimeout(()=>renderAnalysis(true),0)});
  window.addEventListener('load',()=>renderAnalysis());
})();