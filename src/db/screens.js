import { isoNow, jsonValue, normaliseMenuRecord, normaliseRow } from './helpers.js';

function normaliseDraft(row, screenId) {
  const record = normaliseMenuRecord(row) || { screen_id: screenId, rows: [], settings: {}, revision: 0 };
  return { ...record, revision: Number(record.revision || 0) };
}

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
      const id = Number(rows[0].id);
      await pool.query('UPDATE screens SET delivery_filename = $1 WHERE id = $2', [`monitor-${id}.jpg`, id]);
      await pool.query(
        'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at) VALUES ($1, $2, $3, 1, $4)',
        [id, '[]', '{}', now]
      );
      return getScreen(id);
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

    async savePreparedAsset(screenId, asset, draftRevision) {
      const { rowCount } = await pool.query(
        `UPDATE screens s SET prepared_asset_key = $1, prepared_asset_sha256 = $2, prepared_asset_size = $3,
         prepared_draft_revision = $4, publication_pending_sha256 = NULL, publication_started_at = NULL,
         status = 'ready', updated_at = $5
         WHERE s.id = $6 AND s.publication_pending_sha256 IS NULL AND EXISTS (
           SELECT 1 FROM screen_drafts d WHERE d.screen_id = s.id AND d.revision = $4
         )`,
        [asset.key, asset.sha256, asset.size, draftRevision, isoNow(), screenId]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async markPublicationStarted(screenId, expectedSha256) {
      const { rowCount } = await pool.query(
        `UPDATE screens s SET publication_pending_sha256 = prepared_asset_sha256, publication_started_at = $1, updated_at = $1
         WHERE s.id = $2 AND publication_pending_sha256 IS NULL
           AND prepared_asset_key IS NOT NULL AND prepared_asset_sha256 = $3
           AND prepared_draft_revision IS NOT NULL
           AND EXISTS (SELECT 1 FROM screen_drafts d WHERE d.screen_id = s.id AND d.revision = s.prepared_draft_revision)`,
        [isoNow(), screenId, expectedSha256]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async clearPublicationPending(screenId, expectedSha256) {
      await pool.query(
        `UPDATE screens SET publication_pending_sha256 = NULL, publication_started_at = NULL, updated_at = $1
         WHERE id = $2 AND publication_pending_sha256 = $3`,
        [isoNow(), screenId, expectedSha256]
      );
      return getScreen(screenId);
    },

    async markScreenPublished(screenId, expectedSha256) {
      const { rowCount } = await pool.query(
        `UPDATE screens SET status = 'published', published_sha256 = $1,
         published_draft_revision = prepared_draft_revision, published_at = $2,
         publication_pending_sha256 = NULL, publication_started_at = NULL,
         prepared_asset_key = NULL, prepared_asset_sha256 = NULL, prepared_asset_size = NULL, prepared_draft_revision = NULL,
         updated_at = $2
         WHERE id = $3 AND publication_pending_sha256 = $1`,
        [expectedSha256, isoNow(), screenId]
      );
      return rowCount ? getScreen(screenId) : null;
    },

    async listPendingPublications() {
      const { rows } = await pool.query(
        `SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name
         FROM screens s JOIN locations l ON l.id = s.location_id
         LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
         WHERE s.publication_pending_sha256 IS NOT NULL AND s.publication_started_at IS NOT NULL`
      );
      return rows.map(normaliseRow);
    },

    async listPreparedAssetKeys() {
      const { rows } = await pool.query('SELECT prepared_asset_key FROM screens WHERE prepared_asset_key IS NOT NULL');
      return rows.map((row) => row.prepared_asset_key).filter(Boolean);
    },

    async nextScreenName(locationId) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM screens WHERE location_id = $1', [locationId]);
      return `ТВ ${Number(rows[0].count) + 1}`;
    },

    async getScreenDraft(screenId) {
      const { rows } = await pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
      return normaliseDraft(rows[0], screenId);
    },

    async saveScreenDraft(screenId, { rows, settings }, expectedRevision) {
      const now = isoNow();
      let saved;
      if (Number.isInteger(expectedRevision) && expectedRevision > 0) {
        const result = await pool.query(
          `UPDATE screen_drafts SET rows_json = $1, settings_json = $2, revision = revision + 1, updated_at = $3
           WHERE screen_id = $4 AND revision = $5 RETURNING *`,
          [JSON.stringify(rows), JSON.stringify(settings), now, screenId, expectedRevision]
        );
        saved = result.rows[0];
        if (!saved) return null;
      } else {
        const result = await pool.query(
          `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, revision, updated_at)
           VALUES ($1, $2, $3, 1, $4)
           ON CONFLICT (screen_id) DO UPDATE SET rows_json = EXCLUDED.rows_json,
           settings_json = EXCLUDED.settings_json, revision = screen_drafts.revision + 1, updated_at = EXCLUDED.updated_at
           RETURNING *`,
          [screenId, JSON.stringify(rows), JSON.stringify(settings), now]
        );
        saved = result.rows[0];
      }
      await pool.query(
        `UPDATE screens SET prepared_asset_key = NULL, prepared_asset_sha256 = NULL, prepared_asset_size = NULL,
         prepared_draft_revision = NULL, publication_pending_sha256 = NULL, publication_started_at = NULL,
         status = 'draft', updated_at = $1 WHERE id = $2`,
        [now, screenId]
      );
      return normaliseDraft(saved, screenId);
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
