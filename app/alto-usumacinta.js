(() => {
  const BASE='..';
  const DATA_URL=`${BASE}/data/fuentes_publicas/latest.json`;
  const FUENTE1_URL=`${BASE}/data/latest/FUENTE1.txt`;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const fmt=(v,d=2)=>n(v)===null?'s/d':Number(v).toFixed(d);
  const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';

  function table(headers,rows){
    return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??'s/d'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function insivumehLevels(doc){
    const ins=doc?.insivumeh||{};
    const wanted=['El Porvenir','El Tigre'];
    const evo=new Map((doc?.insivumeh_evolucion_real||[]).map(x=>[norm(x.estacion),x]));
    const rows=[];
    for(const name of wanted){
      const x=(ins.estaciones_estructuradas||[]).find(y=>norm(y.estacion)===norm(name));
      if(!x)continue;
      const e=evo.get(norm(name));
      rows.push([
        esc(x.estacion),esc(x.rio),esc(x.ubicacion),`${fmt(x.nivel_instantaneo_m)} m`,`${fmt(x.caudal_instantaneo_m3s)} m³/s`,
        e?.delta_nivel_m!==undefined&&e?.delta_nivel_m!==null?`${Number(e.delta_nivel_m).toFixed(2)} m / ${fmt(e.horas_transcurridas,1)} h`:'s/d',
        esc(e?.tendencia_calculada||'s/d'),esc(`${ins.fecha||'s/d'} ${ins.hora||''}`.trim()),'INSIVUMEH · BHVGM',esc(x.calidad||'extraído del BHVGM')
      ]);
    }
    return rows;
  }

  function guatemalaRain(doc){
    const g=doc?.guatemala_acumulados||{};
    const out=[];
    const seasonal=g?.epoca_lluviosa?.estaciones_relevantes||[];
    const target=['El Tigre','El Porvenir','Machaquilá','Mactún','Bethel'];
    for(const x of seasonal){
      if(!target.some(t=>norm(t)===norm(x.estacion)))continue;
      out.push([esc(x.estacion),esc(x.rama_aportante||x.rama||'Alto Usumacinta'),n(x.acumulado_mm)===null?'s/d':`${Number(x.acumulado_mm).toFixed(1)} mm`,esc(x.periodo||g?.epoca_lluviosa?.periodo||'época lluviosa'),'INSIVUMEH · Resumen de estaciones','Consulta automática cada 10 min',esc(x.confianza_influencia||x.confianza||'s/d')]);
    }
    const daily=(g?.periodos||[]).find(x=>norm(x.periodo)==='24h');
    if(daily){
      out.unshift(['Mapa oficial 24 h','Sector Alto Usumacinta · Guatemala','Mapa oficial','24 h','INSIVUMEH · Mapas últimas 24 horas','Consulta automática cada 10 min',daily.extraccion_areal===false?'mapa disponible; sin valor puntual automático':'disponible']);
    }
    return out;
  }

  function lacantunRow(text){
    const clean=String(text||'').replace(/,/g,'');
    const m=clean.match(/BHG21\s+Lacant[uú]n\s+Ocosingo\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
    if(!m)return [];
    return [[
      'Lacantún','Río Lacantún · Ocosingo',`${Number(m[4]).toFixed(2)} m`,`${Number(m[5]).toFixed(2)} m³/s`,`${Number(m[6]).toFixed(1)} mm / 24 h`,
      'Boletín diario OCFS/CONAGUA','Frontera Sur · Centro Hidrometeorológico Regional Tuxtla Gutiérrez','Se actualiza con cada boletín recibido','dato extraído del bloque Cuenca del Río Usumacinta'
    ]];
  }

  function styles(){
    if(document.getElementById('altoUsuStyle'))return;
    const s=document.createElement('style');s.id='altoUsuStyle';
    s.textContent='.alto-usu{margin-top:26px;border-top:2px solid #e2ded8;padding-top:18px}.alto-usu h3{color:#6f112d;margin:0 0 6px}.alto-usu h4{margin:18px 0 8px;color:#333}.alto-usu .source-note{font-size:12px;color:#666;line-height:1.45;margin:6px 0 12px}';document.head.appendChild(s);
  }

  async function render(){
    if(active()!=='weather')return;
    const content=document.getElementById('content');if(!content||content.querySelector('#altoUsumacinta'))return;
    const con=[...content.querySelectorAll('section.panel.wide')].find(s=>/CONAGUA · lluvia/i.test(s.querySelector('h2')?.textContent||''));
    if(!con)return;
    try{
      const [dr,tr]=await Promise.all([
        fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'}),
        fetch(`${FUENTE1_URL}?v=${Date.now()}`,{cache:'no-store'})
      ]);
      const doc=dr.ok?await dr.json():{};const txt=tr.ok?await tr.text():'';
      const levels=insivumehLevels(doc),rain=guatemalaRain(doc),lac=lacantunRow(txt);
      styles();
      const sec=document.createElement('section');sec.id='altoUsumacinta';sec.className='panel wide alto-usu';
      sec.innerHTML=`<h3>Alto Usumacinta · Guatemala y Chiapas</h3>
        <p class="source-note">Seguimiento de aportes aguas arriba hacia Tabasco. Se muestran únicamente datos obtenidos de las fuentes operativas ya integradas al agente; un dato ausente se conserva como s/d y no se sustituye por cero.</p>
        <h4>Guatemala · lluvia registrada / acumulados INSIVUMEH</h4>
        ${table(['Estación / producto','Rama aportante','Lluvia','Periodo','Fuente','Frecuencia de extracción','Calidad / confianza'],rain.length?rain:[['s/d','Alto Usumacinta','s/d','s/d','INSIVUMEH','Cada 10 min','sin dato puntual disponible']])}
        <p class="source-note">Fuente de lluvia: INSIVUMEH, producto “Mapas de las últimas 24 horas” y resumen de estaciones. El agente consulta la fuente cada 10 minutos; cuando el mapa diario no ofrece valor puntual estructurado, se identifica expresamente y no se infiere una lluvia de estación.</p>
        <h4>Guatemala · niveles y caudales</h4>
        ${table(['Estación','Río','Ubicación','Nivel','Caudal','Δ nivel','Tendencia','Corte fuente','Fuente','Calidad'],levels.length?levels:[['s/d','La Pasión / Usumacinta','s/d','s/d','s/d','s/d','s/d','s/d','INSIVUMEH · BHVGM','sin dato']])}
        <p class="source-note">INSIVUMEH BHVGM se consulta cada 10 minutos. El histórico observado muestra boletines a las 08:00, 14:00 y 20:00 h; la tabla conserva la hora publicada por la fuente.</p>
        <h4>Chiapas · Río Lacantún</h4>
        ${table(['Estación','Río / zona','Nivel','Caudal','Lluvia','Producto','Fuente','Actualización','Calidad'],lac.length?lac:[['Lacantún','Ocosingo','s/d','s/d','s/d','Boletín OCFS/CONAGUA','Frontera Sur','Con cada boletín recibido','sin dato en corte actual']])}`;
      con.insertAdjacentElement('afterend',sec);
    }catch(e){/* no altera el resto de la página si una fuente falla */}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(render,1200);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,800));
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(()=>{document.getElementById('altoUsumacinta')?.remove();render()},900));
    const c=document.getElementById('content')||document.body;new MutationObserver(()=>{if(active()==='weather')render()}).observe(c,{childList:true,subtree:true});
  });
})();
