import { createDatabasePool } from './pool.js';
import { initialiseSchema } from './migrations/schema.js';
import { migrateLegacyMenuSettings } from './migrations/menu-settings.js';
import { retireLegacyTemplates } from './migrations/template-retirement.js';
import { migrateScreenNumbering } from './migrations/screen-numbering.js';
import { migrateAnimationSettings } from './migrations/animation-settings.js';
import { migrateDevicePlayer } from './migrations/device-player.js';
import { seedDemoData } from './migrations/seed.js';
import { createOverviewRepository } from './overview.js';
import { createUsersRepository } from './users.js';
import { createSettingsRepository } from './settings.js';
import { createNotificationsRepository } from './notifications.js';
import { createLocationsRepository } from './locations.js';
import { createScreensRepository } from './screens.js';
import { createCatalogRepository } from './catalog.js';
import { createSftpRepository } from './sftp.js';
import { createDevicesRepository } from './devices.js';

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
    createSftpRepository(queryable, { getLocation: locations.getLocation }),
    createDevicesRepository(queryable)
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
    await migrateLegacyMenuSettings(this.pool);
    await retireLegacyTemplates(this.pool);
    await migrateScreenNumbering(this.pool);
    await migrateAnimationSettings(this.pool);
    await migrateDevicePlayer(this.pool);
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
