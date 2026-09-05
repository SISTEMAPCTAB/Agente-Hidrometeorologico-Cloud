(() => {
  const nativeFetch = window.fetch.bind(window);
  const TARGET = '/data/niveles/Lluvia_CONAGUA/ultimo_corte.json';

  function normalizePayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.stations)) return payload.stations;
    if (payload && Array.isArray(payload.rows)) return payload.rows;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
  }

  window.ConaguaShape = { normalizePayload };

  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);
    let url = '';
    try {
      url = typeof input === 'string' ? new URL(input, location.href).pathname : new URL(input.url, location.href).pathname;
    } catch (_) {
      return response;
    }
    if (!url.endsWith(TARGET) || !response.ok) return response;

    try {
      const payload = await response.clone().json();
      const normalized = normalizePayload(payload);
      if (Array.isArray(payload)) return response;
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      headers.set('x-app-shape-normalized', 'conagua-rain-array');
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };
})();