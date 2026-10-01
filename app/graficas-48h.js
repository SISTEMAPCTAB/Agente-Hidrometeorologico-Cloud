(() => {
  const BASE='..';
  const HOURS=96;
  const MAP={
    presas:['samaria','gonzalez','mezcalapa','carrizal','platanar','macayo','penitas'],
    serranos:['oxolotan','tapijulapa','teapa','puyacatengo','san joaquin','pueblo nuevo','rios de la sierra','pichucalco','gaviotas','el muelle','porvenir'],
    tulija:['salto de agua','macuspana','tulija','puxcatan','chilapa'],
    usumacinta:['boca del cerro','san pedro','usumacinta']
  };
  let history=[];
  let loading=null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  function current(){return document.querySelector('#nav button.active')?.dataset.section||'resumen'}
  async function load(){
    if(history.length)return history;
    if(loading)return loading;
    loading=fetch(`${BASE}/data/niveles/Historico/niveles_historicos.json?v=${Date.now()}`,{cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(new Error(r.status)))
      .then(j=>history=Array.isArray(j)?j:[])
      .catch(()=>history=[])
      .finally(()=>loading=null);
    return loading;
  }
  function stationRows(name){
    const n=norm(name);
    const all=history.filter(r=>norm(r.estacion)===n&&num(r.nivel)&&r.estado_dato==='observado'&&r.fecha_hora)
      .map(r=>({...r,_t:new Date(r.fecha_hora)})).filter(r=>!Number.isNaN(r._t.getTime())).sort((a,b)=>a._t-b._t);
    if(!all.length)return [];
    const end=all[all.length-1]._t.getTime();
    const start=end-HOURS*3600000;
    return all.filter(r=>r._t.getTime()>=start);
  }
  function stationNames(id){
    const terms=MAP[id]||[];
    const names=[];
    for(const r of history){
      if(!r.estacion)continue;
      const text=norm(`${r.estacion} ${r.rio||''}`);
      if(terms.some(t=>text.includes(t))&&!names.some(x=>norm(x)===norm(r.estacion)))names.push(r.estacion);
    }
    return names;
  }
  function tabascoParts(d){
    const parts=new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return {day:get('day'),hour:get('hour'),minute:get('minute')};
  }
  function axisLabels(rows,x,H,B){
    let priorDay='';
    return rows.map(r=>{
      const p=tabascoParts(r._t),dayChanged=p.day!==priorDay;
      priorDay=p.day;
      const label=dayChanged?`D${p.day}, ${p.hour}`:`${p.hour}`;
      return `<line x1="${x(r._t)}" y1="${H-B}" x2="${x(r._t)}" y2="${H-B+5}" stroke="#777"/><text x="${x(r._t)}" y="${H-14}" text-anchor="middle" font-size="10" fill="#666">${label}</text>`;
    }).join('');
  }
  function svgFor(name){
    const rows=stationRows(name);if(rows.length<2)return '';
    const latest=rows[rows.length-1];
    const levels=rows.map(r=>Number(r.nivel));
    const obsMin=Math.min(...levels),obsMax=Math.max(...levels);
    let span=Math.max(obsMax-obsMin,0.12),pad=Math.max(span*.18,0.05),yMin=obsMin-pad,yMax=obsMax+pad;
    const namo=num(latest.namo)?Number(latest.namo):null;
    const nameRef=num(latest.name)?Number(latest.name):null;
    const W=Math.max(760,58+22+(rows.length-1)*58),H=340,L=58,R=22,T=42,B=52,pw=W-L-R,ph=H-T-B;
    const t0=rows[0]._t.getTime(),t1=rows[rows.length-1]._t.getTime()||t0+1;
    const x=t=>L+((t.getTime()-t0)/(t1-t0||1))*pw;
    const y=v=>T+(yMax-v)/(yMax-yMin||1)*ph;
    const pts=rows.map(r=>`${x(r._t).toFixed(1)},${y(Number(r.nivel)).toFixed(1)}`).join(' ');
    let ref='';
    function refLine(v,label,dash){
      if(v===null)return '';
      if(v>=yMin&&v<=yMax){const yy=y(v);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#7a1230" stroke-width="2" stroke-dasharray="${dash}"/><text x="${L+6}" y="${yy-5}" font-size="12" font-weight="700" fill="#7a1230">${label} ${v.toFixed(2)} m</text>`}
      const yy=T+12;return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#7a1230" stroke-width="2" stroke-dasharray="${dash}"/><text x="${L+6}" y="${yy-5}" font-size="11" font-weight="700" fill="#7a1230">${label} ${v.toFixed(2)} m · fuera de escala</text>`
    }
    ref+=refLine(namo,'NAMO','8 5');
    if(nameRef!==null&&nameRef!==namo)ref+=refLine(nameRef,'NAME','2 5');
    const grid=[0,.25,.5,.75,1].map(p=>{const yy=T+p*ph,val=yMax-p*(yMax-yMin);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#ddd" stroke-width="1"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#666">${val.toFixed(2)}</text>`}).join('');
    const dots=rows.map(r=>`<circle cx="${x(r._t)}" cy="${y(Number(r.nivel))}" r="3.6" fill="#1f77b4"/>`).join('');
    const labels=axisLabels(rows,x,H,B);
    const fmt=d=>d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const delta=Number(rows[rows.length-1].nivel)-Number(rows[0].nivel);
    const staleHours=(Date.now()-latest._t.getTime())/3600000;
    const stale=staleHours>12?` · último dato ${fmt(latest._t)}`:'';
    return `<div class="hydro48-card"><div class="hydro48-head"><div><strong>${esc(latest.estacion)}</strong><span>${esc(latest.rio||'')}</span></div><button type="button" class="copy-btn copy-graph" aria-label="Copiar gráfica de ${esc(latest.estacion)}">Copiar</button></div><div class="hydro48-scroll"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de nivel de ${esc(latest.estacion)} en las últimas 96 horas">${grid}<line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" stroke="#777"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H-B}" stroke="#777"/>${ref}<polyline fill="none" stroke="#1f77b4" stroke-width="3" points="${pts}"/>${dots}${labels}</svg></div><div class="hydro48-foot"><b>${Number(latest.nivel).toFixed(2)} m</b> · Δ96 h ${delta>=0?'+':''}${delta.toFixed(2)} m${stale}</div></div>`;
  }
  function injectStyles(){if(document.getElementById('hydro48Style'))return;const s=document.createElement('style');s.id='hydro48Style';s.textContent='.hydro48-panel{border-top:4px solid #b9955b}.hydro48-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.hydro48-card{border:1px solid #e2ded8;border-radius:14px;padding:10px;background:#fff;min-width:0}.hydro48-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap}.hydro48-head>div{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex:1}.hydro48-head strong{color:#6f112d}.hydro48-head span,.hydro48-foot{font-size:11px;color:#666}.hydro48-scroll,.graph-zoom-scroll{display:block;width:100%;max-width:100%;overflow-x:scroll!important;overflow-y:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain}.hydro48-scroll>svg,.graph-zoom-scroll>svg{display:block;max-width:none!important;min-width:max-content}.hydro48-card svg{display:block;max-width:none;background:#fff}.hydro48-foot{padding:4px 2px 0}.hydro48-foot b{color:#2d2d2d}.copy-btn,.zoom-btn{border:1px solid #c9c1b7;background:#fff;border-radius:8px;padding:5px 9px;font:inherit;font-size:11px;cursor:pointer;color:#555;white-space:nowrap}.copy-btn:active,.zoom-btn:active{transform:translateY(1px)}.copy-table-bar{display:flex;justify-content:flex-end;margin:0 0 6px}.graph-zoom-bar{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:4px 0 6px}.zoom-label{min-width:44px;text-align:center;font-size:11px;color:#666;font-variant-numeric:tabular-nums}.hydro-figure img{display:none!important}.hydro-figure{display:none!important}@media(max-width:760px){.hydro48-grid{grid-template-columns:1fr}.graph-zoom-bar{justify-content:flex-start;overflow-x:auto}}';document.head.appendChild(s)}
  function tableText(table){return [...table.rows].map(row=>[...row.cells].map(cell=>cell.innerText.trim()).join('\t')).join('\n')}
  function isHydrometTable(table){
    const panel=table.closest('section.panel'),title=panel?.querySelector('h2')?.textContent||'';
    const headers=[...(table.tHead?.rows||[])].flatMap(row=>[...row.cells].map(cell=>cell.textContent)).join(' ');
    return /nivel|lluvia|weatherlink|conagua|precipitaci[oó]n/i.test(title+' '+headers);
  }
  function tableImageBlob(table){
    if(typeof window.html2canvas!=='function')throw new Error('Captura PNG no disponible');
    const width=Math.ceil(Math.max(table.scrollWidth,table.getBoundingClientRect().width,600));
    const stage=document.createElement('div');
    stage.className='table-wrap';
    stage.style.cssText='position:fixed;left:0;top:0;z-index:-99999;pointer-events:none;overflow:visible;max-width:none;background:#fff;padding:12px;width:'+width+'px';
    const clone=table.cloneNode(true);
    clone.style.width='100%';clone.style.maxWidth='none';
    stage.appendChild(clone);document.body.appendChild(stage);
    return window.html2canvas(stage,{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false,
      width:stage.scrollWidth,height:stage.scrollHeight,windowWidth:Math.max(window.innerWidth,stage.scrollWidth+30)})
      .then(canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG no disponible')),'image/png')))
      .finally(()=>stage.remove());
  }
  function saveTablePNG(blob,table){
    const title=table.closest('section.panel')?.querySelector('h2')?.textContent||'tabla-hidrometeorologica';
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=norm(title).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.png';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  async function copyTable(btn){
    const wrap=btn.closest('.table-wrap'),table=wrap?.querySelector('table');if(!table)return;
    // Tablas hidrometeorológicas: conservar formato visual y capturar ancho completo,
    // incluso si en móvil se desplazan horizontalmente.
    if(isHydrometTable(table)&&typeof window.html2canvas==='function'){
      let task;
      try{
        task=tableImageBlob(table);
        if(navigator.clipboard?.write&&window.ClipboardItem){
          // Entregar la promesa directamente conserva el gesto del usuario.
          await navigator.clipboard.write([new ClipboardItem({'image/png':task})]);
          flash(btn,'Imagen copiada');return;
        }
        saveTablePNG(await task,table);flash(btn,'PNG descargado');return;
      }catch(err){
        try{if(task){saveTablePNG(await task,table);flash(btn,'PNG descargado');return}}catch{}
        console.warn('No se pudo copiar la tabla como imagen:',err);
        flash(btn,'No disponible');return;
      }
    }
    // Mantener la copia HTML/texto previa para otras tablas y como respaldo sin librería.
    const text=tableText(table),html=table.outerHTML;
    try{
      if(navigator.clipboard?.write&&window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);
      }else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text)}
      else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}
      flash(btn,'Copiado');
    }catch{flash(btn,'No disponible')}
  }
  function svgCanvas(svg,title='',sub=''){
    return new Promise((resolve,reject)=>{
      const xml=new XMLSerializer().serializeToString(svg),blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();
      img.onload=()=>{const scale=Math.max(1,window.devicePixelRatio||1),sw=svg.viewBox.baseVal.width||svg.width.baseVal.value,sh=svg.viewBox.baseVal.height||svg.height.baseVal.value,head=title||sub?52:0,canvas=document.createElement('canvas');canvas.width=sw*scale;canvas.height=(sh+head)*scale;const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,sw,sh+head);if(head){ctx.fillStyle='#6f112d';ctx.font='700 18px sans-serif';ctx.fillText(title,18,23);ctx.fillStyle='#666';ctx.font='12px sans-serif';ctx.fillText(sub,18,42)}ctx.drawImage(img,0,head,sw,sh);URL.revokeObjectURL(url);resolve(canvas)};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('svg'))};img.src=url;
    });
  }
  async function copyGraph(btn){
    const card=btn.closest('.hydro48-card'),svg=card?.querySelector('svg');if(!svg)return;
    const title=card.querySelector('.hydro48-head strong')?.textContent?.trim()||'Gráfica';
    const sub=card.querySelector('.hydro48-head span')?.textContent?.trim()||'';
    try{
      const canvas=await svgCanvas(svg,title,sub),blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
      if(blob&&navigator.clipboard?.write&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);flash(btn,'Copiado');return}
      const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`grafica-${norm(title).replace(/\s+/g,'-')}.png`;document.body.appendChild(a);a.click();a.remove();flash(btn,'PNG');
    }catch{flash(btn,'No disponible')}
  }
  function flash(btn,text){const old=btn.textContent;btn.textContent=text;setTimeout(()=>btn.textContent=old,1400)}
  function addTableCopyButtons(root=document){
    root.querySelectorAll('.table-wrap').forEach(w=>{if(w.querySelector(':scope > .copy-table-bar'))return;const bar=document.createElement('div');bar.className='copy-table-bar';bar.innerHTML='<button type="button" class="copy-btn copy-table">Copiar</button>';w.prepend(bar)});
  }
  function addGraphCopyButtons(root=document){
    root.querySelectorAll('.hydro48-card').forEach(card=>{if(!card.querySelector('svg')||card.querySelector('.copy-graph'))return;const head=card.querySelector('.hydro48-head');if(!head)return;const b=document.createElement('button');b.type='button';b.className='copy-btn copy-graph';b.textContent='Copiar';b.setAttribute('aria-label','Copiar gráfica');head.appendChild(b)});
  }
  function graphMetrics(svg){
    const vb=svg.viewBox?.baseVal;
    const w=Number(svg.getAttribute('width'))||(vb&&vb.width)||760;
    const h=Number(svg.getAttribute('height'))||(vb&&vb.height)||330;
    return {w,h};
  }
  function ensureGraphScroll(card){
    const svg=card.querySelector('svg');if(!svg)return null;
    let wrap=svg.parentElement;
    if(!wrap?.classList.contains('hydro48-scroll')&&!wrap?.classList.contains('graph-zoom-scroll')){
      const n=document.createElement('div');n.className='graph-zoom-scroll';svg.parentNode.insertBefore(n,svg);n.appendChild(svg);wrap=n;
    }
    if(!svg.dataset.zoomBaseWidth){const m=graphMetrics(svg);svg.dataset.zoomBaseWidth=String(m.w);svg.dataset.zoomBaseHeight=String(m.h);svg.dataset.zoom='1';svg.style.width=`${m.w}px`;svg.style.height=`${m.h}px`;}
    return {svg,wrap};
  }
  function applyZoom(card,z,fit=false){
    const g=ensureGraphScroll(card);if(!g)return;
    const baseW=Number(g.svg.dataset.zoomBaseWidth)||760,baseH=Number(g.svg.dataset.zoomBaseHeight)||330;
    let zoom=z;
    if(fit){const available=Math.max(280,g.wrap.clientWidth||card.clientWidth||baseW);zoom=Math.min(1,available/baseW);}
    zoom=Math.max(.45,Math.min(2.5,zoom));
    g.svg.dataset.zoom=String(zoom);
    g.svg.style.width=`${Math.round(baseW*zoom)}px`;
    g.svg.style.height=`${baseH}px`;
    const label=card.querySelector('.zoom-label');if(label)label.textContent=fit&&zoom<.995?'Ajustado':`${Math.round(zoom*100)}%`;
  }
  function addGraphZoomControls(root=document){
    root.querySelectorAll('.hydro48-card').forEach(card=>{
      if(!card.querySelector('svg'))return;ensureGraphScroll(card);
      if(card.querySelector('.graph-zoom-bar'))return;
      const bar=document.createElement('div');bar.className='graph-zoom-bar';bar.innerHTML='<button type="button" class="zoom-btn zoom-out" aria-label="Alejar gráfica">−</button><span class="zoom-label">100%</span><button type="button" class="zoom-btn zoom-in" aria-label="Acercar gráfica">+</button><button type="button" class="zoom-btn zoom-fit">Ajustar</button>';
      const head=card.querySelector('.hydro48-head');head?.insertAdjacentElement('afterend',bar);
    });
  }
  function enhance(root=document){addTableCopyButtons(root);addGraphCopyButtons(root);addGraphZoomControls(root)}
  function bindCopy(){
    if(document.body.dataset.hydroCopyBound)return;document.body.dataset.hydroCopyBound='1';
    document.addEventListener('click',e=>{
      const tb=e.target.closest('.copy-table');if(tb){copyTable(tb);return}
      const gb=e.target.closest('.copy-graph');if(gb){copyGraph(gb);return}
      const card=e.target.closest('.hydro48-card');if(!card)return;
      const svg=card.querySelector('svg');if(!svg)return;
      const currentZoom=Number(svg.dataset.zoom)||1;
      if(e.target.closest('.zoom-in')){applyZoom(card,currentZoom+.25);return}
      if(e.target.closest('.zoom-out')){applyZoom(card,currentZoom-.25);return}
      if(e.target.closest('.zoom-fit')){applyZoom(card,1,true);return}
    });
    new MutationObserver(()=>enhance()).observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  function removeLegacy48(content){
    content.querySelectorAll('section.panel.wide').forEach(section=>{
      const title=section.querySelector(':scope > h2')?.textContent?.trim()||'';
      if(title.startsWith('Gráficas hidrométricas · 48 h'))section.remove();
    });
  }
  async function render(){
    await load();injectStyles();bindCopy();enhance();
    const id=current(),content=document.getElementById('content');if(!content||!history.length)return;
    removeLegacy48(content);
    const guatemala=content.querySelector('#hydro48Panel .guatemala-charts-stable');
    if(guatemala)guatemala.remove();
    content.querySelector('#hydro48Panel')?.remove();
    const ids=id==='resumen'?['presas','serranos','tulija','usumacinta']:[id];
    if(!ids.some(x=>MAP[x]))return;
    const names=[];ids.forEach(x=>stationNames(x).forEach(n=>{if(!names.some(a=>norm(a)===norm(n)))names.push(n)}));
    const cards=names.map(svgFor).filter(Boolean);if(!cards.length)return;
    const panel=document.createElement('section');panel.id='hydro48Panel';panel.className='panel wide hydro48-panel';panel.innerHTML=`<h2>Niveles de ríos · últimas 96 h</h2><p class="muted">Se conserva la última serie válida hasta que exista una observación nueva.</p><div class="hydro48-grid">${cards.join('')}</div>`;
    const grid=content.querySelector('.grid')||content;grid.appendChild(panel);if(guatemala&&id==='usumacinta')panel.querySelector('.hydro48-grid')?.prepend(guatemala);enhance(content);
  }
  document.addEventListener('DOMContentLoaded',()=>{injectStyles();bindCopy();enhance();setTimeout(render,800);document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,500));document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(()=>{history=[];render()},900));window.addEventListener('hydro:soft-refresh',()=>setTimeout(render,250));});
})();