import { isoNow, normaliseRow } from './helpers.js';
import { completeAnimationProfile } from '../shared/animation-profile.js';
import { completeSceneEntity } from '../contracts/scene-entity.js';
import { completeAnnouncement } from '../contracts/announcement.js';

function normaliseAnimationSettings(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  let profile = {};
  let entity = {};
  let announcement = {};
  try { profile = JSON.parse(value.profile_json || '{}'); }
  catch { profile = {}; }
  try { entity = JSON.parse(value.entity_json || '{}'); }
  catch { entity = {}; }
  try { announcement = JSON.parse(value.announcement_json || '{}'); }
  catch { announcement = {}; }
  return {
    id: value.id,
    enabled: value.enabled === true,
    preset_id: value.preset_id || 'cinematic-live-menu',
    profile: completeAnimationProfile(profile),
    entity: completeSceneEntity(entity),
    announcement: completeAnnouncement(announcement),
    updated_by: value.updated_by || '',
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

export function createSettingsRepository(pool) {
  return Object.freeze({
    async setInitialSiteName(name) {
      await pool.query(
        `UPDATE site_settings SET application_name = $1, updated_at = $2
         WHERE id = 1 AND (application_name = '' OR application_name IN ('ТВ МЕНЮ', 'ТВ МЕНЮ 2'))`,
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

    async updateAnimationSettings({ enabled, preset_id, profile, entity, announcement, updated_by }) {
      const { rows } = await pool.query(
        `UPDATE animation_settings SET enabled = $1, preset_id = $2, profile_json = $3, entity_json = $4,
         announcement_json = $5, updated_by = $6, updated_at = $7 WHERE id = 1 RETURNING *`,
        [enabled, preset_id, JSON.stringify(profile), JSON.stringify(entity), JSON.stringify(announcement), updated_by, isoNow()]
      );
      return normaliseAnimationSettings(rows[0]);
    },

    async updateAnimationEntity(entity, updated_by) {
      const { rows } = await pool.query(
        `UPDATE animation_settings SET entity_json = $1, updated_by = $2, updated_at = $3
         WHERE id = 1 RETURNING *`,
        [JSON.stringify(entity), updated_by, isoNow()]
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
