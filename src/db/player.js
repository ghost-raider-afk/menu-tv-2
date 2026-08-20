import { randomBytes } from 'node:crypto';
import { isoNow, normaliseRow } from './helpers.js';

function newToken() {
  return randomBytes(24).toString('base64url');
}

export function createPlayerRepository(pool) {
  return Object.freeze({
    async getPlayerWorkspaceByScreen(screenId) {
      const { rows } = await pool.query('SELECT * FROM player_workspaces WHERE screen_id = $1', [screenId]);
      return normaliseRow(rows[0]);
    },
    async getPlayerWorkspaceByToken(token) {
      const { rows } = await pool.query(
        `SELECT w.*, s.name AS screen_name, s.resolution, s.location_id, s.animation_profile_id,
         l.name AS location_name
         FROM player_workspaces w JOIN screens s ON s.id = w.screen_id
         JOIN locations l ON l.id = s.location_id
         WHERE w.token = $1 AND w.enabled = TRUE`,
        [token]
      );
      return normaliseRow(rows[0]);
    },
    async ensurePlayerWorkspace(screenId) {
      const existing = await this.getPlayerWorkspaceByScreen(screenId);
      if (existing) return existing;
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO player_workspaces (screen_id, token, enabled, created_at, updated_at)
         VALUES ($1, $2, TRUE, $3, $3)
         ON CONFLICT (screen_id) DO UPDATE SET screen_id = EXCLUDED.screen_id
         RETURNING *`,
        [screenId, newToken(), now]
      );
      return normaliseRow(rows[0]);
    },
    async rotatePlayerWorkspaceToken(screenId) {
      const { rows } = await pool.query(
        'UPDATE player_workspaces SET token = $1, updated_at = $2 WHERE screen_id = $3 RETURNING *',
        [newToken(), isoNow(), screenId]
      );
      return normaliseRow(rows[0]);
    },
    async setPlayerWorkspaceEnabled(screenId, enabled) {
      const { rows } = await pool.query(
        'UPDATE player_workspaces SET enabled = $1, updated_at = $2 WHERE screen_id = $3 RETURNING *',
        [enabled === true, isoNow(), screenId]
      );
      return normaliseRow(rows[0]);
    }
  });
}
