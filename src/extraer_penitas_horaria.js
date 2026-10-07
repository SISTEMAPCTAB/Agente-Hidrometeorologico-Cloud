const fs=require('fs');
const path=require('path');

function arg(name,fallback=null){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback}
const pdfPath=arg('--pdf'),subject=arg('--subject',''),messageId=arg('--message-id',''),base=arg('--base');
if(!pdfPath||!base){console.error('Faltan --pdf o --base');process.exit(2)}

function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
function toNum(s){let t=String(s).trim();if(!t)return null;t=t.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'');if(t.includes(',')&&!t.includes('.'))t=t.replace(',','.');else t=t.replace(/,/g,'');const v=Number(t);return Number.isFinite(v)?v:null}
function parseDate(text){const t=norm(text),m=t.match(/(?:A|DEL|FECHA:?\s*)\s*(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);if(!m)return new Date().toISOString().slice(0,10);const mo={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12}[m[2]];return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`}
function targetHour(s){const n=norm(s);let m=n.match(/(?:DE LAS|LAS|DE)\s*(\d{1,2})(?::00)?\s*(?:HR|HRS|HORA|HORAS|AM|PM)?/);if(m){let h=Number(m[1]);if(/PM/.test(n)&&h<12)h+=12;return h}if(/8\s*AM/.test(n)||/8:00/.test(n))return 8;return null}
async function extract(pdf){const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const data=new Uint8Array(fs.readFileSync(pdf));const doc=await pdfjs.getDocument({data,disableWorker:true}).promise;const page=await doc.getPage(1);const tc=await page.getTextContent();return tc.items.map(it=>({str:String(it.str||'').trim(),x:Number(it.transform?.[4]||0),y:Number(it.transform?.[5]||0)})).filter(it=>it.str)}

function saveJson(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(obj,null,2))}
function loadJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}

(async()=>{
 const items=await extract(pdfPath);
 const allText=items.map(x=>x.str).join(' ');
 const date=parseDate(allText);
 const hour=targetHour(subject);
 const extHeader=items.some(x=>/EXT\.?\s*PROM|EXT\.?.*PROM|PROM\.?/.test(norm(x.str))) || /EXT\.?\s*PROM/.test(norm(allText));
 if(!extHeader)throw new Error('No se reconoció encabezado de extracción promedio en el formato.');

 function rowNums(label){
   const p=items.find(x=>norm(x.str)===norm(label));
   if(!p)return [];
   return items.filter(x=>Math.abs(x.y-p.y)<=3.2&&x.x>p.x+5)
     .sort((a,b)=>a.x-b.x)
     .map(x=>({raw:x.str,x:x.x,v:toNum(x.str)}))
     .filter(x=>Number.isFinite(x.v));
 }

 const pen=rowNums('Peñitas');
 if(pen.length<8)throw new Error(`Fila Peñitas incompleta: ${pen.length} valores numéricos.`);
 // Formato Tabasco: Capac. total, capac. cons., elev. anterior, almac. anterior,
 // elev. actual, %NAMO, dif. almac., Ext. Prom. 24 h, precip., dif. nivel, dif. NAME.
 const qPen=pen[7].v;
 if(!(qPen>=0&&qPen<=3000))throw new Error(`Extracción Peñitas fuera de rango de control: ${qPen}`);

 const pla=rowNums('Platanar');
 // Formato de la fila hidrométrica: escala/gasto máximo, escala/gasto NAMO,
 // escala/gasto día anterior, escala/gasto actual. En el formato observado
 // de Tabasco los cuatro valores visibles útiles de Platanar son:
 // escala anterior, gasto anterior, escala actual, gasto actual.
 const qPla=pla.length>=4?pla[3].v:null;
 const hPla=pla.length>=3?pla[2].v:null;
 if(qPla!==null && !(qPla>=0&&qPla<=5000))throw new Error(`Gasto Platanar fuera de rango de control: ${qPla}`);

 const stamp=hour==null?null:`${date}T${String(hour).padStart(2,'0')}:00:00-06:00`;
 const record={
   fecha_hora:stamp,
   fecha:date,
   hora:hour,
   q_penitas_m3s:qPen,
   q_platanar_m3s:qPla,
   h_platanar_m:hPla,
   q_suma_sin_transito_m3s:qPla===null?null:qPen+qPla,
   fuente:'boletin_hidrometrico_horario',
   asunto:subject,
   message_id:messageId,
   archivo:path.basename(pdfPath),
   validacion_penitas:'fila_penitas_columna_ext_prom_24h',
   validacion_platanar:qPla===null?'platanar_no_identificado':'fila_platanar_gasto_actual',
   parser:'macayo_entradas_horarias_v2',
   fila_penitas:pen.map(x=>x.v),
   fila_platanar:pla.map(x=>x.v),
   advertencia:'q_suma_sin_transito_m3s es sólo diagnóstico; no equivale automáticamente a gasto instantáneo en Macayo.'
 };

 const dir=path.join(base,'Pronostico_Hidrologico_Prueba');
 const histFile=path.join(dir,'macayo_entradas_horarias.json');
 const lastFile=path.join(dir,'macayo_entradas_ultima.json');
 let hist=loadJson(histFile,[]);
 const key=`${record.fecha_hora||date}|${messageId}`;
 const map=new Map(hist.map(r=>[`${r.fecha_hora||r.fecha}|${r.message_id}`,r]));
 map.set(key,record);
 hist=[...map.values()].sort((a,b)=>String(a.fecha_hora||a.fecha).localeCompare(String(b.fecha_hora||b.fecha)));
 saveJson(histFile,hist);
 saveJson(lastFile,record);

 // Compatibilidad con la primera prueba de Peñitas.
 saveJson(path.join(dir,'penitas_extraccion_horaria.json'),hist.map(r=>({
   fecha_hora:r.fecha_hora,fecha:r.fecha,hora:r.hora,q_penitas_m3s:r.q_penitas_m3s,
   fuente:r.fuente,asunto:r.asunto,message_id:r.message_id,archivo:r.archivo,
   validacion:r.validacion_penitas,parser:r.parser
 })));
 saveJson(path.join(dir,'penitas_extraccion_ultima.json'),{
   fecha_hora:record.fecha_hora,fecha:record.fecha,hora:record.hora,q_penitas_m3s:record.q_penitas_m3s,
   fuente:record.fuente,asunto:record.asunto,message_id:record.message_id,archivo:record.archivo,
   validacion:record.validacion_penitas,parser:record.parser
 });

 console.log(`OK MACAYO ENTRADAS: ${record.fecha_hora||date} · Peñitas=${qPen.toFixed(2)} m3/s · Platanar=${qPla===null?'s/d':qPla.toFixed(2)} m3/s`);
})().catch(e=>{console.error('ERROR PEÑITAS HORARIA:',e.stack||e.message);process.exit(1)});
