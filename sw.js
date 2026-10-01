/* Service Worker — مصحف المدينة - رواية حفص v2
 * ثلاث كاشات مُصدَّرة لضمان أفضل أداء ودعم حقيقي للأوفلاين:
 *   shell-v1  : القشرة والأصول الثابتة (HTML, JS, Manifest, Icons)
 *   data-v1   : ملفات البيانات والفهارس (data/book.json)
 *   media-v1  : صور صفحات الكتاب والوسائط
 */

const VERSION = 'v1';
const SHELL_CACHE = 'shell-' + VERSION;
const DATA_CACHE = 'data-' + VERSION;
const MEDIA_CACHE = 'media-' + VERSION;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/data.js',
  './src/audio.js',
  './src/arabic.js',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, MEDIA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isData(request) {
  const url = new URL(request.url);
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

function isMedia(request) {
  return ['image', 'audio', 'font'].includes(request.destination) ||
         /\.(?:jpg|jpeg|png|webp|gif|svg)$/i.test(request.url);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // تنقل الصفحات
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // البيانات: Stale-While-Revalidate
  if (isData(request)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || network || Response.error();
      })
    );
    return;
  }

  // الوسائط والقشرة: Cache-First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const cacheName = isMedia(request) ? MEDIA_CACHE : SHELL_CACHE;
            const copy = res.clone();
            caches.open(cacheName).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => Response.error());
    })
  );
});

// تحميل الكتاب للأوفلاين
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'DOWNLOAD_BOOK' || !Array.isArray(data.urls)) return;

  const client = event.source;
  const total = data.urls.length;
  let done = 0;
  let failed = 0;

  const notify = (extra = {}) =>
    client &&
    client.postMessage({ type: 'DOWNLOAD_PROGRESS', done, total, failed, ...extra });

  event.waitUntil(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE);

      if (self.navigator?.storage?.persist) {
        try {
          await self.navigator.storage.persist();
        } catch (_) {}
      }

      for (const url of data.urls) {
        try {
          const already = await cache.match(url);
          if (!already) {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            await cache.put(url, res.clone());
          }
          done++;
        } catch (err) {
          failed++;
          if (err && err.name === 'QuotaExceededError') {
            notify({ error: 'QUOTA', message: 'انتهت مساحة التخزين المتاحة على هذا الجهاز.' });
            return;
          }
        }
        if (done % 5 === 0 || done === total) notify();
      }
      notify({ error: null, finished: true });
    })()
  );
});
