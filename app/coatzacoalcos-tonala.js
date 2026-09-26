(()=>{
'use strict';
// Apartado aislado: no altera la semaforización ni las consultas de los otros sistemas.
const ROOT='../data/coatzacoalcos_tonala/latest.json', WEATHER='../data/weatherlink/latest.json';
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
 const ref=n(namo)&&namo>=lo&&namo<=hi?'<line x1="62" x2="702" y1="'+Y(namo)+'" y2="'+Y(namo)+'" stroke="#ab7b15" stroke-dasharray="6 4"/>':'';
 return '<svg role="img" aria-label="Evolución de nivel del Tonalá en metros" viewBox="0 0 760 260" style="max-width:100%;height:auto">'+grid+ref+'<path d="'+path+'" fill="none" stroke="#711833" stroke-width="3"/>'+points.map((p,i)=>'<circle cx="'+X(i)+'" cy="'+Y(p.current_m)+'" r="4" fill="#711833"><title>'+esc(p.date)+' · '+num(p.current_m)+' m</title></circle>').join('')+'<text x="62" y="243" font-size="11">'+esc(points[0].date)+'</text><text x="702" y="243" font-size="11" text-anchor="end">'+esc(points.at(-1).date)+'</text></svg>';
}
function weatherRows(doc){
 const found=(doc?.stations||[]).filter(x=>existing.has(x.uuid));
 return found.map(x=>{
 const t=Date.parse(x.observed_utc||'');const fresh=Number.isFinite(t)&&Date.now()-t<2*3600000&&t<Date.now()+300000;
 const veracruz=x.uuid==='7cde6e43-d6da-4f2c-b082-e33a2ff2f750';
 const a=x.accumulations_mm||{},min=x.accumulation_status?.['24']==='minimo_observado';
 return '<tr><td><b>'+esc(names[x.uuid])+'</b><br><small>'+esc(x.ubicacion)+'</small></td><td>'+esc(veracruz?'Referencia Veracruz; pertenencia a cuenca sin confirmar':'Occidente de Tabasco; asociación hidrológica pendiente de coordenadas')+'</td><td>'+(fresh&&n(a['1'])?num(a['1'])+' mm':'s/d')+'</td><td>'+(fresh&&n(a['6'])?num(a['6'])+' mm':'s/d')+'</td><td>'+(fresh&&n(a['24'])?(min?'≥ ':'')+num(a['24'])+' mm':'s/d')+'</td><td>'+date(x.observed_utc)+'</td><td>'+(fresh?'Actualizada':'Atrasada · no usar acumulado como actual')+'</td></tr>';
 }).join('');
}
async function show(){
 const root=document.getElementById('tonala-root');if(!root)return;const id=++seq;
 const [doc,weather,rain]=await Promise.all([get(ROOT),get(WEATHER),get(RAIN)]);
 if(id!==seq||!document.getElementById('tonala-root'))return;
 const mat=doc?.reports?.matutino,ves=doc?.reports?.vespertino,stations=mat?.stations||[];
 const age=mat?.date?Math.floor((Date.now()-Date.parse(mat.date+'T23:59:59-06:00'))/86400000):Infinity;
 const validity=age<=0?'Actualizado':'Atrasado · última emisión verificada '+esc(mat?.date||'s/d');
 const rows=stations.map(x=>'<tr><td><b>'+esc(x.name)+'</b><br><small>'+esc(x.river)+'</small></td><td>'+num(x.previous_m)+' m</td><td>'+num(x.current_m)+' m</td><td>'+(n(x.delta_m)&&Number(x.delta_m)>0?'+':'')+num(x.delta_m)+' m</td><td>'+num(x.namo_m)+' m</td><td>'+num(x.below_namo_m)+' m abajo</td></tr>').join('');
 const tonal=stations.find(x=>x.id==='san-jose-del-carmen');
 const bridge=(Array.isArray(rain)?rain:[]).filter(x=>/puente tonala/i.test((x.estacion||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''))).sort((a,b)=>Date.parse(b.fecha_hora||'')-Date.parse(a.fecha_hora||''))[0];
 root.innerHTML='<section class="panel wide"><h2>CONAGUA Golfo Centro · niveles</h2><p><b>Estado:</b> '+validity+' · Fuente: informe matutino '+esc(mat?.date||'s/d')+'. La fecha del informe no representa necesariamente la hora de observación.</p><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Escala anterior</th><th>Escala publicada</th><th>Variación</th><th>NAMO</th><th>Distancia NAMO</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="6">Sin escala oficial verificable</td></tr>')+'</tbody></table></div><p><a href="'+esc(mat?.url||'#')+'" target="_blank" rel="noopener noreferrer">Abrir PDF matutino oficial ↗</a></p><p><b>Vespertino:</b> '+esc(ves?.date||'s/d')+' · '+esc(ves?.status||'sin extracción verificada')+'. <a href="'+esc(ves?.url||'#')+'" target="_blank" rel="noopener noreferrer">PDF oficial ↗</a></p><p class="muted">No se mezcla un PDF histórico con el corte actual; los fines de semana se conserva la última fecha válida.</p></section>'+
 '<section class="panel wide"><h2>Río Tonalá · gráfica de evolución</h2>'+chart(doc?.history?.['san-jose-del-carmen'],tonal?.namo_m)+'</section>'+
 '<section class="panel wide"><h2>Lluvia asociada · Puente Tonalá (CONAGUA)</h2>'+(bridge?'<p>Reporte '+date(bridge.fecha_hora)+' · 24 h: '+num(bridge.lluvia_24h_precedentes_mm)+' mm · desde 08:00: '+num(bridge.lluvia_hoy_desde_08_mm)+' mm.</p>':'<p>Sin lectura disponible.</p>')+'</section>'+
 '<section class="panel wide"><h2>WeatherLink · vigilancia regional complementaria</h2><p class="muted">Estaciones ya consultadas por el Agente. La lluvia puntual no representa por sí sola el nivel del Tonalá. Se muestran ubicaciones de referencia, sin adjudicar subcuenca sin coordenadas verificadas.</p><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Ámbito</th><th>1 h</th><th>6 h</th><th>24 h</th><th>Última observación</th><th>Estado</th></tr></thead><tbody>'+ (weatherRows(weather)||'<tr><td colspan="7">Sin datos WeatherLink</td></tr>')+'</tbody></table></div></section>';
}
document.addEventListener('DOMContentLoaded',()=>{
 const content=document.getElementById('content');
 content?.addEventListener('app-rendered',e=>{if(e.detail?.section==='tonala')show()});
 document.getElementById('refreshBtn')?.addEventListener('click',()=>{if(document.querySelector('#nav button[data-section="tonala"].active'))setTimeout(show,500)});
 setInterval(()=>{if(document.querySelector('#nav button[data-section="tonala"].active'))show()},15*60000);
});
})();
