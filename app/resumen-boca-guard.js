(function(){
  const original=window.summaryLevelRows;
  if(typeof original!=='function') return;

  window.summaryLevelRows=function(){
    const rows=original();
    if(!Array.isArray(rows)) return rows;
    if(rows.some(r=>norm(r.estacion)==='boca del cerro')) return rows;

    const boca=levels().find(r=>norm(r.estacion)==='boca del cerro');
    if(!boca) return rows;

    const out=[...rows];
    const sanPedro=out.findIndex(r=>norm(r.estacion)==='san pedro');
    out.splice(sanPedro>=0?sanPedro:out.length,0,boca);
    return out;
  };
})();
