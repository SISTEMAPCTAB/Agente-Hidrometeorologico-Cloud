(()=>{
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 const INVALID=['balancan','emiliano zapata','jonuta','centla / tres brazos','centla/tres brazos'];
 function isInvalidCard(card){
  const title=norm(card.querySelector('strong')?.textContent||card.firstElementChild?.textContent||'');
  return INVALID.includes(title);
 }
 function clean(){
  if(norm(document.getElementById('pageTitle')?.textContent)!=='usumacinta')return;
  const content=document.getElementById('content');
  if(!content)return;
  [...content.querySelectorAll('.ucu-node')].forEach(card=>{if(isInvalidCard(card))card.remove()});
  [...content.querySelectorAll('article,div')].forEach(card=>{
   if(card.classList.contains('ucu-downstream-context'))return;
   const txt=norm(card.textContent);
   if(!txt||txt.length>100)return;
   if(INVALID.some(n=>txt===n+' s/d'||txt===n+'s/d'))card.remove();
  });
  const chain=content.querySelector('.ucu-mexico-chain');
  if(chain&&!chain.querySelector('.ucu-downstream-context')){
   const note=document.createElement('article');
   note.className='ucu-node ucu-context ucu-downstream-context';
   note.innerHTML='<div class="ucu-node-top"><span class="ucu-country">México</span><strong>Seguimiento territorial aguas abajo</strong></div><b>Balancán → Emiliano Zapata → Jonuta → Centla</b><small>Secuencia territorial de seguimiento. No se muestran como puntos de medición en esta cadena.</small>';
   chain.appendChild(note);
  }
  [...content.querySelectorAll('.ucu-node')].forEach(card=>{
   if(norm(card.querySelector('strong')?.textContent)==='lacantun'){
    const b=card.querySelector('b');if(b)b.textContent='Aporte hidrológico de contexto';
    const s=card.querySelector('small');if(s)s.textContent='No se presenta como punto de medición en esta cadena; se integra sólo como aporte hidrológico cuando exista información oficial trazable.';
   }
  });
 }
 const obs=new MutationObserver(()=>clean());
 obs.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('DOMContentLoaded',()=>setTimeout(clean,0));
 window.addEventListener('load',()=>{clean();setTimeout(clean,200);setTimeout(clean,1000)});
 document.addEventListener('click',()=>setTimeout(clean,50));
 setInterval(clean,1500);
})();