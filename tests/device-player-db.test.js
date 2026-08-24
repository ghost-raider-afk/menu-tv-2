import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { initialiseSchema } from '../src/db/migrations/schema.js';
import { migrateDevicePlayer } from '../src/db/migrations/device-player.js';
import { migrateDeviceIdentity } from '../src/db/migrations/device-identity.js';
import { createDevicesRepository } from '../src/db/devices.js';

const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
const { Pool } = memoryDb.adapters.createPg();
const pool = new Pool();

async function seedScreen() {
  const now = new Date().toISOString();
  const location = await pool.query(
    `INSERT INTO locations (name, address, active, created_at, updated_at)
     VALUES ($1, '', TRUE, $2, $2) RETURNING id`,
    [`Точка ${crypto.randomUUID()}`, now]
  );
  const screenName = `ТВ ${crypto.randomUUID()}`;
  const screen = await pool.query(
    `INSERT INTO screens (location_id, location_number, name, resolution, status, active, created_at, updated_at)
     VALUES ($1, 1, $2, '1920×1080', 'draft', TRUE, $3, $3) RETURNING id`,
    [location.rows[0].id, screenName, now]
  );
  return { locationId: Number(location.rows[0].id), screenId: Number(screen.rows[0].id), screenName };
}

test.before(async () => {
  await initialiseSchema(pool);
  await migrateDevicePlayer(pool);
  await migrateDeviceIdentity(pool);
});

test.after(async () => {
  await pool.end();
});

test('TV activation carries persistent identity into an active device session', async () => {
  const repository = createDevicesRepository(pool);
  const { screenId, screenName } = await seedScreen();
  const activationId = crypto.randomUUID();
  const deviceKey = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const scanHash = crypto.randomBytes(32).toString('hex');
  const pollHash = crypto.randomBytes(32).toString('hex');
  const codeHash = crypto.randomBytes(32).toString('hex');

  await repository.createDeviceActivation({
    id: activationId,
    deviceKey,
    scanTokenHash: scanHash,
    pollSecretHash: pollHash,
    reserveCodeHash: codeHash,
    expiresAt,
    userAgent: 'test-tv',
    remoteAddress: '127.0.0.1'
  });

  const byQr = await repository.getDeviceActivationByScanTokenHash(scanHash);
  assert.equal(byQr.device_key, deviceKey);
  const approved = await repository.approveDeviceActivation(activationId, screenId, 'admin');
  assert.equal(approved.approved_screen_id, screenId);

  const device = await repository.bindDevice({
    deviceKey,
    screenId,
    label: 'ТВ 1',
    userAgent: 'test-tv',
    remoteAddress: '127.0.0.1',
    authorizedBy: 'admin'
  });
  const sessionId = crypto.randomUUID();
  const rawTokenHash = crypto.randomBytes(32).toString('hex');
  await repository.createDeviceSession({ id: sessionId, deviceId: device.id, tokenHash: rawTokenHash, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await repository.markDeviceActivationConsumed(activationId, device.id, sessionId);

  const session = await repository.getActiveDeviceSessionByHash(rawTokenHash);
  assert.equal(session.device_id, device.id);
  assert.equal(session.device_key, deviceKey);
  assert.equal(session.screen_id, screenId);
  assert.equal(session.screen_name, screenName);
});

test('same physical TV is moved between monitors instead of creating parallel devices', async () => {
  const repository = createDevicesRepository(pool);
  const first = await seedScreen();
  const second = await seedScreen();
  const deviceKey = crypto.randomUUID();

  const original = await repository.bindDevice({ deviceKey, screenId: first.screenId, label: 'ТВ', authorizedBy: 'admin' });
  const oldTokenHash = crypto.randomBytes(32).toString('hex');
  await repository.createDeviceSession({
    id: crypto.randomUUID(),
    deviceId: original.id,
    tokenHash: oldTokenHash,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString()
  });
  assert.ok(await repository.getActiveDeviceSessionByHash(oldTokenHash));

  const moved = await repository.bindDevice({ deviceKey, screenId: second.screenId, label: 'ТВ', authorizedBy: 'admin' });
  assert.equal(moved.id, original.id, 'physical TV keeps one database identity');
  assert.equal(moved.screen_id, second.screenId);
  assert.equal(await repository.getActiveDeviceSessionByHash(oldTokenHash), null, 'old session is revoked atomically on rebind');
});

test('one monitor can have only one active physical TV', async () => {
  const repository = createDevicesRepository(pool);
  const { screenId } = await seedScreen();
  const first = await repository.bindDevice({ deviceKey: crypto.randomUUID(), screenId, label: 'Первый ТВ', authorizedBy: 'admin' });
  const replacement = await repository.bindDevice({ deviceKey: crypto.randomUUID(), screenId, label: 'Второй ТВ', authorizedBy: 'admin' });
  assert.notEqual(replacement.id, first.id);
  const bindings = await repository.listDeviceBindings();
  const screenBindings = bindings.filter((binding) => binding.screen_id === screenId);
  assert.equal(screenBindings.length, 1);
  assert.equal(screenBindings[0].id, replacement.id);
});
