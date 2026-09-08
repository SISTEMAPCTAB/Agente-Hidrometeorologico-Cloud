(()=>{
  const REPORTS={
    'Análisis hidrometeorológico':'../data/analysis/Reportes/Analisis_Hidrometeorologico_Ultimo.docx',
    'WeatherLink':'../data/weatherlink/Reportes/Reporte_WeatherLink_Ultimo.docx'
  };

  function fixLinks(){
    const title=document.querySelector('#pageTitle');
    const content=document.querySelector('#content');
    if(!title||!content||!title.textContent.includes('Reportes'))return;

    content.querySelectorAll('a.station-card').forEach(a=>{
      const strong=a.querySelector('strong');
      const key=strong?.textContent?.trim();
      const href=REPORTS[key];
      if(!href)return;
      a.href=href;
      a.removeAttribute('target');
      a.setAttribute('download','');
    });
  }

  const observer=new MutationObserver(fixLinks);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-section="reportes"]'))setTimeout(fixLinks,0);
  });
  window.addEventListener('load',fixLinks);
})();
