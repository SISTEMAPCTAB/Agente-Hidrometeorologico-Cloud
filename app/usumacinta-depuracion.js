(()=>{
 const INVALID_DOWNSTREAM=['Balancán','Emiliano Zapata','Jonuta','Centla / Tres Brazos'];
 function clean(){
  const root=document.getElementById('upperUsumacintaChain');
  if(!root)return;
  const chain=root.querySelector('.ucu-mexico-chain');
  if(chain){
   [...chain.querySelectorAll('.ucu-node')].forEach(card=>{
    const title=card.querySelector('strong')?.textContent?.trim()||'';
    if(INVALID_DOWNSTREAM.includes(title))card.remove();
   });
   if(!chain.querySelector('.ucu-downstream-context')){
    const note=document.createElement('article');
    note.className='ucu-node ucu-context ucu-downstream-context';
    note.innerHTML='<div class="ucu-node-top"><span class="ucu-country">México</span><strong>Seguimiento territorial aguas abajo</strong></div><b>Balancán → Emiliano Zapata → Jonuta → Centla</b><small>Secuencia territorial del río Usumacinta. No se presentan como estaciones de medición ni se espera un dato puntual en estos municipios salvo que se incorpore una estación oficial específica.</small>';
    chain.appendChild(note);
   }
  }
  const lac=[...root.querySelectorAll('.ucu-node')].find(card=>card.querySelector('strong')?.textContent?.trim()==='Lacantún');
  if(lac){
   const b=lac.querySelector('b'); if(b)b.textContent='Aporte hidrológico de contexto';
   const s=lac.querySelector('small'); if(s)s.textContent='No se presenta como estación de medición en esta App. Sólo se incorpora cuando exista una fuente oficial puntual y trazable.';
  }
 }
 const obs=new MutationObserver(clean);
 obs.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('click',()=>setTimeout(clean,50));
 window.addEventListener('load',()=>setTimeout(clean,150));
 setInterval(clean,3000);
})();