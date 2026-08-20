import { isoNow, normaliseRow } from './helpers.js';
import { completeAnimationProfile } from '../shared/animation-profile.js';

function normaliseProfile(row) {
  const value = normaliseRow(row);
  if (!value) return null;
  let profile = {};
  try { profile = JSON.parse(value.profile_json || '{}'); }
  catch { profile = {}; }
  return {
    id: value.id,
    name: value.name,
    enabled: value.enabled === true,
    preset_id: value.preset_id,
    profile: completeAnimationProfile(profile),
    assigned_screen_count: Number(value.assigned_screen_count || 0),
    created_by: value.created_by || '',
    updated_by: value.updated_by || '',
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}

export function createAnimationRepository(pool) {
  async function getAnimationProfile(id) {
    const { rows } = await pool.query(
      `SELECT p.*, COUNT(s.id)::int AS assigned_screen_count
       FROM animation_profiles p LEFT JOIN screens s ON s.animation_profile_id = p.id
       WHERE p.id = $1 GROUP BY p.id`,
      [id]
    );
    return normaliseProfile(rows[0]);
  }

  return Object.freeze({
    async listAnimationProfiles() {
      const { rows } = await pool.query(
        `SELECT p.*, COUNT(s.id)::int AS assigned_screen_count
         FROM animation_profiles p LEFT JOIN screens s ON s.animation_profile_id = p.id
         GROUP BY p.id ORDER BY p.name, p.id`
      );
      return rows.map(normaliseProfile);
    },
    getAnimationProfile,
    async createAnimationProfile({ name, enabled, preset_id, profile, updated_by }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO animation_profiles (name, enabled, preset_id, profile_json, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $6) RETURNING id`,
        [name, enabled, preset_id, JSON.stringify(profile), updated_by, now]
      );
      return getAnimationProfile(rows[0].id);
    },
    async updateAnimationProfile(id, { name, enabled, preset_id, profile, updated_by }) {
      const { rowCount } = await pool.query(
        `UPDATE animation_profiles SET name = $1, enabled = $2, preset_id = $3, profile_json = $4,
         updated_by = $5, updated_at = $6 WHERE id = $7`,
        [name, enabled, preset_id, JSON.stringify(profile), updated_by, isoNow(), id]
      );
      return rowCount ? getAnimationProfile(id) : null;
    },
    async deleteAnimationProfile(id) {
      const { rowCount } = await pool.query(
        `DELETE FROM animation_profiles p WHERE p.id = $1
         AND NOT EXISTS (SELECT 1 FROM screens s WHERE s.animation_profile_id = p.id)`,
        [id]
      );
      return rowCount > 0;
    },
    async assignScreenAnimationProfile(screenId, profileId) {
      const { rowCount } = await pool.query(
        'UPDATE screens SET animation_profile_id = $1, updated_at = $2 WHERE id = $3',
        [profileId, isoNow(), screenId]
      );
      return rowCount > 0;
    },
    async getAnimationProfileForScreen(screenId) {
      const { rows } = await pool.query(
        `SELECT p.*, 1::int AS assigned_screen_count
         FROM screens s JOIN animation_profiles p ON p.id = s.animation_profile_id WHERE s.id = $1`,
        [screenId]
      );
      return normaliseProfile(rows[0]);
    }
  });
}
