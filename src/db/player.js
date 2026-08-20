import { isoNow, normaliseRow } from './helpers.js';

function normaliseDevice(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  return {
    id: Number(value.id),
    screen_id: value.screen_id == null ? null : Number(value.screen_id),
    screen_name: value.screen_name || '',
    location_id: value.location_id == null ? null : Number(value.location_id),
    location_name: value.location_name || '',
    authorized_by: value.authorized_by || '',
    authorized_at: value.authorized_at || null,
    last_seen_at: value.last_seen_at || null,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at || null,
    created_at: value.created_at
  };
}

function normalisePairing(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  return {
    id: Number(value.id),
    device_session_id: Number(value.device_session_id),
    display_code: value.display_code,
    expires_at: value.expires_at,
    approved_at: value.approved_at || null,
    created_at: value.created_at,
    screen_id: value.screen_id == null ? null : Number(value.screen_id),
    screen_name: value.screen_name || '',
    location_id: value.location_id == null ? null : Number(value.location_id),
    location_name: value.location_name || ''
  };
}

export function createPlayerRepository(pool) {
  async function getPlayerDeviceSessionById(id) {
    const { rows } = await pool.query(
      `SELECT ds.*, s.name AS screen_name, s.location_id, l.name AS location_name
       FROM player_device_sessions ds
       LEFT JOIN screens s ON s.id = ds.screen_id
       LEFT JOIN locations l ON l.id = s.location_id
       WHERE ds.id = $1`,
      [id]
    );
    return normaliseDevice(rows[0]);
  }

  return Object.freeze({
    async cleanupPlayerPairings(now = isoNow()) {
      await pool.query('DELETE FROM player_pairings WHERE approved_at IS NULL AND expires_at <= $1', [now]);
      await pool.query(
        `DELETE FROM player_device_sessions ds
         WHERE ds.screen_id IS NULL AND ds.authorized_at IS NULL
           AND ds.expires_at <= $1
           AND NOT EXISTS (SELECT 1 FROM player_pairings p WHERE p.device_session_id = ds.id)`,
        [now]
      );
    },

    async countPendingPlayerPairings(now = isoNow()) {
      const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM player_pairings WHERE approved_at IS NULL AND expires_at > $1',
        [now]
      );
      return Number(rows[0]?.count || 0);
    },

    async createPlayerPairing({ token_hash, pair_token_hash, display_code, session_expires_at, pairing_expires_at }) {
      const now = isoNow();
      const sessionResult = await pool.query(
        `INSERT INTO player_device_sessions (token_hash, expires_at, created_at)
         VALUES ($1, $2, $3) RETURNING id`,
        [token_hash, session_expires_at, now]
      );
      const sessionId = Number(sessionResult.rows[0].id);
      const pairingResult = await pool.query(
        `INSERT INTO player_pairings (device_session_id, pair_token_hash, display_code, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [sessionId, pair_token_hash, display_code, pairing_expires_at, now]
      );
      return normalisePairing(pairingResult.rows[0]);
    },

    async getPlayerDeviceSessionByTokenHash(tokenHash) {
      const { rows } = await pool.query(
        `SELECT ds.*, s.name AS screen_name, s.location_id, l.name AS location_name
         FROM player_device_sessions ds
         LEFT JOIN screens s ON s.id = ds.screen_id
         LEFT JOIN locations l ON l.id = s.location_id
         WHERE ds.token_hash = $1`,
        [tokenHash]
      );
      return normaliseDevice(rows[0]);
    },

    getPlayerDeviceSessionById,

    async getPlayerPairingByTokenHash(tokenHash) {
      const { rows } = await pool.query(
        `SELECT p.*, ds.screen_id, s.name AS screen_name, s.location_id, l.name AS location_name
         FROM player_pairings p
         JOIN player_device_sessions ds ON ds.id = p.device_session_id
         LEFT JOIN screens s ON s.id = ds.screen_id
         LEFT JOIN locations l ON l.id = s.location_id
         WHERE p.pair_token_hash = $1`,
        [tokenHash]
      );
      return normalisePairing(rows[0]);
    },

    async getPlayerPairingByDisplayCode(displayCode) {
      const { rows } = await pool.query(
        `SELECT p.*, ds.screen_id, s.name AS screen_name, s.location_id, l.name AS location_name
         FROM player_pairings p
         JOIN player_device_sessions ds ON ds.id = p.device_session_id
         LEFT JOIN screens s ON s.id = ds.screen_id
         LEFT JOIN locations l ON l.id = s.location_id
         WHERE p.display_code = $1`,
        [displayCode]
      );
      return normalisePairing(rows[0]);
    },

    async authorizePlayerPairing(pairingId, screenId, username, sessionExpiresAt) {
      const now = isoNow();
      const pairingResult = await pool.query(
        `SELECT p.*, ds.id AS session_id
         FROM player_pairings p JOIN player_device_sessions ds ON ds.id = p.device_session_id
         WHERE p.id = $1 AND p.approved_at IS NULL AND p.expires_at > $2 FOR UPDATE`,
        [pairingId, now]
      );
      if (!pairingResult.rowCount) return null;
      const sessionId = Number(pairingResult.rows[0].session_id);

      await pool.query(
        `UPDATE player_device_sessions SET revoked_at = $1
         WHERE screen_id = $2 AND revoked_at IS NULL AND id <> $3`,
        [now, screenId, sessionId]
      );
      await pool.query(
        `UPDATE player_device_sessions
         SET screen_id = $1, authorized_by = $2, authorized_at = $3, last_seen_at = $3,
             expires_at = $4, revoked_at = NULL
         WHERE id = $5`,
        [screenId, username, now, sessionExpiresAt, sessionId]
      );
      await pool.query('UPDATE player_pairings SET approved_at = $1 WHERE id = $2', [now, pairingId]);
      return getPlayerDeviceSessionById(sessionId);
    },

    async refreshPlayerDeviceSession(id, expiresAt) {
      const now = isoNow();
      const { rowCount } = await pool.query(
        `UPDATE player_device_sessions SET last_seen_at = $1, expires_at = $2
         WHERE id = $3 AND revoked_at IS NULL`,
        [now, expiresAt, id]
      );
      return rowCount ? getPlayerDeviceSessionById(id) : null;
    },

    async touchPlayerDeviceSession(id) {
      const { rowCount } = await pool.query(
        'UPDATE player_device_sessions SET last_seen_at = $1 WHERE id = $2 AND revoked_at IS NULL',
        [isoNow(), id]
      );
      return rowCount > 0;
    },

    async getActivePlayerDeviceForScreen(screenId, now = isoNow()) {
      const { rows } = await pool.query(
        `SELECT ds.*, s.name AS screen_name, s.location_id, l.name AS location_name
         FROM player_device_sessions ds
         JOIN screens s ON s.id = ds.screen_id
         JOIN locations l ON l.id = s.location_id
         WHERE ds.screen_id = $1 AND ds.authorized_at IS NOT NULL
           AND ds.revoked_at IS NULL AND ds.expires_at > $2
         ORDER BY ds.authorized_at DESC LIMIT 1`,
        [screenId, now]
      );
      return normaliseDevice(rows[0]);
    },

    async revokePlayerDevicesForScreen(screenId) {
      const now = isoNow();
      const { rowCount } = await pool.query(
        `UPDATE player_device_sessions SET revoked_at = $1
         WHERE screen_id = $2 AND revoked_at IS NULL`,
        [now, screenId]
      );
      return rowCount;
    }
  });
}
