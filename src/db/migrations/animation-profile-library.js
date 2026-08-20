import { isoNow } from '../helpers.js';

export async function migrateAnimationProfileLibrary(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animation_profiles (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      preset_id TEXT NOT NULL DEFAULT 'cascade-soft',
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    ALTER TABLE screens ADD COLUMN IF NOT EXISTS animation_profile_id BIGINT REFERENCES animation_profiles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS screens_animation_profile_id_index ON screens(animation_profile_id);
  `);

  const existing = await pool.query('SELECT id FROM animation_profiles ORDER BY id LIMIT 1');
  if (existing.rowCount) return;

  const legacy = await pool.query('SELECT enabled, preset_id, profile_json, updated_by FROM animation_settings WHERE id = 1');
  const source = legacy.rows[0] || {};
  const now = isoNow();
  const inserted = await pool.query(
    `INSERT INTO animation_profiles (name, enabled, preset_id, profile_json, created_by, updated_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $6) RETURNING id`,
    [
      'Основной профиль',
      source.enabled === true,
      source.preset_id || 'cascade-soft',
      source.profile_json || '{}',
      source.updated_by || '',
      now
    ]
  );
  await pool.query(
    'UPDATE screens SET animation_profile_id = $1 WHERE animation_profile_id IS NULL',
    [inserted.rows[0].id]
  );
}
