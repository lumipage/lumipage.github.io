/* lumipage US-013 : mode hors ligne (service worker). COPIE D ESSAI (adresse jamais imprimée). Portée : le dossier de ce fichier seulement.
   Une page destination envoie sa liste : elle-même, ses fichiers et les 40 destinations de sa langue.
   Pages : réseau d'abord, copie gardée en secours. Fichiers versionnés (?v=...) et polices : copie d'abord ; autres données (daily.json) : réseau d'abord.
   Rien n'est envoyé ; seules les pages et fichiers du site sont gardés sur le téléphone.
   Pour le retirer : remplacer ce fichier par sw-retrait.js (voir README hors ligne). */
var PFX = "essai-hl-", CACHE = PFX + "2";
self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(PFX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function same(u) { return new URL(u).origin === self.location.origin; }
function inScope(u) { return u.indexOf(self.registration.scope) === 0; }
self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.type !== "keep" || !Array.isArray(d.urls)) return;
  var urls = d.urls.filter(function (u) { return typeof u === "string" && same(u) && inScope(u); }).slice(0, 80);
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(urls.map(function (u) {
      return c.match(u).then(function (hit) { return hit || fetch(u).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); });
    }));
  }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET" || !same(r.url)) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(r).then(function (hit) { return hit || caches.match(r.url + (r.url.endsWith("/") ? "" : "/")); }).then(function (hit) { if (hit) return hit; throw new Error("offline"); });
    }));
    return;
  }
  var fixe = /[?&]v=/.test(r.url) || /\.woff2$/.test(new URL(r.url).pathname);
  if (!fixe) {
    e.respondWith(fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () { return caches.match(r).then(function (hit) { if (hit) return hit; throw new Error("offline"); }); }));
    return;
  }
  e.respondWith(caches.match(r).then(function (hit) {
    return hit || fetch(r).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
      return res;
    });
  }));
});
