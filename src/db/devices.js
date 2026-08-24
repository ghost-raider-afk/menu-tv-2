import crypto from 'node:crypto';
import { isoNow } from './helpers.js';

function deviceRecord(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    screen_id: Number(row.screen_id)
  };
}

function activationRecord(row) {
  if (!row) return null;
  return {
    ...row,
    approved_screen_id: row.approved_screen_id === null ? null : Number(row.approved_screen_id),
    device_id: row.device_id === null ? null : Number(row.device_id)
  };
}

function sessionRecord(row) {
  if (!row) return null;
  return {
    ...row,
    device_id: Number(row.device_id),
    screen_id: Number(row.screen_id),
    location_id: Number(row.location_id),
    location_number: Number(row.location_number)
  };
}

export function createDevicesRepository(pool) {
  return Object.freeze({
    async createDeviceActivation({
      id,
      deviceKey = '',
      scanTokenHash,
      pollSecretHash,
      reserveCodeHash,
      expiresAt,
      userAgent = '',
      remoteAddress = ''
    }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_device_activations
          (id, device_key, scan_token_hash, poll_secret_hash, reserve_code_hash, status, user_agent, remote_address, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $9)
         RETURNING *`,
        [id, deviceKey, scanTokenHash, pollSecretHash, reserveCodeHash, userAgent, remoteAddress, expiresAt, now]
      );
      return activationRecord(rows[0]);
    },

    async deleteExpiredDeviceActivations(before) {
      const { rowCount } = await pool.query('DELETE FROM tv_device_activations WHERE expires_at < $1', [before]);
      return rowCount;
    },

    async getDeviceActivation(id, { lock = false } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations WHERE id = $1 LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [id]
      );
      return activationRecord(rows[0]);
    },

    async getDeviceActivationByScanTokenHash(hash) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations
         WHERE scan_token_hash = $1 AND status = 'pending' AND expires_at > NOW()
         LIMIT 1`,
        [hash]
      );
      return activationRecord(rows[0]);
    },

    async getDeviceActivationByReserveCodeHash(hash) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations
         WHERE reserve_code_hash = $1 AND status = 'pending' AND expires_at > NOW()
         LIMIT 1`,
        [hash]
      );
      return activationRecord(rows[0]);
    },

    async getDeviceActivationForPoll(id, pollSecretHash, { lock = false } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM tv_device_activations
         WHERE id = $1 AND poll_secret_hash = $2
         LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [id, pollSecretHash]
      );
      return activationRecord(rows[0]);
    },

    async approveDeviceActivation(id, screenId, approvedBy) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE tv_device_activations
         SET status = 'approved', approved_screen_id = $1, approved_by = $2, approved_at = $3, updated_at = $3
         WHERE id = $4 AND status = 'pending' AND expires_at > NOW()
         RETURNING *`,
        [screenId, approvedBy, now, id]
      );
      return activationRecord(rows[0]);
    },

    async markDeviceActivationConsumed(id, deviceId, sessionId) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE tv_device_activations
         SET status = 'consumed', device_id = $1, session_id = $2, consumed_at = $3, updated_at = $3
         WHERE id = $4 AND status = 'approved'
         RETURNING *`,
        [deviceId, sessionId, now, id]
      );
      return activationRecord(rows[0]);
    },

    async deactivateDevicesForScreen(screenId) {
      const now = isoNow();
      await pool.query(
        `UPDATE tv_device_sessions SET revoked_at = $1
         WHERE revoked_at IS NULL AND device_id IN (
           SELECT id FROM tv_devices WHERE screen_id = $2 AND active = TRUE
         )`,
        [now, screenId]
      );
      const { rows } = await pool.query(
        `UPDATE tv_devices SET active = FALSE, updated_at = $1
         WHERE screen_id = $2 AND active = TRUE
         RETURNING *`,
        [now, screenId]
      );
      return rows.map(deviceRecord);
    },

    async bindDevice({ deviceKey, screenId, label = '', userAgent = '', remoteAddress = '', authorizedBy = '' }) {
      const key = String(deviceKey || '').trim();
      if (!key) throw new TypeError('TV binding requires a persistent device key.');
      const now = isoNow();

      await pool.query(
        `UPDATE tv_device_sessions SET revoked_at = $1
         WHERE revoked_at IS NULL AND device_id IN (
           SELECT id FROM tv_devices
           WHERE active = TRUE AND (screen_id = $2 OR device_key = $3)
         )`,
        [now, screenId, key]
      );

      await pool.query(
        `UPDATE tv_devices SET active = FALSE, updated_at = $1
         WHERE active = TRUE AND (screen_id = $2 OR device_key = $3)`,
        [now, screenId, key]
      );

      const existing = await pool.query('SELECT id FROM tv_devices WHERE device_key = $1 LIMIT 1', [key]);
      if (existing.rowCount) {
        const { rows } = await pool.query(
          `UPDATE tv_devices
           SET screen_id = $1, label = $2, user_agent = $3, remote_address = $4,
               authorized_by = $5, active = TRUE, updated_at = $6
           WHERE device_key = $7
           RETURNING *`,
          [screenId, label, userAgent, remoteAddress, authorizedBy, now, key]
        );
        return deviceRecord(rows[0]);
      }

      const { rows } = await pool.query(
        `INSERT INTO tv_devices
          (device_key, screen_id, label, user_agent, remote_address, authorized_by, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $7)
         RETURNING *`,
        [key, screenId, label, userAgent, remoteAddress, authorizedBy, now]
      );
      return deviceRecord(rows[0]);
    },

    async createDevice({ deviceKey = crypto.randomUUID(), screenId, label = '', userAgent = '', remoteAddress = '', authorizedBy = '' }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_devices
          (device_key, screen_id, label, user_agent, remote_address, authorized_by, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $7)
         RETURNING *`,
        [deviceKey, screenId, label, userAgent, remoteAddress, authorizedBy, now]
      );
      return deviceRecord(rows[0]);
    },

    async createDeviceSession({ id, deviceId, tokenHash, expiresAt }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO tv_device_sessions
          (id, device_id, token_hash, expires_at, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING *`,
        [id, deviceId, tokenHash, expiresAt, now]
      );
      return rows[0] || null;
    },

    async getActiveDeviceSessionByHash(hash) {
      const { rows } = await pool.query(
        `SELECT ds.id AS session_id, ds.device_id, ds.expires_at, ds.last_seen_at AS session_last_seen_at,
                d.device_key, d.screen_id, d.label AS device_label, d.last_seen_at AS device_last_seen_at,
                s.name AS screen_name, s.location_number, s.resolution, s.status AS screen_status,
                l.id AS location_id, l.name AS location_name
         FROM tv_device_sessions ds
         JOIN tv_devices d ON d.id = ds.device_id
         JOIN screens s ON s.id = d.screen_id
         JOIN locations l ON l.id = s.location_id
         WHERE ds.token_hash = $1
           AND ds.revoked_at IS NULL
           AND ds.expires_at > NOW()
           AND d.active = TRUE
           AND s.active = TRUE
         LIMIT 1`,
        [hash]
      );
      return sessionRecord(rows[0]);
    },

    async touchDeviceSession(sessionId, deviceId, observedAt, staleBefore) {
      await pool.query(
        `UPDATE tv_device_sessions SET last_seen_at = $1
         WHERE id = $2 AND (last_seen_at IS NULL OR last_seen_at < $3)`,
        [observedAt, sessionId, staleBefore]
      );
      await pool.query(
        `UPDATE tv_devices SET last_seen_at = $1, updated_at = $1
         WHERE id = $2 AND active = TRUE AND (last_seen_at IS NULL OR last_seen_at < $3)`,
        [observedAt, deviceId, staleBefore]
      );
    },

    async listDeviceBindings() {
      const { rows } = await pool.query(
        `SELECT d.*, s.name AS screen_name, s.location_number, l.id AS location_id, l.name AS location_name,
                (SELECT MAX(ds.last_seen_at) FROM tv_device_sessions ds WHERE ds.device_id = d.id AND ds.revoked_at IS NULL) AS session_last_seen_at,
                (SELECT MAX(ds.expires_at) FROM tv_device_sessions ds WHERE ds.device_id = d.id AND ds.revoked_at IS NULL) AS session_expires_at
         FROM tv_devices d
         JOIN screens s ON s.id = d.screen_id
         JOIN locations l ON l.id = s.location_id
         WHERE d.active = TRUE
         ORDER BY l.name, s.location_number, d.id`
      );
      return rows.map((row) => ({
        ...deviceRecord(row),
        location_id: Number(row.location_id),
        location_number: Number(row.location_number)
      }));
    },

    async revokeDeviceByScreen(screenId) {
      const now = isoNow();
      await pool.query(
        `UPDATE tv_device_sessions SET revoked_at = $1
         WHERE revoked_at IS NULL AND device_id IN (
           SELECT id FROM tv_devices WHERE screen_id = $2 AND active = TRUE
         )`,
        [now, screenId]
      );
      const { rowCount } = await pool.query(
        `UPDATE tv_devices SET active = FALSE, updated_at = $1
         WHERE screen_id = $2 AND active = TRUE`,
        [now, screenId]
      );
      return rowCount > 0;
    }
  });
}
