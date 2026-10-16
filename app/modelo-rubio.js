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
 const head='<tr><th rowspan="2">Estación</th><th colspan="3">H+24</th><th colspan="3">H+36</th><th colspan="3">H+72</th></tr><tr>'+'<th>Nivel</th><th>Gasto</th><th>Situación</th>'.repeat(3)+'</tr>';
 const rows=d.estaciones.map(e=>'<tr><td><b>'+esc(e.estacion)+'</b></td>'+['h24','h36','h72'].map(k=>'<td>'+m(e[k]?.nivel_m)+'</td><td>'+q(e[k]?.gasto_m3s)+'</td><td>'+sit(e[k]?.situacion)+'</td>').join('')+'</tr>').join('');
 const picos=(d.picos_sierra||[]).map(p=>'<tr><td><b>'+esc(p.estacion)+'</b></td><td>'+q(p.gasto_m3s)+' m³/s</td><td>'+m(p.nivel_m)+'</td><td>'+esc(p.hora)+'</td></tr>').join('');
 const estado=fresh?'<span style="color:#15803d"><b>Vigente</b></span>':'<span style="color:#b45309"><b>Desactualizado</b> · la PC del modelo no ha publicado en '+(Number.isFinite(age)?age.toFixed(0)+' h':'s/d')+'</span>';
 root.innerHTML=
  '<section class="panel wide"><h2>Modelo Rubio/SegAMH · pronóstico 0–72 h</h2>'+
  '<p class="muted">Corrida '+esc(d.version||'')+' · calculada '+fdate(d.calculado_utc)+' · '+estado+'<br>Lluvia futura: '+esc(d.lluvia_futura||'s/d')+'</p>'+
  '<div class="table-wrap"><table><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div></section>'+
  (picos?'<section class="panel wide"><h2>Picos esperados 0–72 h · Sierra</h2><div class="table-wrap"><table><thead><tr><th>Estación</th><th>Gasto pico</th><th>Nivel pico</th><th>Hora</th></tr></thead><tbody>'+picos+'</tbody></table></div><p class="muted">Los picos pueden caer entre las columnas H+36 y H+72 del cuadro.</p></section>':'')+
  '<section class="panel wide"><p class="muted">'+(d.notas||[]).map(esc).join('<br>')+'<br>Modelo hidrológico experimental del Dr. Horacio Rubio Gutiérrez, desarrollo AMH Sección Tabasco (SegAMH). Gasto en m³/s.</p></section>';
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('content')?.addEventListener('app-rendered',e=>{if(e.detail?.section==='modelo')show()});
});
})();
