import { Pool } from 'pg';

function isoNow() {
  return new Date().toISOString();
}

function normaliseRow(row) {
  if (!row) return null;
  return {
    ...row,
    ...(row.id === undefined ? {} : { id: Number(row.id) }),
    ...(row.location_id === undefined ? {} : { location_id: Number(row.location_id) }),
    ...(row.template_id === undefined || row.template_id === null ? {} : { template_id: Number(row.template_id) }),
    ...(row.session_version === undefined || row.session_version === null ? {} : { session_version: Number(row.session_version) }),
    ...(row.screen_count === undefined ? {} : { screen_count: Number(row.screen_count) }),
    ...(row.sftp_directory_id === undefined || row.sftp_directory_id === null ? {} : { sftp_directory_id: Number(row.sftp_directory_id) }),
    ...(row.bound_location_id === undefined || row.bound_location_id === null ? {} : { bound_location_id: Number(row.bound_location_id) })
  };
}

function normaliseActivityEvent(row) {
  const event = normaliseRow(row);
  if (!event) return null;
  try {
    return { ...event, metadata: JSON.parse(event.metadata || '{}') };
  } catch {
    return { ...event, metadata: {} };
  }
}

function jsonValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normaliseMenuRecord(row) {
  const record = normaliseRow(row);
  if (!record) return null;
  return {
    ...record,
    rows: jsonValue(record.rows_json, []),
    settings: jsonValue(record.settings_json, {})
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
        template_id BIGINT,
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
        rows_json TEXT NOT NULL DEFAULT '[]',
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_products (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        producer TEXT NOT NULL DEFAULT '',
        characteristics TEXT NOT NULL DEFAULT '',
        strength TEXT NOT NULL DEFAULT '',
        price_primary TEXT NOT NULL DEFAULT '',
        price_secondary TEXT NOT NULL DEFAULT '',
        alcoholic BOOLEAN NOT NULL DEFAULT FALSE,
        beverage_color TEXT NOT NULL DEFAULT 'none',
        filtration TEXT NOT NULL DEFAULT 'none',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_packaging (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        unit_price TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS screen_drafts (
        screen_id BIGINT PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
        rows_json TEXT NOT NULL DEFAULT '[]',
        settings_json TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_preferences (
        username TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        job_title TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT 'system',
        notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      -- SFTPGo uses a table named "users" in this same PostgreSQL database.
      -- Keep browser-administrator accounts in an application-specific table so
      -- that the two services never alter each other's schema or credentials.
      CREATE TABLE IF NOT EXISTS web_users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'administrator' CHECK(role IN ('administrator')),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        session_version INTEGER NOT NULL DEFAULT 1,
        password_changed_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS site_settings (
        id SMALLINT PRIMARY KEY,
        application_name TEXT NOT NULL DEFAULT '',
        accent_color TEXT NOT NULL DEFAULT '#2563EB',
        logo_filename TEXT NOT NULL DEFAULT '',
        favicon_filename TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
        date_format TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
        dashboard_refresh_seconds INTEGER NOT NULL DEFAULT 45,
        default_screen_resolution TEXT NOT NULL DEFAULT '1920×1080',
        updated_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity_events (
        id BIGSERIAL PRIMARY KEY,
        actor_username TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        message TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_directory_id BIGINT REFERENCES sftp_directories(id) ON DELETE RESTRICT;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_username TEXT;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS sftp_password_issued_at TIMESTAMPTZ;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS delivery_filename TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS template_id BIGINT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_key TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_sha256 TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS prepared_asset_size BIGINT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_sha256 TEXT;
      ALTER TABLE screens ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
      ALTER TABLE templates ADD COLUMN IF NOT EXISTS rows_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE templates ADD COLUMN IF NOT EXISTS settings_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT '';
      ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'administrator';
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE web_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS date_format TEXT NOT NULL DEFAULT 'DD.MM.YYYY';
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS dashboard_refresh_seconds INTEGER NOT NULL DEFAULT 45;
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS default_screen_resolution TEXT NOT NULL DEFAULT '1920×1080';
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS application_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#2563EB';
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS logo_filename TEXT NOT NULL DEFAULT '';
      ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS favicon_filename TEXT NOT NULL DEFAULT '';
      CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_directory_id_unique ON locations(sftp_directory_id) WHERE sftp_directory_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS locations_sftp_username_unique ON locations(sftp_username) WHERE sftp_username IS NOT NULL;
      CREATE INDEX IF NOT EXISTS activity_events_created_at_index ON activity_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS activity_events_unread_index ON activity_events(read_at) WHERE read_at IS NULL;
      UPDATE screens SET delivery_filename = 'monitor-' || id::text || '.jpg' WHERE delivery_filename IS NULL;
      UPDATE web_users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
    `);
    const now = isoNow();
    await this.pool.query(
      'INSERT INTO site_settings (id, timezone, created_at, updated_at) VALUES (1, $1, $2, $2) ON CONFLICT (id) DO NOTHING',
      ['Europe/Moscow', now]
    );
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

  async ensureInitialAdministrator({ username, passwordHash } = {}) {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS count FROM web_users');
    if (Number(rows[0].count) > 0) return false;
    if (!username || !passwordHash) {
      throw new Error('В базе нет пользователей. Для первого запуска укажите временные BOOTSTRAP_ADMIN_USERNAME и BOOTSTRAP_ADMIN_PASSWORD.');
    }
    const now = isoNow();
    await this.pool.query(
      `INSERT INTO web_users (username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at)
       VALUES ($1, $2, 'administrator', TRUE, 1, $3, $3, $3)`,
      [username, passwordHash, now]
    );
    await this.getUserPreferences(username);
    return true;
  }

  async getActiveUser(username) {
    const { rows } = await this.pool.query(
      `SELECT username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at
       FROM web_users WHERE username = $1 AND active = TRUE`,
      [username]
    );
    return normaliseRow(rows[0]);
  }

  async updateUserPassword(username, passwordHash) {
    const { rows } = await this.pool.query(
      `UPDATE web_users
       SET password_hash = $1, session_version = session_version + 1, password_changed_at = $2, updated_at = $2
       WHERE username = $3 AND active = TRUE
       RETURNING username, password_hash, role, active, session_version, password_changed_at, created_at, updated_at`,
      [passwordHash, isoNow(), username]
    );
    return normaliseRow(rows[0]);
  }

  async getUserPreferences(username) {
    const now = isoNow();
    await this.pool.query(
      'INSERT INTO user_preferences (username, display_name, created_at, updated_at) VALUES ($1, $1, $2, $2) ON CONFLICT (username) DO NOTHING',
      [username, now]
    );
    const { rows } = await this.pool.query('SELECT * FROM user_preferences WHERE username = $1', [username]);
    return normaliseRow(rows[0]);
  }

  async updateUserPreferences(username, { display_name, email, phone, job_title, theme, notifications_enabled }) {
    await this.getUserPreferences(username);
    const { rows } = await this.pool.query(
      `UPDATE user_preferences
       SET display_name = $1, email = $2, phone = $3, job_title = $4, theme = $5,
         notifications_enabled = $6, updated_at = $7
       WHERE username = $8 RETURNING *`,
      [display_name, email, phone, job_title, theme, notifications_enabled, isoNow(), username]
    );
    return normaliseRow(rows[0]);
  }

  async setInitialSiteName(name) {
    await this.pool.query(
      "UPDATE site_settings SET application_name = $1, updated_at = $2 WHERE id = 1 AND application_name = ''",
      [name, isoNow()]
    );
  }

  async getSiteSettings() {
    const { rows } = await this.pool.query('SELECT * FROM site_settings WHERE id = 1');
    return normaliseRow(rows[0]);
  }

  async updateSiteSettings({ application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, updated_by }) {
    const { rows } = await this.pool.query(
      `UPDATE site_settings
       SET application_name = $1, accent_color = $2, timezone = $3, date_format = $4,
         dashboard_refresh_seconds = $5, default_screen_resolution = $6, updated_by = $7, updated_at = $8
       WHERE id = 1 RETURNING *`,
      [application_name, accent_color, timezone, date_format, dashboard_refresh_seconds, default_screen_resolution, updated_by, isoNow()]
    );
    return normaliseRow(rows[0]);
  }

  async setSiteAsset(kind, filename, updatedBy) {
    const column = kind === 'logo' ? 'logo_filename' : 'favicon_filename';
    const { rows } = await this.pool.query(
      `UPDATE site_settings SET ${column} = $1, updated_by = $2, updated_at = $3 WHERE id = 1 RETURNING *`,
      [filename, updatedBy, isoNow()]
    );
    return normaliseRow(rows[0]);
  }

  async recordActivity({ actor_username, action, entity_type, entity_id = null, message, metadata = {} }) {
    const { rows } = await this.pool.query(`
      INSERT INTO activity_events (actor_username, action, entity_type, entity_id, message, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [actor_username, action, entity_type, entity_id === null ? null : String(entity_id), message, JSON.stringify(metadata), isoNow()]);
    return normaliseActivityEvent(rows[0]);
  }

  async listNotifications(limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 100));
    const [events, unread] = await Promise.all([
      this.pool.query('SELECT * FROM activity_events ORDER BY created_at DESC, id DESC LIMIT $1', [safeLimit]),
      this.pool.query('SELECT COUNT(*)::int AS count FROM activity_events WHERE read_at IS NULL')
    ]);
    return { items: events.rows.map(normaliseActivityEvent), unread_count: Number(unread.rows[0].count) };
  }

  async markNotificationsRead() {
    const { rowCount } = await this.pool.query('UPDATE activity_events SET read_at = $1 WHERE read_at IS NULL', [isoNow()]);
    return rowCount;
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
      SELECT s.*, l.name AS location_name, t.name AS template_name, d.name AS sftp_directory_name,
      CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
      FROM screens s JOIN locations l ON l.id = s.location_id
      LEFT JOIN templates t ON t.id = s.template_id
      LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
      ORDER BY l.name, s.name
    `);
    return rows.map(normaliseRow);
  }

  async getScreen(id) {
    const { rows } = await this.pool.query(`
      SELECT s.*, l.name AS location_name, t.name AS template_name, d.name AS sftp_directory_name,
      CASE WHEN d.name IS NULL THEN NULL ELSE '/' || d.name || '/' || s.delivery_filename END AS sftp_path
      FROM screens s JOIN locations l ON l.id = s.location_id
      LEFT JOIN templates t ON t.id = s.template_id
      LEFT JOIN sftp_directories d ON d.id = l.sftp_directory_id
      WHERE s.id = $1
    `, [id]);
    return normaliseRow(rows[0]);
  }

  async createScreen({ location_id, name, resolution = '1920×1080', status = 'draft', active = true, template_id = null }) {
    const now = isoNow();
    const { rows } = await this.pool.query(`
      INSERT INTO screens (location_id, name, resolution, status, active, template_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id
    `, [location_id, name, resolution, status, active, template_id, now]);
    await this.pool.query('UPDATE screens SET delivery_filename = $1 WHERE id = $2', [`monitor-${rows[0].id}.jpg`, rows[0].id]);
    await this.pool.query(
      'INSERT INTO screen_drafts (screen_id, rows_json, settings_json, updated_at) VALUES ($1, $2, $3, $4)',
      [rows[0].id, '[]', '{}', now]
    );
    return this.getScreen(rows[0].id);
  }

  async updateScreen(id, { location_id, name, resolution = '1920×1080', status = 'draft', active = true, template_id = null }) {
    const { rowCount } = await this.pool.query(`
      UPDATE screens SET location_id = $1, name = $2, resolution = $3, status = $4, active = $5, template_id = $6, updated_at = $7 WHERE id = $8
    `, [location_id, name, resolution, status, active, template_id, isoNow(), id]);
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

  async nextScreenName(locationId) {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS count FROM screens WHERE location_id = $1', [locationId]);
    return `ТВ ${Number(rows[0].count) + 1}`;
  }

  async getScreenDraft(screenId) {
    const { rows } = await this.pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
    return normaliseMenuRecord(rows[0]) || { screen_id: screenId, rows: [], settings: {} };
  }

  async saveScreenDraft(screenId, { rows, settings }) {
    const now = isoNow();
    await this.pool.query(
      `INSERT INTO screen_drafts (screen_id, rows_json, settings_json, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (screen_id) DO UPDATE SET rows_json = EXCLUDED.rows_json, settings_json = EXCLUDED.settings_json, updated_at = EXCLUDED.updated_at`,
      [screenId, JSON.stringify(rows), JSON.stringify(settings), now]
    );
    const { rows: saved } = await this.pool.query('SELECT * FROM screen_drafts WHERE screen_id = $1', [screenId]);
    return normaliseMenuRecord(saved[0]);
  }

  async screensUsingCatalog(kind, catalogId) {
    const column = kind === 'product' ? 'product_id' : 'packaging_id';
    const { rows } = await this.pool.query(`
      SELECT d.screen_id, d.rows_json, s.name AS screen_name, l.name AS location_name
      FROM screen_drafts d JOIN screens s ON s.id = d.screen_id JOIN locations l ON l.id = s.location_id
    `);
    return rows.filter((row) => jsonValue(row.rows_json, []).some((item) => Number(item?.[column]) === Number(catalogId)))
      .map((row) => ({ screen_id: Number(row.screen_id), screen_name: row.screen_name, location_name: row.location_name }));
  }

  async listProducts() {
    const { rows } = await this.pool.query('SELECT * FROM catalog_products ORDER BY name');
    return rows.map(normaliseRow);
  }

  async getProduct(id) {
    const { rows } = await this.pool.query('SELECT * FROM catalog_products WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }

  async createProduct(product) {
    const now = isoNow();
    const { rows } = await this.pool.query(
      `INSERT INTO catalog_products (name, producer, characteristics, strength, price_primary, price_secondary, alcoholic, beverage_color, filtration, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
      [product.name, product.producer, product.characteristics, product.strength, product.price_primary, product.price_secondary,
        product.alcoholic, product.beverage_color, product.filtration, product.active, now]
    );
    return this.getProduct(rows[0].id);
  }

  async updateProduct(id, product) {
    const { rowCount } = await this.pool.query(
      `UPDATE catalog_products
       SET name = $1, producer = $2, characteristics = $3, strength = $4, price_primary = $5, price_secondary = $6,
         alcoholic = $7, beverage_color = $8, filtration = $9, active = $10, updated_at = $11
       WHERE id = $12`,
      [product.name, product.producer, product.characteristics, product.strength, product.price_primary, product.price_secondary,
        product.alcoholic, product.beverage_color, product.filtration, product.active, isoNow(), id]
    );
    return rowCount ? this.getProduct(id) : null;
  }

  async deleteProduct(id) {
    const { rowCount } = await this.pool.query('DELETE FROM catalog_products WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async listPackaging() {
    const { rows } = await this.pool.query('SELECT * FROM catalog_packaging ORDER BY name');
    return rows.map(normaliseRow);
  }

  async getPackaging(id) {
    const { rows } = await this.pool.query('SELECT * FROM catalog_packaging WHERE id = $1', [id]);
    return normaliseRow(rows[0]);
  }

  async createPackaging(packaging) {
    const now = isoNow();
    const { rows } = await this.pool.query(
      'INSERT INTO catalog_packaging (name, unit_price, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) RETURNING id',
      [packaging.name, packaging.unit_price, packaging.active, now]
    );
    return this.getPackaging(rows[0].id);
  }

  async updatePackaging(id, packaging) {
    const { rowCount } = await this.pool.query(
      'UPDATE catalog_packaging SET name = $1, unit_price = $2, active = $3, updated_at = $4 WHERE id = $5',
      [packaging.name, packaging.unit_price, packaging.active, isoNow(), id]
    );
    return rowCount ? this.getPackaging(id) : null;
  }

  async deletePackaging(id) {
    const { rowCount } = await this.pool.query('DELETE FROM catalog_packaging WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async listTemplates() {
    const [templates, assignments] = await Promise.all([
      this.pool.query('SELECT * FROM templates ORDER BY name'),
      this.pool.query('SELECT template_id, COUNT(*)::int AS assigned_screens FROM screens WHERE template_id IS NOT NULL GROUP BY template_id')
    ]);
    const counts = new Map(assignments.rows.map((row) => [Number(row.template_id), Number(row.assigned_screens)]));
    return templates.rows.map((row) => normaliseMenuRecord({ ...row, assigned_screens: counts.get(Number(row.id)) || 0 }));
  }

  async getTemplate(id) {
    const { rows } = await this.pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    return normaliseMenuRecord(rows[0]);
  }

  async createTemplate({ name, description = '', active = true, rows: menuRows = [], settings = {} }) {
    const now = isoNow();
    const { rows } = await this.pool.query(
      'INSERT INTO templates (name, description, active, rows_json, settings_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id',
      [name, description, active, JSON.stringify(menuRows), JSON.stringify(settings), now]
    );
    return this.getTemplate(rows[0].id);
  }

  async updateTemplate(id, { name, description = '', active = true, rows: menuRows = [], settings = {} }) {
    const { rowCount } = await this.pool.query(
      'UPDATE templates SET name = $1, description = $2, active = $3, rows_json = $4, settings_json = $5, updated_at = $6 WHERE id = $7',
      [name, description, active, JSON.stringify(menuRows), JSON.stringify(settings), isoNow(), id]
    );
    return rowCount ? this.getTemplate(id) : null;
  }

  async deleteTemplate(id) {
    await this.pool.query('UPDATE screens SET template_id = NULL, updated_at = $1 WHERE template_id = $2', [isoNow(), id]);
    const { rowCount } = await this.pool.query('DELETE FROM templates WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async close() {
    await this.pool.end();
  }
}
