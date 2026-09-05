(() => {
  // Añade fuentes públicas estructuradas al cargador existente de la App.
  sources.fuentesPublicas = `${BASE}/data/fuentes_publicas/latest.json`;
  sources.fuentesPublicasEstado = `${BASE}/data/fuentes_publicas/Estado_Fuentes_Publicas.json`;

  const originalRender = render;

  function rangeCell(v){
    if(!v || !v.texto) return '<span class="muted">s/d</span>';
    return `<strong>${esc(v.texto)} mm</strong>`;
  }

  function smn96Panel(data){
    const d=data?.smn96;
    if(!d || d.__error) return '<div class="empty-state">SMN 96 h aún no disponible en JSON cloud.</div>';
    const wins=['0-24','24-48','48-72','72-96'];
    const basins=['Peñitas','Malpaso','Chicoasén','La Angostura','Bajo Grijalva-Ríos de la Sierra','Usumacinta','Presa Juan Sabines'];
    return `<div class="panel wide"><h2>SMN · Pronóstico por cuencas 96 h</h2><div class="maturity-row"><span class="badge ok">Aviso ${esc(d.aviso||'s/d')}</span><span class="badge">${esc(d.fecha||'fecha s/d')}</span><span class="badge">Emisión ${esc(d.emision||'s/d')}</span></div>${d.resumen?`<p>${esc(d.resumen)}</p>`:''}<div class="table-wrap"><table><thead><tr><th>Cuenca</th>${wins.map(w=>`<th>${w} h</th>`).join('')}</tr></thead><tbody>${basins.map(b=>`<tr><td>${esc(b)}</td>${wins.map(w=>`<td>${rangeCell(d.ventanas?.[w]?.[b])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="section-note">Fuente: Servicio Meteorológico Nacional. Los rangos se conservan como rangos oficiales; no se suman sus extremos como pronóstico puntual.</div></div>`;
  }

  function smn360Panel(data){
    const d=data?.smn360;
    if(!d || d.__error) return '<div class="panel wide"><div class="empty-state">SMN 360 h aún no disponible en JSON cloud.</div></div>';
    const periods=Array.isArray(d.periodos)?d.periodos:[];
    return `<div class="panel wide"><h2>SMN · Escenario 360 h</h2><div class="maturity-row"><span class="badge ok">Aviso ${esc(d.aviso||'s/d')}</span><span class="badge">${esc(d.fecha||'fecha s/d')}</span>${d.corrida_modelo?`<span class="badge">Corrida ${esc(d.corrida_modelo)}</span>`:''}</div><div class="source-grid">${periods.map(p=>`<div class="source-card"><div><strong>${esc(p.ventana||'periodo')}</strong><span class="badge warn">Mayor incertidumbre</span></div><p><b>Validez:</b> ${esc(p.validez||'s/d')}</p><p>${esc(p.descripcion||'')}</p></div>`).join('')||'<div class="empty-state">Sin periodos estructurados.</div>'}</div><div class="section-note">Escenario de vigilancia de mediano plazo. No equivale a predicción determinista de niveles o crecientes.</div></div>`;
  }

  function insivumehPanel(data){
    const d=data?.insivumeh;
    if(!d || d.__error) return '<div class="panel wide"><div class="empty-state">INSIVUMEH aún no disponible en JSON cloud.</div></div>';
    const frags=Array.isArray(d.fragmentos_relevantes)?d.fragmentos_relevantes:[];
    return `<div class="panel wide"><h2>INSIVUMEH · Formación aguas arriba de Boca del Cerro</h2><div class="maturity-row"><span class="badge ${d.completo?'ok':'warn'}">${d.completo?'Dato localizado':'En validación'}</span><span class="badge">Vertiente Golfo de México</span></div><div class="source-grid">${frags.map((x,i)=>`<div class="source-card"><div><strong>Referencia ${i+1}</strong><span class="badge">oficial</span></div><p>${esc(x)}</p></div>`).join('')||'<div class="empty-state">El boletín fue localizado, pero todavía no contiene texto estructurable de las estaciones objetivo.</div>'}</div><div class="section-note">Prioridad: Chixoy/Salinas, La Pasión/El Porvenir, Usumacinta/El Tigre y Machaquilá. Se conserva la hora y denominación oficial cuando el PDF la expone.</div></div>`;
  }

  function liveStatusPanel(){
    const s=state.data.fuentesPublicasEstado;
    if(!s || s.__error) return '';
    const p=s.products||{};
    return `<div class="panel wide"><h2>Estado de actualización automática</h2><div class="cards">${['smn96','smn360','insivumeh'].map(k=>`<div class="station-card"><h3>${k==='smn96'?'SMN 96 h':k==='smn360'?'SMN 360 h':'INSIVUMEH'}</h3><div><span class="badge ${p[k]?.available?'ok':'warn'}">${p[k]?.available?'Disponible':'Sin dato nuevo'}</span></div><small>${p[k]?.complete?'Estructurado':'Parcial / en validación'}</small></div>`).join('')}</div><div class="section-note">Consulta cloud programada cada 10 minutos. La App revisa GitHub cada minuto mientras está abierta.</div></div>`;
  }

  render = function(){
    if(state.current==='pronostico'){
      const d=state.data.fuentesPublicas||{};
      $('#pageTitle').textContent='Pronóstico SMN 96 / 360 h';
      $('#content').innerHTML=`<div class="grid">${smn96Panel(d)}${smn360Panel(d)}${liveStatusPanel()}</div>`;
      return;
    }
    if(state.current==='usumacinta'){
      const d=state.data.fuentesPublicas||{};
      $('#pageTitle').textContent='Usumacinta';
      $('#content').innerHTML=`<div class="grid">${systemBlock('Usumacinta',usumacintaRows(),'Cadena antecedente: Guatemala (Chixoy/Salinas, La Pasión y El Tigre) + Lacantún → Boca del Cerro → Balancán → Emiliano Zapata → Jonuta → Centla.')}${insivumehPanel(d)}${systemRainPanel('usumacinta')}</div>`;
      return;
    }
    originalRender();
  };

  // Refresca de inmediato para cargar los dos nuevos JSON si ya existen.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>document.getElementById('refreshBtn')?.click(),250));
  else setTimeout(()=>document.getElementById('refreshBtn')?.click(),250);
})();
