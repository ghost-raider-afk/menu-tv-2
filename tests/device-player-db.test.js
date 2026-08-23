import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { initialiseSchema } from '../src/db/migrations/schema.js';
import { migrateDevicePlayer } from '../src/db/migrations/device-player.js';
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
});

test.after(async () => {
  await pool.end();
});

test('TV activation can be approved, consumed and resolved as an active device session', async () => {
  const repository = createDevicesRepository(pool);
  const { screenId, screenName } = await seedScreen();
  const activationId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const scanHash = crypto.randomBytes(32).toString('hex');
  const pollHash = crypto.randomBytes(32).toString('hex');
  const codeHash = crypto.randomBytes(32).toString('hex');

  await repository.createDeviceActivation({
    id: activationId,
    scanTokenHash: scanHash,
    pollSecretHash: pollHash,
    reserveCodeHash: codeHash,
    expiresAt,
    userAgent: 'test-tv',
    remoteAddress: '127.0.0.1'
  });

  const byQr = await repository.getDeviceActivationByScanTokenHash(scanHash);
  const byCode = await repository.getDeviceActivationByReserveCodeHash(codeHash);
  assert.equal(byQr.id, activationId);
  assert.equal(byCode.id, activationId);

  const approved = await repository.approveDeviceActivation(activationId, screenId, 'admin');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approved_screen_id, screenId);

  const device = await repository.createDevice({
    screenId,
    label: 'ТВ 1',
    userAgent: 'test-tv',
    remoteAddress: '127.0.0.1',
    authorizedBy: 'admin'
  });
  const sessionId = crypto.randomUUID();
  const rawTokenHash = crypto.randomBytes(32).toString('hex');
  await repository.createDeviceSession({
    id: sessionId,
    deviceId: device.id,
    tokenHash: rawTokenHash,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString()
  });
  const consumed = await repository.markDeviceActivationConsumed(activationId, device.id, sessionId);
  assert.equal(consumed.status, 'consumed');

  const session = await repository.getActiveDeviceSessionByHash(rawTokenHash);
  assert.equal(session.device_id, device.id);
  assert.equal(session.screen_id, screenId);
  assert.equal(session.screen_name, screenName);
  assert.equal(session.device_label, 'ТВ 1');
});

test('re-authorizing a screen revokes the old device before a replacement is created', async () => {
  const repository = createDevicesRepository(pool);
  const { screenId } = await seedScreen();
  const oldDevice = await repository.createDevice({ screenId, label: 'Старый ТВ', authorizedBy: 'admin' });
  const oldTokenHash = crypto.randomBytes(32).toString('hex');
  await repository.createDeviceSession({
    id: crypto.randomUUID(),
    deviceId: oldDevice.id,
    tokenHash: oldTokenHash,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString()
  });
  assert.ok(await repository.getActiveDeviceSessionByHash(oldTokenHash));

  const deactivated = await repository.deactivateDevicesForScreen(screenId);
  assert.equal(deactivated.length, 1);
  assert.equal(await repository.getActiveDeviceSessionByHash(oldTokenHash), null);

  const replacement = await repository.createDevice({ screenId, label: 'Новый ТВ', authorizedBy: 'admin' });
  assert.notEqual(replacement.id, oldDevice.id);
  assert.equal(replacement.screen_id, screenId);
});
