import { isoNow, normaliseRow } from './helpers.js';

export function createSettingsRepository(pool) {
  return Object.freeze({
    async setInitialSiteName(name) {
      await pool.query(
        "UPDATE site_settings SET application_name = $1, updated_at = $2 WHERE id = 1 AND application_name = ''",
        [name, isoNow()]
      );
    },

    async getSiteSettings() {
      const { rows } = await pool.query('SELECT * FROM site_settings WHERE id = 1');
      return normaliseRow(rows[0]);
    },

    async updateSiteSettings({ application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, updated_by }) {
      const { rows } = await pool.query(
        `UPDATE site_settings SET application_name = $1, accent_color = $2, timezone = $3, date_format = $4,
         dashboard_refresh_seconds = $5, default_screen_resolution = $6, updated_by = $7, updated_at = $8
         WHERE id = 1 RETURNING *`,
        [application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, updated_by, isoNow()]
      );
      return normaliseRow(rows[0]);
    },

    async setSiteAsset(kind, filename, updatedBy) {
      const column = kind === 'logo' ? 'logo_filename' : 'favicon_filename';
      const { rows } = await pool.query(
        `UPDATE site_settings SET ${column} = $1, updated_by = $2, updated_at = $3 WHERE id = 1 RETURNING *`,
        [filename, updatedBy, isoNow()]
      );
      return normaliseRow(rows[0]);
    }
  });
}
