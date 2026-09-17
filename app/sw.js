self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }catch(_){ }
    try{await self.registration.unregister();}catch(_){ }
    try{
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      clients.forEach(c=>c.navigate(c.url));
    }catch(_){ }
  })());
});

// Sin manejador fetch: la aplicación vuelve a usar directamente la red.
