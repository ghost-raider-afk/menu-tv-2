import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { newDb } from 'pg-mem';
import { createApp } from '../src/server.js';
import { MenuTvStore } from '../src/db/index.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const config = {
  appName: 'Menu TV 2.0 test', host: '127.0.0.1', port: 0,
  bootstrapAdmin: { username: 'admin', password: 'CorrectHorse-1!' },
  sessionSecret: 's'.repeat(48), sessionTtlHours: 12, secureCookies: false,
  passwordMinLength: 10, passwordMaxLength: 32, generatedPasswordLength: 10,
  loginMaxAttempts: 8, loginIpMaxAttempts: 32, loginWindowMinutes: 15, loginLimiterMaxEntries: 500,
  jsonBodyMaxBytes: 65_536, menuDraftMaxBytes: 49_152, screenSourceMaxBytes: 12_582_912,
  dashboardRefreshMinSeconds: 15, dashboardRefreshMaxSeconds: 300,
  screenMaxWidth: 1920, screenMaxHeight: 1080, imageMaxPixels: 40_000_000, healthReadinessCacheMs: 0,
  siteAssetsRoot: `/tmp/menu-tv-2-test-site-assets-${process.pid}`, siteLogoMaxBytes: 2_097_152, siteFaviconMaxBytes: 524_288,
  screenBackgroundMaxBytes: 20_971_520,
  db: { host: 'db', port: 5432, database: 'menu_tv_2', user: 'menu_tv_2', password: 'p'.repeat(32), poolMax: 5, connectionTimeoutMs: 5000, idleTimeoutMs: 30000 },
  sftp: { apiUrl: 'http://127.0.0.1:18080', apiTimeoutMs: 1000, adminUsername: 'test', adminPassword: 'a'.repeat(32), storageRoot: '/tmp/menu-tv-test-sftp', publicHost: 'tv.example.test', port: 2022, stagingMaxAgeHours: 24 },
  seedDemoData: false
};

async function jpegFor(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } } }).jpeg({ quality: 85 }).toBuffer();
}

async function pngFor(width, height) {
  return sharp({ create: { width, height, channels: 4, background: { r: 16, g: 24, b: 40, alpha: 1 } } }).png().toBuffer();
}

class FakeSftpService {
  constructor() { this.directories = new Set(); this.users = new Map(); this.assets = new Map(); this.publications = new Map(); }
  async directoryStatus(name) { return this.directories.has(name) ? 'ready' : 'missing'; }
  async provisionDirectory(name) { this.directories.add(name); return 'created'; }
  async createReadOnlyUser({ username, password, directoryName }) {
    if (!this.directories.has(directoryName)) throw Object.assign(new Error('Сначала явно создайте физический каталог SFTP.'), { status: 409 });
    if (this.users.has(username)) throw Object.assign(new Error('Такой логин SFTP уже занят.'), { status: 409 });
    this.users.set(username, { password, directoryName, permissions: { '/': ['list', 'download'] } });
  }
  async resetPassword({ username, password }) { this.users.get(username).password = password; }
  async removeUser(username) { this.users.delete(username); }
  async stageJpeg(screenId, bytes) {
    const key = `${screenId}-${crypto.randomUUID()}.jpg`;
    this.assets.set(key, Buffer.from(bytes));
    return { key, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }
  async removeStaged(key) { return this.assets.delete(key); }
  async cleanupStaging(keepKeys = []) {
    const keep = new Set(keepKeys); let removed = 0;
    for (const key of [...this.assets.keys()]) if (!keep.has(key)) { this.assets.delete(key); removed += 1; }
    return { removed };
  }
  async publishedInfo(directoryName, deliveryFilename) {
    const bytes = this.publications.get(`${directoryName}/${deliveryFilename}`);
    return bytes ? { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length } : null;
  }
  async publish({ directoryName, deliveryFilename, stagedKey, expectedSha256 }) {
    const bytes = this.assets.get(stagedKey);
    if (!bytes) throw Object.assign(new Error('Подготовленный JPEG не найден.'), { status: 409 });
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, expectedSha256);
    this.publications.set(`${directoryName}/${deliveryFilename}`, Buffer.from(bytes));
    return { sha256, size: bytes.length };
  }
}

const sftp = new FakeSftpService();
const store = new MenuTvStore(config.db, { pool: new Pool() });
const service = await createApp(config, { store, sftp });
const server = service.app.listen(0, config.host);
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://${config.host}:${server.address().port}`;

function jsonHeaders(cookie = '') { return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }; }
async function adminCookie(password = config.bootstrapAdmin.password) {
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password }) });
  assert.equal(login.status, 204);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  return cookie.split(';', 1)[0];
}

async function createLocation(cookie, name) {
  const response = await fetch(`${baseUrl}/api/locations`, { method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name, address: 'Тестовый адрес' }) });
  assert.equal(response.status, 201);
  return response.json();
}

async function createScreen(cookie, locationId, sourceScreenId = null) {
  const response = await fetch(`${baseUrl}/api/locations/${locationId}/screens`, { method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify(sourceScreenId ? { source_screen_id: sourceScreenId } : {}) });
  assert.equal(response.status, 201);
  return response.json();
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  await rm(config.siteAssetsRoot, { recursive: true, force: true });
});

test('public liveness, compact overview and protected session work without templates', async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'menu-tv-2.0' });
  const ready = await fetch(`${baseUrl}/readyz`);
  assert.deepEqual(await ready.json(), { status: 'ready', service: 'menu-tv-2.0' });
  const publicSettings = await (await fetch(`${baseUrl}/api/public/config`)).json();
  assert.equal(publicSettings.app_name, config.appName);
  assert.equal(publicSettings.accent_color, '#F4C915');
  assert.equal(publicSettings.signin_logo_size, 1);
  const dashboard = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  assert.equal(dashboard.status, 302);
  assert.equal(dashboard.headers.get('location'), '/signin.html');
  const cookie = await adminCookie();
  const settingsPage = await fetch(`${baseUrl}/settings.html`, { headers: { Cookie: cookie } });
  assert.equal(settingsPage.status, 200);
  assert.match(await settingsPage.text(), /Настройки/);
  const templatesPage = await fetch(`${baseUrl}/templates.html`, { headers: { Cookie: cookie } });
  assert.equal(templatesPage.status, 404);
  const templatesApi = await fetch(`${baseUrl}/api/templates`, { headers: { Cookie: cookie } });
  assert.equal(templatesApi.status, 404);
  const overview = await fetch(`${baseUrl}/api/overview`, { headers: jsonHeaders(cookie) });
  const overviewBody = await overview.json();
  assert.deepEqual(Object.keys(overviewBody).sort(), ['locations', 'published', 'screens']);
  assert.equal(Object.hasOwn(overviewBody, 'templates'), false);
});

test('monitor draft, background, geometry and clone are independent per monitor', async () => {
  const cookie = await adminCookie();
  const productResponse = await fetch(`${baseUrl}/api/catalog/products`, { method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({
    name: 'Пиво API', producer: 'Пивоварня', characteristics: 'Светлое', strength: '4.5%', price_primary: '240', alcoholic: true, beverage_color: 'light', filtration: 'filtered', active: true
  }) });
  assert.equal(productResponse.status, 201);
  const product = await productResponse.json();
  assert.equal(product.price_secondary, '360');
  const location = await createLocation(cookie, 'Точка редактора');
  const screen = await createScreen(cookie, location.id);
  assert.equal(Object.hasOwn(screen, 'template_id'), false);
  let editor = await (await fetch(`${baseUrl}/api/screens/${screen.id}/editor`, { headers: { Cookie: cookie } })).json();
  assert.equal(editor.draft.revision, 1);
  assert.equal(Object.hasOwn(editor, 'templates'), false);

  const draftPayload = {
    revision: editor.draft.revision,
    settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'tahoma-bold', table_x: 80, table_y: 30, table_width_px: 1300, table_height_px: 850 },
    rows: [{ id: 'section-1', kind: 'section', name: 'Пиво' }, { id: 'product-1', kind: 'item', product_id: product.id }]
  };
  const saved = await fetch(`${baseUrl}/api/screens/${screen.id}/draft`, { method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify(draftPayload) });
  assert.equal(saved.status, 200);
  editor = await saved.json();
  assert.equal(editor.draft.revision, 2);
  assert.equal(editor.draft.settings.table_x, 80);
  assert.equal(editor.draft.settings.font_family, 'tahoma-bold');
  assert.equal(editor.draft.rows[1].price_secondary, '360');
  const stale = await fetch(`${baseUrl}/api/screens/${screen.id}/draft`, { method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify(draftPayload) });
  assert.equal(stale.status, 409);

  const background = await pngFor(1920, 1080);
  const backgroundUpload = await fetch(`${baseUrl}/api/screens/${screen.id}/background`, {
    method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/png', 'X-Draft-Revision': String(editor.draft.revision) }, body: background
  });
  assert.equal(backgroundUpload.status, 200);
  editor = await backgroundUpload.json();
  assert.match(editor.draft.settings.background_image_url, /^\/site-assets\/screens\/background-[0-9a-f-]{36}\.png$/i);
  assert.equal(editor.draft.revision, 3);

  const clone = await createScreen(cookie, location.id, screen.id);
  assert.notEqual(clone.id, screen.id);
  assert.equal(clone.status, 'draft');
  assert.equal(clone.prepared_asset_key, null);
  const cloneEditor = await (await fetch(`${baseUrl}/api/screens/${clone.id}/editor`, { headers: { Cookie: cookie } })).json();
  assert.equal(cloneEditor.draft.rows[0].name, 'Пиво');
  assert.equal(cloneEditor.draft.settings.table_x, 80);
  assert.equal(cloneEditor.draft.settings.background_image_url, editor.draft.settings.background_image_url);
  assert.notEqual(cloneEditor.draft.screen_id, editor.draft.screen_id);
});

test('location clone copies monitors and menu but never SFTP identity', async () => {
  const cookie = await adminCookie();
  const source = await createLocation(cookie, 'Точка образец');
  await createScreen(cookie, source.id);
  await createScreen(cookie, source.id);
  const response = await fetch(`${baseUrl}/api/locations/${source.id}/clone`, { method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Точка копия', address: 'Новый адрес', active: true }) });
  assert.equal(response.status, 201);
  const clone = await response.json();
  assert.notEqual(clone.id, source.id);
  assert.equal(clone.screen_count, 2);
  assert.equal(clone.sftp_directory_id, null);
  assert.equal(clone.sftp_username, null);
  const screens = await (await fetch(`${baseUrl}/api/screens`, { headers: { Cookie: cookie } })).json();
  const clonedScreens = screens.filter((item) => item.location_id === clone.id);
  assert.equal(clonedScreens.length, 2);
  assert.ok(clonedScreens.every((item) => item.status === 'draft' && item.prepared_asset_key === null && item.published_at === null));
});

test('SFTP access, validated JPEG staging and recoverable publication work through service boundary', async () => {
  const cookie = await adminCookie();
  const location = await createLocation(cookie, 'SFTP-точка API');
  const directoryResponse = await fetch(`${baseUrl}/api/sftp/directories`, { method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'point-api' }) });
  assert.equal(directoryResponse.status, 201);
  const directory = await directoryResponse.json();
  assert.equal((await fetch(`${baseUrl}/api/sftp/directories/${directory.id}/provision`, { method: 'POST', headers: jsonHeaders(cookie) })).status, 200);
  const binding = await fetch(`${baseUrl}/api/locations/${location.id}/sftp-binding`, { method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ directory_id: directory.id, username: 'point_api' }) });
  assert.equal(binding.status, 201);
  assert.match((await binding.json()).credentials.password, /^[A-Za-z0-9]{10}$/);
  const screen = await createScreen(cookie, location.id);
  assert.equal(screen.location_number, 1);
  assert.equal(screen.delivery_filename, 'monitor-1.jpg');
  const wrongSize = await fetch(`${baseUrl}/api/screens/${screen.id}/source`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: await jpegFor(1280, 720) });
  assert.equal(wrongSize.status, 400);
  const source = await fetch(`${baseUrl}/api/screens/${screen.id}/source`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: await jpegFor(1920, 1080) });
  assert.equal(source.status, 200);
  const staged = await source.json();
  const stagedKey = staged.prepared_asset_key;
  assert.ok(sftp.assets.has(stagedKey));
  const publish = await fetch(`${baseUrl}/api/screens/${screen.id}/publish`, { method: 'POST', headers: jsonHeaders(cookie) });
  assert.equal(publish.status, 200);
  const published = await publish.json();
  assert.equal(published.status, 'published');
  assert.equal(published.prepared_asset_key, null);
  assert.ok(!sftp.assets.has(stagedKey));
  assert.ok(sftp.publications.has('point-api/monitor-1.jpg'));
});

test('site settings persist seven login logo sizes and password remains PostgreSQL-only', async () => {
  const cookie = await adminCookie();
  const profile = await fetch(`${baseUrl}/api/settings/user`, { method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({ display_name: 'Главный администратор', email: 'admin@example.test', phone: '', job_title: 'Администратор', theme: 'dark', notifications_enabled: true }) });
  assert.equal(profile.status, 200);
  const site = await fetch(`${baseUrl}/api/settings/site`, { method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({
    application_name: 'ТВ МЕНЮ Тест', accent_color: '#0F766E', timezone: 'Europe/Moscow', date_format: 'DD.MM.YYYY', dashboard_refresh_seconds: 30, default_screen_resolution: '1920×1080', signin_logo_size: 7
  }) });
  assert.equal(site.status, 200);
  const siteBody = await site.json();
  assert.equal(siteBody.accent_color, '#0F766E');
  assert.equal(siteBody.signin_logo_size, 7);
  const invalidSize = await fetch(`${baseUrl}/api/settings/site`, { method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({ ...siteBody, application_name: siteBody.app_name, signin_logo_size: 8 }) });
  assert.equal(invalidSize.status, 400);
  const users = await store.pool.query('SELECT username, password_hash FROM web_users WHERE username = $1', ['admin']);
  assert.equal(users.rows.length, 1);
  assert.match(users.rows[0].password_hash, /^scrypt\$/);
  const changed = await fetch(`${baseUrl}/api/settings/user/password`, { method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({ current_password: config.bootstrapAdmin.password, new_password: 'ChangedPassword-1!' }) });
  assert.equal(changed.status, 204);
  const newLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: 'ChangedPassword-1!' }) });
  assert.equal(newLogin.status, 204);
});
