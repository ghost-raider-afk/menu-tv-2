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

test('offline player keeps its shell, motion engine, Visual FX, context and same-origin assets', async () => {
  const [worker, player] = await Promise.all([
    read('src/web/admin-ui/public/player-sw.js'),
    read('src/web/admin-ui/public/js/player/player.js')
  ]);
  assert.match(worker, /tv-menu-player-shell-v14/);
  assert.match(worker, /PLAYER_CONTEXT = '\/api\/device\/player-context'/);
  assert.match(worker, /\/css\/motion-effects\.css/);
  assert.match(worker, /\/js\/player\/player-legacy\.js/);
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

test('legacy TV browser gets a classic Player when ES modules cannot run', async () => {
  const [html, legacy, routes, motionCss] = await Promise.all([
    read('src/web/admin-ui/public/player.html'),
    read('src/web/admin-ui/public/js/player/player-legacy.js'),
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/css/motion-effects.css')
  ]);
  assert.match(html, /<script defer src="\/js\/player\/player-legacy\.js"><\/script>/);
  assert.match(html, /type="module" data-modern-player/);
  assert.match(legacy, /XMLHttpRequest/);
  assert.match(legacy, /'noModule' in document\.createElement\('script'\)/);
  assert.match(legacy, /modernScript\.addEventListener\('error', function \(\) \{ startLegacy\(\); \}\)/);
  assert.doesNotMatch(legacy, /\?\.|\?\?|=>|\bconst\b|\blet\b|\.padStart\(/);
  assert.match(routes, /buildRenderedPlayerFrame/);
  assert.match(routes, /rendered_frame: renderedFrame/);
  assert.match(routes, /buildTableSvg\(model, lines, layout\)/);
  assert.match(motionCss, /data-legacy-player="true"/);
  assert.match(motionCss, /legacy-ocean-a/);
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
  assert.match(shellAsset, /isValidShellResponse\(pathname, cached\)[\s\S]*event\.waitUntil\(refresh\)[\s\S]*return cached/);
});

test('Player shell cache rejects HTML responses stored under CSS or JavaScript URLs', async () => {
  const worker = await read('src/web/admin-ui/public/player-sw.js');
  assert.match(worker, /function expectedContentType\(pathname\)/);
  assert.match(worker, /pathname\.endsWith\('\.css'\)[\s\S]*'text\/css'/);
  assert.match(worker, /pathname\.endsWith\('\.js'\)[\s\S]*'javascript'/);
  assert.match(worker, /function isValidShellResponse\(pathname, response\)/);
  assert.match(worker, /if \(cached\) await cache\.delete\(request\)/);
  assert.match(worker, /fetchShellAsset\(new Request\(pathname, \{ cache: 'no-store' \}\)\)/);
});

test('Player boot spinner cannot wait forever on service worker or session fetch', async () => {
  const player = await read('src/web/admin-ui/public/js/player/player.js');
  assert.match(player, /const NETWORK_TIMEOUT_MS = 5000/);
  assert.match(player, /function fetchWithTimeout|async function fetchWithTimeout/);
  assert.match(player, /fetchWithTimeout\('\/api\/device\/session'/);
  assert.doesNotMatch(player, /await navigator\.serviceWorker\.ready/);
  assert.doesNotMatch(player, /await registerOfflinePlayer\(\)/);
  assert.match(player, /registerOfflinePlayer\(\);[\s\S]*await resolveInitialPlayerState\(\)/);
  assert.match(player, /showBootScreen\('Нет связи с сервером\. Проверяем повторно…'\)[\s\S]*scheduleInitialRetry\(\)/);
});

test('legacy TV browser boot layout does not depend on CSS grid', async () => {
  const css = await read('src/web/admin-ui/public/css/player.css');
  const bootRule = css.match(/\.player-boot,\.activation-view\s*\{([\s\S]*?)\}/)?.[1] || '';
  const cardRule = css.match(/\.player-boot-card\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(bootRule, /display:flex/);
  assert.match(bootRule, /align-items:center/);
  assert.match(bootRule, /justify-content:center/);
  assert.doesNotMatch(bootRule, /display:grid/);
  assert.match(cardRule, /display:block/);
});

test('static TV background stays inside the exact player screen bounds', async () => {
  const css = await read('src/web/admin-ui/public/css/player.css');
  const rule = css.match(/\.tv-player-stage \.animation-screen-background\{([\s\S]*?)\}/)?.[1]
    || css.match(/\.tv-player-stage \.animation-screen-background \{([\s\S]*?)\}/)?.[1]
    || '';
  assert.match(rule, /inset:\s*0/);
  assert.match(rule, /transform:\s*none/);
  assert.doesNotMatch(rule, /inset:\s*-\d/);
  assert.doesNotMatch(rule, /scale\(/);
});

test('background is not a Motion Engine target anywhere in preview or TV Player', async () => {
  const [css, renderer, motion] = await Promise.all([
    read('src/web/admin-ui/public/css/pages/animation-screen-preview.css'),
    read('src/web/admin-ui/public/js/motion/screen-preview.js'),
    read('src/web/admin-ui/public/js/motion/preview-player.js')
  ]);
  const rule = css.match(/\.animation-screen-background\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(rule, /inset:\s*0/);
  assert.match(rule, /transform:\s*none/);
  assert.doesNotMatch(rule, /inset:\s*-\d/);
  assert.doesNotMatch(rule, /scale\(/);
  assert.match(renderer, /backgroundSize = '100% 100%'/);
  assert.doesNotMatch(renderer, /data-motion-background/);
  assert.doesNotMatch(motion, /backgroundFrames|background_effect|background_zoom_percent|data-motion-background/);
});

test('authorized TV cannot create another activation request', async () => {
  const routes = await read('src/api/device/public-routes.js');
  const activationRoute = routes.match(/router\.post\('\/activations'[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(activationRoute, /resolveDeviceSession/);
  assert.match(activationRoute, /existingSession/);
  assert.match(activationRoute, /status\(409\)/);
  assert.match(activationRoute, /Телевизор уже авторизован/);
});

test('QR and reserve code share the server TTL, show a countdown and renew automatically', async () => {
  const [routes, html, player, connect] = await Promise.all([
    read('src/api/device/public-routes.js'),
    read('src/web/admin-ui/public/player.html'),
    read('src/web/admin-ui/public/js/player/player.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js')
  ]);
  assert.match(routes, /config\.deviceActivationTtlMinutes \* 60_000/);
  assert.match(routes, /expires_at: expiresAt/);
  assert.match(html, /data-activation-countdown/);
  assert.match(player, /formatRemaining\(expiresAt\)/);
  assert.match(player, /expireActivation\(record\)/);
  assert.match(player, /createActivation\(\{ automatic: true \}\)/);
  assert.match(player, /ACTIVATION_RENEW_RETRY_MS/);
  assert.match(connect, /activation\.expires_at/);
  assert.match(connect, /startActivationTimer\(activation\.expires_at\)/);
});

test('player context includes the saved global animation profile', async () => {
  const routes = await read('src/api/device/public-routes.js');
  assert.match(routes, /store\.getAnimationSettings\(\)/);
  assert.match(routes, /animation:\s*animation \|\|/);
});

test('TV connection uses native QR detection when available and a local iPhone fallback otherwise', async () => {
  const [navigation, contextPanel, screens, application, page, html, server, decoder] = await Promise.all([
    read('src/web/admin-ui/public/js/core/navigation.js'),
    read('src/web/admin-ui/public/js/components/context-panel.js'),
    read('src/web/admin-ui/public/screens.html'),
    read('src/web/admin-ui/public/js/application.js'),
    read('src/web/admin-ui/public/js/pages/connect-tv.js'),
    read('src/web/admin-ui/public/connect-tv.html'),
    read('src/server.js'),
    read('src/web/admin-ui/public/js/device/qr-decoder.js')
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
  assert.match(page, /decodeTvActivationQr/);
  assert.match(page, /localScanPayload/);
  assert.match(page, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(decoder, /export function decodeTvActivationQr/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net|jsQR/i);
  assert.match(server, /scriptSrc: \["'self'"\]/);
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
