const CACHE = 'jzac-erp-v1.2.0';
const BASE = './';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/db.js',
  './js/license.js',
  './js/auth.js',
  './js/ui.js',
  './js/scanner.js',
  './lib/jsqr.min.js',
  './js/app.js',
  './js/modules/dashboard.js',
  './js/modules/ventas.js',
  './js/modules/inventario.js',
  './js/modules/clientes.js',
  './js/modules/fiados.js',
  './js/modules/proveedores.js',
  './js/modules/gastos.js',
  './js/modules/reportes.js',
  './js/modules/config.js',
  './icons/icono.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          if (resp.ok) {
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => {
          return caches.match('./index.html');
        });
    })
  );
});