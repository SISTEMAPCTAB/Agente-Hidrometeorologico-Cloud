(() => {
  // 22-oct-2026 · Columna "Fecha y hora" en los cuadros de niveles (Resumen, Presas–Mezcalapa, Serranos, Tulijá, Usumacinta,
  // Coatzacoalcos–Tonalá y Presas). Sólo AGREGA una columna al final; no cambia datos, orden, estaciones ni otras columnas.
  const NIV='../data/niveles/Ultimo_Corte/ultimo_resumen.json',F1='../data/latest/FUENTE1.txt',F2='../data/latest/FUENTE2.txt',TON='../data/coatzacoalcos_tonala/latest.json';
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const fmt=iso=>{const t=Date.parse(iso||'');if(!Number.isFinite(t))return null;const p=new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(t));const g=k=>p.find(x=>x.type===k)?.value;return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`};
  let cache=null,loadedAt=0,busy=false;
  async function txt(u){try{const r=await fetch(u+'?v='+Date.now(),{cache:'no-store'});return r.ok?await r.text():''}catch{return ''}}
  async function load(){
    if(cache&&Date.now()-loadedAt<5*60000)return cache;
    const [niv,f1,f2,ton]=await Promise.all([txt(NIV),txt(F1),txt(F2),txt(TON)]);
    const map=new Map();
    try{for(const r of JSON.parse(niv||'[]')){const real=r.ultima_actualizacion_real||r.fecha_hora;const f=fmt(real);if(f)map.set(norm(r.estacion),{f,old:r.estado_dato&&r.estado_dato!=='observado'})}}catch{}
    const h1=(f1.match(/FECHA\/HORA MENSAJE:\s*(\S+)/)||[])[1],d1=(f1.match(/Presas\s+(\d{2})-(\d{2})-(\d{4})/)||[]);
    const lac=d1.length?`${d1[1]}/${d1[2]}/${d1[3]} · boletín OCFS`:(fmt(h1)||null);
    if(lac)map.set('lacantun',{f:lac,old:false});
    const d2=(f2.match(/Boletin del (\d{1,2}) de (\w+)\s+del (\d{4})/i)||[]),hh2=(f2.match(/DE\s+(\d{1,2}):(\d{2})\s*AM/i)||[]);
    const MES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
    const presas=d2.length&&MES[norm(d2[2])]?`${String(d2[1]).padStart(2,'0')}/${String(MES[norm(d2[2])]).padStart(2,'0')}/${d2[3]} ${String(hh2[1]||'08').padStart(2,'0')}:${hh2[2]||'00'}`:null;
    let tonala=null;try{const d=JSON.parse(ton||'{}')?.reports?.matutino?.date;if(/^\d{4}-\d{2}-\d{2}$/.test(d||''))tonala=`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)} · informe matutino`}catch{}
    cache={map,presas,tonala};loadedAt=Date.now();return cache;
  }
  function addCol(table,valueFor){
    const head=table.querySelector('thead tr');if(!head||[...head.cells].some(th=>norm(th.textContent)==='fecha y hora'))return;
    const th=document.createElement('th');th.textContent='Fecha y hora';head.appendChild(th);
    for(const tr of table.querySelectorAll('tbody tr')){if(tr.cells.length===1&&tr.cells[0].colSpan>1){tr.cells[0].colSpan+=1;continue}
      const td=document.createElement('td');const v=valueFor(tr);td.innerHTML=v?v:'s/d';tr.appendChild(td)}
  }
  function fillMissing(table,valueFor){ // filas agregadas después por otros scripts (p. ej., Lacantún)
    const head=table.querySelector('thead tr');const n=head?.cells.length||0;
    const idx=[...head.cells].findIndex(th=>norm(th.textContent)==='fecha y hora');
    for(const tr of table.querySelectorAll('tbody tr')){
      if(tr.cells.length===1&&tr.cells[0].colSpan>1)continue;
      if(tr.cells.length===n-1){const td=document.createElement('td');td.innerHTML=valueFor(tr)||'s/d';tr.appendChild(td);continue}
      const cell=idx>=0?tr.cells[idx]:null;if(cell&&norm(cell.textContent)==='s/d'){const v=valueFor(tr);if(v)cell.innerHTML=v}
    }
  }
  async function apply(){
    if(busy)return;busy=true;
    try{
      const c=await load();
      for(const table of document.querySelectorAll('#content table')){
        const hs=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
        const level=hs.includes('nivel')&&(hs.includes('dist. namo')||hs.some(h=>h.startsWith('δ')));
        const presa=hs[0]==='presa'&&hs.includes('nivel actual');
        if(!level&&!presa)continue;
        const tonala=!!table.closest('#tonala-root');
        const st=hs.indexOf('estacion');
        const val=tr=>{
          if(presa)return c.presas?c.presas+'<br><small>boletín CONAGUA</small>':null;
          if(tonala)return c.tonala;
          const cell=tr.cells[st>=0?st:0];const name=norm((cell?.querySelector('b')?.textContent)||cell?.textContent||'');
          const r=c.map.get(name)||[...c.map.entries()].find(([k])=>name.startsWith(k))?.[1];
          return r?r.f+(r.old?'<br><small>dato anterior</small>':''):null;
        };
        addCol(table,val);fillMissing(table,val);
      }
    }finally{busy=false}
  }
  let t=null;const schedule=(ms=400)=>{if(t)return;t=setTimeout(()=>{t=null;apply()},ms)}; // sin reiniciar: otros scripts mutan el contenido seguido
  document.addEventListener('DOMContentLoaded',()=>{
    const content=document.getElementById('content');
    if(content)new MutationObserver(()=>schedule(500)).observe(content,{childList:true,subtree:true});
    document.getElementById('refreshBtn')?.addEventListener('click',()=>{cache=null;schedule(1500)});
    schedule(1500);
    setInterval(()=>{if(!document.hidden)schedule(0)},5000);
  });
})();
