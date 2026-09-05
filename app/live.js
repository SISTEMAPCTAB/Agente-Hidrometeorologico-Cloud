(() => {
  const POLL_MS = 60000;
  let refreshing = false;
  let lastAuto = null;

  function ensureIndicator(){
    const foot = document.querySelector('.sidebar-foot');
    if(!foot || document.getElementById('liveState')) return;
    const el = document.createElement('div');
    el.id = 'liveState';
    el.className = 'live-state';
    el.innerHTML = '<span class="live-dot"></span><span>Autoactualización activa</span>';
    foot.appendChild(el);
  }

  async function refreshNow(reason='interval'){
    if(refreshing || document.hidden || !navigator.onLine) return;
    const btn = document.getElementById('refreshBtn');
    if(!btn) return;
    refreshing = true;
    try{
      btn.click();
      lastAuto = new Date();
      const el = document.getElementById('liveState');
      if(el){
        const hh = String(lastAuto.getHours()).padStart(2,'0');
        const mm = String(lastAuto.getMinutes()).padStart(2,'0');
        el.innerHTML = `<span class="live-dot"></span><span>Autoactualización activa · ${hh}:${mm}</span>`;
        el.dataset.reason = reason;
      }
    } finally {
      setTimeout(() => { refreshing = false; }, 5000);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureIndicator();
    setInterval(() => refreshNow('interval'), POLL_MS);
    window.addEventListener('focus', () => refreshNow('focus'));
    window.addEventListener('online', () => refreshNow('online'));
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden) refreshNow('visible');
    });
  });
})();
