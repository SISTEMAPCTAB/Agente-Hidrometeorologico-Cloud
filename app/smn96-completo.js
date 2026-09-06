(() => {
  const DATA_URL='../data/fuentes_publicas/latest.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';
  const WINDOWS=['0-24','24-48','48-72','72-96'];
  const BASINS=['Peñitas','Malpaso','Chicoasén','La Angostura','Bajo Grijalva-Ríos de la Sierra','Usumacinta','Presa Juan Sabines'];

  function cell(v,suffix=''){
    if(v===null||v===undefined||String(v).trim()==='')return 's/d';
    return `${esc(v)}${suffix}`;
  }

  function fullTable(d,w){
    const rows=BASINS.map(b=>{
      const x=d?.detalle_ventanas?.[w]?.[b]||{};
      return `<tr><td><b>${esc(b)}</b></td><td>${cell(x.precipitacion_mm,' mm')}</td><td>${cell(x.temperatura_max_c,' °C')}</td><td>${cell(x.temperatura_min_c,' °C')}</td><td>${cell(x.viento_sostenido_kmh,' km/h')}</td><td>${cell(x.rachas_kmh,' km/h')}</td></tr>`;
    }).join('');
    return `<h3>Pronóstico ${esc(w)} h</h3><div class="table-wrap"><table><thead><tr><th>Cuenca</th><th>Precipitación</th><th>Temp. máx.</th><th>Temp. mín.</th><th>Viento sostenido</th><th>Rachas</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function panelHTML(d){
    return `<h2>SMN · Pronóstico meteorológico especial por cuencas 96 h</h2>
      <div class="maturity-row"><span class="badge ok">Aviso ${esc(d.aviso||'s/d')}</span><span class="badge">${esc(d.fecha||'fecha s/d')}</span><span class="badge">Emisión ${esc(d.emision||'s/d')}</span></div>
      ${d.resumen?`<p>${esc(d.resumen)}</p>`:''}
      ${WINDOWS.map(w=>fullTable(d,w)).join('')}
      <div class="section-note">Fuente: Servicio Meteorológico Nacional · Pronóstico Meteorológico especial por cuencas para el Sureste Mexicano a 96 horas. Se muestran precipitación, temperatura máxima y mínima, viento sostenido y rachas tal como los publica el SMN.</div>`;
  }

  async function render(){
    if(active()!=='pronostico')return;
    const content=document.getElementById('content');if(!content)return;
    const panels=[...content.querySelectorAll('section.panel,div.panel')];
    const target=panels.find(p=>{
      const h=p.querySelector('h2')?.textContent||'';
      const t=norm(h);
      return t.includes('smn')&&t.includes('96 h')&&!t.includes('360');
    });
    if(!target||target.dataset.smn96Completo==='1')return;
    try{
      const r=await fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)return;
      const j=await r.json();const d=j?.smn96;if(!d?.detalle_ventanas)return;
      target.innerHTML=panelHTML(d);target.dataset.smn96Completo='1';
    }catch{/* mantener panel existente si la fuente falla */}
  }

  function reset(){const c=document.getElementById('content');if(c)c.querySelectorAll('[data-smn96-completo]').forEach(x=>delete x.dataset.smn96Completo);setTimeout(render,700)}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(render,1000);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,700));
    document.getElementById('refreshBtn')?.addEventListener('click',reset);
    const c=document.getElementById('content')||document.body;
    new MutationObserver(()=>{if(active()==='pronostico')render()}).observe(c,{childList:true,subtree:true});
  });
})();
