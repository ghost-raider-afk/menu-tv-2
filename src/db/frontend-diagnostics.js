import { isoNow, normaliseRow } from './helpers.js';

export function createFrontendDiagnosticsRepository(pool) {
  return Object.freeze({
    async recordFrontendError(entry, { retentionDays, maxEntries }) {
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
      await pool.query('DELETE FROM frontend_error_events WHERE created_at < $1', [cutoff]);
      const { rows } = await pool.query(
        `INSERT INTO frontend_error_events
          (error_type, message, stack, page, source, line_number, column_number, user_agent, username, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [entry.error_type, entry.message, entry.stack, entry.page, entry.source, entry.line_number, entry.column_number, entry.user_agent, entry.username, isoNow()]
      );
      await pool.query(
        `DELETE FROM frontend_error_events
         WHERE id IN (
           SELECT id FROM frontend_error_events ORDER BY created_at DESC, id DESC OFFSET $1
         )`,
        [maxEntries]
      );
      return normaliseRow(rows[0]);
    },

    async listFrontendErrors(limit = 200) {
      const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 200, 500));
      const { rows } = await pool.query(
        'SELECT * FROM frontend_error_events ORDER BY created_at DESC, id DESC LIMIT $1',
        [safeLimit]
      );
      return rows.map(normaliseRow);
    },

    async clearFrontendErrors() {
      const { rowCount } = await pool.query('DELETE FROM frontend_error_events');
      return rowCount;
    }
  });
}
