const SHELL_CACHE = 'tv-menu-player-shell-v12';
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

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
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
    if (response.ok) { const cache = await caches.open(SHELL_CACHE); await cache.put('/player.html', response.clone()); }
    return response;
  } catch { return (await caches.match('/player.html')) || Response.error(); }
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
  try { const response = await networkWithTimeout(request, 4000); if (response.ok) await cache.put(request, response.clone()); return response.ok ? response : null; }
  catch { return null; }
}
async function shellAsset(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const refresh = refreshShellAsset(cache, request);
  if (cached) { event.waitUntil(refresh); return cached; }
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
