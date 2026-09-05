(()=>{
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 const INVALID=['balancan','emiliano zapata','jonuta','centla / tres brazos','centla/tres brazos'];
 function invalidTitle(el){
  const candidates=[
   el.querySelector?.('strong')?.textContent,
   el.querySelector?.('h1,h2,h3,h4')?.textContent,
   el.firstElementChild?.textContent
  ].map(norm).filter(Boolean);
  return INVALID.some(x=>candidates.some(t=>t===x));
 }
 function clean(){
  const content=document.getElementById('content');
  if(!content)return;
  const upper=content.querySelector('#upperUsumacintaChain,.upper-usumacinta');
  const scope=upper||content;

  // Elimina cualquier tarjeta que presente estos municipios como puntos de medición.
  [...scope.querySelectorAll('article,.ucu-node,.station-card,.source-card,.card,.ucu-mexico-chain>div')].forEach(card=>{
   if(card.classList?.contains('ucu-downstream-context'))return;
   if(!invalidTitle(card))return;
   const txt=norm(card.textContent);
   if(txt.includes('s/d')||txt.includes('dato puntual')||card.closest('.ucu-mexico-chain'))card.remove();
  });

  // Barrido de seguridad para contenedores simples renderizados por otros módulos.
  [...scope.querySelectorAll('div')].forEach(card=>{
   if(card.classList?.contains('ucu-downstream-context'))return;
   const txt=norm(card.textContent);
   if(txt.length>140)return;
   for(const name of INVALID){
    if(txt===`${name} s/d`||txt===`${name}s/d`){ card.remove(); break; }
   }
  });

  const chain=scope.querySelector('.ucu-mexico-chain');
  if(chain&&!chain.querySelector('.ucu-downstream-context')){
   const note=document.createElement('article');
   note.className='ucu-node ucu-context ucu-downstream-context';
   note.innerHTML='<div class="ucu-node-top"><span class="ucu-country">México</span><strong>Seguimiento territorial aguas abajo</strong></div><b>Balancán → Emiliano Zapata → Jonuta → Centla</b><small>Secuencia territorial del río Usumacinta. No son puntos de medición en esta App.</small>';
   chain.appendChild(note);
  }

  [...scope.querySelectorAll('.ucu-node,article')].forEach(card=>{
   if(norm(card.querySelector('strong')?.textContent)==='lacantun'){
    const b=card.querySelector('b'); if(b)b.textContent='Aporte hidrológico de contexto';
    const s=card.querySelector('small'); if(s)s.textContent='No se presenta como punto de medición; sólo se integra como aporte hidrológico cuando exista información oficial trazable.';
   }
  });
 }
 const obs=new MutationObserver(clean);
 obs.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('DOMContentLoaded',()=>{clean();setTimeout(clean,100);setTimeout(clean,600)});
 window.addEventListener('load',()=>{clean();setTimeout(clean,250);setTimeout(clean,1200)});
 document.addEventListener('click',()=>setTimeout(clean,30));
 setInterval(clean,1000);
})();