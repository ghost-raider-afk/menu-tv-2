import { isoNow, normaliseRow } from './helpers.js';
import { completeAnimationProfile } from '../shared/animation-profile.js';

function profileFromJson(value) {
  let profile = {};
  try { profile = JSON.parse(value || '{}'); }
  catch { profile = {}; }
  return completeAnimationProfile(profile);
}
function normaliseAnimationSettings(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  return {
    id: value.id,
    enabled: value.enabled === true,
    preset_id: value.preset_id || 'custom',
    profile: profileFromJson(value.profile_json),
    updated_by: value.updated_by || '',
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}
function normaliseAnimationPreset(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  return {
    id: value.id,
    name: value.name,
    profile: profileFromJson(value.profile_json),
    created_by: value.created_by || '',
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

    async listAnimationPresets() {
      const { rows } = await pool.query('SELECT * FROM animation_presets ORDER BY LOWER(name), id');
      return rows.map(normaliseAnimationPreset);
    },

    async getAnimationPreset(id) {
      const { rows } = await pool.query('SELECT * FROM animation_presets WHERE id = $1', [id]);
      return normaliseAnimationPreset(rows[0]);
    },

    async createAnimationPreset({ name, profile, created_by }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO animation_presets (name, profile_json, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4) RETURNING *`,
        [name, JSON.stringify(profile), created_by, now]
      );
      return normaliseAnimationPreset(rows[0]);
    },

    async updateAnimationPreset(id, { name, profile }) {
      const { rows } = await pool.query(
        'UPDATE animation_presets SET name = $1, profile_json = $2, updated_at = $3 WHERE id = $4 RETURNING *',
        [name, JSON.stringify(profile), isoNow(), id]
      );
      return normaliseAnimationPreset(rows[0]);
    },

    async deleteAnimationPreset(id) {
      const result = await pool.query('DELETE FROM animation_presets WHERE id = $1', [id]);
      return result.rowCount > 0;
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
