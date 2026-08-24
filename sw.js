const CACHE = 'dr-estomato-v8';
const APP_SHELL = ['/', '/index.html', '/styles.css?v=20260824-8', '/app.js?v=20260824-8', '/manifest.webmanifest', '/assets/dr-estomato.jpeg', '/assets/icon-192.png', '/assets/icon-512.png'];

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() || {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || 'Dr. Estomato', { body: data.body || 'Você recebeu uma nova mensagem da equipe.', icon: '/assets/icon-192.png', badge: '/assets/icon-192.png', tag: `case-${data.caseId || 'message'}`, data: { url: '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => { const open = clients.find(client => new URL(client.url).origin === self.location.origin); return open ? (open.focus(), open.navigate('/')) : self.clients.openWindow('/'); }));
});
