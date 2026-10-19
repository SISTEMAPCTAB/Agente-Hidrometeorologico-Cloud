(()=>{
'use strict';
// Apartado "Modelo Rubio/SegAMH": sólo lectura de data/modelo_rubio/latest.json, que publica la PC
// del modelo local. No altera fuentes, semáforos ni otros apartados del agente.
const SRC='../data/modelo_rubio/latest.json';
// El agente ya se actualiza solo cada 5 min y al volver a la pestaña: se oculta el botón manual.
const st=document.createElement('style');st.textContent='#refreshBtn{display:none!important}';document.head.appendChild(st);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ok=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
const m=v=>ok(v)?Number(v).toFixed(2)+' m':'—';
const q=v=>ok(v)?Number(v).toFixed(1):'—';
const fdate=v=>{const d=new Date(v);return Number.isFinite(+d)?d.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'s/d'};
const sit=t=>{const s=String(t||'');const c=/emergencia|alarma/i.test(s)?'#9b1c1c':/alerta/i.test(s)?'#c2410c':/prevenci/i.test(s)?'#a16207':'#15803d';return '<b style="color:'+c+'">'+esc(s||'s/d')+'</b>'};
let seq=0;
async function show(){
 const root=document.getElementById('modelo-rubio-root');if(!root)return;const id=++seq;
 let d=null;try{const r=await fetch(SRC+'?v='+Date.now(),{cache:'no-store'});if(r.ok)d=await r.json()}catch(_){}
 if(id!==seq||!document.getElementById('modelo-rubio-root'))return;
 if(!d||!Array.isArray(d.estaciones)){root.innerHTML='<section class="panel wide"><h2>Modelo Rubio/SegAMH</h2><p>Aún no hay una corrida publicada por la PC del modelo.</p></section>';return}
 const age=(Date.now()-Date.parse(d.calculado_utc||''))/3600000;
 const fresh=Number.isFinite(age)&&age<=6;
 const conPico=d.estaciones.some(e=>e.pico);
 const head='<tr><th rowspan="2">Río · estación</th><th colspan="3">H+24</th><th colspan="3">H+36</th><th colspan="3">H+72</th>'+(conPico?'<th rowspan="2">Pico 0–72 h</th>':'')+'</tr><tr>'+'<th>Nivel</th><th>Gasto</th><th>Situación</th>'.repeat(3)+'</tr>';
 const rows=d.estaciones.map(e=>'<tr><td><b>'+esc(e.estacion)+'</b></td>'+['h24','h36','h72'].map(k=>'<td>'+m(e[k]?.nivel_m)+'</td><td>'+q(e[k]?.gasto_m3s)+'</td><td>'+sit(e[k]?.situacion)+'</td>').join('')+(conPico?'<td>'+esc(e.pico||'—')+'</td>':'')+'</tr>').join('');
 const alto=new Map((d.picos_sierra_alto||[]).map(p=>[p.estacion,p]));
 const picos=(d.picos_sierra||[]).map(p=>{const a=alto.get(p.estacion);return '<tr><td><b>'+esc(p.estacion)+'</b></td><td>'+q(p.gasto_m3s)+' m³/s</td><td>'+m(p.nivel_m)+'</td><td>'+esc(p.hora)+'</td>'+(alto.size?'<td>'+(a?q(a.gasto_m3s)+' m³/s · '+m(a.nivel_m)+'<br><small>'+esc(a.hora)+'</small>':'—')+'</td>':'')+'</tr>'}).join('');
 const estado=fresh?'<span style="color:#15803d"><b>Vigente</b></span>':'<span style="color:#b45309"><b>Desactualizado</b> · la PC del modelo no ha publicado en '+(Number.isFinite(age)?age.toFixed(0)+' h':'s/d')+'</span>';
 const al=Array.isArray(d.alertas_cabecera)?d.alertas_cabecera:[];
 const aviso=al.length&&fresh?'<section class="panel wide" style="border-left:6px solid #b91c1c;background:#fef2f2"><h2 style="color:#b91c1c">⚠ Lluvia intensa observada en cabecera</h2><p>'+al.map(a=>'<b>'+esc(a.estacion)+'</b>: '+esc(a.mm3h)+' mm en 3 h · '+esc(a.mm6h)+' mm en 6 h → río <b>'+esc(a.rio)+'</b>').join('<br>')+'</p><p class="muted">Para esos ríos considerar el escenario alto y la tendencia observada por encima del pronóstico central. Umbral: ≥30 mm en 3 h o ≥50 mm en 6 h (WeatherLink).</p></section>':'';
 // Lluvia acumulada frente a crecidas mayores (exportado por el modelo desde V106l).
 const la=d.lluvia_acumulada,mm=v=>ok(v)?Math.round(v)+' mm':'s/d';
 const col=x=>x.pct_mediana==null?'#666':(x.maximo_mm&&x.total_mm>=x.maximo_mm)?'#9b1c1c':x.pct_mediana>=100?'#c2410c':x.pct_mediana>=50?'#a16207':'#15803d';
 const acu=la&&Array.isArray(la.rios)&&la.rios.length?'<section class="panel wide"><h2>Lluvia acumulada frente a crecidas mayores</h2>'+
  '<p style="background:#f8fafc;border-left:4px solid #64748b;padding:8px 10px"><b>Qué se analiza:</b> '+esc(la.explicacion||'')+'</p>'+
  '<div class="table-wrap"><table><thead><tr><th>Río · estación</th><th>Observada</th><th>Pronosticada 0–96 h</th><th>SMN 360 h'+(la.smn360_validez?' <small>('+esc(la.smn360_validez)+')</small>':'')+'</th><th>Total</th><th>Crecidas mayores (mediana)</th><th>Lectura</th></tr></thead><tbody>'+
  la.rios.map(x=>'<tr><td><b>'+esc(x.rio)+'</b></td><td>'+mm(x.observada_mm)+(x.dias_obs<x.dias_tot?' <small>('+esc(x.dias_obs)+'/'+esc(x.dias_tot)+' días)</small>':'')+'</td><td>'+mm(x.pronosticada_96h_mm)+'</td><td>'+mm(x.smn360_mm)+'</td><td><b>'+mm(x.total_mm)+'</b></td><td>'+(ok(x.mediana_mm)?mm(x.mediana_mm)+'<br><small>máx.: '+mm(x.maximo_mm)+' · '+esc(x.maximo_txt||'')+'</small>':'—')+'</td><td>'+
   (x.pct_mediana==null?'<span style="color:#666">'+esc(x.lectura)+'</span>':'<b style="color:'+col(x)+'">'+esc(x.pct_mediana)+' % de la mediana</b>'+(ok(x.pct_maximo)?' <span style="color:#555">· '+esc(x.pct_maximo)+' % del máximo</span>':'')+'<br><span style="color:'+col(x)+'">'+esc(x.lectura)+'</span>')+'</td></tr>').join('')+
  '</tbody></table></div><p class="muted">Lluvia observada: cortes SIH de 24 h'+(la.observada_hasta?' hasta el '+esc(la.observada_hasta):'')+'. SMN 360 h convertido a lluvia media con ×0.3 (indicativo). No es un pronóstico de nivel.</p></section>':'';
 root.innerHTML=aviso+
  '<section class="panel wide"><h2>Modelo Rubio/SegAMH · pronóstico 0–72 h</h2>'+
  '<p class="muted">Corrida '+esc(d.version||'')+' · calculada '+fdate(d.calculado_utc)+' · '+estado+'<br>Lluvia futura: '+esc(d.lluvia_futura||'s/d')+'</p>'+
  '<div class="table-wrap"><table><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div><p class="muted">Río La Sierra en Pueblo Nuevo (Centro): ya incluye los ríos Tacotalpa (Tapijulapa), Teapa y Puyacatengo.</p></section>'+
  (picos?'<section class="panel wide"><h2>Picos esperados 0–72 h · Sierra</h2><div class="table-wrap"><table><thead><tr><th>Río · estación</th><th>Gasto pico</th><th>Nivel pico</th><th>Hora</th>'+((d.picos_sierra_alto||[]).length?'<th>Escenario alto (boletín SMN)</th>':'')+'</tr></thead><tbody>'+picos+'</tbody></table></div><p class="muted">Los picos pueden caer entre las columnas H+36 y H+72 del cuadro. Escenario alto: lluvia del boletín SMN 96 h del día convertida a su percentil 90 observado; no es el pronóstico central.</p></section>':'')+
  acu+
 '<section class="panel wide"><p class="muted">'+(d.notas||[]).map(esc).join('<br>')+'<br>Modelo hidrológico experimental del Dr. Horacio Rubio Gutiérrez, desarrollo AMH Sección Tabasco (SegAMH). Aforos, curvas escala–gasto y topografía de Gaviotas: Dr. J. Enrique León Jiménez (UJAT). Gasto en m³/s.</p></section>';
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('content')?.addEventListener('app-rendered',e=>{if(e.detail?.section==='modelo')show()});
});
})();
