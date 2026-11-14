(()=>{
'use strict';
// Encabezado en todo lo que se copia (14-nov-2026, Gilberto): "Toda tabla, gráfico, mapa etc. que tenga la opción de copiar en el Agente y el
// modelo lleve un encabezado: Modelo Grijalva-Usumacinta Rubio/Segovia, fecha y hora simplificada en una sola línea".
// Un solo punto: se envuelve navigator.clipboard. Imagen PNG -> franja de una línea arriba; texto y HTML -> primera línea.
// Fecha y hora = último corte de niveles observado (la del dato, no la de la copia). Si algo falla, se copia como antes.
const ETIQUETA='Modelo Grijalva-Usumacinta Rubio/Segovia';
const URL_CORTE=(typeof BASE==='string'&&BASE?BASE:'..')+'/data/niveles/Ultimo_Corte/ultimo_resumen.json';
let corte=null;
async function leerCorte(){
 try{
  if(typeof DATA!=='undefined'&&Array.isArray(DATA?.levels)&&DATA.levels.length){corte=ultimo(DATA.levels);return}
  const r=await fetch(URL_CORTE+'?v='+Date.now(),{cache:'no-store'});if(r.ok)corte=ultimo(await r.json());
 }catch(e){}
}
function ultimo(rows){const t=(Array.isArray(rows)?rows:[]).filter(x=>!x.estado_dato||x.estado_dato==='observado').map(x=>Date.parse(x.fecha_hora||'')).filter(Number.isFinite);return t.length?Math.max(...t):null}
function texto(){
 const t=Number.isFinite(corte)?corte:Date.now();
 const p=Object.fromEntries(new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return `${ETIQUETA} · ${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} h`;
}
async function png(blob){
 const img=await createImageBitmap(blob);const s=Math.max(1,img.width/1000);const h=Math.round(34*s);
 const c=document.createElement('canvas');c.width=img.width;c.height=img.height+h;const g=c.getContext('2d');
 g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#1f3b57';g.fillRect(0,0,c.width,h);
 g.fillStyle='#ffffff';g.font=`600 ${Math.round(17*s)}px Arial, sans-serif`;g.textBaseline='middle';g.fillText(texto(),Math.round(12*s),h/2);
 g.drawImage(img,0,h);return await new Promise((ok,no)=>c.toBlob(b=>b?ok(b):no(new Error('PNG')),'image/png'));
}
const esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function conEncabezado(tipo,b){
 if(tipo==='image/png')return png(b);
 if(tipo==='text/plain')return new Blob([texto()+'\n'+await b.text()],{type:tipo});
 if(tipo==='text/html')return new Blob([`<p style="font:600 13px Arial,sans-serif;color:#1f3b57;margin:0 0 6px">${esc(texto())}</p>`+await b.text()],{type:tipo});
 return b;
}
function instalar(){
 const cb=navigator.clipboard;if(!cb||cb.__encabezadoRS)return;cb.__encabezadoRS=true;
 const write=cb.write?.bind(cb),writeText=cb.writeText?.bind(cb);
 if(write&&window.ClipboardItem)cb.write=items=>{
  try{
   const nuevos=items.map(it=>{const o={};for(const t of it.types)o[t]=it.getType(t).then(b=>conEncabezado(t,b)).catch(()=>it.getType(t));return new ClipboardItem(o)});
   return write(nuevos).catch(()=>write(items));
  }catch(e){return write(items)}
 };
 if(writeText)cb.writeText=t=>writeText(texto()+'\n'+t).catch(()=>writeText(t));
}
window.encabezadoCopiaRS=texto;
instalar();leerCorte();setInterval(leerCorte,5*60000);
})();
