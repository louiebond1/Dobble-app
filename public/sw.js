// Bump this on any release that changes cached files, so old clients pick
// up the new versions instead of serving stale ones forever.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `favethings-${CACHE_VERSION}`;

// Precached at install: the app shell for pages that work without a live
// two-person connection — home shell, Memory Match, Trial Mode, Hugo Pong.
// Two-person modes (Quick Play, What Would You Say, Date Roulette) sync two
// separate phones through the live server by design and aren't included —
// there's no meaningful "offline" version of a game two people play together
// in real time. Those still get a friendly offline.html instead of a broken
// page — see the fetch handler below.
const SHELL_URLS = [
  '/',
  '/offline.html',
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
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

// cache.addAll() is all-or-nothing — one flaky fetch out of twenty would
// silently sink the ENTIRE precache and leave the app with zero offline
// support. Fetch each shell URL independently instead, so a single failure
// (or a request still in flight when the page unloads) doesn't take
// everything else down with it.
async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(
    SHELL_URLS.map(async (url) => {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      await cache.put(url, res);
    })
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.warn('[sw] precache had failures, continuing with the rest:', failed.map((f) => f.reason && f.reason.message));
  }
}

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
// back to the last cached copy when there's no network at all. A page
// navigation that's neither reachable nor cached (a two-person mode you
// haven't opened before, with no signal) gets our own offline.html instead
// of the browser's bare "not connected" page.
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
    if (req.mode === 'navigate') {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    throw err;
  }
}
