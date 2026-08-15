// Bump this on any release that changes cached files, so old clients pick
// up the new versions instead of serving stale ones forever.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `favethings-${CACHE_VERSION}`;

// Precached at install: the app shell for pages that work without a live
// two-person connection — home shell, Memory Match, Trial Mode, Hugo Pong.
// Two-person modes (Quick Play, What Would You Say, Date Roulette) sync two
// separate phones through the live server by design and aren't included —
// there's no meaningful "offline" version of a game two people play together
// in real time.
const SHELL_URLS = [
  '/',
  '/style.css',
  '/layout.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/socket.io/socket.io.js',
  '/memory',
  '/memory.js',
  '/trial',
  '/trial.js',
  '/hugo-pong',
  '/hugo-pong.js',
  '/hugo-pong.css',
  '/api/symbols',
  '/api/photos',
  '/api/deck',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POSTs (spins, leaderboard writes, etc.)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin requests

  // Socket.IO's realtime long-poll/websocket handshake traffic must always
  // hit the network live — only its static client script is cacheable.
  if (url.pathname.startsWith('/socket.io/') && url.pathname !== '/socket.io/socket.io.js') return;

  if (url.pathname.startsWith('/images/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

// Images are effectively immutable once created — check the cache before
// ever touching the network, and cache whatever we do fetch for next time.
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

// App shell + data: prefer a fresh copy (this app deploys often) but fall
// back to the last cached copy when there's no network at all.
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw err;
  }
}
