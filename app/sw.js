const CACHE='hmr-app-v76';
const GRAPH_CACHE='hmr-graphs-stable';
const ASSETS=['./styles.css','./app.js','./graficas-48h.js','./logo-ipcet.svg','./manifest.webmanifest','./app-icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.allSettled(ASSETS.map(async a=>{try{const r=await fetch(a,{cache:'reload'});if(r.ok)await c.put(a,r.clone())}catch(_){}}))})())});
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k!==CACHE&&k!==GRAPH_CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('./index.html').then(r=>r||Response.redirect('./',302))));
    return;
  }
  if(url.pathname.includes('/Graficas/')){
    e.respondWith((async()=>{
      const stable=new Request(url.origin+url.pathname,{method:'GET',credentials:e.request.credentials,mode:e.request.mode,redirect:'follow'});
      const c=await caches.open(GRAPH_CACHE);
      try{
        const r=await fetch(e.request,{cache:'no-store'});
        if(r.ok&&String(r.headers.get('content-type')||'').startsWith('image/')){await c.put(stable,r.clone());return r}
        throw new Error('imagen no válida');
      }catch(_){
        const prev=await c.match(stable);
        if(prev)return prev;
        return fetch(stable,{cache:'reload'}).then(async r=>{if(r.ok)await c.put(stable,r.clone());return r});
      }
    })());
    return;
  }
  const live=url.pathname.includes('/data/')||url.pathname.includes('/config/')||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('manifest.webmanifest');
  if(live){e.respondWith(fetch(e.request,{cache:'no-store'}).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return resp}).catch(()=>caches.match(e.request)));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});