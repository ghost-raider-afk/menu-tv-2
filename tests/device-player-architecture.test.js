import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('player is public while TV connection page remains admin protected', async () => {
  const [server, playerHtml, connectHtml] = await Promise.all([
    read('src/server.js'), read('src/web/admin-ui/public/player.html'), read('src/web/admin-ui/public/connect-tv.html')
  ]);
  assert.match(server, /'\/connect-tv\.html'/);
  assert.doesNotMatch(server.match(/const protectedPages = \[[\s\S]*?\];/)?.[0] || '', /player/);
  assert.match(server, /app\.use\('\/api\/device', createDevicePublicRouter/);
  assert.match(server, /app\.use\('\/api\/device-admin', createDeviceAdminRouter/);
  assert.match(playerHtml, /data-activation-view/);
  assert.match(playerHtml, /data-tv-player/);
  assert.match(connectHtml, /Сканировать QR-код/);
});

test('real TV player runs the continuous WASM Motion Engine and keeps it available offline', async () => {
  const [worker, player, liveMotion, motionPlan, adapter, wasmDriver, publicRoutes, playerCss] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/motion/live-menu-motion.js'),
    read('src/web/admin-ui/public/js/motion/motion-plan.js'),
    read('src/web/admin-ui/public/js/motion/dom-scene-adapter.js'),
    read('src/web/admin-ui/public/js/motion/drivers/wasm-motion-driver.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/css/player.css')
  ]);
  assert.match(worker, /mira-tv-player-shell-v\d+/);
  for (const asset of [
    '/js/editor/renderer.js','/js/editor/renderer-model.js','/js/editor/renderer-svg.js',
    '/js/motion/live-menu-motion.js','/js/motion/motion-plan.js','/js/motion/dom-scene-adapter.js',
    '/js/motion/drivers/wasm-motion-driver.js','/js/motion/wasm-motion-kernel.js','/wasm/mira-motion-kernel.wasm'
  ]) assert.ok(worker.includes(`'${asset}'`), `offline shell is missing ${asset}`);
  assert.match(player, /new LiveMenuMotion\(playerStage\)/);
  assert.match(player, /context\.animation\?\.enabled/);
  assert.match(player, /sameOriginAsset\(context\?\.entity\?\.asset_url\)/);
  assert.match(liveMotion, /WasmMotionDriver/);
  assert.match(liveMotion, /DEFAULT_SCENE_COMPILERS/);
  assert.match(motionPlan, /procedural:/);
  assert.doesNotMatch(motionPlan, /keyframes:/);
  assert.doesNotMatch(motionPlan, /background_effect|background_zoom_percent/);
  assert.doesNotMatch(adapter, /kind: 'background'/);
  assert.doesNotMatch(adapter, /kind: 'price'/);
  assert.match(wasmDriver, /requestAnimationFrame/);
  assert.match(publicRoutes, /animation:\s*\{/);
  assert.match(publicRoutes, /enabled: animationSettings\?\.enabled === true/);
  assert.match(playerCss, /\.tv-player-announcement-layer/);
  assert.match(playerCss, /transform-box:\s*fill-box/);
  assert.match(player, /showCachedPlayer/);
  assert.match(player, /serviceWorker\.register\('\/player-sw\.js'/);
  assert.match(player, /void registerOfflinePlayer\(\)/);
  assert.doesNotMatch(player, /await registerOfflinePlayer\(\)/);
});

test('offline player caches Video Entity fully and serves byte ranges from cache', async () => {
  const [worker, player] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(player, /warmPlayerAssetCache/);
  assert.match(player, /fetch\(asset, \{ cache: 'reload' \}/);
  assert.match(worker, /cachedVideoRange/);
  assert.match(worker, /Accept-Ranges/);
  assert.match(worker, /Content-Range/);
  assert.match(worker, /Partial Content/);
  assert.match(worker, /status:\s*206/);
  assert.match(worker, /mp4\|webm/);
});

test('TV identity is persistent and monitor binding is a first-class one-to-one relation', async () => {
  const [migration, repository, routes, player] = await Promise.all([
    read('src/db/migrations/device-bindings.js'),
    read('src/db/devices.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(migration, /device_key TEXT/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tv_device_bindings/);
  assert.match(migration, /tv_device_bindings_active_device_unique/);
  assert.match(migration, /tv_device_bindings_active_screen_unique/);
  assert.match(migration, /UPDATE tv_devices SET screen_id = NULL/);
  assert.match(repository, /async function bindDevice/);
  assert.match(repository, /JOIN tv_device_bindings b ON b\.device_id = d\.id AND b\.active = TRUE/);
  assert.match(repository, /UPDATE tv_device_sessions SET revoked_at/);
  assert.match(routes, /deviceKey: persistentDeviceKey\(activation\.device_key\)/);
  assert.match(routes, /tx\.bindDevice/);
  assert.match(player, /DEVICE_KEY_STORAGE_KEY/);
  assert.match(player, /device_key: currentDeviceKey\(\) \|\| undefined/);
  assert.match(player, /rememberDeviceKey/);
});

test('admin connection flow is mobile-first and diagnoses iOS camera/decoder failures', async () => {
  const [navigation, application, page, html, css] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'), read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js'), read('src/web/admin-ui/public/connect-tv.html'),
    read('src/web/admin-ui/public/css/connect-tv.css')
  ]);
  assert.match(navigation, /\['Подключить ТВ', '\/connect-tv\.html'\]/);
  assert.match(application, /case 'connect-tv'/);
  assert.match(page, /selectedLocationId/);
  assert.match(page, /selectedScreenId/);
  assert.match(page, /API\.deviceAuthorize/);
  assert.match(page, /BarcodeDetector/);
  assert.match(page, /window\.jsQR/);
  assert.match(page, /const JS_QR_SRC = '\/vendor\/jsQR\.js'/);
  assert.match(page, /ensureJsQr/);
  assert.match(page, /document\.head\.append\(script\)/);
  assert.match(page, /function bindDom\(\)/);
  assert.match(page, /function releaseDom\(\)/);
  assert.doesNotMatch(page, /const scanButton = document\.querySelector/);
  assert.doesNotMatch(html, /\/vendor\/jsQR\.js/);
  assert.match(page, /window\.isSecureContext/);
  assert.match(page, /facingMode:\s*\{ ideal: 'environment' \}/);
  assert.match(page, /video\.videoWidth/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /NotAllowedError/);
  assert.match(html, /data-scanner role="dialog" aria-modal="true"/);
  assert.match(css, /\.connect-tv-scanner\{[\s\S]*position:fixed;[\s\S]*inset:0/);
});

test('TV activation lifetime is env-driven, defaults to two minutes and rotates automatically', async () => {
  const [env, player, publicRoutes] = await Promise.all([
    read('.env.example'), read('src/web/admin-ui/public/js/player/player.js'), read('src/api/device/public-routes.js')
  ]);
  assert.match(env, /^DEVICE_ACTIVATION_TTL_MINUTES=2$/m);
  assert.match(publicRoutes, /config\.deviceActivationTtlMinutes \* 60_000/);
  assert.match(publicRoutes, /expires_at: expiresAt/);
  assert.match(player, /Date\.parse\(record\.expires_at\) - Date\.now\(\)/);
  assert.match(player, /createActivation\(\{ automatic: true \}\)/);
  assert.doesNotMatch(player, /120_000|120000/);
});

test('runtime TV device settings are declared in env example', async () => {
  const env = await read('.env.example');
  for (const key of [
    'DEVICE_ACTIVATION_TTL_MINUTES','DEVICE_ACTIVATION_POLL_SECONDS','DEVICE_ACTIVATION_MAX_ATTEMPTS',
    'DEVICE_ACTIVATION_WINDOW_MINUTES','DEVICE_ACTIVATION_LIMITER_MAX_ENTRIES','DEVICE_ACTIVATION_CLEANUP_MINUTES',
    'DEVICE_ACTIVATION_RETENTION_HOURS','DEVICE_SESSION_TTL_DAYS','DEVICE_HEARTBEAT_WRITE_SECONDS','PLAYER_REFRESH_SECONDS'
  ]) assert.match(env, new RegExp(`^${key}=`, 'm'), key);
});
