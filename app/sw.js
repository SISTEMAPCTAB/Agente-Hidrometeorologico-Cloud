const CACHE='hmr-app-v80';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./app-icon-512.png','./apple-touch-icon.png'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map(async a=>{
      try{
        const r=await fetch(a);
        if(r.ok)await c.put(a,r.clone());
      }catch(_){ }
    }));
  })());
});

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);

  // Navegacion: red primero, pero conserva la ultima pagina valida.
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const r=await fetch(e.request);
        if(r.ok){
          const c=await caches.open(CACHE);
          await c.put('./index.html',r.clone());
          return r;
        }
        const cached=await caches.match('./index.html')||await caches.match('./');
        return cached||r;
      }catch(_){
        return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }

  // Datos: una consulta normal a la red y respaldo inmediato del ultimo dato valido.
  // No se usa no-store ni cache-busting desde el service worker para no provocar rate limit.
  if(u.pathname.includes('/data/')){
    e.respondWith((async()=>{
      const cached=await caches.match(e.request,{ignoreSearch:true});
      try{
        const r=await fetch(e.request);
        if(r.ok){
          const c=await caches.open(CACHE);
          await c.put(e.request,r.clone());
          return r;
        }
        return cached||r;
      }catch(_){
        return cached||Response.error();
      }
    })());
    return;
  }

  // JS/CSS/manifest: cache primero para que abrir o navegar no multiplique solicitudes.
  if(u.pathname.endsWith('.js')||u.pathname.endsWith('.css')||u.pathname.endsWith('manifest.webmanifest')){
    e.respondWith((async()=>{
      const cached=await caches.match(e.request,{ignoreSearch:true});
      if(cached)return cached;
      try{
        const r=await fetch(e.request);
        if(r.ok){
          const c=await caches.open(CACHE);
          await c.put(e.request,r.clone());
        }
        return r;
      }catch(_){
        return Response.error();
      }
    })());
    return;
  }

  e.respondWith((async()=>{
    const cached=await caches.match(e.request,{ignoreSearch:true});
    if(cached)return cached;
    try{return await fetch(e.request)}catch(_){return Response.error()}
  })());
});