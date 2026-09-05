(() => {
  const SOURCES=[
    ['Comisión Nacional del Agua (CONAGUA) / Servicio Meteorológico Nacional (SMN)','Pronósticos meteorológicos especiales por cuencas de 96 y 360 h; productos meteorológicos e hidrológicos oficiales.','https://smn.conagua.gob.mx/'],
    ['CONAGUA · Organismo de Cuenca Frontera Sur','Boletines hidrométricos, climatológicos, de presas y registros de precipitación utilizados en el análisis operativo.','https://www.gob.mx/conagua'],
    ['INSIVUMEH, Guatemala','Boletines de hidrología aplicada, monitoreo hidrológico y productos de saturación de suelos de las cuencas altas que drenan hacia México.','https://insivumeh.gob.gt/hidrologia-aplicada-sub-menu/'],
    ['WeatherLink','Observaciones de estaciones meteorológicas automáticas disponibles mediante el servicio WeatherLink; la App conserva fuente, hora y calidad del dato.','https://www.weatherlink.com/'],
    ['Instituto Nacional de Estadística y Geografía (INEGI)','Información cartográfica e hidrológica utilizada para la referencia espacial y delimitación de cuencas/subcuencas.','https://www.inegi.org.mx/']
  ];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function render(){
    const title=document.getElementById('pageTitle')?.textContent?.trim();
    const content=document.getElementById('content');
    if(!content||!title)return;
    content.querySelector('#sourceCredits')?.remove();
    if(title!=='Reportes')return;
    const el=document.createElement('section');
    el.id='sourceCredits'; el.className='panel wide source-credits';
    el.innerHTML=`<h2>Fuentes, créditos y uso de la información</h2><p>Esta herramienta integra y procesa información pública y datos de monitoreo para apoyar la vigilancia hidrometeorológica y la toma de decisiones de Protección Civil. Las instituciones que generan los datos conservan la autoría y responsabilidad sobre sus productos originales.</p><div class="source-list">${SOURCES.map(([n,d,u])=>`<article><strong>${esc(n)}</strong><p>${esc(d)}</p><a href="${u}" target="_blank" rel="noopener noreferrer">Consultar fuente oficial</a></article>`).join('')}</div><h3>Referencias institucionales · formato tipo APA 7</h3><div class="apa-list"><p>Comisión Nacional del Agua. (s. f.). <em>Servicio Meteorológico Nacional: pronósticos y productos meteorológicos oficiales</em>. Gobierno de México.</p><p>Comisión Nacional del Agua, Organismo de Cuenca Frontera Sur. (s. f.). <em>Boletines hidrométricos, climatológicos y de presas</em>. Gobierno de México.</p><p>Instituto Nacional de Sismología, Vulcanología, Meteorología e Hidrología. (s. f.). <em>Hidrología aplicada y sistema de monitoreo hidrológico</em>. Gobierno de Guatemala.</p><p>WeatherLink. (s. f.). <em>WeatherLink: red y datos de estaciones meteorológicas automáticas</em>.</p><p>Instituto Nacional de Estadística y Geografía. (s. f.). <em>Información geográfica e hidrológica de México</em>.</p></div><div class="source-disclaimer"><strong>Aviso de uso:</strong> Aplicación de apoyo técnico y preventivo, de carácter institucional y sin fines de lucro. No comercializa ni reivindica como propios los datos o productos de terceros. La información se acredita a su fuente de origen y puede ser transformada en tablas, indicadores y análisis operativos. Para fines oficiales, legales o de difusión externa deberá consultarse también el producto original de la institución generadora. Los semáforos, cruces de variables e interpretaciones de esta App son productos derivados de apoyo a Protección Civil y no sustituyen avisos, alertas o boletines oficiales.</div>`;
    content.append(el);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const title=document.getElementById('pageTitle'),content=document.getElementById('content');
    if(title)new MutationObserver(()=>setTimeout(render,0)).observe(title,{childList:true,subtree:true,characterData:true});
    if(content)new MutationObserver(()=>{if(document.getElementById('pageTitle')?.textContent?.trim()==='Reportes'&&!content.querySelector('#sourceCredits'))setTimeout(render,0)}).observe(content,{childList:true});
    setTimeout(render,0);
  });
})();