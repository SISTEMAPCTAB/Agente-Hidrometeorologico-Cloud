(() => {
  const RETRY_MS = 2500;
  const MAX_RETRIES = 4;
  const memory = new Map();
  const norm = s => String(s || '').trim();

  function keyFor(img){
    const fig = img.closest('.hydro-figure');
    const cap = fig?.querySelector('figcaption')?.textContent || '';
    const head = fig?.querySelector('.figure-head strong')?.textContent || '';
    return norm(head || cap || img.alt || img.src);
  }

  function withBust(src){
    try{
      const u = new URL(src, location.href);
      u.searchParams.set('v', Date.now());
      return u.href;
    }catch(_){
      return src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
    }
  }

  function remember(img){
    if(!img.complete || !img.naturalWidth) return;
    const k = keyFor(img);
    if(k) memory.set(k, img.currentSrc || img.src);
    img.dataset.graphStableReady = '1';
    img.style.visibility = 'visible';
  }

  function restorePrevious(img){
    const k = keyFor(img);
    const prev = k ? memory.get(k) : null;
    if(prev && prev !== img.src){
      img.src = prev;
      img.dataset.graphStableFallback = '1';
      img.style.visibility = 'visible';
      return true;
    }
    return false;
  }

  function prepare(img){
    if(!(img instanceof HTMLImageElement) || !img.closest('.hydro-figure')) return;
    if(img.dataset.graphStableBound === '1') return;
    img.dataset.graphStableBound = '1';
    img.loading = 'eager';
    img.decoding = 'async';
    img.style.minHeight = img.style.minHeight || '180px';

    if(img.complete && img.naturalWidth){ remember(img); return; }

    const original = img.currentSrc || img.src;
    const probe = new Image();
    probe.decoding = 'async';
    probe.onload = () => {
      img.src = probe.src;
      remember(img);
    };
    probe.onerror = () => {
      if(!restorePrevious(img)) img.style.visibility = 'visible';
    };
    probe.src = withBust(original);

    img.addEventListener('load', () => remember(img));
    img.addEventListener('error', () => {
      let n = Number(img.dataset.graphRetry || 0);
      if(n >= MAX_RETRIES){ restorePrevious(img); return; }
      img.dataset.graphRetry = String(n + 1);
      const prior = keyFor(img) ? memory.get(keyFor(img)) : null;
      if(prior) img.src = prior;
      setTimeout(() => {
        const retry = new Image();
        retry.onload = () => { img.src = retry.src; remember(img); };
        retry.onerror = () => { if(Number(img.dataset.graphRetry || 0) >= MAX_RETRIES) restorePrevious(img); };
        retry.src = withBust(original);
      }, RETRY_MS * (n + 1));
    });
  }

  function scan(root=document){
    root.querySelectorAll?.('.hydro-figure img').forEach(prepare);
  }

  document.addEventListener('DOMContentLoaded', () => {
    scan();
    const content = document.getElementById('content');
    if(content){
      new MutationObserver(muts => {
        for(const m of muts){
          m.addedNodes.forEach(n => {
            if(n.nodeType !== 1) return;
            if(n.matches?.('.hydro-figure img')) prepare(n);
            else scan(n);
          });
        }
      }).observe(content,{childList:true,subtree:true});
    }
    document.getElementById('refreshBtn')?.addEventListener('click', () => setTimeout(scan, 700));
    window.addEventListener('focus', () => setTimeout(scan, 50));
    window.addEventListener('online', () => setTimeout(scan, 50));
  });
})();
