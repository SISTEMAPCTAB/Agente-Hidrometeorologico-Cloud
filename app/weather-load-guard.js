(() => {
  const originalFetch = window.fetch.bind(window);
  const inflight = new Map();
  const targets = [
    '/data/niveles/Lluvia_CONAGUA/ultimo_corte.json',
    '/data/niveles/Clima_CONAGUA/ultimo_corte.json',
    '/data/catalogos/estaciones_influencia_hidrologica.json'
  ];

  function keyFor(input) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      const u = new URL(raw, location.href);
      return targets.some(p => u.pathname.endsWith(p)) ? u.pathname : null;
    } catch {
      return null;
    }
  }

  window.fetch = function(input, init) {
    const key = keyFor(input);
    if (!key) return originalFetch(input, init);

    if (inflight.has(key)) {
      return inflight.get(key).then(r => r.clone());
    }

    const p = originalFetch(input, init)
      .then(r => {
        setTimeout(() => inflight.delete(key), 2500);
        return r;
      })
      .catch(err => {
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, p);
    return p.then(r => r.clone());
  };
})();
