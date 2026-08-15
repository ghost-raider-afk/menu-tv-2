import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createApp } from '../src/server.js';
import { MenuTvStore } from '../src/db.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const schemaPool = new Pool();
// SFTPGo owns this table in the production PostgreSQL database.  Keeping it
// here makes sure the web-administrator migration never collides with it.
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
    if (!Buffer.isBuffer(bytes) || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw Object.assign(new Error('Нужен файл JPEG.'), { status: 400 });
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

async function adminCookie() {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: config.bootstrapAdmin.password })
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

test('health is public and authentication requires the generated administrator credentials', async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'menu-tv-2.0' });
  const publicConfig = await fetch(`${baseUrl}/api/public/config`);
  const publicSettings = await publicConfig.json();
  assert.equal(publicSettings.app_name, config.appName);
  assert.equal(publicSettings.accent_color, '#2563EB');

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
  const profilePage = await fetch(`${baseUrl}/profile.html`, { headers: { Cookie: cookie } });
  assert.equal(profilePage.status, 200);
  assert.match(await profilePage.text(), /Настройки пользователя/);
  const locationsPage = await fetch(`${baseUrl}/locations.html`, { headers: { Cookie: cookie } });
  assert.equal(locationsPage.status, 200);
  const catalogPage = await fetch(`${baseUrl}/catalog.html`, { headers: { Cookie: cookie } });
  assert.equal(catalogPage.status, 200);
  assert.match(await catalogPage.text(), /Продукция и тара/);
});

test('location and screen data remain in the separate PostgreSQL store', async () => {
  const cookie = await adminCookie();
  const unauthorised = await fetch(`${baseUrl}/api/locations`);
  assert.equal(unauthorised.status, 401);

  const createdLocation = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Точка 2.0', address: 'Тестовая 1' })
  });
  assert.equal(createdLocation.status, 201);
  const location = await createdLocation.json();
  assert.equal(location.id, 1);

  const createdScreen = await fetch(`${baseUrl}/api/screens`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ location_id: location.id, name: 'Экран 1', status: 'ready' })
  });
  assert.equal(createdScreen.status, 201);
  assert.equal((await createdScreen.json()).location_name, 'Точка 2.0');

  const createdInsideLocation = await fetch(`${baseUrl}/api/locations/${location.id}/screens`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({})
  });
  assert.equal(createdInsideLocation.status, 201);
  const screen = await createdInsideLocation.json();
  assert.equal(screen.location_id, location.id);
  assert.equal(screen.template_id, null);
  assert.match(screen.name, /^ТВ /);

  const overview = await fetch(`${baseUrl}/api/overview`, { headers: jsonHeaders(cookie) });
  assert.deepEqual(await overview.json(), { locations: 1, screens: 2, published: 0, templates: 0 });

  const createdTemplate = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Основной шаблон', description: 'Тестовый', active: true })
  });
  assert.equal(createdTemplate.status, 201);
  const template = await createdTemplate.json();
  const assigned = await fetch(`${baseUrl}/api/screens/${screen.id}`, {
    method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({
      location_id: location.id, name: screen.name, resolution: screen.resolution,
      status: screen.status, active: screen.active, template_id: template.id
    })
  });
  assert.equal(assigned.status, 200);
  assert.equal((await assigned.json()).template_id, template.id);
  const deletedTemplate = await fetch(`${baseUrl}/api/templates/${template.id}`, { method: 'DELETE', headers: jsonHeaders(cookie) });
  assert.equal(deletedTemplate.status, 204);
  const unassigned = await fetch(`${baseUrl}/api/screens/${screen.id}`, { headers: jsonHeaders(cookie) });
  assert.equal((await unassigned.json()).template_id, null);
});

test('profile and site settings persist separately and create administrator notifications', async () => {
  const cookie = await adminCookie();
  const unauthorised = await fetch(`${baseUrl}/api/settings/user`);
  assert.equal(unauthorised.status, 401);

  const readExisting = await fetch(`${baseUrl}/api/notifications/read`, { method: 'POST', headers: jsonHeaders(cookie) });
  assert.equal(readExisting.status, 200);

  const session = await fetch(`${baseUrl}/api/session`, { headers: jsonHeaders(cookie) });
  assert.equal((await session.json()).display_name, 'admin');

  const profile = await fetch(`${baseUrl}/api/settings/user`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      display_name: 'Главный администратор',
      email: 'admin@example.test',
      phone: '+7 900 000-00-00',
      job_title: 'Администратор',
      theme: 'dark',
      notifications_enabled: false
    })
  });
  assert.equal(profile.status, 200);
  const profileSettings = await profile.json();
  assert.equal(profileSettings.username, 'admin');
  assert.equal(profileSettings.display_name, 'Главный администратор');
  assert.equal(profileSettings.email, 'admin@example.test');
  assert.equal(profileSettings.theme, 'dark');
  assert.equal(profileSettings.notifications_enabled, false);
  assert.ok(profileSettings.created_at);
  assert.ok(profileSettings.updated_at);

  const site = await fetch(`${baseUrl}/api/settings/site`, {
    method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({
      application_name: 'ТВ МЕНЮ Тест',
      accent_color: '#0F766E',
      timezone: 'Europe/Moscow',
      date_format: 'DD.MM.YYYY',
      dashboard_refresh_seconds: 30,
      default_screen_resolution: '1920×1080'
    })
  });
  assert.equal(site.status, 200);
  const siteSettings = await site.json();
  assert.equal(siteSettings.app_name, 'ТВ МЕНЮ Тест');
  assert.equal(siteSettings.accent_color, '#0F766E');
  assert.equal(siteSettings.dashboard_refresh_seconds, 30);
  assert.equal(siteSettings.timezone, 'Europe/Moscow');
  assert.equal(siteSettings.updated_by, 'admin');

  const invalidTimezone = await fetch(`${baseUrl}/api/settings/site`, {
    method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({
      application_name: 'ТВ МЕНЮ Тест',
      accent_color: '#0F766E',
      timezone: 'Wrong/Timezone',
      date_format: 'DD.MM.YYYY',
      dashboard_refresh_seconds: 30,
      default_screen_resolution: '1920×1080'
    })
  });
  assert.equal(invalidTimezone.status, 400);

  const notifications = await fetch(`${baseUrl}/api/notifications?limit=20`, { headers: jsonHeaders(cookie) });
  const summary = await notifications.json();
  assert.equal(summary.unread_count, 2);
  assert.ok(summary.items.some((item) => item.action === 'settings.user.updated'));
  assert.ok(summary.items.some((item) => item.action === 'settings.site.updated'));

  const read = await fetch(`${baseUrl}/api/notifications/read`, { method: 'POST', headers: jsonHeaders(cookie) });
  assert.equal((await read.json()).marked_read, 2);
  const afterRead = await fetch(`${baseUrl}/api/notifications`, { headers: jsonHeaders(cookie) });
  assert.equal((await afterRead.json()).unread_count, 0);

  const logo = await fetch(`${baseUrl}/api/settings/site/logo`, {
    method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/png' },
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  });
  assert.equal(logo.status, 200);
  const logoSettings = await logo.json();
  assert.match(logoSettings.logo_url, /^\/site-assets\/site-logo\.png\?v=/);
  assert.equal((await fetch(`${baseUrl}${logoSettings.logo_url}`)).status, 200);

  const favicon = await fetch(`${baseUrl}/api/settings/site/favicon`, {
    method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/x-icon' },
    body: Buffer.from([0x00, 0x00, 0x01, 0x00, 0x00])
  });
  assert.equal(favicon.status, 200);
  assert.match((await favicon.json()).favicon_url, /^\/site-assets\/site-favicon\.ico\?v=/);
});

test('SFTP catalogues, point access and JPEG publication follow the manual delivery flow', async () => {
  const cookie = await adminCookie();
  const locationResponse = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'SFTP-точка', address: 'Адрес' })
  });
  const location = await locationResponse.json();

  const directoryResponse = await fetch(`${baseUrl}/api/sftp/directories`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'point-alpha' })
  });
  assert.equal(directoryResponse.status, 201);
  const directory = await directoryResponse.json();

  const beforeProvision = await fetch(`${baseUrl}/api/sftp/directories`, { headers: jsonHeaders(cookie) });
  assert.equal((await beforeProvision.json()).find((item) => item.id === directory.id).storage_status, 'missing');

  const provision = await fetch(`${baseUrl}/api/sftp/directories/${directory.id}/provision`, { method: 'POST', headers: jsonHeaders(cookie) });
  assert.equal(provision.status, 200);
  assert.equal((await provision.json()).storage_status, 'ready');

  const binding = await fetch(`${baseUrl}/api/locations/${location.id}/sftp-binding`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ directory_id: directory.id, username: 'point_alpha' })
  });
  assert.equal(binding.status, 201);
  const { credentials } = await binding.json();
  assert.equal(credentials.username, 'point_alpha');
  assert.match(credentials.password, /^[A-Za-z0-9]{10}$/);
  assert.match(credentials.password, /[A-Z]/);
  assert.match(credentials.password, /[a-z]/);
  assert.match(credentials.password, /[0-9]/);
  assert.deepEqual(sftp.users.get('point_alpha').permissions, { '/': ['list', 'download'] });

  const screenResponse = await fetch(`${baseUrl}/api/screens`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ location_id: location.id, name: 'Основной экран' })
  });
  const screen = await screenResponse.json();
  const deliveryPath = `/point-alpha/monitor-${screen.id}.jpg`;
  assert.equal(screen.sftp_path, deliveryPath);

  const source = await fetch(`${baseUrl}/api/screens/${screen.id}/source`, {
    method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9])
  });
  assert.equal(source.status, 200);
  assert.equal((await source.json()).status, 'ready');

  const publish = await fetch(`${baseUrl}/api/screens/${screen.id}/publish`, { method: 'POST', headers: jsonHeaders(cookie) });
  assert.equal(publish.status, 200);
  assert.equal((await publish.json()).status, 'published');
  assert.ok(sftp.publications.has(deliveryPath.slice(1)));

  const resetPassword = await fetch(`${baseUrl}/api/locations/${location.id}/sftp-password`, { method: 'POST', headers: jsonHeaders(cookie) });
  assert.equal(resetPassword.status, 200);
  assert.match((await resetPassword.json()).credentials.password, /^[A-Za-z0-9]{10}$/);

  const deleteBoundLocation = await fetch(`${baseUrl}/api/locations/${location.id}`, { method: 'DELETE', headers: jsonHeaders(cookie) });
  assert.equal(deleteBoundLocation.status, 409);
});

test('catalogue entries and monitor menu drafts are persisted in PostgreSQL', async () => {
  const cookie = await adminCookie();
  const productResponse = await fetch(`${baseUrl}/api/catalog/products`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({
      name: 'Пиво светлое', producer: 'Пивоварня', characteristics: 'Светлое', strength: '4.5%',
      price_primary: '240', alcoholic: true, beverage_color: 'light', filtration: 'filtered', active: true
    })
  });
  assert.equal(productResponse.status, 201);
  const product = await productResponse.json();
  assert.equal(product.price_secondary, '360');

  const packagingResponse = await fetch(`${baseUrl}/api/catalog/packaging`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Бутылка ПЭТ 1,5 л', unit_price: '12', active: true })
  });
  assert.equal(packagingResponse.status, 201);
  const packaging = await packagingResponse.json();

  const locationResponse = await fetch(`${baseUrl}/api/locations`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Точка меню', address: 'Адрес' })
  });
  const location = await locationResponse.json();
  const screenResponse = await fetch(`${baseUrl}/api/locations/${location.id}/screens`, { method: 'POST', headers: jsonHeaders(cookie), body: '{}' });
  const screen = await screenResponse.json();
  const templateResponse = await fetch(`${baseUrl}/api/templates`, {
    method: 'POST', headers: jsonHeaders(cookie), body: JSON.stringify({ name: 'Тёмный', settings: { background_color: '#101828', font_scale: 'large' } })
  });
  const template = await templateResponse.json();
  const saved = await fetch(`${baseUrl}/api/screens/${screen.id}/draft`, {
    method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({
      template_id: template.id,
      settings: { background_color: '#101828', accent_color: '#2563EB', text_color: '#F8FAFC', font_scale: 'large', table_width: 'wide', title: 'Бар' },
      rows: [
        { id: 'section-1', kind: 'section', name: 'Пиво' },
        { id: 'product-1', kind: 'item', product_id: product.id, promotion: true, promotion_text: 'Акция' },
        { id: 'packaging-1', kind: 'packaging', packaging_id: packaging.id }
      ]
    })
  });
  assert.equal(saved.status, 200);
  const draftResult = await saved.json();
  assert.equal(draftResult.screen.template_id, template.id);
  assert.deepEqual(draftResult.draft.rows.map((row) => row.name), ['Пиво', 'Пиво светлое', 'Бутылка ПЭТ 1,5 л']);
  assert.equal(draftResult.draft.rows[1].price_secondary, '360');

  const editor = await fetch(`${baseUrl}/api/screens/${screen.id}/editor`, { headers: jsonHeaders(cookie) });
  const editorData = await editor.json();
  assert.equal(editorData.products.length, 1);
  assert.equal(editorData.packaging.length, 1);
  assert.equal(editorData.draft.rows.length, 3);
  const productDelete = await fetch(`${baseUrl}/api/catalog/products/${product.id}`, { method: 'DELETE', headers: jsonHeaders(cookie) });
  assert.equal(productDelete.status, 409);
});

test('administrator password is hashed in the dedicated web-user database table and can be changed from the profile', async () => {
  const cookie = await adminCookie();
  const users = await store.pool.query('SELECT username, password_hash FROM web_users WHERE username = $1', ['admin']);
  assert.equal(users.rows.length, 1);
  assert.match(users.rows[0].password_hash, /^scrypt\$/);
  assert.equal(users.rows[0].password_hash.includes(config.bootstrapAdmin.password), false);

  const rejected = await fetch(`${baseUrl}/api/settings/user/password`, {
    method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({ current_password: 'WrongPassword-1!', new_password: 'ChangedPassword-1!' })
  });
  assert.equal(rejected.status, 400);
  const changed = await fetch(`${baseUrl}/api/settings/user/password`, {
    method: 'PUT', headers: jsonHeaders(cookie), body: JSON.stringify({ current_password: config.bootstrapAdmin.password, new_password: 'ChangedPassword-1!' })
  });
  assert.equal(changed.status, 204);
  const oldLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: config.bootstrapAdmin.password })
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: 'ChangedPassword-1!' })
  });
  assert.equal(newLogin.status, 204);
});
