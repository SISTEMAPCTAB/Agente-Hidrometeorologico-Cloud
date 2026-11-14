(()=>{
'use strict';
// Apartado "Estiaje" (12-nov-2026, aprobado por Gilberto). Sólo lectura; no altera fuentes, semáforos de creciente ni otros apartados.
// Umbrales: data/catalogos/estiaje_umbrales.json, generado por el Modelo Hidrológico (calibracion_sierra/umbrales_estiaje_v111g.py, V111o)
// con el SIH-CONAGUA diario y BANDAS. Semáforo principal por GASTO (no depende del cero de la escala); nivel en msnm como complemento:
//   vigilancia < mínimo diario de Tr 2 años · alerta < mínimo de 7 días de Tr 5 años · crítico < mínimo diario de Tr 10 años · récord < mínimo histórico.
// 14-nov-2026 (Gilberto: "que sea congruente" con la diferencia al mínimo): la vigilancia era el p10 del mes y en noviembre marcaba Gaviotas y
// El Muelle a más de 1 m del mínimo. Ahora todos los umbrales son contra los mínimos; el p10 queda como nota "bajo lo normal del mes".
// Si manda el gasto y el nivel da 2 o más clases peor (Teapa, Puyacatengo: el cauce bajó), la diferencia del nivel sale en gris.
// Dato actual: gastos_conagua.json (Q y ΔQ 24 h) y ultimo_resumen.json (nivel, Δ24 h y Δ72 h).
// Diferencia = registro actual − mínimo histórico; tendencia − (baja, hacia el mínimo) o + (sube, se aleja).
const SRC={umb:'../data/catalogos/estiaje_umbrales.json',q:'../data/pronostico_hidrologico/gastos_conagua.json',h:'../data/niveles/Ultimo_Corte/ultimo_resumen.json',m:'../data/modelo_rubio/latest.json'};
const GRUPOS=[['Presas–Mezcalapa–Samaria y Carrizal',['Samaria','González']],['Ríos Serranos–Grijalva',['Oxolotán','Tapijulapa','Teapa','Puyacatengo','San Joaquín','Pueblo Nuevo']],
 ['Grijalva en Villahermosa',['Gaviotas','El Muelle','Porvenir']],['Tulijá–Puxcatán–Chilapa',['Salto de Agua','Macuspana']],['Usumacinta',['Boca del Cerro','San Pedro']]];
const NIV={record:['Récord','#111','#fff',4],critico:['Crítico','#5f5f5f','#fff',3],alerta:['Alerta','#7b4a1e','#fff',2],vigilancia:['Vigilancia','#d9b38c','#3b2410',1],normal:['Normal','#eef1ec','#333',0],sd:['s/d','#f4f4f4','#888',-1]};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const num=v=>v===null||v===undefined||v===''?NaN:Number(v);
const fx=(v,d=2)=>Number.isFinite(num(v))?Number(v).toFixed(d):'s/d';
const chip=k=>{const n=NIV[k]||NIV.sd;return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${n[1]};color:${n[2]};font-weight:600;white-space:nowrap">${n[0]}</span>`};
function clase(v,u,mes){if(!u||!Number.isFinite(v))return 'sd';if(v<num(u.minimo_historico))return 'record';if(v<num(u.critico_tr10))return 'critico';
 if(v<num(u.alerta_tr5_min7d))return 'alerta';const t2=num(u.vigilancia_tr2),p=num(u.p10_mes?.[String(mes)]);
 if(Number.isFinite(t2)?v<t2:(Number.isFinite(p)&&v<p))return 'vigilancia';return 'normal'}
const MESES=['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const bajoMes=(v,u,mes)=>{const p=num(u?.p10_mes?.[String(mes)]);return Number.isFinite(v)&&Number.isFinite(p)&&v<p?`<br><small title="menor que en 9 de cada 10 años para este mes. Si noviembre–diciembre queda así, el estiaje llegó a alerta en 1 de cada 2 años (contra 1 de cada 5); si sigue en enero, en 3 de cada 4 (V111o-9)">bajo lo normal de ${MESES[mes]}</small>`:''};
const fh=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?new Date(t).toLocaleString('es-MX',{timeZone:'America/Mexico_City',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+' h':'s/d'};
const ultima=(arr,k)=>arr.map(x=>x?.[k]).filter(x=>Number.isFinite(Date.parse(x||''))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
const vig=u=>u?.vigilancia_tr2??u?.p10_mes?.[String(new Date().getMonth()+1)];
function tend(d,u,dec){if(!Number.isFinite(d))return 's/d';if(Math.abs(d)<(dec===2?0.005:0.05))return 'estable';const s=(d>0?'+':'−')+Math.abs(d).toFixed(dec)+' '+u;
 return d<0?`<b style="color:#7b4a1e">↓ ${s}</b>`:`<span style="color:#2f6b3a">↑ ${s}</span>`}
async function get(u){const r=await fetch(u+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(r.status+' '+u);return r.json()}
let seq=0;
async function show(){
 const root=document.getElementById('estiaje-root');if(!root)return;const id=++seq;
 const [U,Q,H,M]=await Promise.allSettled([get(SRC.umb),get(SRC.q),get(SRC.h),get(SRC.m)]);
 if(id!==seq||!document.getElementById('estiaje-root'))return;
 if(U.status!=='fulfilled'){root.innerHTML='<section class="panel wide"><h2>Estiaje</h2><p>No se encontró la tabla de umbrales de estiaje.</p></section>';return}
 const um=U.value,gs=Q.status==='fulfilled'?(Q.value.estaciones||[]):[],lv=H.status==='fulfilled'&&Array.isArray(H.value)?H.value:[];
 // Pronóstico 0-72 h del Modelo Rubio/SegAMH (publicado por la PC del modelo); sólo si tiene 6 h o menos, como en su apartado.
 const md=M.status==='fulfilled'?M.value:null,mAge=md?(Date.now()-Date.parse(md.calculado_utc||''))/3600000:NaN,mOk=Number.isFinite(mAge)&&mAge<=6;
 const P={};if(mOk)for(const e of (md.estaciones||[])){const est=String(e.estacion||'').split('·').pop().trim();P[nm(est)]={q:num(e.h72?.gasto_m3s),h:num(e.h72?.nivel_m)}}
 // Sin lluvia: días hasta alerta y crítico con la recesión de estiaje de cada río (V111v del modelo): n = ln(U/Q)/ln(k).
 const sinLluvia=(q,ug,rec)=>{if(!Number.isFinite(q)||!ug||!rec?.k50)return '';const d=(U,k)=>Math.round(Math.log(U/q)/Math.log(k));
  const f=(et,U)=>{U=num(U);if(!Number.isFinite(U))return '';if(q<=U)return et+' ya';const a=d(U,rec.k25),b=d(U,rec.k50);return et+' ~'+b+' d'+(a<b?' ('+a+'–'+b+')':'')};
  return '<br><small>Sin lluvia: '+[f('alerta',ug.alerta_tr5_min7d),f('crítico',ug.critico_tr10)].filter(Boolean).join(' · ')+'</small>'};
 const pron=(pr,ug,un,q,h,mes,rec)=>{const pq=num(pr?.q),ph=num(pr?.h);
  if(pq>0&&ug)return `${fx(pq,1)} m³/s ${chip(clase(pq,ug,mes))}<br><small>${Number.isFinite(q)?tend(pq-q,'m³/s',1)+' vs. hoy':'sin gasto observado'}</small>`+sinLluvia(Number.isFinite(q)?q:pq,ug,rec);
  if(Number.isFinite(ph)&&un)return `${fx(ph)} m ${chip(clase(ph,un,mes))}<br><small>${Number.isFinite(h)?tend(ph-h,'m',2)+' vs. hoy':''}</small>`;
  return `<small>${mOk?'sin pronóstico':'modelo sin corrida reciente'}</small>`+sinLluvia(q,ug,rec)};
 const mes=new Date().getMonth()+1;let filas='',cuenta={};
 for(const [sis,ests] of GRUPOS){filas+=`<tr><td colspan="10" style="background:#f3efe8"><b>${esc(sis)}</b></td></tr>`;
  for(const e of ests){const u=um.estaciones?.[e]||{};const g=gs.find(x=>nm(x.estacion)===nm(e));const l=lv.find(x=>nm(x.estacion)===nm(e));
   let q=num(g?.q_actual_m3s);if(!(q>0))q=NaN;const dq=Number.isFinite(q)?num(g?.delta_q_m3s):NaN;
   let h=num(l?.ultimo_nivel);if(h===0)h=NaN;const viejo=l&&l.estado_dato&&l.estado_dato!=='observado';
   const kq=clase(q,u.gasto,mes),kh=clase(h,u.nivel,mes),k=Number.isFinite(q)&&u.gasto?kq:kh;cuenta[k]=(cuenta[k]||0)+1;
   const noComp=Number.isFinite(q)&&!!u.gasto&&Number.isFinite(h)&&!!u.nivel&&((NIV[kh]?.[3]??0)-(NIV[kq]?.[3]??0)>=2);
   filas+=`<tr><td><b>${esc(e)}</b></td><td>${chip(k)}<br><small>${Number.isFinite(q)&&u.gasto?'por gasto':'por nivel'}</small>${Number.isFinite(q)&&u.gasto?bajoMes(q,u.gasto,mes):bajoMes(h,u.nivel,mes)}</td>
    <td>${fx(q,1)}${u.gasto&&Number.isFinite(q)?`<br><small>mín. ${fx(u.gasto.minimo_historico,1)} (${esc(String(u.gasto.fecha_minimo||'').slice(0,4))})</small>`:''}</td>
    <td><b>${Number.isFinite(q)&&u.gasto?fx(q-u.gasto.minimo_historico,1):'s/d'}</b></td><td>${tend(dq,'m³/s',1)}<br><small>24 h</small></td>
    <td>${fx(h)}${viejo?' <small>('+esc(l.estado_dato)+')</small>':''}${u.nivel?`<br><small>mín. ${fx(u.nivel.minimo_historico)} (${esc(String(u.nivel.fecha_minimo||'').slice(0,4))})</small>`:''}</td>
    <td>${noComp?`<span style="color:#888">${fx(h-u.nivel.minimo_historico)}</span><br><small>no comparable: el cauce o la escala cambió; manda el gasto</small>`:`<b>${Number.isFinite(h)&&u.nivel?fx(h-u.nivel.minimo_historico):'s/d'}</b>`}</td><td>24 h: ${tend(num(l?.delta_24h),'m',2)}<br>72 h: ${tend(num(l?.delta_72h),'m',2)}</td><td>${pron(P[nm(e)],u.gasto,u.nivel,q,h,mes,u.recesion)}</td>
    <td><small>${u.gasto?`Q: ${fx(vig(u.gasto),1)} · ${fx(u.gasto.alerta_tr5_min7d,1)} · ${fx(u.gasto.critico_tr10,1)}`:''}${u.nivel?`<br>H: ${fx(vig(u.nivel))} · ${fx(u.nivel.alerta_tr5_min7d)} · ${fx(u.nivel.critico_tr10)}`:''}</small></td></tr>`}}
 const res=['record','critico','alerta','vigilancia'].filter(x=>cuenta[x]).map(x=>`${chip(x)} ${cuenta[x]}`).join(' ')||chip('normal')+' en todas las estaciones con dato';
 root.innerHTML=`<section class="panel wide"><h2>Estiaje · semáforo de mínimos</h2>
  <p><b>Emisión:</b> ${fh(ultima(lv.filter(x=>x.estado_dato==='observado'),'fecha_hora'))} (corte de niveles) · gasto del boletín CONAGUA-OCFS: ${fh(ultima(gs,'fuente_fecha_hora'))} · pronóstico del modelo: ${mOk?fh(md.calculado_utc):'sin corrida reciente'}</p>
  <p><b>Estado:</b> ${res}</p>
  <p style="background:#f8fafc;border-left:4px solid #7b4a1e;padding:8px 10px"><b>Cómo se lee:</b> la <b>diferencia</b> es el registro actual menos el mínimo histórico; la <b>tendencia</b> marca
  <b style="color:#7b4a1e">↓ −</b> cuando baja hacia el mínimo y <b style="color:#2f6b3a">↑ +</b> cuando sube y se aleja. El semáforo va por <b>gasto</b> (registro de 50 a 78 años, SIH + BANDAS);
  el nivel en msnm (SIH 1996-2025) es complemento. Todos los umbrales se miden contra los mínimos, igual todo el año: Vigilancia: menor que el mínimo anual de 1 vez cada 2 años · Alerta: menor que el mínimo de 7 días de 1 vez cada 5 años · Crítico: menor que el mínimo diario
  de 1 vez cada 10 años · Récord: menor que el mínimo histórico. "Bajo lo normal del mes" (sin color) = menor que en 9 de cada 10 años para ese mes: aviso temprano, no estiaje. Históricamente (V111o-9, gasto 1944-2026 en 15 estaciones), cuando noviembre–diciembre queda bajo lo normal el estiaje llegó a alerta en 1 de cada 2 años (contra 1 de cada 5); si sigue así en enero, en 3 de cada 4. No avisa todos: la mayoría de los estiajes severos depende de la lluvia de febrero a mayo.
  Si el nivel da una clase mucho peor que el gasto o queda bajo su mínimo (Puyacatengo, Teapa), es cambio del cauce o de la escala: su diferencia sale en gris y manda el gasto. El <b>pronóstico a 72 h</b> es el del Modelo Rubio/SegAMH (con la lluvia pronosticada): dice si en 3 días el gasto cruzará algún umbral. <b>Sin lluvia</b>: días que tardaría en llegar a alerta y a crítico si no llueve, con la recesión de estiaje de cada río (entre paréntesis, si baja rápido).</p>
  <div class="table-wrap"><table><thead><tr><th>Estación</th><th>Estiaje</th><th>Gasto actual (m³/s)</th><th>Diferencia al mínimo (m³/s)</th><th>Tendencia gasto</th>
  <th>Nivel actual (msnm)</th><th>Diferencia al mínimo (m)</th><th>Tendencia nivel</th><th>Pronóstico del modelo a 72 h · sin lluvia</th><th>Umbrales: vigilancia · alerta · crítico</th></tr></thead><tbody>${filas}</tbody></table></div>
  ${(()=>{const t=um.estaciones?.['González']?.tomas;if(!t)return '';const g=(Q.value?.estaciones||[]).find(x=>nm(x.estacion)===nm('González'));const q=num(g?.q_actual_m3s);return `<p style="background:#fdf8f3;border-left:4px solid #7b4a1e;padding:8px 10px"><b>Tomas de agua potable en el Carrizal (González):</b> `+t.referencias.map(r=>`<b>${fx(r.q,0)} m³/s</b> ${esc(r.que)} (${esc(r.fuente)})`).join('; ')+(Number.isFinite(q)&&q>0?`. Hoy: <b>${fx(q,1)} m³/s</b> (`+t.referencias.map(r=>tend(q-r.q,'m³/s',1)+' contra '+fx(r.q,0)).join(' · ')+')':'')+`. ${esc(t.nota)}</p>`})()}
  <p class="muted">Gasto: boletín CONAGUA-OCFS (${esc(fh(ultima(gs,'fuente_fecha_hora')||Q.value?.fuente2_fecha_hora||Q.value?.fuente1_fecha_hora))}). Nivel: último corte de niveles. Umbrales del ${esc(um.generado||'s/d')} (Modelo Hidrológico, V111o).
  <b>s/d</b> en gasto: el boletín no publica gasto actual de esa estación (Gaviotas, El Muelle, San Pedro, Palizada); ahí el semáforo va por nivel.
  El Nivel Mínimo publicado por CONAGUA se conserva en el semáforo NAMINO de cada sistema; varias estaciones ya registraron niveles más bajos que ese valor.</p></section>`}
document.addEventListener('DOMContentLoaded',()=>{const c=document.getElementById('content');c?.addEventListener('app-rendered',e=>{if(e.detail?.section==='estiaje')show()});
 setInterval(()=>{if(document.getElementById('estiaje-root'))show()},5*60000);window.addEventListener('hydro:soft-refresh',()=>{if(document.getElementById('estiaje-root'))show()})});
})();
