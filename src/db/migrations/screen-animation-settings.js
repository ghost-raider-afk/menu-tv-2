export async function migrateScreenAnimationSettings(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS screen_animation_settings (
      screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      preset_id TEXT NOT NULL DEFAULT 'cinematic-live-menu',
      profile_json TEXT NOT NULL DEFAULT '{}',
      entity_json TEXT NOT NULL DEFAULT '{}',
      announcement_json TEXT NOT NULL DEFAULT '{}',
      brand_json TEXT NOT NULL DEFAULT '{}',
      aquarium_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO screen_animation_settings (
      screen_id, enabled, preset_id, profile_json, entity_json, announcement_json, brand_json, aquarium_json, updated_by, updated_at
    )
    SELECT s.id, a.enabled, a.preset_id, a.profile_json, a.entity_json, a.announcement_json, a.brand_json, a.aquarium_json, a.updated_by, a.updated_at
    FROM screens s CROSS JOIN animation_settings a
    WHERE a.id = 1
    ON CONFLICT (screen_id) DO NOTHING
  `);
}
