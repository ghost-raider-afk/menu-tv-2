import assert from 'node:assert/strict';
import test from 'node:test';
import { newDb } from 'pg-mem';
import { MenuTvStore } from '../src/db/index.js';

async function createStore() {
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = memoryDb.adapters.createPg();
  const store = new MenuTvStore({}, { pool: new Pool() });
  await store.init();
  return store;
}

test('screen creation rolls back screen and draft together after a later failure', async () => {
  const store = await createStore();
  try {
    const location = await store.createLocation({ name: 'Atomic location', address: '', active: true });
    await assert.rejects(
      store.transaction(async (tx) => {
        await tx.createScreen({ location_id: location.id, name: 'Atomic screen' });
        throw new Error('forced failure');
      }),
      /forced failure/
    );
    const screens = await store.listScreens();
    assert.equal(screens.length, 0);
    const drafts = await store.pool.query('SELECT COUNT(*)::int AS count FROM screen_drafts');
    assert.equal(Number(drafts.rows[0].count), 0);
  } finally {
    await store.close();
  }
});

test('stale draft revision rolls back screen metadata changed earlier in the transaction', async () => {
  const store = await createStore();
  try {
    const location = await store.createLocation({ name: 'Revision location', address: '', active: true });
    const screen = await store.transaction((tx) => tx.createScreen({ location_id: location.id, name: 'Original name' }));

    await assert.rejects(
      store.transaction(async (tx) => {
        assert.equal(await tx.lockScreen(screen.id), true);
        const current = await tx.getScreen(screen.id);
        await tx.updateScreen(screen.id, {
          location_id: current.location_id,
          name: 'Must roll back',
          resolution: current.resolution,
          status: current.status,
          active: current.active,
          template_id: current.template_id
        });
        const saved = await tx.saveScreenDraft(screen.id, { rows: [], settings: {} }, 999);
        assert.equal(saved, null);
        throw new Error('stale revision');
      }),
      /stale revision/
    );

    const after = await store.getScreen(screen.id);
    assert.equal(after.name, 'Original name');
    assert.equal((await store.getScreenDraft(screen.id)).revision, 1);
  } finally {
    await store.close();
  }
});
