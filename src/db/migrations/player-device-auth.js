export async function migratePlayerDeviceAuth(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_device_sessions (
      id BIGSERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      screen_id BIGINT REFERENCES screens(id) ON DELETE SET NULL,
      authorized_by TEXT NOT NULL DEFAULT '',
      authorized_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_device_sessions_screen_id_index ON player_device_sessions(screen_id);
    CREATE INDEX IF NOT EXISTS player_device_sessions_expires_at_index ON player_device_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS player_pairings (
      id BIGSERIAL PRIMARY KEY,
      device_session_id BIGINT NOT NULL UNIQUE REFERENCES player_device_sessions(id) ON DELETE CASCADE,
      pair_token_hash TEXT NOT NULL UNIQUE,
      display_code TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_pairings_expires_at_index ON player_pairings(expires_at);
  `);
}
