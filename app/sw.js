const CACHE='hmr-app-v75';
const ASSETS=['./styles.css','./app.js','./logo-ipcet.svg','./manifest.webmanifest','./app-icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.allSettled(ASSETS.map(async a=>{try{const r=await fetch(a,{cache:'reload'});if(r.ok)await c.put(a,r.clone())}catch(_){}}))})())});
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('./index.html').then(r=>r||Response.redirect('./',302))));
    return;
  }
  const live=url.pathname.includes('/data/')||url.pathname.includes('/config/')||url.pathname.includes('/Graficas/')||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('manifest.webmanifest');
  if(live){e.respondWith(fetch(e.request,{cache:'no-store'}).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return resp}).catch(()=>caches.match(e.request)));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});