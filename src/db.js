import { Pool } from 'pg';

function isoNow() {
  return new Date().toISOString();
}

function normaliseRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    ...(row.location_id === undefined ? {} : { location_id: Number(row.location_id) }),
    ...(row.screen_count === undefined ? {} : { screen_count: Number(row.screen_count) }),
    ...(row.sftp_directory_id === undefined || row.sftp_directory_id === null ? {} : { sftp_directory_id: Number(row.sftp_directory_id) }),
    ...(row.bound_location_id === undefined || row.bound_location_id === null ? {} : { bound_location_id: Number(row.bound_location_id) })
  };
}

export class MenuTvStore {
  constructor(dbConfig, { seedDemoData = false, pool = null } = {}) {
    this.pool = pool ?? new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
    this.seedDemoData = seedDemoData;
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sftp_directories (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        provisioned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS locations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sftp_directory_id BIGINT UNIQUE REFERENCES sftp_directories(id) ON DELETE RESTRICT,
        sftp_username TEXT UNIQUE,
        sftp_password_issued_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS screens (
        id BIGSERIAL PRIMARY KEY,
        location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        resolution TEXT NOT NULL DEFAULT '1920×1080',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'ready', 'published')),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        delivery_filename TEXT,
        prepared_asset_key TEXT,
        prepared_asset_sha256 TEXT,
        prepared_asset_size BIGINT,
        published_sha256 TEXT,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(location_id, name)
      );
      CREATE TABLE IF NOT EXISTS templates (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_directory_id BIGINT REFERENCES sftp_directories(id) ON DELETE RESTRICT;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_username TEXT;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_password_issued_at TIMESTAMPTZ;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS delivery_filename TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_key TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_sha256 TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_size BIGINT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_sha256 TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
      CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_directory_id_unique ON locations(sftp_directory_id) WHERE sftp_directory_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_username_unique ON locations(sftp_username) WHERE sftp_username IS NOT NULL;
      UPDATE screens SET delivery_filename = 'monitor-' || id::text || '.jpg' WHERE delivery_filename IS NULL;
    `);
    if (this.seedDemoData) await this.#seed();
  }

  async #seed() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS count FROM locations');
    if (rows[0].count > 0) return;
    const now = isoNow();
    const location = await this.pool.query(
      'INSERT INTO locations (name, address, active, created_at, updated_at) VALUES ($1, $2, TRUE, $3, $3) RETURNING id',
      ['Демонстрационная точка', 'Пример адреса', now]
    );
    await this.pool.query(
      'INSERT INTO screens (location_id, name, resolution, status, active, created_at, updated_at) VALUES ($1, $2, $3, $4, TRUE, $5, $5)',
      [location.rows[0].id, 'Экран у кассы', '1920×1080', 'ready', now]
    );
    await this.pool.query(
      'INSERT INTO templates (name, description, active, created_at, updated_at) VALUES ($1, $2, TRUE, $3, $3)',
      ['Светлое меню', 'Базовый демонстрационный шаблон', now]
    );
  }

  async overview() {
    const { rows } = await this.pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM locations) AS locations,
        (SELECT COUNT(*)::int FROM screens) AS screens,
        (SELECT COUNT(*)::int FROM screens WHERE status = 'published') AS published,
        (SELECT COUNT(*)::int FROM templates) AS templates
    `);
    return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
  }

  async listLocations() {
    const { rows } = await this.pool.query(`
      SELECT l.*, d.name AS sftp_directory_name
      FROM locations l LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
      ORDER BY l.name
    `);
    return Promise.all(rows.map((row) => this.#withScreenCount(row)));
  }

  async getLocation(id) {
    const { rows } = await this.pool.query(`
      SELECT l.*, d.name AS sftp_directory_name
      FROM locations l LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
      WHERE l.id = $1
    `, [id]);
    return this.#withScreenCount(rows[0]);
  }

  async #withScreenCount(row) {
    const location = normaliseRow(row);
    if (!location) return null;
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS screen_count FROM screens WHERE location_id = $1', [location.id]);
    return { ...location, screen_count: Number(rows[0].screen_count) };
  }

  async createLocation({ name, address = '', active = true }) {
    const now = isoNow();
    const { rows } = await this.pool.query(
      'INSERT INTO locations (name, address, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id',
      [name, address, active, now]
    );
    return this.getLocation(rows[0].id);
  }

  async updateLocation(id, { name, address = '', active = true }) {
    const { rowCount } = await this.pool.query(
      'UPDATE locations SET name = $1, address = $2, active = $3, updated_at = $4 WHERE id = $5',
      [name, address, active, isoNow(), id]
    );
    return rowCount ? this.getLocation(id) : null;
  }

  async deleteLocation(id) {
    const { rowCount } = await this.pool.query('DELETE FROM locations WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async listScreens() {
    const { rows } = await this.pool.query(`
      SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name,
        CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
      FROM screens s JOIN locations l ON l.id = s.location_id
      LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
      ORDER BY l.name, s.name
    `);
    return rows.map(normaliseRow);
  }

  async getScreen(id) {
    const { rows } = await this.pool.query(`
      SELECT s.*, l.name AS location_name, d.name AS sftp_directory_name,
        CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
      FROM screens s JOIN locations l ON l.id = s.location_id
      LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
      WHERE s.id = $1
    `, [id]);
    return normaliseRow(rows[0]);
  }

  async createScreen({ location_id, name, resolution = '1920×1080', status = 'draft', active = true }) {
    const now = isoNow();
    const { rows } = await this.pool.query(`
      INSERT INTO screens (location_id, name, resolution, status, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id
    `, [location_id, name, resolution, status, active, now]);
    await this.pool.query('UPDATE screens SET delivery_filename = $1 WHERE id = $2', [`monitor-${rows[0].id}.jpg`, rows[0].id]);
    return this.getScreen(rows[0].id);
  }

  async updateScreen(id, { location_id, name, resolution = '1920×1080', status = 'draft', active = true }) {
    const { rowCount } = await this.pool.query(`
      UPDATE screens SET location_id = $1, name = $2, resolution = $3, status = $4, active = $5, updated_at = $6 WHERE id = $7
    `, [location_id, name, resolution, status, active, isoNow(), id]);
    return rowCount ? this.getScreen(id) : null;
  }

  async deleteScreen(id) {
    const { rowCount } = await this.pool.query('DELETE FROM screens WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async listSftpDirectories() {
    const { rows } = await this.pool.query(`
      SELECT d.*, l.id AS bound_location_id, l.name AS bound_location_name
      FROM sftp_directories d
      LEFT JOIN locations l ON l.sftp_directory_id = d.id
      ORDER BY d.name
    `);
    return rows.map(normaliseRow);
  }

  async getSftpDirectory(id) {
    const { rows } = await this.pool.query(`
      SELECT d.*, l.id AS bound_location_id, l.name AS bound_location_name
      FROM sftp_directories d
      LEFT JOIN locations l ON l.sftp_directory_id = d.id
      WHERE d.id = $1
    `, [id]);
    return normaliseRow(rows[0]);
  }

  async createSftpDirectory({ name }) {
    const now = isoNow();
    const { rows } = await this.pool.query(
      'INSERT INTO sftp_directories (name, created_at, updated_at) VALUES ($1, $2, $2) RETURNING id',
      [name, now]
    );
    return this.getSftpDirectory(rows[0].id);
  }

  async markSftpDirectoryProvisioned(id) {
    const { rowCount } = await this.pool.query(
      'UPDATE sftp_directories SET provisioned_at = $1, updated_at = $1 WHERE id = $2',
      [isoNow(), id]
    );
    return rowCount ? this.getSftpDirectory(id) : null;
  }

  async deleteSftpDirectory(id) {
    const { rowCount } = await this.pool.query('DELETE FROM sftp_directories WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async bindLocationSftp(locationId, { directoryId, username }) {
    const { rowCount } = await this.pool.query(`
      UPDATE locations
      SET sftp_directory_id = $1, sftp_username = $2, sftp_password_issued_at = $3, updated_at = $3
      WHERE id = $4 AND sftp_directory_id IS NULL
    `, [directoryId, username, isoNow(), locationId]);
    return rowCount ? this.getLocation(locationId) : null;
  }

  async touchLocationSftpPassword(locationId) {
    const { rowCount } = await this.pool.query(
      'UPDATE locations SET sftp_password_issued_at = $1, updated_at = $1 WHERE id = $2 AND sftp_username IS NOT NULL',
      [isoNow(), locationId]
    );
    return rowCount ? this.getLocation(locationId) : null;
  }

  async unbindLocationSftp(locationId) {
    const { rowCount } = await this.pool.query(`
      UPDATE locations
      SET sftp_directory_id = NULL, sftp_username = NULL, sftp_password_issued_at = NULL, updated_at = $1
      WHERE id = $2 AND sftp_directory_id IS NOT NULL
    `, [isoNow(), locationId]);
    return rowCount ? this.getLocation(locationId) : null;
  }

  async savePreparedAsset(screenId, asset) {
    const { rowCount } = await this.pool.query(`
      UPDATE screens
      SET prepared_asset_key = $1, prepared_asset_sha256 = $2, prepared_asset_size = $3,
        status = 'ready', updated_at = $4
      WHERE id = $5
    `, [asset.key, asset.sha256, asset.size, isoNow(), screenId]);
    return rowCount ? this.getScreen(screenId) : null;
  }

  async markScreenPublished(screenId) {
    const { rowCount } = await this.pool.query(`
      UPDATE screens
      SET status = 'published', published_sha256 = prepared_asset_sha256, published_at = $1, updated_at = $1
      WHERE id = $2 AND prepared_asset_key IS NOT NULL
    `, [isoNow(), screenId]);
    return rowCount ? this.getScreen(screenId) : null;
  }

  async listTemplates() {
    const { rows } = await this.pool.query('SELECT * FROM templates ORDER BY name');
    return rows.map(normaliseRow);
  }

  async getTemplate(id) {
    const { rows } = await this.pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }

  async createTemplate({ name, description = '', active = true }) {
    const now = isoNow();
    const { rows } = await this.pool.query(
      'INSERT INTO templates (name, description, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id',
      [name, description, active, now]
    );
    return this.getTemplate(rows[0].id);
  }

  async updateTemplate(id, { name, description = '', active = true }) {
    const { rowCount } = await this.pool.query(
      'UPDATE templates SET name = $1, description = $2, active = $3, updated_at = $4 WHERE id = $5',
      [name, description, active, isoNow(), id]
    );
    return rowCount ? this.getTemplate(id) : null;
  }

  async deleteTemplate(id) {
    const { rowCount } = await this.pool.query('DELETE FROM templates WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async close() {
    await this.pool.end();
  }
}
