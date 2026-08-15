import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createApp } from '../src/server.js';
import { MenuTvStore } from '../src/db/index.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const schemaPool = new Pool();
await schemaPool.query(`
  CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    status INTEGER NOT NULL DEFAULT 1
  )
`);
await schemaPool.end();

const config = {
  appName: 'Menu TV 2.0 test',
  host: '127.0.0.1',
  port: 0,
  bootstrapAdmin: { username: 'admin', password: 'CorrectHorse-1!' },
  sessionSecret: 's'.repeat(48),
  sessionTtlHours: 12,
  secureCookies: false,
  passwordMinLength: 10,
  passwordMaxLength: 32,
  generatedPasswordLength: 10,
  loginMaxAttempts: 8,
  loginWindowMinutes: 15,
  loginLimiterMaxEntries: 500,
  jsonBodyMaxBytes: 65_536,
  menuDraftMaxBytes: 49_152,
  screenSourceMaxBytes: 12_582_912,
  dashboardRefreshMinSeconds: 15,
  dashboardRefreshMaxSeconds: 300,
  screenMaxWidth: 1920,
  screenMaxHeight: 1080,
  siteAssetsRoot: `/tmp/menu-tv-2-test-site-assets-${process.pid}`,
  siteLogoMaxBytes: 2_097_152,
  siteFaviconMaxBytes: 524_288,
  db: { host: 'db', port: 5432, database: 'menu_tv_2', user: 'menu_tv_2', password: 'p'.repeat(32) },
  sftp: { publicHost: 'tv.example.test', port: 2022 },
  seedDemoData: false
};

class FakeSftpService {
  constructor() {
    this.directories = new Set();
    this.users = new Map();
    this.assets = new Map();
    this.publications = new Map();
  }

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
    if (!Buffer.isBuffer(bytes) || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
      throw Object.assign(new Error('Нужен файл JPEG.'), { status: 400 });
    }
    const key = `${screenId}-asset.jpg`;
    this.assets.set(key, bytes);
    return { key, sha256: 'a'.repeat(64), size: bytes.length };
  }
  async publish({ directoryName, deliveryFilename, stagedKey }) {
    this.publications.set(`${directoryName}/${deliveryFilename}`, this.assets.get(stagedKey));
  }
}

const sftp = new FakeSftpService();
const store = new MenuTvStore(config.db, { pool: new Pool() });
const service = await createApp(config, { store, sftp });
const server = service.app.listen(0, config.host);
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://${config.host}:${server.address().port}`;

function jsonHeaders(cookie = '') {
  return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
}

async function adminCookie(password = config.bootstrapAdmin.password) {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username: 'admin', password })
  });
  assert.equal(login.status, 204);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  return cookie.split(';', 1)[0];
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await store.close();
  await rm(config.siteAssetsRoot, { recursive: true, force: true });
});

test('public health, TV Menu 1 visual default and protected session work', async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'menu-tv-2.0' });

  const publicConfig = await fetch(`${baseUrl}/api/public/config`);
  const publicSettings = await publicConfig.json();
  assert.equal(publicSettings.app_name, config.appName);
  assert.equal(publicSettings.accent_color, '#F4C915');

  const dashboard = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  assert.equal(dashboard.status, 302);
  assert.equal(dashboard.headers.get('location'), '/signin.html');

  const rejected = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: 'wrong' })
  });
  assert.equal(rejected.status, 401);

  const cookie = await adminCookie();
  const settingsPage = await fetch(`${baseUrl}/settings.html`, { headers: { Cookie: cookie } });
  assert.equal(settingsPage.status, 200);
  assert.match(await settingsPage.text(), /Настройки сайта/);

  const overview = await fetch(`${baseUrl}/api/overview`, { headers: jsonHeaders(cookie) });
  assert.deepEqual(await overview.json(), { locations: 0, screens: 0, published: 0, templates: 0 });
});

test('locations, screens and templates persist through modular PostgreSQL repositories', async () => {
  const cookie = await adminCookie();
  const createdLocation = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Точка API', address: 'Тестовая 1' })
  });
  assert.equal(createdLocation.status, 201);
  const location = await createdLocation.json();

  const createdScreen = await fetch(`${baseUrl}/api/locations/${location.id}/screens`, {
    method: 'POST', headers: jsonHeaders(cookie), body: '{}'
  });
  assert.equal(createdScreen.status, 201);
  const screen = await createdScreen.json();
  assert.equal(screen.location_id, location.id);
  assert.equal(screen.template_id, null);
  assert.match(screen.name, /^ТВ /);

  const templateResponse = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Основной API', description: 'Тест', active: true })
  });
  assert.equal(templateResponse.status, 201);
  const template = await templateResponse.json();

  const assigned = await fetch(`${baseUrl}/api/screens/${screen.id}`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      location_id: location.id,
      name: screen.name,
      resolution: screen.resolution,
      status: screen.status,
      active: screen.active,
      template_id: template.id
    })
  });
  assert.equal(assigned.status, 200);
  assert.equal((await assigned.json()).template_id, template.id);

  const deleted = await fetch(`${baseUrl}/api/templates/${template.id}`, { method: 'DELETE', headers: jsonHeaders(cookie) });
  assert.equal(deleted.status, 204);
  const unassigned = await fetch(`${baseUrl}/api/screens/${screen.id}`, { headers: jsonHeaders(cookie) });
  assert.equal((await unassigned.json()).template_id, null);
});

test('catalogue and editor draft preserve required product linkage and prices', async () => {
  const cookie = await adminCookie();
  const productResponse = await fetch(`${baseUrl}/api/catalog/products`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      name: 'Пиво API', producer: 'Пивоварня', characteristics: 'Светлое', strength: '4.5%',
      price_primary: '240', alcoholic: true, beverage_color: 'light', filtration: 'filtered', active: true
    })
  });
  assert.equal(productResponse.status, 201);
  const product = await productResponse.json();
  assert.equal(product.price_secondary, '360');

  const packagingResponse = await fetch(`${baseUrl}/api/catalog/packaging`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'ПЭТ API 1,5 л', unit_price: '12', active: true })
  });
  assert.equal(packagingResponse.status, 201);
  const packaging = await packagingResponse.json();

  const locationResponse = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Точка редактора', address: 'Адрес' })
  });
  const location = await locationResponse.json();
  const screenResponse = await fetch(`${baseUrl}/api/locations/${location.id}/screens`, {
    method: 'POST', headers: jsonHeaders(cookie), body: '{}'
  });
  const screen = await screenResponse.json();

  const saved = await fetch(`${baseUrl}/api/screens/${screen.id}/draft`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', title: 'Бар' },
      rows: [
        { id: 'section-1', kind: 'section', name: 'Пиво' },
        { id: 'product-1', kind: 'item', product_id: product.id },
        { id: 'packaging-1', kind: 'packaging', packaging_id: packaging.id }
      ]
    })
  });
  assert.equal(saved.status, 200);
  const draft = await saved.json();
  assert.deepEqual(draft.draft.rows.map((row) => row.name), ['Пиво', 'Пиво API', 'ПЭТ API 1,5 л']);
  assert.equal(draft.draft.rows[1].price_primary, '240');
  assert.equal(draft.draft.rows[1].price_secondary, '360');

  const blockedDelete = await fetch(`${baseUrl}/api/catalog/products/${product.id}`, { method: 'DELETE', headers: jsonHeaders(cookie) });
  assert.equal(blockedDelete.status, 409);
});

test('SFTP access, JPEG staging and publication work through modular SFTP service boundary', async () => {
  const cookie = await adminCookie();
  const locationResponse = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'SFTP-точка API', address: 'Адрес' })
  });
  const location = await locationResponse.json();

  const directoryResponse = await fetch(`${baseUrl}/api/sftp/directories`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'point-api' })
  });
  assert.equal(directoryResponse.status, 201);
  const directory = await directoryResponse.json();

  const provision = await fetch(`${baseUrl}/api/sftp/directories/${directory.id}/provision`, {
    method: 'POST', headers: jsonHeaders(cookie)
  });
  assert.equal(provision.status, 200);

  const binding = await fetch(`${baseUrl}/api/locations/${location.id}/sftp-binding`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ directory_id: directory.id, username: 'point_api' })
  });
  assert.equal(binding.status, 201);
  const bindingBody = await binding.json();
  assert.equal(bindingBody.credentials.username, 'point_api');
  assert.match(bindingBody.credentials.password, /^[A-Za-z0-9]{10}$/);

  const screenResponse = await fetch(`${baseUrl}/api/screens`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ location_id: location.id, name: 'Основной SFTP экран' })
  });
  const screen = await screenResponse.json();

  const source = await fetch(`${baseUrl}/api/screens/${screen.id}/source`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' },
    body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9])
  });
  assert.equal(source.status, 200);
  assert.equal((await source.json()).status, 'ready');

  const publish = await fetch(`${baseUrl}/api/screens/${screen.id}/publish`, {
    method: 'POST', headers: jsonHeaders(cookie)
  });
  assert.equal(publish.status, 200);
  assert.equal((await publish.json()).status, 'published');
  assert.ok(sftp.publications.has(`point-api/monitor-${screen.id}.jpg`));
});

test('profile, site settings and password change remain independent from SFTPGo users table', async () => {
  const cookie = await adminCookie();
  const profile = await fetch(`${baseUrl}/api/settings/user`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      display_name: 'Главный администратор', email: 'admin@example.test', phone: '', job_title: 'Администратор',
      theme: 'dark', notifications_enabled: true
    })
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).display_name, 'Главный администратор');

  const site = await fetch(`${baseUrl}/api/settings/site`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      application_name: 'ТВ МЕНЮ Тест', accent_color: '#0F766E', timezone: 'Europe/Moscow',
      date_format: 'DD.MM.YYYY', dashboard_refresh_seconds: 30, default_screen_resolution: '1920×1080'
    })
  });
  assert.equal(site.status, 200);
  assert.equal((await site.json()).accent_color, '#0F766E');

  const users = await store.pool.query('SELECT username, password_hash FROM web_users WHERE username = $1', ['admin']);
  assert.equal(users.rows.length, 1);
  assert.match(users.rows[0].password_hash, /^scrypt\$/);

  const changed = await fetch(`${baseUrl}/api/settings/user/password`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ current_password: config.bootstrapAdmin.password, new_password: 'ChangedPassword-1!' })
  });
  assert.equal(changed.status, 204);

  const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: 'ChangedPassword-1!' })
  });
  assert.equal(newLogin.status, 204);
});
