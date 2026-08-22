import { isoNow, jsonValue, normaliseRow } from './helpers.js';

function normaliseDiagnosticEvent(row) {
  const event = normaliseRow(row);
  if (!event) return null;
  const { details_json: detailsJson, ...publicEvent } = event;
  return {
    ...publicEvent,
    status: event.status === null || event.status === undefined ? null : Number(event.status),
    duration_ms: event.duration_ms === null || event.duration_ms === undefined ? null : Number(event.duration_ms),
    details: jsonValue(detailsJson, {})
  };
}

function enumFilter(value, allowed) {
  const text = String(value || '').trim().toLowerCase();
  return allowed.has(text) ? text : '';
}

export function createDiagnosticsRepository(pool) {
  return Object.freeze({
    async recordDiagnosticEvent({
      severity = 'error', source = 'server', category = 'runtime', code = '', message,
      page = '', route = '', method = '', status = null, duration_ms = null, request_id = '',
      actor_username = '', user_agent = '', details = {}
    }) {
      const { rows } = await pool.query(
        `INSERT INTO diagnostic_events (
          severity, source, category, code, message, page, route, method, status, duration_ms,
          request_id, actor_username, user_agent, details_json, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          severity, source, category, code, message, page, route, method || '',
          status === null ? null : Number(status), duration_ms === null ? null : Number(duration_ms),
          request_id || '', actor_username || '', user_agent || '', JSON.stringify(details || {}), isoNow()
        ]
      );
      return normaliseDiagnosticEvent(rows[0]);
    },

    async listDiagnosticEvents({ limit = 1000, severity = '', source = '', page = '', category = '' } = {}) {
      const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 1000, 5000));
      const clauses = [];
      const parameters = [];
      const add = (sql, value) => {
        parameters.push(value);
        clauses.push(sql.replace('?', `$${parameters.length}`));
      };
      const safeSeverity = enumFilter(severity, new Set(['info', 'warn', 'error']));
      const safeSource = enumFilter(source, new Set(['client', 'server']));
      if (safeSeverity) add('severity = ?', safeSeverity);
      if (safeSource) add('source = ?', safeSource);
      if (String(page || '').trim()) add('page = ?', String(page).trim());
      if (String(category || '').trim()) add('category = ?', String(category).trim());
      parameters.push(safeLimit);
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM diagnostic_events ${where} ORDER BY created_at DESC, id DESC LIMIT $${parameters.length}`,
        parameters
      );
      return rows.map(normaliseDiagnosticEvent);
    },

    async clearDiagnosticEvents() {
      const { rowCount } = await pool.query('DELETE FROM diagnostic_events');
      return rowCount;
    }
  });
}
