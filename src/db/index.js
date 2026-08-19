import { createDatabasePool } from './pool.js';
import { initialiseSchema } from './migrations/schema.js';
import { seedDemoData } from './migrations/seed.js';
import { createOverviewRepository } from './overview.js';
import { createUsersRepository } from './users.js';
import { createSettingsRepository } from './settings.js';
import { createNotificationsRepository } from './notifications.js';
import { createLocationsRepository } from './locations.js';
import { createScreensRepository } from './screens.js';
import { createCatalogRepository } from './catalog.js';
import { createTemplatesRepository } from './templates.js';
import { createSftpRepository } from './sftp.js';

function createRepositories(queryable) {
  const locations = createLocationsRepository(queryable);
  return Object.assign(
    {},
    createOverviewRepository(queryable),
    createUsersRepository(queryable),
    createSettingsRepository(queryable),
    createNotificationsRepository(queryable),
    locations,
    createScreensRepository(queryable),
    createCatalogRepository(queryable),
    createTemplatesRepository(queryable),
    createSftpRepository(queryable, { getLocation: locations.getLocation })
  );
}

export class MenuTvStore {
  constructor(dbConfig, { seedDemoData: enableDemoSeed = false, pool = null } = {}) {
    this.pool = pool ?? createDatabasePool(dbConfig);
    this.seedDemoData = enableDemoSeed;
    Object.assign(this, createRepositories(this.pool));
  }

  async init() {
    await initialiseSchema(this.pool);
    if (this.seedDemoData) await seedDemoData(this.pool);
  }

  async transaction(run) {
    if (typeof run !== 'function') throw new TypeError('Транзакция требует функцию выполнения.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(createRepositories(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
