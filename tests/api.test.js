import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { createApp } from '../src/server.js';
import { MenuTvStore } from '../src/db.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const config = {
  appName: 'Menu TV 2.0 test',
  host: '127.0.0.1',
  port: 0,
  adminUsername: 'admin',
  adminPassword: 'correct-horse-battery-staple',
  sessionSecret: 's'.repeat(48),
  sessionTtlHours: 12,
  secureCookies: false,
  db: { host: 'db', port: 5432, database: 'menu_tv_2', user: 'menu_tv_2', password: 'p'.repeat(32) },
  seedDemoData: false
};
const store = new MenuTvStore(config.db, { pool: new Pool() });
const service = await createApp(config, { store });
const server = service.app.listen(0, config.host);
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://${config.host}:${server.address().port}`;

function jsonHeaders(cookie = '') {
  return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
}

async function adminCookie() {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: config.adminPassword })
  });
  assert.equal(login.status, 204);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  return cookie.split(';', 1)[0];
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await store.close();
});

test('health is public and authentication requires the generated administrator credentials', async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'menu-tv-2.0' });

  const rejected = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username: 'admin', password: 'wrong' })
  });
  assert.equal(rejected.status, 401);
  await adminCookie();
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

  const overview = await fetch(`${baseUrl}/api/overview`, { headers: jsonHeaders(cookie) });
  assert.deepEqual(await overview.json(), { locations: 1, screens: 1, published: 0, templates: 0 });
});
