import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('player is public while TV connection page remains admin protected', async () => {
  const [server, playerHtml, connectHtml] = await Promise.all([
    read('src/server.js'),
    read('src/web/admin-ui/public/player.html'),
    read('src/web/admin-ui/public/connect-tv.html')
  ]);
  assert.match(server, /'\/connect-tv\.html'/);
  assert.doesNotMatch(server.match(/const protectedPages = \[[\s\S]*?\];/)?.[0] || '', /player/);
  assert.match(server, /app\.use\('\/api\/device', createDevicePublicRouter/);
  assert.match(server, /app\.use\('\/api\/device-admin', createDeviceAdminRouter/);
  assert.match(server, /app\.use\('\/vendor', express\.static\(path\.join\(nodeModulesDir, 'jsqr', 'dist'\)/);
  assert.match(playerHtml, /data-activation-view/);
  assert.match(playerHtml, /data-tv-player/);
  assert.match(playerHtml, /data-activation-expiry/);
  assert.match(connectHtml, /Сканировать QR-код/);
  assert.match(connectHtml, /6-значный резервный код/);
  assert.match(connectHtml, /\/vendor\/jsQR\.js/);
});

test('offline player refreshes its shell online and falls back to cache offline', async () => {
  const [worker, player] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(worker, /tv-menu-player-shell-v\d+/);
  assert.match(worker, /networkFirstShell/);
  assert.match(worker, /cache: 'no-cache'/);
  assert.match(worker, /PLAYER_CONTEXT = '\/api\/device\/player-context'/);
  assert.match(worker, /response\.status === 401 \|\| response\.status === 403[\s\S]*cache\.delete\(PLAYER_CONTEXT\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/site-assets\/'\)/);
  assert.doesNotMatch(worker, /\/api\/auth|\/api\/settings|\/api\/catalog/);
  assert.match(player, /PLAYER_CONTEXT_STORAGE_KEY/);
  assert.match(player, /showCachedPlayer/);
  assert.match(player, /serviceWorker\.register\('\/player-sw\.js'/);
  assert.match(player, /Нет связи с сервером\. ТВ работает по последней сохранённой версии меню/);
});

test('admin connection flow is mobile-first and keeps explicit location and screen selection', async () => {
  const [navigation, application, page, html, css] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js'),
    read('src/web/admin-ui/public/connect-tv.html'),
    read('src/web/admin-ui/public/css/connect-tv.css')
  ]);
  assert.match(navigation, /\['Подключить ТВ', '\/connect-tv\.html'\]/);
  assert.match(application, /case 'connect-tv'/);
  assert.match(page, /selectedLocationId/);
  assert.match(page, /selectedScreenId/);
  assert.match(page, /API\.deviceAuthorize/);
  assert.match(page, /BarcodeDetector/);
  assert.match(page, /window\.jsQR/);
  assert.match(page, /getUserMedia/);
  assert.match(page, /focusStep\(locationStep, 'location'\)/);
  assert.match(page, /focusStep\(screenStep, 'screen'\)/);
  assert.match(html, /data-scanner role="dialog" aria-modal="true"/);
  assert.match(html, /data-scanner-code/);
  assert.match(css, /\.connect-tv-scanner \{[\s\S]*position: fixed;[\s\S]*inset: 0;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.connect-tv-card\.is-disabled \{[\s\S]*display: none;/);
});

test('TV activation lifetime is env-driven, defaults to two minutes and rotates automatically', async () => {
  const [env, player, publicRoutes] = await Promise.all([
    read('.env.example'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/api/device/public-routes.js')
  ]);
  assert.match(env, /^DEVICE_ACTIVATION_TTL_MINUTES=2$/m);
  assert.match(publicRoutes, /config\.deviceActivationTtlMinutes \* 60_000/);
  assert.match(publicRoutes, /expires_at: expiresAt/);
  assert.match(player, /Date\.parse\(record\.expires_at\) - Date\.now\(\)/);
  assert.match(player, /QR действителен/);
  assert.match(player, /createActivation\(\{ automatic: true \}\)/);
  assert.match(player, /invalidatePairing/);
  assert.doesNotMatch(player, /120_000|120000/);
});

test('runtime TV device settings are declared in env example', async () => {
  const env = await read('.env.example');
  for (const key of [
    'DEVICE_ACTIVATION_TTL_MINUTES',
    'DEVICE_ACTIVATION_POLL_SECONDS',
    'DEVICE_ACTIVATION_MAX_ATTEMPTS',
    'DEVICE_ACTIVATION_WINDOW_MINUTES',
    'DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES',
    'DEVICE_ACTIVATION_CLEANUP_MINUTES',
    'DEVICE_ACTIVATION_RETENTION_HOURS',
    'DEVICE_SESSION_TTL_DAYS',
    'DEVICE_HEARTBEAT_WRITE_SECONDS',
    'PLAYER_REFRESH_SECONDS'
  ]) assert.match(env, new RegExp(`^${key}=`, 'm'), key);
});
