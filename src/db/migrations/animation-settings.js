import { isoNow } from '../helpers.js';

export async function migrateAnimationSettings(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animation_settings (
      id SMALLINT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      preset_id TEXT NOT NULL DEFAULT 'cascade-soft',
      profile_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  const now = isoNow();
  await pool.query(
    `INSERT INTO animation_settings (id, enabled, preset_id, profile_json, created_at, updated_at)
     VALUES (1, FALSE, 'cascade-soft', '{}', $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [now]
  );
}
