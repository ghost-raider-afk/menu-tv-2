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
    ...(row.screen_count === undefined ? {} : { screen_count: Number(row.screen_count) })
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
      CREATE TABLE IF NOT EXISTS locations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
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
    const { rows } = await this.pool.query('SELECT * FROM locations ORDER BY name');
    return Promise.all(rows.map((row) => this.#withScreenCount(row)));
  }

  async getLocation(id) {
    const { rows } = await this.pool.query('SELECT * FROM locations WHERE id = $1', [id]);
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
      SELECT s.*, l.name AS location_name
      FROM screens s JOIN locations l ON l.id = s.location_id
      ORDER BY l.name, s.name
    `);
    return rows.map(normaliseRow);
  }

  async getScreen(id) {
    const { rows } = await this.pool.query(`
      SELECT s.*, l.name AS location_name
      FROM screens s JOIN locations l ON l.id = s.location_id WHERE s.id = $1
    `, [id]);
    return normaliseRow(rows[0]);
  }

  async createScreen({ location_id, name, resolution = '1920×1080', status = 'draft', active = true }) {
    const now = isoNow();
    const { rows } = await this.pool.query(`
      INSERT INTO screens (location_id, name, resolution, status, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id
    `, [location_id, name, resolution, status, active, now]);
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
