import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createApp } from '../src/server.js';
import { MenuTvStore } from '../src/db/index.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const siteAssetsRoot = `/tmp/menu-tv-device-api-${process.pid}`;
const config = {
  appName: 'TV Device API test', host: '127.0.0.1', port: 0,
  bootstrapAdmin: { username: 'admin', password: 'CorrectHorse-1!' },
  sessionSecret: 's'.repeat(48), sessionTtlHours: 12, secureCookies: false,
  deviceActivationTtlMinutes: 10, deviceActivationPollSeconds: 1, deviceSessionTtlDays: 365,
  deviceHeartbeatWriteSeconds: 30, playerRefreshSeconds: 5,
  passwordMinLength: 10, passwordMaxLength: 32, generatedPasswordLength: 10,
  loginMaxAttempts: 8, loginIpMaxAttempts: 32, loginWindowMinutes: 15, loginLimiterMaxEntries: 500,
  jsonBodyMaxBytes: 65_536, menuDraftMaxBytes: 49_152, screenSourceMaxBytes: 12_582_912,
  dashboardRefreshMinSeconds: 15, dashboardRefreshMaxSeconds: 300,
  screenMaxWidth: 1920, screenMaxHeight: 1080, imageMaxPixels: 40_000_000, healthReadinessCacheMs: 0,
  siteAssetsRoot, siteLogoMaxBytes: 2_097_152, siteFaviconMaxBytes: 524_288, screenBackgroundMaxBytes: 20_971_520,
  db: { host: 'db', port: 5432, database: 'menu_tv_2', user: 'menu_tv_2', password: 'p'.repeat(32), poolMax: 5, connectionTimeoutMs: 5000, idleTimeoutMs: 30000 },
  sftp: { apiUrl: 'http://127.0.0.1:18080', apiTimeoutMs: 1000, adminUsername: 'test', adminPassword: 'a'.repeat(32), storageRoot: '/tmp/menu-tv-test-sftp', publicHost: 'tv.example.test', port: 2022, stagingMaxAgeHours: 24 },
  seedDemoData: false
};

const store = new MenuTvStore(config.db, { pool: new Pool() });
const service = await createApp(config, { store, sftp: {} });
const server = service.app.listen(0, config.host);
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://${config.host}:${server.address().port}`;

function jsonHeaders(cookie = '') {
  return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
}

async function adminCookie() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username: 'admin', password: config.bootstrapAdmin.password })
  });
  assert.equal(response.status, 204);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

async function seedScreen() {
  const now = new Date().toISOString();
  const location = await store.pool.query(
    `INSERT INTO locations (name, address, active, created_at, updated_at)
     VALUES ($1, 'API', TRUE, $2, $2) RETURNING id`,
    [`API точка ${crypto.randomUUID()}`, now]
  );
  const screen = await store.pool.query(
    `INSERT INTO screens (location_id, location_number, name, resolution, status, active, delivery_filename, created_at, updated_at)
     VALUES ($1, 1, 'ТВ API', '1920×1080', 'draft', TRUE, 'monitor-1.jpg', $2, $2) RETURNING id`,
    [location.rows[0].id, now]
  );
  await store.pool.query(
    `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at)
     VALUES ($1, $2, $3, 1, $4)`,
    [screen.rows[0].id, JSON.stringify([{ id: 'section-1', kind: 'section', name: 'Меню API', enabled: true }]), JSON.stringify({ background_color: '#101828' }), now]
  );
  return { locationId: Number(location.rows[0].id), screenId: Number(screen.rows[0].id) };
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  await rm(siteAssetsRoot, { recursive: true, force: true });
});

test('public player does not require admin login while Connect TV page does', async () => {
  const player = await fetch(`${baseUrl}/player`, { redirect: 'manual' });
  assert.equal(player.status, 200);
  assert.match(await player.text(), /Подключение телевизора/);

  const connect = await fetch(`${baseUrl}/connect-tv.html`, { redirect: 'manual' });
  assert.equal(connect.status, 302);
  assert.equal(connect.headers.get('location'), '/signin.html');
});

test('TV activation binds one device to one screen, rejects duplicate activation and revocation invalidates its Device Session', async () => {
  const { screenId } = await seedScreen();

  const activationResponse = await fetch(`${baseUrl}/api/device/activations`, {
    method: 'POST', headers: jsonHeaders(), body: '{}'
  });
  assert.equal(activationResponse.status, 201);
  const activation = await activationResponse.json();
  assert.match(activation.activation_id, /^[0-9a-f-]{36}$/i);
  assert.match(activation.reserve_code, /^\d{6}$/);
  assert.match(activation.qr_svg, /^<svg/);
  assert.ok(activation.poll_secret.length >= 32);

  const pending = await fetch(`${baseUrl}/api/device/activations/${activation.activation_id}/status`, {
    headers: { 'x-device-activation-secret': activation.poll_secret }
  });
  assert.equal(pending.status, 200);
  assert.equal((await pending.json()).status, 'pending');

  const admin = await adminCookie();
  const resolved = await fetch(`${baseUrl}/api/device-admin/resolve`, {
    method: 'POST', headers: jsonHeaders(admin), body: JSON.stringify({ reserve_code: activation.reserve_code })
  });
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).activation_id, activation.activation_id);

  const authorized = await fetch(`${baseUrl}/api/device-admin/authorize`, {
    method: 'POST', headers: jsonHeaders(admin), body: JSON.stringify({ activation_id: activation.activation_id, screen_id: screenId })
  });
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).screen.id, screenId);

  const consumed = await fetch(`${baseUrl}/api/device/activations/${activation.activation_id}/status`, {
    headers: { 'x-device-activation-secret': activation.poll_secret }
  });
  assert.equal(consumed.status, 200);
  const deviceSetCookie = consumed.headers.get('set-cookie');
  assert.match(deviceSetCookie, /^menu_tv_device_session=/);
  assert.match(deviceSetCookie, /HttpOnly/);
  const deviceCookie = deviceSetCookie.split(';', 1)[0];
  assert.equal((await consumed.json()).status, 'authorized');

  const duplicateActivation = await fetch(`${baseUrl}/api/device/activations`, {
    method: 'POST', headers: jsonHeaders(deviceCookie), body: '{}'
  });
  assert.equal(duplicateActivation.status, 409);
  const duplicateBody = await duplicateActivation.json();
  assert.equal(duplicateBody.authorized, true);
  assert.equal(duplicateBody.screen.id, screenId);
  assert.match(duplicateBody.error, /уже авторизован/);

  const currentAnimation = await store.getAnimationSettings();
  const savedAnimation = await store.updateAnimationSettings({
    enabled: true,
    preset_id: currentAnimation.preset_id,
    profile: currentAnimation.profile,
    updated_by: 'admin'
  });
  assert.equal(savedAnimation.enabled, true);

  const context = await fetch(`${baseUrl}/api/device/player-context`, { headers: { Cookie: deviceCookie } });
  assert.equal(context.status, 200);
  const contextBody = await context.json();
  assert.equal(contextBody.screen.id, screenId);
  assert.equal(contextBody.draft.rows[0].name, 'Меню API');
  assert.equal(contextBody.animation.enabled, true);
  assert.equal(contextBody.animation.preset_id, savedAnimation.preset_id);
  assert.equal(contextBody.animation.profile.motion_version, 2);
  assert.equal(contextBody.refresh_interval_ms, 5000);

  const bindings = await fetch(`${baseUrl}/api/device-admin/bindings`, { headers: { Cookie: admin } });
  assert.equal(bindings.status, 200);
  const bindingRows = await bindings.json();
  assert.equal(bindingRows.length, 1);
  assert.equal(bindingRows[0].screen_id, screenId);

  const revoke = await fetch(`${baseUrl}/api/device-admin/bindings/${screenId}`, {
    method: 'DELETE', headers: { Cookie: admin }
  });
  assert.equal(revoke.status, 204);

  const revokedContext = await fetch(`${baseUrl}/api/device/player-context`, { headers: { Cookie: deviceCookie } });
  assert.equal(revokedContext.status, 401);
  assert.match(revokedContext.headers.get('set-cookie'), /Max-Age=0/);
});
