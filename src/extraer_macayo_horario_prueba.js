const fs=require('fs');
const path=require('path');

function arg(name,fallback=null){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:fallback}
const pdfPath=arg('--pdf'),subject=arg('--subject',''),messageId=arg('--message-id',''),base=arg('--base');
if(!pdfPath||!base){console.error('Faltan --pdf o --base');process.exit(2)}

function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
function toNum(s){let t=String(s).trim();if(!t)return null;t=t.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'');if(t.includes(',')&&!t.includes('.'))t=t.replace(',','.');else t=t.replace(/,/g,'');const v=Number(t);return Number.isFinite(v)?v:null}
function parseDate(text){const t=norm(text),m=t.match(/(?:A|DEL|FECHA:?\s*)\s*(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);if(!m)return new Date().toISOString().slice(0,10);const mo={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12}[m[2]];return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`}
function targetHour(s){const n=norm(s);let m=n.match(/(?:DE LAS|LAS|DE)\s*(\d{1,2})(?::00)?\s*(?:HR|HRS|HORA|HORAS|AM|PM)?/);if(m){let h=Number(m[1]);if(/PM/.test(n)&&h<12)h+=12;return h}if(/8\s*AM/.test(n)||/8:00/.test(n))return 8;return null}
async function extract(pdf){const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const data=new Uint8Array(fs.readFileSync(pdf));const doc=await pdfjs.getDocument({data,disableWorker:true}).promise;const out=[];for(let pageNo=1;pageNo<=doc.numPages;pageNo++){const page=await doc.getPage(pageNo);const tc=await page.getTextContent();for(const it of tc.items){const str=String(it.str||'').trim();if(str)out.push({str,x:Number(it.transform?.[4]||0),y:Number(it.transform?.[5]||0),page:pageNo})}}return out}
function save(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(obj,null,2))}
function load(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}

(async()=>{
 const items=await extract(pdfPath),allText=items.map(x=>x.str).join(' ');
 const date=parseDate(allText),hour=targetHour(subject);
 function numbersFromString(s){
   return [...String(s||'').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'').matchAll(/-?\d+(?:[.,]\d+)?/g)]
     .map(m=>toNum(m[0])).filter(Number.isFinite);
 }
 function rowNums(label){
   const nl=norm(label);
   const p=items.find(x=>norm(x.str)===nl || norm(x.str).startsWith(nl+' '));
   if(!p)return [];
   const own=norm(p.str).startsWith(nl+' ')?numbersFromString(p.str).map(v=>({raw:String(v),x:p.x,v})):[];
   const same=items.filter(x=>Math.abs(x.y-p.y)<=4.0&&x!==p&&x.x>p.x-1).sort((a,b)=>a.x-b.x)
     .flatMap(x=>numbersFromString(x.str).map(v=>({raw:x.str,x:x.x,v})));
   const out=[...own,...same].sort((a,b)=>a.x-b.x);
   if(out.length)return out;
   // Respaldo textual: algunos PDF entregan toda la fila como un solo bloque.
   const flat=items.map(x=>x.str).join(' ');
   const m=flat.match(new RegExp(label+'\\s+([^A-Za-zÁÉÍÓÚÑ]+)','i'));
   return m?numbersFromString(m[1]).map(v=>({raw:String(v),x:0,v})):[];
 }
 const pen=rowNums('Peñitas');
 const pla=rowNums('Platanar');

 function operationalPenitas(){
   try{
     const g=JSON.parse(fs.readFileSync(path.join('data','pronostico_hidrologico','gastos_conagua.json'),'utf8'));
     const p=(g.estaciones||[]).find(x=>x.estacion==='Peñitas');
     return Number.isFinite(Number(p?.q_actual_m3s))?Number(p.q_actual_m3s):null;
   }catch(_){return null}
 }

 function explicitHourlyExtraction(){
   const hits=[];
   for(let i=0;i<items.length;i++){
     const n=norm(items[i].str);
     if(!/(EXTRACC|EXT\.?\s*PROM|TURBIN|VERTEDOR)/.test(n))continue;
     const p=items[i], near=items.filter(x=>x.page===p.page&&Math.abs(x.y-p.y)<=8&&Math.abs(x.x-p.x)<=180);
     for(const x of near){
       for(const v of numbersFromString(x.str)){
         if(v>=0&&v<=3000)hits.push({v,page:x.page,x:x.x,y:x.y,raw:x.str,anchor:p.str});
       }
     }
   }
   if(!hits.length)return null;
   // Sólo aceptar un candidato si es único para evitar confundir precipitación, elevación u otra columna.
   const uniq=[...new Set(hits.map(h=>h.v))];
   if(uniq.length!==1)return null;
   return hits.find(h=>h.v===uniq[0])||null;
 }

 function latestReservoirLevel(label){
   const nl=norm(label), head=items.find(x=>x.page===1&&(norm(x.str)===nl||norm(x.str).startsWith(nl+' ')));
   if(!head)return null;
   const rows=items.filter(x=>x.page===1&&x.y<head.y&&x.y>300&&Math.abs(x.x-head.x)<=16)
     .map(x=>({v:toNum(x.str),x:x.x,y:x.y,raw:x.str})).filter(x=>Number.isFinite(x.v));
   if(!rows.length)return null;
   rows.sort((a,b)=>a.y-b.y); // menor y = hora más reciente dentro del bloque
   return rows[0];
 }

 const explicitPen=explicitHourlyExtraction();
 const dailyPen=operationalPenitas();
 const qPen=explicitPen?explicitPen.v:dailyPen;
 if(!Number.isFinite(qPen))throw new Error('No existe extracción validada de Peñitas para la prueba shadow');

 // El formato horario 07-oct (12:00 y 14:00) NO publica gasto actual de Platanar.
 // NAME=34.65 y NAMO=32.28 son escalas de referencia; 1,104 y 150 son gastos de NAME/NAMO,
 // no gasto observado actual. Por tanto no se infiere Q de Platanar.
 const qPla=null;
 const hPla=null;
 const penLevel=latestReservoirLevel('Peñitas');
 const plaLevel=latestReservoirLevel('Platanar');

 const stamp=hour==null?null:`${date}T${String(hour).padStart(2,'0')}:00:00-06:00`;
 const rec={
   fecha_hora:stamp,fecha:date,hora:hour,
   q_penitas_m3s:qPen,q_platanar_m3s:qPla,h_platanar_m:hPla,
   q_suma_sin_transito_m3s:null,
   nivel_embalse_penitas_m:penLevel?penLevel.v:null,
   nivel_platanar_horario_m:plaLevel?plaLevel.v:null,
   fuente:'CONAGUA-reporte-horario + gasto Peñitas validado',asunto:subject,message_id:messageId,
   archivo:path.basename(pdfPath),parser:'macayo_shadow_v3_conservador',
   cambio_extraccion_horario_detectado:Boolean(explicitPen),
   validacion_penitas:explicitPen?'extraccion_explicita_horaria':'sin_cambio_explicito_horario_se_conserva_ultimo_gasto_validado',
   validacion_platanar:'sin_gasto_actual_publicado_en_formato_horario',
   evidencia_extraccion_horaria:explicitPen,
   advertencia:'PRUEBA AISLADA: no se suma Platanar mientras no exista gasto actual observado. NAME/NAMO no son gasto actual. Peñitas sólo cambia si el formato horario publica explícitamente una nueva extracción.'
 };
 const dir=path.join('data','pronostico_hidrologico','prueba_macayo');
 const histFile=path.join(dir,'entradas_horarias.json'),lastFile=path.join(dir,'ultima_entrada.json');
 let hist=load(histFile,[]),key=`${rec.fecha_hora||rec.fecha}|${messageId}`;
 const m=new Map(hist.map(r=>[`${r.fecha_hora||r.fecha}|${r.message_id}`,r]));m.set(key,rec);
 hist=[...m.values()].sort((a,b)=>String(a.fecha_hora||a.fecha).localeCompare(String(b.fecha_hora||b.fecha)));
 save(histFile,hist);save(lastFile,rec);
 console.log(`SHADOW MACAYO ${rec.fecha_hora||date}: Peñitas=${qPen.toFixed(2)} Platanar=${qPla===null?'s/d':qPla.toFixed(2)}`);
})().catch(e=>{console.error('SHADOW MACAYO:',e.message);process.exit(1)});
