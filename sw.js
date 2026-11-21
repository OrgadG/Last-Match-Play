// Regenerate the version with: node scripts/version-offline.js
const VERSION = 'cd34eba922771e2d';
const ASSETS = [
  './', './index.html', './styles.css', './game.js', './sound.js', './scores.js',
  './app.js', './offline.js', './felt.svg', './wood.svg', './sulfur.svg',
  './manifest.webmanifest', './icons/apple-touch-icon.png',
  './icons/icon-192.png', './icons/icon-512.png'
];
const PREFIX = `last-match:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  // All files must succeed before this version is ready for offline play.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    ASSETS.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'}))
  )));
  // Deliberately do not skipWaiting: updates must not replace a game in progress.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = ''; url.hash = '';
  if (!assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Keep the complete release together; future versions install into a new cache.
    return (await cache.match(url.href)) || fetch(event.request);
  })());
});
