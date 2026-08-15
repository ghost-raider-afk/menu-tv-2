import { isoNow, jsonValue, normaliseMenuRecord, normaliseRow } from './helpers.js';

export function createScreensRepository(pool) {
  async function getScreen(id) {
    const { rows } = await pool.query(
      `SELECT s.*, l.name AS location_name, t.name AS template_name, d.name AS sftp_directory_name,
       CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
       FROM screens s JOIN locations l ON l.id = s.location_id
       LEFT JOIN templates t ON t.id = s.template_id
       LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
       WHERE s.id = $1`,
      [id]
    );
    return normaliseRow(rows[0]);
  }

  return Object.freeze({
    async listScreens() {
      const { rows } = await pool.query(
        `SELECT s.*, l.name AS location_name, t.name AS template_name, d.name AS sftp_directory_name,
         CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
         FROM screens s JOIN locations l ON l.id = s.location_id
         LEFT JOIN templates t ON t.id = s.template_id
         LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
         ORDER BY l.name, s.name`
      );
      return rows.map(normaliseRow);
    },

    getScreen,

    async createScreen({ location_id, name, resolution = '1920×1080', status = 'draft', active = true, template_id = null }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO screens (location_id, name, resolution, status, active, template_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
        [location_id, name, resolution, status, active, template_id, now]
      );
      await pool.query('UPDATE screens SET delivery_filename = $1 WHERE id = $2', [`monitor-${rows[0].id}.jpg`, rows[0].id]);
      await pool.query(
        'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, updated_at) VALUES ($1, $2, $3, $4)',
        [rows[0].id, '[]', '{}', now]
      );
      return getScreen(rows[0].id);
    },

    async updateScreen(id, { location_id, name, resolution = '1920×1080', status = 'draft', active = true, template_id = null }) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET location_id = $1, name = $2, resolution = $3, status = $4,
         active = $5, template_id = $6, updated_at = $7 WHERE id = $8`,
        [location_id, name, resolution, status, active, template_id, isoNow(), id]
      );
      return rowCount ? getScreen(id) : null;
    },

    async deleteScreen(id) {
      const { rowCount } = await pool.query('DELETE FROM screens WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async savePreparedAsset(screenId, asset) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET prepared_asset_key = $1, prepared_asset_sha256 = $2, prepared_asset_size = $3,
         status = 'ready', updated_at = $4 WHERE id = $5`,
        [asset.key, asset.sha256, asset.size, isoNow(), screenId]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async markScreenPublished(screenId) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET status = 'published', published_sha256 = prepared_asset_sha256,
         published_at = $1, updated_at = $1 WHERE id = $2 AND prepared_asset_key IS NOT NULL`,
        [isoNow(), screenId]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async nextScreenName(locationId) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM screens WHERE location_id = $1', [locationId]);
      return `ТВ ${Number(rows[0].count) + 1}`;
    },

    async getScreenDraft(screenId) {
      const { rows } = await pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
      return normaliseMenuRecord(rows[0]) || { screen_id: screenId, rows: [], settings: {} };
    },

    async saveScreenDraft(screenId, { rows, settings }) {
      const now = isoNow();
      await pool.query(
        `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (screen_id) DO UPDATE SET rows_json = EXCLUDED.rows_json,
         settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at`,
        [screenId, JSON.stringify(rows), JSON.stringify(settings), now]
      );
      const { rows: saved } = await pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
      return normaliseMenuRecord(saved[0]);
    },

    async screensUsingCatalog(kind, catalogId) {
      const column = kind === 'product' ? 'product_id' : 'packaging_id';
      const { rows } = await pool.query(
        `SELECT d.screen_id, d.rows_json, s.name AS screen_name, l.name AS location_name
         FROM screen_drafts d JOIN screens s ON s.id = d.screen_id JOIN locations l ON l.id = s.location_id`
      );
      return rows
        .filter((row) => jsonValue(row.rows_json, []).some((item) => Number(item?.[column]) === Number(catalogId)))
        .map((row) => ({ screen_id: Number(row.screen_id), screen_name: row.screen_name, location_name: row.location_name }));
    }
  });
}
