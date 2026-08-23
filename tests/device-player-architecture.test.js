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
  assert.match(playerHtml, /data-activation-view/);
  assert.match(playerHtml, /data-tv-player/);
  assert.match(connectHtml, /Сканировать QR/);
  assert.match(connectHtml, /6-значный резервный код/);
});

test('offline player keeps only its own shell, context and same-origin assets', async () => {
  const [worker, player] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(worker, /tv-menu-player-shell-v1/);
  assert.match(worker, /PLAYER_CONTEXT = '\/api\/device\/player-context'/);
  assert.match(worker, /response\.status === 401 \|\| response\.status === 403[\s\S]*cache\.delete\(PLAYER_CONTEXT\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/site-assets\/'\)/);
  assert.doesNotMatch(worker, /\/api\/auth|\/api\/settings|\/api\/catalog/);
  assert.match(player, /PLAYER_CONTEXT_STORAGE_KEY/);
  assert.match(player, /showCachedPlayer/);
  assert.match(player, /serviceWorker\.register\('\/player-sw\.js'/);
  assert.match(player, /Нет связи с сервером\. ТВ работает по последней сохранённой версии меню/);
});

test('admin connection flow requires explicit location and screen selection before authorization', async () => {
  const [navigation, application, page] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js')
  ]);
  assert.match(navigation, /\['Подключить ТВ', '\/connect-tv\.html'\]/);
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
