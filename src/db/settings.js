import { isoNow, normaliseRow } from './helpers.js';
import { completeAnimationProfile } from '../shared/animation-profile.js';

function normaliseAnimationSettings(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  let profile = {};
  try { profile = JSON.parse(value.profile_json || '{}'); }
  catch { profile = {}; }
  return {
    id: value.id,
    enabled: value.enabled === true,
    preset_id: value.preset_id || 'cascade-soft',
    profile: completeAnimationProfile(profile),
    updated_by: value.updated_by || '',
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

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

    async updateSiteSettings({ application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, signin_logo_size, updated_by }) {
      const { rows } = await pool.query(
        `UPDATE site_settings SET application_name = $1, accent_color = $2, timezone = $3, date_format = $4,
         dashboard_refresh_seconds = $5, default_screen_resolution = $6, signin_logo_size = $7,
         updated_by = $8, updated_at = $9 WHERE id = 1 RETURNING *`,
        [application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, signin_logo_size, updated_by, isoNow()]
      );
      return normaliseRow(rows[0]);
    },

    async getAnimationSettings() {
      const { rows } = await pool.query('SELECT * FROM animation_settings WHERE id = 1');
      return normaliseAnimationSettings(rows[0]);
    },

    async updateAnimationSettings({ enabled, preset_id, profile, updated_by }) {
      const { rows } = await pool.query(
        `UPDATE animation_settings SET enabled = $1, preset_id = $2, profile_json = $3,
         updated_by = $4, updated_at = $5 WHERE id = 1 RETURNING *`,
        [enabled, preset_id, JSON.stringify(profile), updated_by, isoNow()]
      );
      return normaliseAnimationSettings(rows[0]);
    },

    async setSiteAsset(kind, filename, updatedBy) {
      const now = isoNow();
      const statement = kind === 'logo'
        ? 'UPDATE site_settings SET logo_filename = $1, updated_by = $2, updated_at = $3 WHERE id = 1 RETURNING *'
        : 'UPDATE site_settings SET favicon_filename = $1, updated_by = $2, updated_at = $3 WHERE id = 1 RETURNING *';
      const { rows } = await pool.query(statement, [filename, updatedBy, now]);
      return normaliseRow(rows[0]);
    }
  });
}
