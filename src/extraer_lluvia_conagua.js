const fs = require('fs');
const path = require('path');

function arg(name, fallback=null){ const i=process.argv.indexOf(name); return i>=0?process.argv[i+1]:fallback; }
const pdfPath=arg('--pdf');
const subject=arg('--subject','');
const messageId=arg('--message-id','');
const base=arg('--base','data/niveles');
if(!pdfPath){ console.error('Falta --pdf'); process.exit(2); }

function norm(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim(); }
function isNumeric(s){ return /^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(String(s).trim()); }
function toNum(s){ const n=Number(String(s).replace(/,/g,'')); return Number.isFinite(n)?n:null; }
function median(arr){ const a=[...arr].sort((x,y)=>x-y); if(!a.length)return null; return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2; }
function parseDate(text){
  const t=norm(text);
  const m=t.match(/(?:A|DEL)\s+(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);
  if(!m)return new Date().toISOString().slice(0,10);
  const mo={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12}[m[2]];
  return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}
function targetHour(subj){ const s=norm(subj); const m=s.match(/(?:DE LAS|LAS|DE)\s*(\d{1,2})(?::00)?\s*(?:HR|HRS|HORA|HORAS|AM)/); if(m)return Number(m[1]); if(/8\s*AM/.test(s)||/8:00/.test(s))return 8; return null; }
async function itemsPage1(file){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data=new Uint8Array(fs.readFileSync(file));
  const doc=await pdfjs.getDocument({data,disableWorker:true}).promise;
  const page=await doc.getPage(1); const tc=await page.getTextContent();
  return tc.items.map(it=>({str:String(it.str||'').trim(),x:Number(it.transform?.[4]||0),y:Number(it.transform?.[5]||0),w:Number(it.width||0),h:Number(it.height||0)})).filter(it=>it.str);
}
function hourRows(items){
  return items.filter(it=>/^\d{2}:00$/.test(it.str)).map(hi=>({hour:Number(hi.str.slice(0,2)),y:hi.y,hourX:hi.x,cells:items.filter(it=>Math.abs(it.y-hi.y)<=2.6&&it.x>hi.x+4&&isNumeric(it.str)).sort((a,b)=>a.x-b.x)}));
}
function riverColumns(rows,wanted){
  const c=rows.filter(r=>r.cells.length>=15&&(wanted==null||r.hour<=wanted)).sort((a,b)=>b.cells.length-a.cells.length||b.hour-a.hour);
  if(!c.length)return null; const xs=c[0].cells.map(z=>z.x).sort((a,b)=>a-b); const river=xs.slice(-15); const gaps=river.slice(1).map((x,i)=>x-river[i]); const med=median(gaps)||20;
  return {xs:river,tol:Math.max(5,med*.48)};
}
function isRiverX(x,river){ return river && river.xs.some(rx=>Math.abs(rx-x)<=river.tol); }
function clusterXs(rows,river){
  const xs=[];
  for(const r of rows) for(const c of r.cells) if(!isRiverX(c.x,river)) xs.push(c.x);
  xs.sort((a,b)=>a-b); const out=[]; const tol=6;
  for(const x of xs){ const g=out.find(z=>Math.abs(z.x-x)<=tol); if(g){g.values.push(x);g.x=g.values.reduce((a,b)=>a+b,0)/g.values.length}else out.push({x,values:[x]}); }
  return out.filter(g=>g.values.length>=2).sort((a,b)=>a.x-b.x);
}
function inferHeader(items,x,minRowY,maxRowY){
  const candidates=items.filter(it=>it.y>maxRowY+3 && Math.abs((it.x+it.w/2)-x)<=32 && !/^\d{2}:00$/.test(it.str));
  const chosen=candidates.sort((a,b)=>b.y-a.y).slice(0,5).sort((a,b)=>a.y-b.y);
  return chosen.map(z=>z.str).join(' ').replace(/\s+/g,' ').trim();
}
function rainLike(label){ const n=norm(label); return /(PRECIP|LLUV|PLUV|RAIN|P\.P\.|PP\b)/.test(n); }
function esc(v){ return `"${String(v??'').replace(/"/g,'""')}"`; }

(async()=>{
  const items=await itemsPage1(pdfPath); const rows=hourRows(items); const wanted=targetHour(subject);
  if(!rows.length){ console.log('Lluvia CONAGUA: sin filas horarias detectadas.'); process.exit(0); }
  const river=riverColumns(rows,wanted); const clusters=clusterXs(rows,river); const minY=Math.min(...rows.map(r=>r.y)),maxY=Math.max(...rows.map(r=>r.y));
  const columns=clusters.map((g,i)=>({id:`col_${i+1}`,x:g.x,label:inferHeader(items,g.x,minY,maxY)}));
  const rainCols=columns.filter(c=>rainLike(c.label));
  const selected=rainCols.length?rainCols:columns;
  const date=parseDate(items.map(i=>i.str).join(' '));
  const target=(wanted==null?rows.at(-1)?.hour:wanted);
  const usable=rows.filter(r=>target==null||r.hour<=target).sort((a,b)=>a.hour-b.hour);
  const out=[];
  for(const r of usable){
    for(const col of selected){
      const cell=r.cells.reduce((best,c)=>{ const d=Math.abs(c.x-col.x); return d<(best?.d??Infinity)?{c,d}:best; },null);
      const val=(cell&&cell.d<=7)?toNum(cell.c.str):null;
      out.push({fecha_hora:`${date}T${String(r.hour).padStart(2,'0')}:00:00-06:00`,hora:r.hour,columna_id:col.id,estacion:col.label||col.id,lluvia_mm:val,estado_dato:val==null?'sin_dato':'observado',fuente:'CONAGUA-reporte-horario',asunto:subject,message_id:messageId});
    }
  }
  const dir=path.join(base,'Lluvia_CONAGUA'); fs.mkdirSync(dir,{recursive:true});
  const latestRows=out.filter(r=>r.hora===target);
  fs.writeFileSync(path.join(dir,'ultimo_corte.json'),JSON.stringify(latestRows,null,2));
  const histFile=path.join(dir,'historico.json'); let hist=[]; try{hist=JSON.parse(fs.readFileSync(histFile,'utf8'))}catch{}
  const key=r=>`${r.fecha_hora}|${r.columna_id}`; const map=new Map(hist.map(r=>[key(r),r])); for(const r of out)map.set(key(r),r); hist=[...map.values()].sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora)||a.columna_id.localeCompare(b.columna_id));
  fs.writeFileSync(histFile,JSON.stringify(hist,null,2));
  const hdr=['fecha_hora','estacion','lluvia_mm','estado_dato','fuente'];
  fs.writeFileSync(path.join(dir,'ultimo_corte.csv'),hdr.join(',')+'\n'+latestRows.map(r=>hdr.map(h=>esc(r[h])).join(',')).join('\n'));
  const state={complete:true,fecha_reporte:date,hora_objetivo:target,columnas_detectadas:columns.length,columnas_lluvia_identificadas:rainCols.length,modo:rainCols.length?'encabezado_lluvia_detectado':'columnas_no_hidrometricas_en_revision',regla_blancos:'Celda en blanco = sin_dato; nunca se convierte a 0 mm. Solo se conserva 0 cuando CONAGUA publica explícitamente cero.',columnas:selected.map(c=>({id:c.id,etiqueta:c.label,x:Number(c.x.toFixed(1))})),latest_count:latestRows.length};
  fs.writeFileSync(path.join(dir,'Estado_Lluvia_CONAGUA.json'),JSON.stringify(state,null,2));
  console.log(`Lluvia CONAGUA: ${latestRows.length} registros de corte; modo=${state.modo}; lluvia identificada=${rainCols.length}/${columns.length}.`);
})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});
