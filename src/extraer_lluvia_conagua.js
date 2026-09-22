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
function esc(v){ return `"${String(v??'').replace(/"/g,'""')}"`; }
function parseDate(text){
  const t=norm(text);
  const m=t.match(/(?:A|DEL)\s+(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);
  if(!m)return new Date().toISOString().slice(0,10);
  const mo={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12}[m[2]];
  return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}
function targetHour(subj){
  const s=norm(subj);
  const m=s.match(/(?:DE LAS|LAS|DE)\s*(\d{1,2})(?::00)?\s*(?:HR|HRS|HORA|HORAS|AM)/);
  if(m)return Number(m[1]);
  if(/8\s*AM/.test(s)||/8:00/.test(s))return 8;
  return null;
}

async function pageItems(file,pageNo){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data=new Uint8Array(fs.readFileSync(file));
  const doc=await pdfjs.getDocument({data,disableWorker:true}).promise;
  if(doc.numPages < pageNo) throw new Error(`PDF tiene ${doc.numPages} páginas; no existe página ${pageNo}`);
  const page=await doc.getPage(pageNo); const tc=await page.getTextContent();
  return tc.items.map(it=>({str:String(it.str||'').trim(),x:Number(it.transform?.[4]||0),y:Number(it.transform?.[5]||0),w:Number(it.width||0),h:Number(it.height||0)})).filter(it=>it.str);
}

function groupByY(items,tol=2.4){
  const sorted=[...items].sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const it of sorted){
    let row=rows.find(r=>Math.abs(r.y-it.y)<=tol);
    if(!row){ row={y:it.y,items:[]}; rows.push(row); }
    row.items.push(it); row.y=row.items.reduce((a,z)=>a+z.y,0)/row.items.length;
  }
  for(const r of rows) r.items.sort((a,b)=>a.x-b.x);
  return rows.sort((a,b)=>b.y-a.y);
}

function centers(items){ return items.map(i=>({...i,cx:i.x+i.w/2})); }
function nearest(items,x,tol){
  let best=null;
  for(const it of items){ const d=Math.abs((it.x+it.w/2)-x); if(d<=(best?.d??tol)){best={it,d};} }
  return best&&best.d<=tol?best.it:null;
}

function detectBlocks(items){
  const ci=centers(items);
  const stationHeaders=ci.filter(i=>norm(i.str)==='ESTACION');
  const aHeaders=ci.filter(i=>norm(i.str)==='A');
  const hoyHeaders=ci.filter(i=>norm(i.str)==='HOY');
  const blocks=[];
  for(const sh of stationHeaders){
    const nearbyA=aHeaders.filter(h=>Math.abs(h.y-sh.y)<=20 && h.cx>sh.cx).sort((a,b)=>a.cx-b.cx)[0];
    const nearbyHoy=hoyHeaders.filter(h=>Math.abs(h.y-sh.y)<=20 && h.cx>sh.cx).sort((a,b)=>a.cx-b.cx)[0];
    if(nearbyA && nearbyHoy && nearbyHoy.cx>nearbyA.cx){
      blocks.push({stationX:sh.cx,aX:nearbyA.cx,hoyX:nearbyHoy.cx,headerY:Math.min(sh.y,nearbyA.y,nearbyHoy.y)});
    }
  }
  blocks.sort((a,b)=>a.stationX-b.stationX);
  return blocks.filter((b,i,a)=>i===0||Math.abs(b.stationX-a[i-1].stationX)>20);
}

function cleanStationName(parts){
  let s=parts.map(p=>p.str).join(' ').replace(/\s+/g,' ').trim();
  s=s.replace(/^\*+\s*/,'').trim();
  return s;
}
function isSectionLabel(name){
  const n=norm(name);
  return !name ||
    /^RIO\b/.test(n) || /^SUBCUENCA\b/.test(n) || /^PRECIPITACION\b/.test(n) ||
    /^ESTACION\b/.test(n) || /^AYER\b/.test(n) || /^HOY\b/.test(n) ||
    /^DATOS DE ESCALAS\b/.test(n) || /^DATOS DE PRECIPITACION\b/.test(n);
}

function extractRain(items,date,hour){
  const blocks=detectBlocks(items);
  if(!blocks.length) return {blocks:[],rows:[],diagnostic:'No se detectaron bloques ESTACIÓN / A / HOY en página 2.'};
  const yRows=groupByY(items);
  const out=[];
  for(let bi=0;bi<blocks.length;bi++){
    const b=blocks[bi];
    const nextX=blocks[bi+1]?.stationX ?? Infinity;
    const left=Math.max(0,b.stationX-35);
    const right=Number.isFinite(nextX)?(nextX-18):(b.hoyX+45);
    for(const row of yRows){
      if(row.y>=b.headerY-3) continue;
      const inside=row.items.filter(i=>(i.x+i.w/2)>=left && (i.x+i.w/2)<=right);
      if(!inside.length) continue;
      const stationParts=inside.filter(i=>(i.x+i.w/2)<b.aX-10 && !isNumeric(i.str));
      const name=cleanStationName(stationParts);
      if(isSectionLabel(name)) continue;
      // La tabla de aforos comparte página y contiene cifras ajenas a lluvia.
      // Exigir que cada lectura esté en su propia columna y dentro del bloque
      // de precipitación; una cifra cercana por posición no es prueba suficiente.
      const aItem=nearest(inside.filter(i=>isNumeric(i.str)),b.aX,6);
      const hoyItem=nearest(inside.filter(i=>isNumeric(i.str)),b.hoyX,6);
      if(name.length<2) continue;
      // Control de integridad: el reporte de presas contiene una estación
      // PEÑITAS distinta de la estación de precipitación del cuadro inferior.
      // No atribuir cifras de la tabla de aforos ni de otra tabla a Peñitas.
      if(norm(name)==='PENITAS' && aItem && toNum(aItem.str)>150){
        console.warn(`Lectura de Peñitas ${aItem.str} mm fuera de rango de validación; se publica sin_dato hasta cotejo de fuente.`);
        out.push({fecha_hora:`${date}T${String(hour??8).padStart(2,'0')}:00:00-06:00`,hora_corte:hour,bloque:bi+1,estacion:name,lluvia_24h_precedentes_mm:null,lluvia_hoy_desde_08_mm:hoyItem?toNum(hoyItem.str):null,estado_24h:'sin_dato',estado_hoy:hoyItem?'observado':'sin_dato',fuente:'CONAGUA-reporte-horario',asunto:subject,message_id:messageId,advertencia:'Lectura de Peñitas pendiente de cotejo con el boletín original'});
        continue;
      }
      out.push({
        fecha_hora:`${date}T${String(hour??8).padStart(2,'0')}:00:00-06:00`,
        hora_corte:hour,
        bloque:bi+1,
        estacion:name,
        lluvia_24h_precedentes_mm:aItem?toNum(aItem.str):null,
        lluvia_hoy_desde_08_mm:hoyItem?toNum(hoyItem.str):null,
        estado_24h:aItem?'observado':'sin_dato',
        estado_hoy:hoyItem?'observado':'sin_dato',
        fuente:'CONAGUA-reporte-horario',
        asunto:subject,
        message_id:messageId
      });
    }
  }
  const seen=new Map();
  for(const r of out) seen.set(`${r.bloque}|${norm(r.estacion)}`,r);
  return {blocks,rows:[...seen.values()],diagnostic:null};
}

function previousDate(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return null;
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])-1));
  return d.toISOString().slice(0,10);
}
function hourOf(iso){
  const m=String(iso||'').match(/T(\d{2}):/); return m?Number(m[1]):null;
}
function previous24Block(hist,row){
  const day=previousDate(row.fecha_hora); if(!day)return null;
  const wantedHour=hourOf(row.fecha_hora);
  const candidates=hist.filter(x=>
    norm(x?.estacion)===norm(row.estacion) &&
    String(x?.fecha_hora||'').slice(0,10)===day &&
    norm(x?.estado_24h)==='OBSERVADO' &&
    Number.isFinite(Number(x?.lluvia_24h_precedentes_mm))
  );
  if(!candidates.length)return null;
  candidates.sort((a,b)=>{
    const ah=hourOf(a.fecha_hora), bh=hourOf(b.fecha_hora);
    const ad=(wantedHour==null||ah==null)?99:Math.abs(ah-wantedHour);
    const bd=(wantedHour==null||bh==null)?99:Math.abs(bh-wantedHour);
    if(ad!==bd)return ad-bd;
    return new Date(b.fecha_hora)-new Date(a.fecha_hora);
  });
  return candidates[0];
}

(async()=>{
  const items=await pageItems(pdfPath,2);
  const allText=items.map(i=>i.str).join(' ');
  const date=parseDate(allText);
  const hour=targetHour(subject);
  const result=extractRain(items,date,hour);
  const dir=path.join(base,'Lluvia_CONAGUA'); fs.mkdirSync(dir,{recursive:true});
  const latestRows=result.rows;

  const histFile=path.join(dir,'historico.json'); let hist=[]; try{hist=JSON.parse(fs.readFileSync(histFile,'utf8'))}catch{}
  hist=hist.filter(r=>!isSectionLabel(r?.estacion));

  // Acumulado móvil de 48 h = bloque oficial de 24 h vigente + bloque oficial
  // de 24 h del día previo para la misma estación. Sólo se calcula cuando
  // ambos bloques son observados; un faltante nunca se convierte a cero.
  for(const r of latestRows){
    const prev=previous24Block(hist,r);
    const currentOk=norm(r.estado_24h)==='OBSERVADO' && Number.isFinite(Number(r.lluvia_24h_precedentes_mm));
    const prevOk=prev && Number.isFinite(Number(prev.lluvia_24h_precedentes_mm));
    r.lluvia_48h_precedentes_mm=(currentOk&&prevOk)
      ? Number(r.lluvia_24h_precedentes_mm)+Number(prev.lluvia_24h_precedentes_mm)
      : null;
    r.estado_48h=(currentOk&&prevOk)?'observado':'sin_dato';
    r.fecha_referencia_48h=prev?.fecha_hora||null;
  }

  fs.writeFileSync(path.join(dir,'ultimo_corte.json'),JSON.stringify(latestRows,null,2));

  const key=r=>`${r.fecha_hora}|${norm(r.estacion)}`;
  const map=new Map(hist.map(r=>[key(r),r])); for(const r of latestRows)map.set(key(r),r);
  hist=[...map.values()].sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora)||String(a.estacion).localeCompare(String(b.estacion)));
  fs.writeFileSync(histFile,JSON.stringify(hist,null,2));

  const hdr=['fecha_hora','estacion','lluvia_24h_precedentes_mm','estado_24h','lluvia_48h_precedentes_mm','estado_48h','fecha_referencia_48h','lluvia_hoy_desde_08_mm','estado_hoy','fuente'];
  fs.writeFileSync(path.join(dir,'ultimo_corte.csv'),hdr.join(',')+'\n'+latestRows.map(r=>hdr.map(h=>esc(r[h])).join(',')).join('\n'));

  const explicitZeros24=latestRows.filter(r=>r.lluvia_24h_precedentes_mm===0).length;
  const explicitZerosHoy=latestRows.filter(r=>r.lluvia_hoy_desde_08_mm===0).length;
  const blanks24=latestRows.filter(r=>r.lluvia_24h_precedentes_mm==null).length;
  const blanks48=latestRows.filter(r=>r.lluvia_48h_precedentes_mm==null).length;
  const blanksHoy=latestRows.filter(r=>r.lluvia_hoy_desde_08_mm==null).length;
  const state={
    complete:latestRows.length>0,
    fecha_reporte:date,
    hora_objetivo:hour,
    pagina_fuente:2,
    bloques_precipitacion_detectados:result.blocks.length,
    estaciones_detectadas:latestRows.length,
    modo:latestRows.length?'precipitacion_conagua_validada_por_estructura':'sin_datos_precipitacion',
    significado_campos:{
      lluvia_24h_precedentes_mm:'PRECIPITACIÓN REGISTRADA A LAS 8:00 HR, ACUMULADA EN LAS 24:00 HR PRECEDENTES (A)',
      lluvia_48h_precedentes_mm:'ACUMULADO MÓVIL DE 48 H: suma del bloque oficial de 24 h vigente y el bloque oficial de 24 h del día previo para la misma estación; sólo con ambos bloques observados.',
      lluvia_hoy_desde_08_mm:'PRECIPITACIÓN ACUMULADA A PARTIR DE LAS 8:00 HR DEL DÍA ACTUAL (HOY)'
    },
    regla_blancos:'Celda en blanco = sin_dato; nunca se convierte a 0 mm. Solo se conserva 0 cuando CONAGUA publica explícitamente cero.',
    conteo:{blancos_24h:blanks24,blancos_48h:blanks48,blancos_hoy:blanksHoy,ceros_explicitos_24h:explicitZeros24,ceros_explicitos_hoy:explicitZerosHoy},
    diagnostic:result.diagnostic
  };
  fs.writeFileSync(path.join(dir,'Estado_Lluvia_CONAGUA.json'),JSON.stringify(state,null,2));
  console.log(`Lluvia CONAGUA pág.2: ${latestRows.length} estaciones; blancos 48h=${blanks48}; blancos HOY=${blanksHoy}; ceros HOY=${explicitZerosHoy}.`);
  if(!latestRows.length) process.exit(3);
})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});
