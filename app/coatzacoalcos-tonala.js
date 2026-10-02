(()=>{
'use strict';
// Apartado aislado: no altera la semaforización ni las consultas de los otros sistemas.
const ROOT='../data/coatzacoalcos_tonala/latest.json', DIAG='../data/coatzacoalcos_tonala/prueba_extraccion.json', WEATHER='../data/weatherlink/latest.json';
const RAIN='../data/niveles/Lluvia_CONAGUA/ultimo_corte.json';
const existing=new Set(['e49a137f-741c-4e4d-b9ac-d7118c301f4d','a86b31af-4828-44e9-8709-47f86d62b20e','fefb3d52-6c19-4922-b679-c1302e724124','7cde6e43-d6da-4f2c-b082-e33a2ff2f750']);
const names={'e49a137f-741c-4e4d-b9ac-d7118c301f4d':'Impulsora','a86b31af-4828-44e9-8709-47f86d62b20e':'Paso La Mina','fefb3d52-6c19-4922-b679-c1302e724124':'Modesta_1','7cde6e43-d6da-4f2c-b082-e33a2ff2f750':'CitrusMax IP Gateway S2'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>n(v)?Number(v).toFixed(2):'s/d';
const date=v=>{if(!v)return 's/d';let d=new Date(v);return Number.isFinite(+d)?d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):esc(v)};
async function get(u){try{const r=await fetch(u+'?v='+Date.now(),{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
let seq=0;
function chart(series,namo){
 const points=(Array.isArray(series)?series:[]).filter(x=>n(x.current_m)&&x.date&&Number.isFinite(Date.parse(x.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-60);
 if(points.length<2)return '<p class="muted">Se generará la gráfica al disponer de al menos dos cortes publicados con fechas verificadas. No se transforman las escalas de ayer/hoy en dos informes independientes.</p>';
 const values=points.map(x=>Number(x.current_m));let lo=Math.min(...values),hi=Math.max(...values);let pad=Math.max(.15,(hi-lo)*.18);lo-=pad;hi+=pad;
 let X=i=>62+640*i/(points.length-1),Y=v=>215-(v-lo)*170/(hi-lo);
 const path=points.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(Number(p.current_m)).toFixed(1)).join(' ');
 const grid=[0,.25,.5,.75,1].map(t=>{let yy=45+t*170;return '<line x1="62" x2="702" y1="'+yy+'" y2="'+yy+'" stroke="#ddd"/><text x="55" y="'+(yy+4)+'" font-size="11" text-anchor="end">'+(hi-t*(hi-lo)).toFixed(2)+'</text>'}).join('');
 // Mismo criterio visual que las demás gráficas: NAMO punteado granate,
 // valor identificado incluso cuando está fuera del rango observado.
 const ref=n(namo)?(Number(namo)>=lo&&Number(namo)<=hi
  ?'<line x1="62" x2="702" y1="'+Y(Number(namo))+'" y2="'+Y(Number(namo))+'" stroke="#7a1230" stroke-width="2" stroke-dasharray="8 5"/><text x="68" y="'+(Y(Number(namo))-6)+'" font-size="12" font-weight="700" fill="#7a1230">NAMO '+num(namo)+' m</text>'
  :'<line x1="62" x2="702" y1="57" y2="57" stroke="#7a1230" stroke-width="2" stroke-dasharray="8 5"/><text x="68" y="51" font-size="11" font-weight="700" fill="#7a1230">NAMO '+num(namo)+' m · fuera de escala</text>'):'';
 return '<svg role="img" aria-label="Evolución de nivel del Tonalá en metros" viewBox="0 0 760 260" style="max-width:100%;height:auto">'+grid+ref+'<path d="'+path+'" fill="none" stroke="#711833" stroke-width="3"/>'+points.map((p,i)=>'<circle cx="'+X(i)+'" cy="'+Y(p.current_m)+'" r="4" fill="#711833"><title>'+esc(p.date)+' · '+num(p.current_m)+' m</title></circle>').join('')+'<text x="62" y="243" font-size="11">'+esc(points[0].date)+'</text><text x="702" y="243" font-size="11" text-anchor="end">'+esc(points.at(-1).date)+'</text></svg>';
}
function weatherRows(doc){
 const found=(doc?.stations||[]).filter(x=>existing.has(x.uuid));
 const order=['e49a137f-741c-4e4d-b9ac-d7118c301f4d','a86b31af-4828-44e9-8709-47f86d62b20e','fefb3d52-6c19-4922-b679-c1302e724124','7cde6e43-d6da-4f2c-b082-e33a2ff2f750'];
 found.sort((a,b)=>order.indexOf(a.uuid)-order.indexOf(b.uuid));
 return found.map(x=>{
  const t=Date.parse(x.observed_utc||''),fresh=Number.isFinite(t)&&Date.now()-t<2*3600000&&t<Date.now()+300000;
  const veracruz=x.uuid==='7cde6e43-d6da-4f2c-b082-e33a2ff2f750';
  const accum=x.accumulations_mm||{},quality=x.accumulation_status||{};
  const rain=h=>fresh&&n(accum[h])?(quality[h]==='minimo_observado'?'≥ ':'')+num(accum[h])+' mm':'s/d';
  const state=fresh?'Observado':'Dato anterior';
  return '<tr><td><b>'+esc(names[x.uuid])+'</b><br><small>'+esc(x.ubicacion)+'</small></td><td>WeatherLink</td><td>'+rain('24')+'</td><td>'+rain('48')+'</td><td>'+date(x.observed_utc)+'</td><td class="weather-quality-cell" style="white-space:normal;min-width:120px">'+state+(veracruz?' · Veracruz; subcuenca por verificar':' · ubicación regional')+'</td></tr>';
 }).join('');
}
const panel=(title,body)=>'<section class="panel wide"><h2>'+title+'</h2>'+body+'</section>';
const table=(head,body,colspan)=>'<div class="table-wrap"><table><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(body||'<tr><td colspan="'+colspan+'">Sin dato válido disponible</td></tr>')+'</tbody></table></div>';
async function show(){
 const root=document.getElementById('tonala-root');if(!root)return;const id=++seq;
 const [doc,diag,weather,rain]=await Promise.all([get(ROOT),get(DIAG),get(WEATHER),get(RAIN)]);
 if(id!==seq||!document.getElementById('tonala-root'))return;
 const mat=doc?.reports?.matutino,stations=mat?.stations||[];
 const validDate=mat?.date&&/^\d{4}-\d{2}-\d{2}$/.test(mat.date);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const validity=validDate?(mat.date===today?'Actualizado':'Dato anterior · última emisión '+esc(mat.date)):'No disponible';
 const rows=stations.map(x=>'<tr><td><b>'+esc(x.name)+'</b><br><small>'+esc(x.river)+'</small></td><td>'+num(x.current_m)+' m</td><td>'+(n(x.delta_m)&&Number(x.delta_m)>0?'+':'')+num(x.delta_m)+' m</td><td>'+esc(n(x.delta_m)?Number(x.delta_m)>0?'Ascenso':Number(x.delta_m)<0?'Descenso':'Estable':'s/d')+'</td><td>'+num(x.below_namo_m)+' m abajo</td><td>'+validity+'</td></tr>').join('');
 const tonal=stations.find(x=>x.id==='san-jose-del-carmen');
 const dulce=stations.find(x=>x.id==='agua-dulce');
 const bridge=(Array.isArray(rain)?rain:[]).filter(x=>/puente tonala/i.test((x.estacion||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''))).sort((a,b)=>Date.parse(b.fecha_hora||'')-Date.parse(a.fecha_hora||''))[0];
 const bridgeRow=bridge?'<tr><td><b>Puente Tonalá</b></td><td>CONAGUA · reporte horario</td><td>'+num(bridge.lluvia_24h_precedentes_mm)+' mm</td><td>s/d</td><td>'+date(bridge.fecha_hora)+'</td><td>'+esc(bridge.estado_24h||'s/d')+'</td></tr>':'';
 const weatherTable=table(['Estación','Fuente','24 h anteriores','48 h anteriores','Hora','Calidad'],weatherRows(weather),6);
 const rainTable=table(['Estación','Fuente','24 h anteriores','48 h anteriores','Hora','Calidad'],bridgeRow,6);
 const levelTable=table(['Estación','Nivel','Δ reporte anterior','Tendencia','Dist. NAMO','Estado'],rows,6);
 const http=diag?.discovery?.http,checked=diag?.checked_at_utc;
 const sourceState=http===403
  ?'<p class="muted"><b>Última verificación automática:</b> '+date(checked)+' · el portal oficial de CONAGUA respondió HTTP 403 al recolector; se conserva sin alterar el último informe validado. Esto corresponde a una falla de acceso a la fuente, no a una actualización del nivel.</p>'
  :'';
 const source='<p class="muted">Corte oficial: '+esc(mat?.date||'s/d')+' · '+validity+'. Escala anterior y actual corresponden al mismo informe, no a dos publicaciones independientes. <a href="'+esc(mat?.url||'#')+'" target="_blank" rel="noopener noreferrer">Informe matutino oficial ↗</a></p>'+sourceState;
 root.innerHTML=
  panel('Lluvia observada · 24 y 48 h',rainTable+'<p class="muted">Puente Tonalá · lluvia observada por CONAGUA; no equivale a nivel del río.</p>')+
  panel('WeatherLink · vigilancia regional complementaria',weatherTable+'<p class="muted">Las estaciones del occidente de Tabasco siguen perteneciendo a sus apartados originales; esta vista es referencia adicional sin reasignar subcuenca. CitrusMax, Veracruz, conserva la fecha original y no se presenta como dato vigente.</p>')+
  panel('Coatzacoalcos–Tonalá · niveles',levelTable+source)+
  panel('Gráficas hidrométricas · evolución del Tonalá','<div class="hydro48-grid"><article class="hydro48-card"><div class="hydro48-head"><strong>San José del Carmen · Río Tonalá</strong><span>CONAGUA Golfo Centro</span></div>'+chart(doc?.history?.['san-jose-del-carmen'],tonal?.namo_m)+'</article><article class="hydro48-card"><div class="hydro48-head"><strong>Agua Dulce · Río Aguadulcita</strong><span>CONAGUA Golfo Centro</span></div>'+chart(doc?.history?.['agua-dulce'],dulce?.namo_m)+'</article></div>');
}

document.addEventListener('DOMContentLoaded',()=>{
 const content=document.getElementById('content');
 content?.addEventListener('app-rendered',e=>{if(e.detail?.section==='tonala')show()});
 document.getElementById('refreshBtn')?.addEventListener('click',()=>{if(document.querySelector('#nav button[data-section="tonala"].active'))setTimeout(show,500)});
 setInterval(()=>{if(document.querySelector('#nav button[data-section="tonala"].active'))show()},15*60000);
});
})();
