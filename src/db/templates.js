import { isoNow, normaliseMenuRecord } from './helpers.js';

export function createTemplatesRepository(pool) {
  async function getTemplate(id) {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    return normaliseMenuRecord(rows[0]);
  }

  return Object.freeze({
    async listTemplates() {
      const [templates, assignments] = await Promise.all([
        pool.query('SELECT * FROM templates ORDER BY name'),
        pool.query('SELECT template_id, COUNT(*)::int AS assigned_screens FROM screens WHERE template_id IS NOT NULL GROUP BY template_id')
      ]);
      const counts = new Map(assignments.rows.map((row) => [Number(row.template_id), Number(row.assigned_screens)]));
      return templates.rows.map((row) => normaliseMenuRecord({ ...row, assigned_screens: counts.get(Number(row.id)) || 0 }));
    },
    getTemplate,
    async createTemplate({ name, description = '', active = true, rows: menuRows = [], settings = {} }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO templates (name, description, active, rows_json, settings_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
        [name, description, active, JSON.stringify(menuRows), JSON.stringify(settings), now]
      );
      return getTemplate(rows[0].id);
    },
    async updateTemplate(id, { name, description = '', active = true, rows: menuRows = [], settings = {} }) {
      const { rowCount } = await pool.query(
        `UPDATE templates SET name = $1, description = $2, active = $3, rows_json = $4,
         settings_json = $5, updated_at = $6 WHERE id = $7`,
        [name, description, active, JSON.stringify(menuRows), JSON.stringify(settings), isoNow(), id]
      );
      return rowCount ? getTemplate(id) : null;
    },
    async deleteTemplate(id) {
      await pool.query('UPDATE screens SET template_id = NULL, updated_at = $1 WHERE template_id = $2', [isoNow(), id]);
      const { rowCount } = await pool.query('DELETE FROM templates WHERE id = $1', [id]);
      return rowCount > 0;
    }
  });
}
