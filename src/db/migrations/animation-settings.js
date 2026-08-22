import { isoNow } from '../helpers.js';
import { completeAnimationProfile, ANIMATION_PROFILE_VERSION } from '../../shared/animation-profile.js';

export async function migrateAnimationSettings(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animation_settings (
      id SMALLINT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      preset_id TEXT NOT NULL DEFAULT 'custom',
      profile_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animation_presets (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS animation_presets_name_lower_unique ON animation_presets (LOWER(name))');
  const now = isoNow();
  await pool.query(
    `INSERT INTO animation_settings (id, enabled, preset_id, profile_json, created_at, updated_at)
     VALUES (1, FALSE, 'custom', '{}', $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [now]
  );

  const { rows } = await pool.query('SELECT id, profile_json FROM animation_settings');
  for (const row of rows) {
    let source = {};
    try { source = JSON.parse(row.profile_json || '{}'); }
    catch { source = {}; }
    const migrated = completeAnimationProfile(source);
    const serialized = JSON.stringify(migrated);
    if (Number(source.motion_version) === ANIMATION_PROFILE_VERSION && serialized === JSON.stringify(source)) continue;
    await pool.query(
      'UPDATE animation_settings SET profile_json = $1, preset_id = $2, updated_at = $3 WHERE id = $4',
      [serialized, 'custom', now, row.id]
    );
  }

  const presets = await pool.query('SELECT id, profile_json FROM animation_presets');
  for (const row of presets.rows) {
    let source = {};
    try { source = JSON.parse(row.profile_json || '{}'); }
    catch { source = {}; }
    const migrated = completeAnimationProfile(source);
    const serialized = JSON.stringify(migrated);
    if (Number(source.motion_version) === ANIMATION_PROFILE_VERSION && serialized === JSON.stringify(source)) continue;
    await pool.query('UPDATE animation_presets SET profile_json = $1, updated_at = $2 WHERE id = $3', [serialized, now, row.id]);
  }
}
