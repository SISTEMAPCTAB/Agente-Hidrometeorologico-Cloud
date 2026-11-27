/* Capa de interfaz. Conserva los datos, semáforos y resultados originales. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const element=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n};
if($('#map')){
 document.body.classList.add('ui-map');
 const reset=element('button','btn','◎ Volver al área de interés');reset.type='button';
 reset.addEventListener('click',()=>window.TONALA_MAP?.setView([17.70,-92.65],8,{animate:false}));$('.controls')?.append(reset);
 return;
}
if(!$('#content'))return;
document.title='AMH Tabasco · Portal hidrológico';
const banner=element('div','ui-preview');banner.innerHTML='<strong>AMH · SECCIÓN TABASCO</strong> Portal de seguimiento hidrológico';
$('.main').prepend(banner);
const skip=element('a','ui-skip','Saltar al contenido');skip.href='#content';document.body.prepend(skip);$('#content').tabIndex=-1;
const sidebar=$('#sidebar'),menu=$('#menuBtn');menu.setAttribute('aria-controls','sidebar');
menu.innerHTML='<svg class="ui-menu-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Menú</span>';
document.body.append(menu);
document.body.classList.add('ui-focus-layout');
$('#nav').addEventListener('click',e=>{if(e.target.closest('button[data-section]')){sidebar.classList.remove('open');$('#content').focus({preventScroll:true})}});
const close=element('button','ui-close','Cerrar menú ×'),shade=element('button','ui-backdrop');shade.setAttribute('aria-label','Cerrar navegación');sidebar.prepend(close);document.body.append(shade);
close.textContent='×';close.setAttribute('aria-label','Cerrar menú');close.title='Cerrar menú';
function closeNav(){sidebar.classList.remove('open');menu.focus()}
close.onclick=closeNav;shade.onclick=closeNav;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sidebar.classList.contains('open'))closeNav();if(e.key==='Tab'&&sidebar.classList.contains('open')){const a=[...sidebar.querySelectorAll('button,a[href]')],first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
new MutationObserver(()=>{const opened=sidebar.classList.contains('open');shade.classList.toggle('open',opened);menu.setAttribute('aria-expanded',String(opened));if(opened)close.focus()}).observe(sidebar,{attributes:true,attributeFilter:['class']});
function navigate(section){$(`#nav button[data-section="${section}"]`)?.click()}
let current='';
function renderUI(){
 const c=$('#content'),section=$('#nav button.active')?.dataset.section||'resumen';
document.body.dataset.section=section;
 for(const b of document.querySelectorAll('#nav button')){if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
 if(!$('.ui-context',c)){
 const box=element('div','ui-context'+(section==='modelo'||section==='pronostico'?' forecast':''));
 if(section==='modelo'){box.innerHTML='<strong>◇ Pronóstico experimental · H+24 / H+36 / H+72</strong><small>Son horizontes del modelo, no observaciones actuales. Consulta la fecha de corrida, su vigencia y las fuentes que aparecen debajo. Nivel: m · Gasto: m³/s.</small>'}
 else if(section==='pronostico'){box.innerHTML='<strong>◇ Pronósticos meteorológicos</strong><small>Las ventanas y fechas de validez pertenecen a cada producto del SMN. No son lluvia observada.</small>'}
 else if(section==='resumen'){box.innerHTML='<strong>● Observaciones y seguimiento operativo</strong><small>Consulta la fecha de cada lectura; las estaciones pueden tener horas distintas. «Sin datos» no significa nivel cero ni ausencia de lluvia.</small>'}
 else{box.textContent='Consulta la fecha, fuente y calidad de cada registro. Los avisos de vigencia se conservan en cada apartado.'}
 c.prepend(box);
 }
 if(false&&section==='resumen'&&!$('.ui-intro',c)){
 const hero=element('section','ui-intro');hero.innerHTML='<div class="ui-kicker">AMH · Sección Tabasco</div><h2>Seguimiento hidrológico</h2><p>Grijalva · Usumacinta · Tonalá. Niveles, tendencias y lluvia para la consulta operativa.</p>';
 const links=element('div','ui-links');for(const [id,label] of [['mapa','◎ Mapa operativo'],['weather','☂ Lluvia observada'],['modelo','◇ Pronóstico H+24 · 36 · 72']]){const b=element('button','',label);b.onclick=()=>navigate(id);links.append(b)}hero.append(links);c.prepend(hero);
 }
 for(const wrap of c.querySelectorAll('.table-wrap,.op-table-wrap,.analysis-table-wrap')){
 if(wrap.dataset.uiReady)continue;wrap.dataset.uiReady='1';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Tabla de información hidrológica; desplazamiento horizontal disponible');
 const hint=element('div','ui-table-hint','↔ Desliza la tabla para consultar todas las columnas.');wrap.before(hint);
 }
 for(const th of c.querySelectorAll('th')){if(!th.hasAttribute('scope'))th.scope=th.colSpan>1?'colgroup':'col'}
 current=section;
}
let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;renderUI()})};
new MutationObserver(schedule).observe($('#content'),{childList:true,subtree:true});
$('#content').addEventListener('app-rendered',schedule);renderUI();
})();