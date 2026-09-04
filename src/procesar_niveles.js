const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

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
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/\s+/g," ").trim();
}

function parseDate(text){
  const t = norm(text);
  const m = t.match(/(?:A|DEL)\s+(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DEL?\s+)?(20\d{2})/);
  if(!m) return new Date().toISOString().slice(0,10);
  const mo={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12}[m[2]];
  return `${m[3]}-${String(mo).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
}

function targetHour(subject){
  const s = norm(subject);
  let m=s.match(/(?:DE LAS|LAS|DE)\s*(\d{1,2})\s*(?:HR|HRS|HORA|HORAS)/);
  if(m) return Number(m[1]);
  if(/8\s*AM/.test(s) || /8:00/.test(s)) return 8;
  return null;
}

function parseHourlyRows(text){
  const rows=[];
  for(const raw of text.split(/\r?\n/)){
    const m=raw.trim().match(/^(\d{2}):00\s+(.+)$/);
    if(!m) continue;
    const hour=Number(m[1]);
    const nums=[...m[2].matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?/g)]
      .map(x=>Number(x[0].replace(/,/g,"")))
      .filter(Number.isFinite);
    rows.push({hour, nums, raw});
  }
  return rows;
}

function exactRow(rows, wantedHour){
  if(wantedHour == null) return null;
  return rows.find(r=>r.hour===wantedHour) || null;
}

function chooseLatestCompleteRow(rows, wantedHour){
  const complete=rows.filter(r=>r.nums.length>=15);
  if(!complete.length) return null;
  if(wantedHour != null){
    const before=complete.filter(r=>r.hour<=wantedHour).sort((a,b)=>b.hour-a.hour)[0];
    if(before) return before;
  }
  return complete.sort((a,b)=>b.hour-a.hour)[0];
}

function levelsFromCompleteRow(row){
  // Solo se asignan valores por posición cuando la fila contiene la serie completa.
  // Si la fila objetivo viene incompleta, NO se corre el arreglo: se conserva el último
  // valor válido de cada estación y el punto se marca como heredado.
  const vals=row.nums.slice(-15);
  if(vals.length!==15) throw new Error(`Fila horaria incompleta (${vals.length} valores).`);
  return STATIONS.map((s,i)=>({...s,nivel:vals[i],estado_dato:"observado"}));
}

function lastValidByStation(history, station){
  const rows=history
    .filter(r=>r.estacion===station && Number.isFinite(r.nivel) && r.estado_dato==="observado")
    .sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora));
  return rows.length ? rows.at(-1) : null;
}

function buildSnapshot(history, rows, wantedHour){
  const target = exactRow(rows, wantedHour);

  if(target && target.nums.length>=15){
    return {
      sourceHour: target.hour,
      snapshotHour: wantedHour,
      sourceStatus: "observado",
      levels: levelsFromCompleteRow(target)
    };
  }

  const inherited = STATIONS.map(st=>{
    const prev=lastValidByStation(history, st.estacion);
    return {
      ...st,
      nivel: prev ? prev.nivel : null,
      estado_dato: prev ? "heredado" : "sin_dato",
      ultima_actualizacion_real: prev ? prev.fecha_hora : null
    };
  });

  const seed = chooseLatestCompleteRow(rows, wantedHour);
  return {
    sourceHour: seed ? seed.hour : null,
    snapshotHour: wantedHour,
    sourceStatus: "heredado",
    seedLevels: seed ? levelsFromCompleteRow(seed) : null,
    levels: inherited
  };
}

function loadHistory(file){
  if(!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return []; }
}
function saveHistory(history,jsonFile,csvFile){
  fs.writeFileSync(jsonFile,JSON.stringify(history,null,2));
  const cols=["fecha_hora","rio","estacion","nivel","namo","name","fuente","asunto","message_id","hora_fuente","estado_dato","ultima_actualizacion_real"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  fs.writeFileSync(csvFile,cols.join(",")+"\n"+history.map(r=>cols.map(c=>esc(r[c])).join(",")).join("\n"));
}
function stationRows(history,station,soloObservados=false){
  return history.filter(r=>
      r.estacion===station &&
      Number.isFinite(r.nivel) &&
      (!soloObservados || r.estado_dato==="observado")
    )
    .sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora));
}
function atOrBefore(rows,target){
  const a=rows.filter(r=>new Date(r.fecha_hora).getTime()<=target);
  return a.length ? a[a.length-1] : null;
}
function deltaWindow(history,station,hours){
  const rows=stationRows(history,station,true);
  if(!rows.length) return null;
  const last=rows[rows.length-1];
  const anchor=atOrBefore(rows,new Date(last.fecha_hora).getTime()-hours*3600000);
  return anchor ? last.nivel-anchor.nivel : null;
}
function trend(history,station){
  const rows=stationRows(history,station,true);
  if(rows.length<2) return {label:"Sin tendencia suficiente",arrow:"",delta:null};
  const a=rows.at(-2), b=rows.at(-1), d=b.nivel-a.nivel;
  const eps=.01;
  if(Math.abs(d)<=eps) return {label:"Estable",arrow:"→",delta:d};
  if(d>eps){
    if(rows.length>=3){
      const p=rows.at(-2).nivel-rows.at(-3).nivel;
      if(p>eps && d>p*1.5) return {label:"Ascenso acelerado",arrow:"↑↑",delta:d};
      if(p<-eps) return {label:"Cambio a ascenso",arrow:"↗",delta:d};
    }
    return {label:"Ascenso",arrow:"↑",delta:d};
  }
  if(rows.length>=3){
    const p=rows.at(-2).nivel-rows.at(-3).nivel;
    if(p<-eps && Math.abs(d)>Math.abs(p)*1.5) return {label:"Descenso acelerado",arrow:"↓↓",delta:d};
    if(p>eps) return {label:"Cambio a descenso",arrow:"↘",delta:d};
  }
  return {label:"Descenso",arrow:"↓",delta:d};
}
function windowSeries(history,station,hours){
  const rows=stationRows(history,station);
  if(!rows.length) return [];
  const end=new Date(rows.at(-1).fecha_hora).getTime();
  const start=end-hours*3600000;
  const anchor=atOrBefore(rows,start);
  const inside=rows.filter(r=>new Date(r.fecha_hora).getTime()>start && new Date(r.fecha_hora).getTime()<=end);
  return anchor ? [anchor,...inside] : inside;
}
function safe(s){return String(s).replace(/[\\/:*?"<>|]/g,"_");}
function svg(st,series,hours,tr,history){
  if(!series.length) return null;
  const W=1200,H=620,p={l:90,r:40,t:105,b:90};
  const vals=series.map(r=>r.nivel);
  if(st.namo!=null) vals.push(st.namo);
  if(st.name!=null) vals.push(st.name);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(max===min){min-=1;max+=1}
  const mar=Math.max((max-min)*.08,.1); min-=mar; max+=mar;
  const X=i=>p.l+(W-p.l-p.r)*(series.length===1?.5:i/(series.length-1));
  const Y=v=>p.t+(H-p.t-p.b)*(1-(v-min)/(max-min));
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const f=v=>v==null?"s/d":`${v>=0?"+":""}${v.toFixed(2)} m`;
  const d24=deltaWindow(history,st.estacion,24),d48=deltaWindow(history,st.estacion,48),d72=deltaWindow(history,st.estacion,72);
  let grid="",yl="";
  for(let i=0;i<=5;i++){const v=min+(max-min)*i/5,yy=Y(v);grid+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" stroke="#ddd"/>`;yl+=`<text x="${p.l-12}" y="${yy+5}" text-anchor="end" font-size="15">${v.toFixed(2)}</text>`}
  let refs="";
  if(st.namo!=null) refs+=`<line x1="${p.l}" y1="${Y(st.namo)}" x2="${W-p.r}" y2="${Y(st.namo)}" stroke="#b8860b" stroke-width="3" stroke-dasharray="10 7"/><text x="${W-p.r-5}" y="${Y(st.namo)-8}" text-anchor="end" font-size="17" font-weight="bold">NAMO ${st.namo.toFixed(2)} m</text>`;
  if(st.name!=null) refs+=`<line x1="${p.l}" y1="${Y(st.name)}" x2="${W-p.r}" y2="${Y(st.name)}" stroke="#7a0019" stroke-width="3" stroke-dasharray="10 7"/><text x="${W-p.r-5}" y="${Y(st.name)-8}" text-anchor="end" font-size="17" font-weight="bold">NAME ${st.name.toFixed(2)} m</text>`;
  const pts=series.map((r,i)=>`${X(i)},${Y(r.nivel)}`).join(" ");
  const dots=series.map((r,i)=>`<circle cx="${X(i)}" cy="${Y(r.nivel)}" r="5" fill="#1261a0"/>`).join("");
  const xl=series.map((r,i)=>{const d=new Date(r.fecha_hora);const lab=d.toLocaleString("es-MX",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});return `<text x="${X(i)}" y="${H-p.b+30}" text-anchor="middle" font-size="13">${esc(lab)}</text>`}).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><text x="${p.l}" y="35" font-size="27" font-weight="bold">${esc(st.rio)} — ${esc(st.estacion)} — ${hours} h</text><text x="${p.l}" y="68" font-size="18">Último: ${series.at(-1).nivel.toFixed(2)} m | ${tr.label} ${tr.arrow} | Δ24h ${f(d24)} | Δ48h ${f(d48)} | Δ72h ${f(d72)}</text>${grid}${yl}${refs}<polyline fill="none" stroke="#1261a0" stroke-width="4" points="${pts}"/>${dots}${xl}<text x="${W/2}" y="${H-22}" text-anchor="middle" font-size="14">Cada punto corresponde a un reporte real. El primer punto puede ser el último dato válido anterior a la ventana.</text></svg>`;
}

(async()=>{
  const data=await pdfParse(fs.readFileSync(pdfPath));
  const text=(data.text||"").replace(/\u00a0/g," ");
  const date=parseDate(text);
  const wanted=targetHour(subject);
  const rows=parseHourlyRows(text);
  if(wanted==null) throw new Error("No se pudo identificar la hora del corte desde el asunto.");

  const histDir=path.join(base,"Historico"), graphDir=path.join(base,"Graficas"), cutDir=path.join(base,"Ultimo_Corte"), evDir=path.join(base,"Evidencia_Texto");
  for(const d of [histDir,graphDir,cutDir,evDir]) fs.mkdirSync(d,{recursive:true});
  const histJson=path.join(histDir,"niveles_historicos.json");
  const histCsv=path.join(histDir,"niveles_historicos.csv");
  let history=loadHistory(histJson);

  const snap=buildSnapshot(history, rows, wanted);

  if(snap.seedLevels && snap.sourceHour!=null){
    const seedStamp=`${date}T${String(snap.sourceHour).padStart(2,"0")}:00:00-06:00`;
    for(const r of snap.seedLevels){
      const seedKey=`${seedStamp}|${r.estacion}|SEED|${messageId}`;
      if(!history.some(x=>x._key===seedKey)){
        history.push({
          _key:seedKey,fecha_hora:seedStamp,rio:r.rio,estacion:r.estacion,nivel:r.nivel,
          namo:r.namo,name:r.name,fuente:path.basename(pdfPath),asunto:subject,message_id:messageId,
          hora_fuente:`${String(snap.sourceHour).padStart(2,"0")}:00`,
          estado_dato:"observado",ultima_actualizacion_real:seedStamp
        });
      }
    }
  }

  const snapshot=buildSnapshot(history, rows, wanted);
  const levels=snapshot.levels;
  const stamp=`${date}T${String(wanted).padStart(2,"0")}:00:00-06:00`;

  fs.writeFileSync(path.join(evDir,`${date}_${String(wanted).padStart(2,"0")}00_MSG${messageId}.txt`),text);

  let added=0, observedAdded=0, inheritedAdded=0, noDataAdded=0;
  for(const r of levels){
    const key=`${stamp}|${r.estacion}|${messageId}`;
    if(history.some(x=>x._key===key)) continue;

    let ultimaReal = r.ultima_actualizacion_real || null;
    if(r.estado_dato==="observado") ultimaReal = stamp;
    if(r.estado_dato==="heredado" && !ultimaReal){
      const prev=lastValidByStation(history,r.estacion);
      ultimaReal=prev ? prev.fecha_hora : null;
    }

    history.push({
      _key:key,fecha_hora:stamp,rio:r.rio,estacion:r.estacion,nivel:r.nivel,
      namo:r.namo,name:r.name,fuente:path.basename(pdfPath),asunto:subject,message_id:messageId,
      hora_fuente:`${String(wanted).padStart(2,"0")}:00`,
      estado_dato:r.estado_dato,
      ultima_actualizacion_real:ultimaReal
    });
    added++;
    if(r.estado_dato==="observado") observedAdded++;
    else if(r.estado_dato==="heredado") inheritedAdded++;
    else noDataAdded++;
  }
  history.sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora));
  saveHistory(history,histJson,histCsv);

  const summary=[];
  for(const st of STATIONS){
    const sr=stationRows(history,st.estacion);
    if(!sr.length) continue;
    const tr=trend(history,st.estacion),last=sr.at(-1);
    const dir=path.join(graphDir,safe(st.rio),safe(st.estacion));
    fs.mkdirSync(dir,{recursive:true});
    for(const h of [24,48,72]){
      const s=windowSeries(history,st.estacion,h);
      const v=svg(st,s,h,tr,history);
      if(v) fs.writeFileSync(path.join(dir,`${h}h.svg`),v);
    }
    summary.push({
      rio:st.rio,estacion:st.estacion,ultimo_nivel:last.nivel,
      delta_reporte:tr.delta,tendencia:tr.label,
      delta_24h:deltaWindow(history,st.estacion,24),
      delta_48h:deltaWindow(history,st.estacion,48),
      delta_72h:deltaWindow(history,st.estacion,72),
      distancia_namo:st.namo==null?null:last.nivel-st.namo,
      distancia_name:st.name==null?null:last.nivel-st.name,
      fecha_hora:last.fecha_hora,
      estado_dato:last.estado_dato || "observado",
      ultima_actualizacion_real:last.ultima_actualizacion_real || (last.estado_dato==="observado" ? last.fecha_hora : null)
    });
  }
  fs.writeFileSync(path.join(cutDir,"ultimo_resumen.json"),JSON.stringify(summary,null,2));
  const cols=["rio","estacion","ultimo_nivel","delta_reporte","tendencia","delta_24h","delta_48h","delta_72h","distancia_namo","distancia_name","fecha_hora","estado_dato","ultima_actualizacion_real"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  fs.writeFileSync(path.join(cutDir,"ultimo_resumen.csv"),cols.join(",")+"\n"+summary.map(r=>cols.map(c=>esc(r[c])).join(",")).join("\n"));

  console.log(`OK. Reporte ${date} ${String(wanted).padStart(2,"0")}:00. Registros nuevos: ${added}. Observados: ${observedAdded}. Heredados: ${inheritedAdded}. Sin dato previo: ${noDataAdded}. Estaciones con histórico: ${summary.length}.`);
})().catch(e=>{console.error("ERROR EXTRACTOR:",e.message);process.exit(1);});
