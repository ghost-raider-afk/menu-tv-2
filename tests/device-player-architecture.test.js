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
  assert.match(playerHtml, /data-player-boot/);
  assert.match(playerHtml, /activation-view is-hidden[^>]*data-activation-view[^>]*hidden/);
  assert.match(playerHtml, /tv-player is-hidden[^>]*data-tv-player[^>]*hidden/);
  assert.match(connectHtml, /Сканировать QR/);
  assert.match(connectHtml, /6-значный резервный код/);
});

test('offline player keeps its shell, motion engine, context and same-origin assets', async () => {
  const [worker, player] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(worker, /tv-menu-player-shell-v6/);
  assert.match(worker, /PLAYER_CONTEXT = '\/api\/device\/player-context'/);
  assert.match(worker, /\/js\/motion\/preview-player\.js/);
  assert.match(worker, /\/js\/motion\/screen-preview\.js/);
  assert.match(worker, /\/js\/editor\/settings\.js/);
  assert.match(worker, /response\.status === 401 \|\| response\.status === 403[\s\S]*cache\.delete\(PLAYER_CONTEXT\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/site-assets\/'\)/);
  assert.doesNotMatch(worker, /\/api\/auth|\/api\/settings|\/api\/catalog/);
  assert.match(player, /PLAYER_CONTEXT_STORAGE_KEY/);
  assert.match(player, /AnimationPreviewPlayer/);
  assert.match(player, /renderAnimationScreenPreview/);
  assert.match(player, /animation\?\.enabled === true/);
  assert.match(player, /restart\(animation\.profile\)/);
  assert.match(player, /showCachedPlayer/);
  assert.match(player, /showBootScreen/);
  assert.match(player, /response\.status === 409/);
  assert.match(player, /resolveInitialPlayerState/);
  assert.match(player, /serviceWorker\.register\('\/player-sw\.js'/);
  assert.match(player, /Нет связи с сервером\. ТВ работает по последней сохранённой версии меню/);
});

test('rapid reload cannot expose raw Player screens or drop a cached shell asset', async () => {
  const [html, worker, player] = await Promise.all([
    read('src/web/admin-ui/public/player.html'),
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(html, /data-activation-view hidden/);
  assert.match(html, /data-activation-pairing hidden/);
  assert.match(html, /data-tv-player[^>]*hidden/);
  assert.match(html, /data-player-message[^>]*hidden/);
  assert.match(player, /element\.hidden = Boolean\(hidden\)/);
  const shellAsset = worker.match(/async function shellAsset\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(shellAsset, /const cached = await cache\.match\(request\)/);
  assert.match(shellAsset, /if \(cached\)[\s\S]*event\.waitUntil\(refresh\)[\s\S]*return cached/);
});

test('static TV background stays inside the exact player screen bounds', async () => {
  const css = await read('src/web/admin-ui/public/css/player.css');
  const rule = css.match(/\.tv-player-stage \.animation-screen-background \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(rule, /inset:\s*0;/);
  assert.match(rule, /transform:\s*none;/);
  assert.doesNotMatch(rule, /inset:\s*-\d/);
  assert.doesNotMatch(rule, /scale\(/);
});

test('authorized TV cannot create another activation request', async () => {
  const routes = await read('src/api/device/public-routes.js');
  const activationRoute = routes.match(/router\.post\('\/activations'[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(activationRoute, /resolveDeviceSession/);
  assert.match(activationRoute, /existingSession/);
  assert.match(activationRoute, /status\(409\)/);
  assert.match(activationRoute, /Телевизор уже авторизован/);
});

test('player context includes the saved global animation profile', async () => {
  const routes = await read('src/api/device/public-routes.js');
  assert.match(routes, /store\.getAnimationSettings\(\)/);
  assert.match(routes, /animation:\s*animation \|\|/);
});

test('TV connection is a separate device branch inside monitor submenu', async () => {
  const [navigation, contextPanel, screens, application, page] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/components/context-panel.js'),
    read('src/web/admin-ui/public/screens.html'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js')
  ]);
  assert.match(navigation, /label: 'ТЕЛЕВИЗОРЫ'/);
  assert.match(navigation, /\['Подключение ТВ', '\/connect-tv\.html'\]/);
  assert.match(contextPanel, /is-device-route/);
  assert.doesNotMatch(screens, />Подключить ТВ<\/a>/);
  assert.match(application, /case 'connect-tv'/);
  assert.match(page, /selectedLocationId/);
  assert.match(page, /selectedScreenId/);
  assert.match(page, /API\.deviceAuthorize/);
  assert.match(page, /BarcodeDetector/);
});

test('runtime TV device settings are declared in env example', async () => {
  const env = await read('.env.example');
  for (const key of [
    'DEVICE_ACTIVATION_TTL_MINUTES',
    'DEVICE_ACTIVATION_POLL_SECONDS',
    'DEVICE_SESSION_TTL_DAYS',
    'DEVICE_HEARTBEAT_WRITE_SECONDS',
    'PLAYER_REFRESH_SECONDS'
  ]) assert.match(env, new RegExp(`^${key}=`, 'm'), key);
});
