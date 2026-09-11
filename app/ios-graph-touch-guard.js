(() => {
  const STYLE_ID='iosGraphTouchGuardStyle';

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #content{max-width:100%;overflow-x:hidden}
      .hydro48-panel,.hydro48-grid,.hydro48-card{max-width:100%;min-width:0;box-sizing:border-box}
      .hydro48-card{overflow:hidden}
      .hydro48-scroll,.graph-zoom-scroll{
        display:block;
        width:100%;
        max-width:100%;
        min-width:0;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        -webkit-overflow-scrolling:touch;
        overscroll-behavior-x:contain;
        touch-action:pan-x pan-y;
        box-sizing:border-box;
        position:relative;
      }
      .hydro48-scroll svg,.graph-zoom-scroll svg{
        display:block;
        max-width:none!important;
        pointer-events:none!important;
        -webkit-user-select:none!important;
        user-select:none!important;
        -webkit-touch-callout:none!important;
      }
    `;
    document.head.appendChild(s);
  }

  function protect(root=document){
    root.querySelectorAll?.('.hydro48-scroll,.graph-zoom-scroll').forEach(w=>{
      if(w.dataset.iosGraphGuard==='1')return;
      w.dataset.iosGraphGuard='1';
      let sx=0,sy=0;
      w.addEventListener('touchstart',e=>{
        const t=e.touches?.[0];if(!t)return;
        sx=t.clientX;sy=t.clientY;
      },{passive:true});
      w.addEventListener('touchmove',e=>{
        const t=e.touches?.[0];if(!t)return;
        const dx=Math.abs(t.clientX-sx),dy=Math.abs(t.clientY-sy);
        if(dx>dy) e.stopPropagation();
      },{passive:true});
      w.addEventListener('click',e=>{
        if(e.target.closest?.('button,a,input,select,textarea'))return;
        if(e.target.tagName?.toLowerCase()==='svg' || e.target.closest?.('svg')){
          e.preventDefault();
          e.stopPropagation();
        }
      },true);
    });
  }

  function run(){installStyles();protect();}

  document.addEventListener('DOMContentLoaded',()=>{
    run();
    setTimeout(run,900);
    document.getElementById('nav')?.addEventListener('click',()=>setTimeout(run,700));
    document.getElementById('refreshBtn')?.addEventListener('click',()=>setTimeout(run,1100));
    const c=document.getElementById('content');
    if(c){
      let timer=null;
      new MutationObserver(()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>protect(c),250);
      }).observe(c,{childList:true,subtree:true});
    }
  });
})();
