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

 const p=items.find(x=>norm(x.str)==='PENITAS');
 if(!p)throw new Error('No se encontró fila Peñitas.');
 const sameRow=items.filter(x=>Math.abs(x.y-p.y)<=3.2&&x.x>p.x+5).sort((a,b)=>a.x-b.x);
 const nums=sameRow.map(x=>({raw:x.str,x:x.x,v:toNum(x.str)})).filter(x=>Number.isFinite(x.v));
 if(nums.length<8)throw new Error(`Fila Peñitas incompleta: ${nums.length} valores numéricos.`);

 // Formato Tabasco: Capac. total, capac. cons., elev. anterior, almac. anterior,
 // elev. actual, %NAMO, dif. almac., Ext. Prom. 24 h, precip., dif. nivel, dif. NAME.
 const q=nums[7].v;
 if(!(q>=0&&q<=3000))throw new Error(`Extracción Peñitas fuera de rango de control: ${q}`);

 const stamp=hour==null?null:`${date}T${String(hour).padStart(2,'0')}:00:00-06:00`;
 const record={
   fecha_hora:stamp,
   fecha:date,
   hora:hour,
   q_penitas_m3s:q,
   fuente:'boletin_hidrometrico_horario',
   asunto:subject,
   message_id:messageId,
   archivo:path.basename(pdfPath),
   validacion:'fila_penitas_columna_ext_prom_24h',
   parser:'penitas_horaria_v1',
   fila_valores:nums.map(x=>x.v)
 };

 const dir=path.join(base,'Pronostico_Hidrologico_Prueba');
 const histFile=path.join(dir,'penitas_extraccion_horaria.json');
 const lastFile=path.join(dir,'penitas_extraccion_ultima.json');
 let hist=loadJson(histFile,[]);
 const key=`${record.fecha_hora||date}|${messageId}`;
 const map=new Map(hist.map(r=>[`${r.fecha_hora||r.fecha}|${r.message_id}`,r]));
 map.set(key,record);
 hist=[...map.values()].sort((a,b)=>String(a.fecha_hora||a.fecha).localeCompare(String(b.fecha_hora||b.fecha)));
 saveJson(histFile,hist);
 saveJson(lastFile,record);
 console.log(`OK PEÑITAS HORARIA: ${record.fecha_hora||date} = ${q.toFixed(2)} m3/s`);
})().catch(e=>{console.error('ERROR PEÑITAS HORARIA:',e.stack||e.message);process.exit(1)});
