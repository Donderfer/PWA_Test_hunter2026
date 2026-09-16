/* ==========================================================================
   Service Worker — offline-first.

   Стратегия: precache всего приложения на install + cache-first на fetch.
   Банк вопросов статичен и лежит в бандле, сетевых вызовов у приложения нет,
   поэтому network-first или stale-while-revalidate не дали бы ничего, кроме
   лишних запросов и зависимости от сети на старте.

   Обновление: версия зашита в CACHE. При смене версии старые кэши сносятся
   в activate. skipWaiting намеренно НЕ вызывается — иначе можно подменить
   ресурсы посреди начатого экзамена; новая версия подхватится при следующем
   полном запуске.
   ========================================================================== */

const CACHE = 'boo2026-flat-v1.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll атомарен: один недоступный файл обрушит установку целиком.
         Это желаемое поведение — половинчатый оффлайн хуже отсутствующего. */
      return c.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Навигационные запросы всегда отдаём index.html: приложение
     одностраничное, маршрутизация живёт в hash. */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (r) {
        return r || fetch(req);
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        /* Кладём в кэш только успешные однородные ответы — иначе рискуем
           закэшировать 404 или ответ прокси и получить «мёртвое» приложение. */
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
