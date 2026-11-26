/* Retrait du mode hors ligne : à publier à la place de sw.js. Vide les copies et se désinstalle. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("us013-hl-") === 0 || k.indexOf("essai-hl-") === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.registration.unregister(); }));
});
