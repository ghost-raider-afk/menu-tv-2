import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createActivationCredentials,
  deterministicDeviceSessionToken,
  deviceSessionCookie,
  parseReserveCode,
  parseScanPayload,
  tokenHash
} from '../src/services/device-session-service.js';
import { activationQrPayload, createActivationQrSvg } from '../src/services/qr-code-service.js';

const config = {
  sessionSecret: 's'.repeat(48),
  deviceSessionTtlDays: 365,
  secureCookies: true
};

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);
const readPublic = (path) => readFile(new URL(path, publicRoot), 'utf8');

test('TV activation credentials separate QR claim, polling secret and fallback code', () => {
  const credentials = createActivationCredentials();
  assert.match(credentials.id, /^[0-9a-f-]{36}$/i);
  assert.match(credentials.scanToken, /^[A-Za-z0-9_-]{22}$/);
  assert.match(credentials.pollSecret, /^[A-Za-z0-9_-]{43}$/);
  assert.match(credentials.reserveCode, /^\d{6}$/);
  assert.notEqual(tokenHash(credentials.scanToken), credentials.scanToken);
  assert.notEqual(tokenHash(credentials.pollSecret), credentials.pollSecret);
});

test('QR contains only short-lived scan claim and never contains polling secret', () => {
  const credentials = createActivationCredentials();
  const payload = activationQrPayload(credentials.scanToken);
  const svg = createActivationQrSvg(credentials.scanToken);
  assert.equal(payload, `TV2:${credentials.scanToken}`);
  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-label="QR-код подключения телевизора"/);
  assert.equal(svg.includes(credentials.pollSecret), false);
  assert.equal(svg.includes(credentials.reserveCode), false);
});

test('admin scanner accepts only canonical TV2 QR payload and six digit fallback code', () => {
  const credentials = createActivationCredentials();
  assert.equal(parseScanPayload(`TV2:${credentials.scanToken}`), credentials.scanToken);
  assert.equal(parseScanPayload(`https://example.test/?token=${credentials.scanToken}`), null);
  assert.equal(parseReserveCode('123 456'), '123456');
  assert.equal(parseReserveCode('12345'), null);
  assert.equal(parseReserveCode('12345x'), null);
});

test('device session token is deterministic for activation recovery but opaque to the TV page', () => {
  const credentials = createActivationCredentials();
  const first = deterministicDeviceSessionToken(credentials.id, credentials.pollSecret, config);
  const second = deterministicDeviceSessionToken(credentials.id, credentials.pollSecret, config);
  assert.equal(first, second);
  assert.match(first, /^dvs_[A-Za-z0-9_-]{43}$/);
  assert.equal(first.includes(credentials.id), false);
  assert.equal(first.includes(credentials.pollSecret), false);
});

test('device cookie is HttpOnly, strict and secure independently from admin session', () => {
  const cookie = deviceSessionCookie('dvs_test', config);
  assert.match(cookie, /^menu_tv_device_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=31536000/);
});

test('TV Player runs the same Motion Engine runtime and caches live entity modules/assets for offline use', async () => {
  const [player, css, serviceWorker, publicRoutes] = await Promise.all([
    readPublic('js/player/player.js'),
    readPublic('css/player.css'),
    readPublic('player-sw.js'),
    readFile(new URL('../src/api/device/public-routes.js', import.meta.url), 'utf8')
  ]);

  assert.match(publicRoutes, /store\.getAnimationSettings\(\)/);
  assert.match(publicRoutes, /animation:\s*animation \?/);
  assert.match(publicRoutes, /profile:\s*animation\.profile/);

  assert.match(player, /renderDomEntity/);
  assert.match(player, /buildDomMotionScene/);
  assert.match(player, /DEFAULT_SCENE_COMPILERS/);
  assert.match(player, /new SceneRuntime/);
  assert.match(player, /new WaapiMotionDriver/);
  assert.match(player, /context\?\.animation\?\.profile\?\.entity\?\.asset_url/);
  assert.match(player, /If-None-Match/);
  assert.match(player, /if \(!result\.unchanged\) renderPlayerContext/);
  assert.match(player, /tv-player-entity-layer/);
  assert.match(player, /data-entity-layer/);
  assert.doesNotMatch(player, /\.animate\(/, 'TV Player must use the driver instead of owning WAAPI calls');

  assert.match(css, /\.tv-player-entity-layer/);
  assert.match(css, /\.motion-entity-placement/);
  assert.match(css, /\.motion-entity-target/);

  assert.match(serviceWorker, /tv-menu-player-shell-v3/);
  assert.match(serviceWorker, /\/js\/motion\/entity-dom\.js/);
  assert.match(serviceWorker, /\/js\/motion\/scene-runtime\.js/);
  assert.match(serviceWorker, /\/js\/motion\/drivers\/waapi-driver\.js/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/site-assets\/'\)/);
});
