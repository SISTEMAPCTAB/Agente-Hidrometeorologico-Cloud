const fs = require("fs");
const path = require("path");

function arg(name, fallback=null){
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i+1] : fallback;
}
const pdfPath = arg("--pdf");
const subject = arg("--subject","");
const messageId = arg("--message-id","");
const base = arg("--base");

if(!pdfPath || !base){
  console.error("Faltan argumentos --pdf o --base");
  process.exit(2);
}

const STATIONS = [
  {rio:"Río Samaria", estacion:"Samaria", namo:14.90, name:18.50},
  {rio:"Río Carrizal", estacion:"González", namo:8.77, name:10.20},
  {rio:"Ríos de la Sierra", estacion:"Oxolotán", namo:39.53, name:47.37},
  {rio:"Ríos de la Sierra", estacion:"Tapijulapa", namo:24.63, name:28.15},
  {rio:"Ríos de la Sierra", estacion:"Teapa", namo:37.71, name:39.56},
  {rio:"Ríos de la Sierra", estacion:"Puyacatengo", namo:29.65, name:31.35},
  {rio:"Ríos de la Sierra", estacion:"San Joaquín", namo:23.12, name:26.66},
  {rio:"Ríos de la Sierra", estacion:"Pueblo Nuevo", namo:7.49, name:8.40},
  {rio:"Río Grijalva", estacion:"Gaviotas", namo:7.00, name:7.85},
  {rio:"Río Grijalva", estacion:"El Muelle", namo:null, name:7.23},
  {rio:"Río Grijalva", estacion:"Porvenir", namo:4.74, name:6.67},
  {rio:"Río Tulijá", estacion:"Salto de Agua", namo:10.99, name:14.72},
  {rio:"Río Puxcatán", estacion:"Macuspana", namo:9.85, name:12.78},
  {rio:"Río San Pedro", estacion:"San Pedro", namo:9.01, name:9.77},
  {rio:"Río Usumacinta", estacion:"Boca del Cerro", namo:19.21, name:21.57}
];

function norm(s){
  return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/\s+/g," ").trim();
}
function parseDate(text){
  const t=norm(text);
  const m=t.match(/(?:A|DEL)\s+(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);
  if(!m) return new Date().toISOString().slice(0,10);
  const mo={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12}[m[2]];
  return `${m[3]}-${String(mo).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
}
function targetHour(subject){
  const s=norm(subject);
  let m=s.match(/(?:DE LAS|LAS|DE)\s*(\d{1,2})(?::00)?\s*(?:HR|HRS|HORA|HORAS|AM)/);
  if(m) return Number(m[1]);
  if(/8\s*AM/.test(s)||/8:00/.test(s)) return 8;
  return null;
}
function isNumeric(s){
  return /^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(String(s).trim());
}
function toNum(s){
  const v=Number(String(s).replace(/,/g,""));
  return Number.isFinite(v)?v:null;
}
function median(arr){
  const a=[...arr].sort((x,y)=>x-y);
  if(!a.length) return null;
  return a.length%2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2;
}

async function extractPage1Geometry(pdfFile){
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfFile));
  const doc = await pdfjs.getDocument({data, disableWorker:true}).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  return tc.items.map(it=>({
    str:String(it.str||"").trim(),
    x:Number(it.transform?.[4]||0),
    y:Number(it.transform?.[5]||0),
    w:Number(it.width||0),
    h:Number(it.height||0)
  })).filter(it=>it.str);
}

function groupHourRows(items){
  const hourItems=items.filter(it=>/^\d{2}:00$/.test(it.str));
  const rows=[];
  for(const hi of hourItems){
    const hour=Number(hi.str.slice(0,2));
    const near=items.filter(it=>Math.abs(it.y-hi.y)<=2.6 && it.x>hi.x+5 && isNumeric(it.str))
      .sort((a,b)=>a.x-b.x);
    rows.push({hour,y:hi.y,hourX:hi.x,cells:near});
  }
  return rows;
}

function establishRiverColumns(rows,wanted){
  const candidates=rows.filter(r=>r.cells.length>=15 && (wanted==null || r.hour<=wanted));
  if(!candidates.length) return null;
  candidates.sort((a,b)=>{
    if(b.cells.length!==a.cells.length) return b.cells.length-a.cells.length;
    return b.hour-a.hour;
  });
  const ref=candidates[0];
  const xs=ref.cells.map(c=>c.x).sort((a,b)=>a-b);
  const riverXs=xs.slice(-15);
  const gaps=riverXs.slice(1).map((x,i)=>x-riverXs[i]);
  const med=median(gaps)||20;
  return {riverXs,tolerance:Math.max(5,med*0.48),referenceHour:ref.hour,referenceCount:ref.cells.length};
}

function mapTargetRow(row,columns){
  if(!row) return Array(15).fill(null);
  const result=Array(15).fill(null);
  for(const cell of row.cells){
    let best=-1,bestDist=Infinity;
    columns.riverXs.forEach((x,i)=>{
      const d=Math.abs(cell.x-x);
      if(d<bestDist){bestDist=d;best=i;}
    });
    if(best>=0 && bestDist<=columns.tolerance){
      result[best]=toNum(cell.str);
    }
  }
  return result;
}

function loadHistory(file){
  if(!fs.existsSync(file)) return [];
  try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return []}
}
function realRows(history,station){
  return history.filter(r=>
    r.estacion===station &&
    Number.isFinite(r.nivel) &&
    (r.estado_dato==null || r.estado_dato==="observado")
  ).sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora));
}
function allRows(history,station){
  return history.filter(r=>r.estacion===station && Number.isFinite(r.nivel))
    .sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora));
}
function lastReal(history,station){
  const rows=realRows(history,station);
  return rows.length?rows.at(-1):null;
}
function atOrBefore(rows,target){
  const q=rows.filter(r=>new Date(r.fecha_hora).getTime()<=target);
  return q.length?q.at(-1):null;
}
function deltaWindow(history,station,hours){
  const rows=realRows(history,station);
  if(!rows.length)return null;
  const last=rows.at(-1);
  const a=atOrBefore(rows,new Date(last.fecha_hora).getTime()-hours*3600000);
  return a?last.nivel-a.nivel:null;
}
function trend(history,station){
  const rows=realRows(history,station);
  if(rows.length<2)return {label:"Sin tendencia suficiente",arrow:"",delta:null};
  const d=rows.at(-1).nivel-rows.at(-2).nivel,eps=.01;
  if(Math.abs(d)<=eps)return {label:"Estable",arrow:"→",delta:d};
  if(d>0){
    if(rows.length>=3){
      const p=rows.at(-2).nivel-rows.at(-3).nivel;
      if(p>eps && d>p*1.5)return {label:"Ascenso acelerado",arrow:"↑↑",delta:d};
      if(p<-eps)return {label:"Cambio a ascenso",arrow:"↗",delta:d};
    }
    return {label:"Ascenso",arrow:"↑",delta:d};
  }
  if(rows.length>=3){
    const p=rows.at(-2).nivel-rows.at(-3).nivel;
    if(p<-eps && Math.abs(d)>Math.abs(p)*1.5)return {label:"Descenso acelerado",arrow:"↓↓",delta:d};
    if(p>eps)return {label:"Cambio a descenso",arrow:"↘",delta:d};
  }
  return {label:"Descenso",arrow:"↓",delta:d};
}
function windowSeries(history,station,hours){
  const rows=allRows(history,station);
  if(!rows.length)return [];
  const end=new Date(rows.at(-1).fecha_hora).getTime();
  const start=end-hours*3600000;
  const anchor=atOrBefore(rows,start);
  const inside=rows.filter(r=>new Date(r.fecha_hora).getTime()>start && new Date(r.fecha_hora).getTime()<=end);
  return anchor?[anchor,...inside]:inside;
}
function saveHistory(history,jsonFile,csvFile){
  fs.writeFileSync(jsonFile,JSON.stringify(history,null,2));
  const cols=["fecha_hora","rio","estacion","nivel","namo","name","fuente","asunto","message_id","hora_fuente","estado_dato","ultima_actualizacion_real"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  fs.writeFileSync(csvFile,cols.join(",")+"\n"+history.map(r=>cols.map(c=>esc(r[c])).join(",")).join("\n"));
}
function safe(s){return String(s).replace(/[\\/:*?"<>|]/g,"_");}
function svg(st,series,hours,tr,history){
  if(!series.length)return null;
  const W=1200,H=620,p={l:90,r:40,t:105,b:90};
  const vals=series.map(r=>r.nivel);
  if(st.namo!=null)vals.push(st.namo);
  if(st.name!=null)vals.push(st.name);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(max===min){min-=1;max+=1}
  const mar=Math.max((max-min)*.08,.1);min-=mar;max+=mar;
  const X=i=>p.l+(W-p.l-p.r)*(series.length===1?.5:i/(series.length-1));
  const Y=v=>p.t+(H-p.t-p.b)*(1-(v-min)/(max-min));
  const esc=s=>String(s).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const f=v=>v==null?"s/d":`${v>=0?"+":""}${v.toFixed(2)} m`;
  const d24=deltaWindow(history,st.estacion,24),d48=deltaWindow(history,st.estacion,48),d72=deltaWindow(history,st.estacion,72);
  let grid="",yl="";
  for(let i=0;i<=5;i++){const v=min+(max-min)*i/5,yy=Y(v);grid+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" stroke="#ddd"/>`;yl+=`<text x="${p.l-12}" y="${yy+5}" text-anchor="end" font-size="15">${v.toFixed(2)}</text>`}
  let refs="";
  if(st.namo!=null)refs+=`<line x1="${p.l}" y1="${Y(st.namo)}" x2="${W-p.r}" y2="${Y(st.namo)}" stroke="#b8860b" stroke-width="3" stroke-dasharray="10 7"/><text x="${W-p.r-5}" y="${Y(st.namo)-8}" text-anchor="end" font-size="17" font-weight="bold">NAMO ${st.namo.toFixed(2)} m</text>`;
  if(st.name!=null)refs+=`<line x1="${p.l}" y1="${Y(st.name)}" x2="${W-p.r}" y2="${Y(st.name)}" stroke="#7a0019" stroke-width="3" stroke-dasharray="10 7"/><text x="${W-p.r-5}" y="${Y(st.name)-8}" text-anchor="end" font-size="17" font-weight="bold">NAME ${st.name.toFixed(2)} m</text>`;
  const pts=series.map((r,i)=>`${X(i)},${Y(r.nivel)}`).join(" ");
  const dots=series.map((r,i)=>{
    const inherited=r.estado_dato==="heredado";
    return `<circle cx="${X(i)}" cy="${Y(r.nivel)}" r="5" fill="${inherited?"white":"#1261a0"}" stroke="#1261a0" stroke-width="2"/>`;
  }).join("");
  const xl=series.map((r,i)=>{const d=new Date(r.fecha_hora);const lab=d.toLocaleString("es-MX",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});return `<text x="${X(i)}" y="${H-p.b+30}" text-anchor="middle" font-size="13">${esc(lab)}</text>`}).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><text x="${p.l}" y="35" font-size="27" font-weight="bold">${esc(st.rio)} — ${esc(st.estacion)} — ${hours} h</text><text x="${p.l}" y="68" font-size="18">Último: ${series.at(-1).nivel.toFixed(2)} m | ${tr.label} ${tr.arrow} | Δ24h ${f(d24)} | Δ48h ${f(d48)} | Δ72h ${f(d72)}</text>${grid}${yl}${refs}<polyline fill="none" stroke="#1261a0" stroke-width="4" points="${pts}"/>${dots}${xl}<text x="${W/2}" y="${H-22}" text-anchor="middle" font-size="14">Punto lleno = observado; punto hueco = valor heredado por ausencia de nueva lectura.</text></svg>`;
}

(async()=>{
  const items=await extractPage1Geometry(pdfPath);
  const allText=items.map(x=>x.str).join(" ");
  const date=parseDate(allText);
  const wanted=targetHour(subject);
  if(wanted==null)throw new Error("No se pudo identificar la hora del corte desde el asunto.");

  const rows=groupHourRows(items);
  const columns=establishRiverColumns(rows,wanted);
  if(!columns)throw new Error("No se pudo establecer la geometría de las 15 columnas hidrométricas.");

  const target=rows.find(r=>r.hour===wanted)||null;
  const mapped=mapTargetRow(target,columns);

  const histDir=path.join(base,"Historico"),graphDir=path.join(base,"Graficas"),cutDir=path.join(base,"Ultimo_Corte"),evDir=path.join(base,"Evidencia_Texto");
  for(const d of [histDir,graphDir,cutDir,evDir])fs.mkdirSync(d,{recursive:true});
  const histJson=path.join(histDir,"niveles_historicos.json");
  const histCsv=path.join(histDir,"niveles_historicos.csv");
  let history=loadHistory(histJson);
  const stamp=`${date}T${String(wanted).padStart(2,"0")}:00:00-06:00`;

  let added=0,observedAdded=0,inheritedAdded=0,noDataAdded=0;
  const diagnostic=[];
  for(let i=0;i<STATIONS.length;i++){
    const st=STATIONS[i];
    const observed=mapped[i];
    const prev=lastReal(history,st.estacion);
    let nivel=null,estado="sin_dato",ultimaReal=null;
    if(Number.isFinite(observed)){
      nivel=observed;estado="observado";ultimaReal=stamp;
    }else if(prev){
      nivel=prev.nivel;estado="heredado";ultimaReal=prev.fecha_hora;
    }

    const key=`${stamp}|${st.estacion}|${messageId}`;
    if(!history.some(x=>x._key===key)){
      history.push({_key:key,fecha_hora:stamp,rio:st.rio,estacion:st.estacion,nivel,
        namo:st.namo,name:st.name,fuente:path.basename(pdfPath),asunto:subject,message_id:messageId,
        hora_fuente:`${String(wanted).padStart(2,"0")}:00`,estado_dato:estado,ultima_actualizacion_real:ultimaReal});
      added++;
      if(estado==="observado")observedAdded++;
      else if(estado==="heredado")inheritedAdded++;
      else noDataAdded++;
    }
    diagnostic.push({estacion:st.estacion,nivel,estado});
  }

  history.sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora));
  saveHistory(history,histJson,histCsv);
  fs.writeFileSync(path.join(evDir,`${date}_${String(wanted).padStart(2,"0")}00_MSG${messageId}_diagnostico.json`),
    JSON.stringify({referenceHour:columns.referenceHour,referenceCount:columns.referenceCount,tolerance:columns.tolerance,targetCount:target?target.cells.length:0,diagnostic},null,2));

  const summary=[];
  for(const st of STATIONS){
    const sr=allRows(history,st.estacion);
    if(!sr.length)continue;
    const tr=trend(history,st.estacion),last=sr.at(-1),dir=path.join(graphDir,safe(st.rio),safe(st.estacion));
    fs.mkdirSync(dir,{recursive:true});
    for(const h of [24,48,72]){
      const s=windowSeries(history,st.estacion,h);
      const v=svg(st,s,h,tr,history);
      if(v)fs.writeFileSync(path.join(dir,`${h}h.svg`),v);
    }
    summary.push({rio:st.rio,estacion:st.estacion,ultimo_nivel:last.nivel,delta_reporte:tr.delta,
      tendencia:tr.label,delta_24h:deltaWindow(history,st.estacion,24),delta_48h:deltaWindow(history,st.estacion,48),
      delta_72h:deltaWindow(history,st.estacion,72),distancia_namo:st.namo==null||last.nivel==null?null:last.nivel-st.namo,
      distancia_name:st.name==null||last.nivel==null?null:last.nivel-st.name,fecha_hora:last.fecha_hora,
      estado_dato:last.estado_dato,ultima_actualizacion_real:last.ultima_actualizacion_real});
  }
  fs.writeFileSync(path.join(cutDir,"ultimo_resumen.json"),JSON.stringify(summary,null,2));
  const cols=["rio","estacion","ultimo_nivel","delta_reporte","tendencia","delta_24h","delta_48h","delta_72h","distancia_namo","distancia_name","fecha_hora","estado_dato","ultima_actualizacion_real"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  fs.writeFileSync(path.join(cutDir,"ultimo_resumen.csv"),cols.join(",")+"\n"+summary.map(r=>cols.map(c=>esc(r[c])).join(",")).join("\n"));

  console.log(`OK V3. Reporte ${date} ${String(wanted).padStart(2,"0")}:00. Columnas ref: ${columns.referenceCount}; celdas en corte: ${target?target.cells.length:0}. Registros nuevos: ${added}. Observados: ${observedAdded}. Heredados: ${inheritedAdded}. Sin dato previo: ${noDataAdded}. Estaciones con histórico: ${summary.length}.`);
})().catch(e=>{console.error("ERROR V3:",e.stack||e.message);process.exit(1);});
