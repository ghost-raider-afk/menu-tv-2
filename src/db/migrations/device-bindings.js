export async function migrateDeviceBindings(pool) {
  await pool.query(`
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS device_key TEXT;
    ALTER TABLE tv_devices ALTER COLUMN screen_id DROP NOT NULL;
    ALTER TABLE tv_device_activations ADD COLUMN IF NOT EXISTS device_key TEXT;

    UPDATE tv_devices
       SET device_key = 'legacy-' || id::text
     WHERE device_key IS NULL OR device_key = '';

    ALTER TABLE tv_devices ALTER COLUMN device_key SET NOT NULL;
    DROP INDEX IF EXISTS tv_devices_active_screen_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS tv_devices_device_key_unique
      ON tv_devices(device_key);

    CREATE TABLE IF NOT EXISTS tv_device_bindings (
      id BIGSERIAL PRIMARY KEY,
      device_id BIGINT NOT NULL REFERENCES tv_devices(id) ON DELETE CASCADE,
      screen_id BIGINT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      bound_by TEXT NOT NULL DEFAULT '',
      bound_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    INSERT INTO tv_device_bindings
      (device_id, screen_id, active, bound_by, bound_at, created_at, updated_at)
    SELECT d.id, d.screen_id, TRUE, d.authorized_by, COALESCE(d.created_at, NOW()),
           COALESCE(d.created_at, NOW()), COALESCE(d.updated_at, NOW())
      FROM tv_devices d
     WHERE d.active = TRUE
       AND d.screen_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM tv_device_bindings b
          WHERE b.device_id = d.id AND b.active = TRUE
       );

    CREATE UNIQUE INDEX IF NOT EXISTS tv_device_bindings_active_device_unique
      ON tv_device_bindings(device_id) WHERE active = TRUE;
    CREATE UNIQUE INDEX IF NOT EXISTS tv_device_bindings_active_screen_unique
      ON tv_device_bindings(screen_id) WHERE active = TRUE;
    CREATE INDEX IF NOT EXISTS tv_device_bindings_screen_index
      ON tv_device_bindings(screen_id);

    UPDATE tv_devices SET screen_id = NULL WHERE screen_id IS NOT NULL;
  `);
}
