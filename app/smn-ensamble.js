(()=>{
'use strict';
// Apartado "SMN ensamble · lluvia por subcuenca": sólo lectura de data/smn_ensamble/latest.json,
// que publica la PC del modelo una vez al día. Se inserta debajo del SMN 96 h en "Pronóstico".
// No modifica ningún otro apartado; si el archivo no existe o falla, no muestra nada.
const SRC='../data/smn_ensamble/latest.json';
const ID='smn-ens-panel';
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const active=()=>document.querySelector('#nav button.active')?.dataset.section||'resumen';
// Colores propios de la escala SMN (de menor a mayor intensidad), independientes de otros apartados.
const COL={'Extraordinarias':['#eee6ff','#5b2a86'],'Torrenciales':['#fde2e2','#8f1838'],'Intensas':['#ffe6cc','#9a4a00'],'Muy fuertes':['#fff4b8','#6f5b00'],'Fuertes':['#e3eeff','#174a7a'],'Chubascos':['#edf0f2','#4d5358'],'Aisladas':['#f5f5f5','#6d7176'],'Sin lluvia':['#f5f5f5','#6d7176']};
const chip=c=>{const k=COL[c]||['#edf0f2','#5e646a'];return '<span class="rain-intensity" style="background:'+k[0]+';color:'+k[1]+'">'+esc(c||'s/d')+'</span>'};
const TZ='America/Mexico_City';
const dia=v=>{const d=new Date(v);return Number.isFinite(+d)?d.toLocaleDateString('es-MX',{timeZone:TZ,weekday:'short',day:'numeric'}):'s/d'};
const fecha=v=>{const d=new Date(v);return Number.isFinite(+d)?d.toLocaleString('es-MX',{timeZone:TZ,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'s/d'};
const diaUTC=v=>{const d=new Date(v);return Number.isFinite(+d)?d.toLocaleDateString('es-MX',{timeZone:'UTC',day:'numeric',month:'short'}):'s/d'};
const num=v=>Number.isFinite(Number(v))?Number(v).toFixed(0):'—';
let data=null,loadedAt=0,busy=false;

function html(d){
 const now=Date.now();
 const idx=(d.ventanas||[]).map((w,i)=>({w,i})).filter(x=>Date.parse(x.w.fin_local)>now).slice(0,4);
 if(!idx.length)return '<h2>SMN ensamble · lluvia por subcuenca</h2><p>La corrida publicada ya no cubre los próximos días. Se actualizará con la siguiente descarga del FTP.</p>';
 const ageH=(now-Date.parse(d.corrida_utc))/3600000;
 const vieja=Number.isFinite(ageH)&&ageH>48;
 const head='<tr><th>Subcuenca</th>'+idx.map(x=>'<th>'+esc(dia(x.w.inicio_local))+'<br><small class="muted">08–08 h</small></th>').join('')+'</tr>';
 const rows=(d.subcuencas||[]).map(s=>'<tr><td><b>'+esc(s.nombre)+'</b></td>'+idx.map(x=>{
   const v=s.dias?.[x.i];if(!v)return '<td>s/d</td>';
   return '<td>'+chip(v.categoria_max)+'<br><b>'+num(v.max_mm)+' mm</b> máx.<br><small class="muted">prom. '+num(v.promedio_mm)+' mm</small></td>';
 }).join('')+'</tr>').join('');
 return '<h2>SMN ensamble · lluvia por subcuenca</h2>'+
  '<div class="maturity-row"><span class="badge '+(vieja?'warn':'ok')+'">Corrida 00z del '+esc(diaUTC(d.corrida_utc))+'</span><span class="badge">Actualizado '+esc(fecha(d.generado_utc))+'</span>'+(vieja?'<span class="badge warn">Corrida con más de 48 h</span>':'')+'</div>'+
  '<p>Categoría del <b>punto más lluvioso</b> de cada subcuenca, con la escala SMN de 24 h, para compararla con el pronóstico oficial. Debajo, el <b>promedio</b> de la subcuenca, que es lo que usa el modelo hidrológico.</p>'+
  '<div class="table-wrap"><table><thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>'+
  '<div class="section-note">Fuente: SMN · FTP de modelos numéricos (ensamble 00z), procesado en la PC del modelo hidrológico. Recuadros aproximados, no polígonos oficiales de cuenca. El máximo es sin corrección; el promedio lleva la corrección de sesgo del modelo. La categoría oficial es la del pronóstico SMN; esta tabla sirve para ubicar en qué subcuencas y días se concentra la lluvia.</div>';
}

async function render(){
 if(busy||active()!=='pronostico')return;
 const content=document.getElementById('content');if(!content)return;
 const target=[...content.querySelectorAll('section.panel,div.panel')].find(p=>{const t=norm(p.querySelector('h2')?.textContent);return t.includes('smn')&&t.includes('96 h')&&!t.includes('360')&&p.id!==ID});
 if(!target)return;
 const existing=document.getElementById(ID);
 if(existing&&Date.now()-loadedAt<5*60*1000&&existing.previousElementSibling===target)return;
 busy=true;
 try{
  if(!data||Date.now()-loadedAt>=5*60*1000){
   const r=await fetch(SRC+'?v='+Date.now(),{cache:'no-store'});
   data=r.ok?await r.json():null;loadedAt=Date.now();
  }
  if(!data||!Array.isArray(data.subcuencas)){document.getElementById(ID)?.remove();return}
  let panel=document.getElementById(ID);
  if(!panel){panel=document.createElement('section');panel.id=ID;panel.className='panel wide'}
  panel.innerHTML=html(data);
  if(target.nextElementSibling!==panel)target.after(panel);
 }catch(_){/* sin panel si la fuente falla */}
 finally{busy=false}
}

document.addEventListener('DOMContentLoaded',()=>{
 setTimeout(render,1200);
 document.getElementById('nav')?.addEventListener('click',()=>setTimeout(render,900));
 const c=document.getElementById('content')||document.body;
 new MutationObserver(()=>{if(active()==='pronostico'&&!document.getElementById(ID))setTimeout(render,300)}).observe(c,{childList:true,subtree:true});
 setInterval(()=>{if(active()==='pronostico'){loadedAt=0;document.getElementById(ID)&&render()}},5*60*1000);
});
})();
