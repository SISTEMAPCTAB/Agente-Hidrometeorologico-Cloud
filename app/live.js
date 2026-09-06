(() => {
  const POLL_MS = 60000;
  let lastAuto = null;

  function ensureIndicator(){
    const foot = document.querySelector('.sidebar-foot');
    if(!foot || document.getElementById('liveState')) return;
    const el = document.createElement('div');
    el.id = 'liveState';
    el.className = 'live-state';
    el.innerHTML = '<span class="live-dot"></span><span>Módulos en vivo</span>';
    foot.appendChild(el);
  }

  function softRefresh(reason='interval'){
    if(document.hidden || !navigator.onLine) return;
    lastAuto = new Date();
    const el = document.getElementById('liveState');
    if(el){
      const hh = String(lastAuto.getHours()).padStart(2,'0');
      const mm = String(lastAuto.getMinutes()).padStart(2,'0');
      el.innerHTML = `<span class="live-dot"></span><span>Módulos en vivo · ${hh}:${mm}</span>`;
      el.dataset.reason = reason;
    }
    window.dispatchEvent(new CustomEvent('hydro:soft-refresh',{detail:{reason,at:lastAuto.toISOString()}}));
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureIndicator();
    softRefresh('inicio');
    setInterval(() => softRefresh('interval'), POLL_MS);
    window.addEventListener('focus', () => softRefresh('focus'));
    window.addEventListener('online', () => softRefresh('online'));
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden) softRefresh('visible');
    });
  });
})();
