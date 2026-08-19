import { isoNow, normaliseMenuRecord } from './helpers.js';

function backgroundUrlFromSettings(value) {
  try {
    const settings = typeof value === 'string' ? JSON.parse(value) : value;
    return typeof settings?.background_image_url === 'string' ? settings.background_image_url : '';
  } catch {
    return '';
  }
}

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
    async lockTemplate(id) {
      const { rowCount } = await pool.query('SELECT id FROM templates WHERE id = $1 FOR UPDATE', [id]);
      return rowCount > 0;
    },
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
    async updateTemplateSettings(id, settings = {}) {
      const { rowCount } = await pool.query(
        'UPDATE templates SET settings_json = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(settings), isoNow(), id]
      );
      return rowCount ? getTemplate(id) : null;
    },
    async isTemplateBackgroundReferenced(url) {
      if (!url) return false;
      const [templates, drafts] = await Promise.all([
        pool.query('SELECT settings_json FROM templates'),
        pool.query('SELECT settings_json FROM screen_drafts')
      ]);
      return [...templates.rows, ...drafts.rows].some((row) => backgroundUrlFromSettings(row.settings_json) === url);
    },
    async deleteTemplate(id) {
      await pool.query('UPDATE screens SET template_id = NULL, updated_at = $1 WHERE template_id = $2', [isoNow(), id]);
      const { rowCount } = await pool.query('DELETE FROM templates WHERE id = $1', [id]);
      return rowCount > 0;
    }
  });
}
