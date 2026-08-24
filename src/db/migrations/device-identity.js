export async function migrateDeviceIdentity(pool) {
  await pool.query(`
    ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS device_key TEXT;
    UPDATE tv_devices SET device_key = 'legacy-' || id::text
      WHERE device_key IS NULL OR device_key = '';
    ALTER TABLE tv_devices ALTER COLUMN device_key SET NOT NULL;

    ALTER TABLE tv_device_activations ADD COLUMN IF NOT EXISTS device_key TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS tv_devices_device_key_unique
      ON tv_devices(device_key);
    CREATE UNIQUE INDEX IF NOT EXISTS tv_devices_active_screen_unique
      ON tv_devices(screen_id) WHERE active = TRUE;
  `);
}
