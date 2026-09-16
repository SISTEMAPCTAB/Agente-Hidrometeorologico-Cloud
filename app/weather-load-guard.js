(() => {
  const originalFetch = window.fetch.bind(window);
  const inflight = new Map();
  const lastGood = new Map();
  const targets = [
    '/data/niveles/Ultimo_Corte/ultimo_resumen.json',
    '/data/niveles/Historico/niveles_historicos.json',
    '/data/weatherlink/latest.json',
    '/data/weatherlink/Estado_WeatherLink_Cloud.json',
    '/data/niveles/Lluvia_CONAGUA/ultimo_corte.json',
    '/data/niveles/Clima_CONAGUA/ultimo_corte.json',
    '/data/catalogos/estaciones_influencia_hidrologica.json',
    '/data/fuentes_publicas/latest.json',
    '/data/analysis/latest.md',
    '/data/latest/FUENTE2.txt',
    '/data/presas/historico_mensual.json',
    '/data/niveles/Estado_Niveles_Cloud.json',
    '/data/niveles/Estado_Gmail_Backup.json'
  ];

  function keyFor(input) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      const u = new URL(raw, location.href);
      return targets.find(p => u.pathname.endsWith(p)) || null;
    } catch {
      return null;
    }
  }

  async function fetchWithRetry(input, init) {
    let firstError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await originalFetch(input, init);
        if (r.ok) return r;
        firstError ||= new Error(`HTTP ${r.status}`);
      } catch (err) {
        firstError ||= err;
      }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 350));
    }
    throw firstError || new Error('Fallo temporal de red');
  }

  window.fetch = function(input, init) {
    const key = keyFor(input);
    if (!key) return originalFetch(input, init);

    if (inflight.has(key)) {
      return inflight.get(key).then(r => r.clone());
    }

    const p = fetchWithRetry(input, init)
      .then(r => {
        if (r.ok) lastGood.set(key, r.clone());
        return r;
      })
      .catch(err => {
        const cached = lastGood.get(key);
        if (cached) return cached.clone();
        throw err;
      })
      .finally(() => {
        setTimeout(() => inflight.delete(key), 1200);
      });

    inflight.set(key, p);
    return p.then(r => r.clone());
  };
})();
