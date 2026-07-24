self.addEventListener('install', function (event) { self.skipWaiting(); });
self.addEventListener('activate', function (event) { self.clients.claim(); });
self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request).catch(function () { return caches.match(event.request); }));
});
