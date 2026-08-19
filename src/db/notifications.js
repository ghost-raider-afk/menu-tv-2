import { isoNow, normaliseActivityEvent } from './helpers.js';

export function createNotificationsRepository(pool) {
  return Object.freeze({
    async recordActivity({ actor_username, action, entity_type, entity_id = null, message, metadata = {} }) {
      const { rows } = await pool.query(
        `INSERT INTO activity_events (actor_username, action, entity_type, entity_id, message, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [actor_username, action, entity_type, entity_id === null ? null : String(entity_id), message, JSON.stringify(metadata), isoNow()]
      );
      return normaliseActivityEvent(rows[0]);
    },

    async listNotifications(limit = 20) {
      const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 100));
      const [events, unread] = await Promise.all([
        pool.query('SELECT * FROM activity_events ORDER BY created_at DESC, id DESC LIMIT $1', [safeLimit]),
        pool.query('SELECT COUNT(*)::int AS count FROM activity_events WHERE read_at IS NULL')
      ]);
      return { items: events.rows.map(normaliseActivityEvent), unread_count: Number(unread.rows[0].count) };
    },

    async markNotificationsRead() {
      const { rowCount } = await pool.query('UPDATE activity_events SET read_at = $1 WHERE read_at IS NULL', [isoNow()]);
      return rowCount;
    }
  });
}
