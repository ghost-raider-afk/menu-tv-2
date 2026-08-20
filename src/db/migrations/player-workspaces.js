import { randomBytes } from 'node:crypto';
import { isoNow } from '../helpers.js';

function token() {
  return randomBytes(24).toString('base64url');
}

export async function migratePlayerWorkspaces(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_workspaces (
      id BIGSERIAL PRIMARY KEY,
      screen_id BIGINT NOT NULL UNIQUE REFERENCES screens(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_workspaces_token_index ON player_workspaces(token);
  `);

  const { rows } = await pool.query(
    `SELECT s.id FROM screens s
     LEFT JOIN player_workspaces w ON w.screen_id = s.id
     WHERE w.id IS NULL ORDER BY s.id`
  );
  for (const row of rows) {
    const now = isoNow();
    await pool.query(
      `INSERT INTO player_workspaces (screen_id, token, enabled, created_at, updated_at)
       VALUES ($1, $2, TRUE, $3, $3) ON CONFLICT (screen_id) DO NOTHING`,
      [row.id, token(), now]
    );
  }
}
