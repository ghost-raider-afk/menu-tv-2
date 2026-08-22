const SHELL_CACHE = 'tv-menu-player-shell-v21';
const DATA_CACHE = 'tv-menu-player-data-v1';
const PLAYER_CONTEXT = '/api/device/player-context';
const SHELL_ASSETS = [
  '/player.html',
  '/css/player.css',
  '/css/motion-effects.css',
  '/js/player/player.js',
  '/js/player/player-legacy.js',
  '/js/editor/renderer.js',
  '/js/editor/settings.js',
  '/js/motion/preview-player.js',
  '/js/motion/screen-preview.js'
];

function expectedContentType(pathname) {
  if (pathname.endsWith('.html')) return 'text/html';
  if (pathname.endsWith('.css')) return 'text/css';
  if (pathname.endsWith('.js')) return 'javascript';
  return '';
}

function isValidShellResponse(pathname, response) {
  if (!response || !response.ok) return false;
  const expected = expectedContentType(pathname);
  const actual = String(response.headers.get('content-type') || '').toLowerCase();
  return !expected || actual.includes(expected);
}

async function fetchShellAsset(request) {
  const response = await networkWithTimeout(request, 4000);
  const pathname = new URL(request.url).pathname;
  if (!isValidShellResponse(pathname, response)) throw new Error(`Invalid Player shell response for ${pathname}`);
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map(async (pathname) => {
      const response = await fetchShellAsset(new Request(pathname, { cache: 'no-store' }));
      await cache.put(pathname, response);
    }));
  })());
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('tv-menu-player-') && !keep.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
async function networkWithTimeout(request, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function playerPage(request) {
  try {
    const response = await networkWithTimeout(request, 4000);
    if (isValidShellResponse('/player.html', response)) { const cache = await caches.open(SHELL_CACHE); await cache.put('/player.html', response.clone()); }
    return response;
  } catch {
    const cached = await caches.match('/player.html');
    return isValidShellResponse('/player.html', cached) ? cached : Response.error();
  }
}
async function playerContext(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await networkWithTimeout(request, 4000);
    if (response.status === 401 || response.status === 403) { await cache.delete(PLAYER_CONTEXT); return response; }
    if (response.ok) { await cache.put(PLAYER_CONTEXT, response.clone()); return response; }
    return (await cache.match(PLAYER_CONTEXT)) || response;
  } catch {
    const cached = await cache.match(PLAYER_CONTEXT);
    if (!cached) return Response.error();
    const headers = new Headers(cached.headers); headers.set('x-tv-menu-offline', '1');
    return new Response(await cached.clone().arrayBuffer(), { status: cached.status, statusText: cached.statusText, headers });
  }
}
async function refreshShellAsset(cache, request) {
  try { const response = await fetchShellAsset(request); await cache.put(request, response.clone()); return response; }
  catch { return null; }
}
async function shellAsset(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const refresh = refreshShellAsset(cache, request);
  const pathname = new URL(request.url).pathname;
  if (isValidShellResponse(pathname, cached)) { event.waitUntil(refresh); return cached; }
  if (cached) await cache.delete(request);
  return (await refresh) || Response.error();
}
async function assetRequest(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  try { const response = await networkWithTimeout(request, 5000); if (response.ok) await cache.put(request, response.clone()); return response.ok ? response : (cached || response); }
  catch { return cached || Response.error(); }
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && (url.pathname === '/player' || url.pathname === '/player.html')) { event.respondWith(playerPage(event.request)); return; }
  if (url.pathname === PLAYER_CONTEXT) { event.respondWith(playerContext(event.request)); return; }
  if (SHELL_ASSETS.includes(url.pathname)) { event.respondWith(shellAsset(event.request, event)); return; }
  if (url.pathname.startsWith('/site-assets/')) event.respondWith(assetRequest(event.request));
});
