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

export class MenuTvStore {
  constructor(dbConfig, { seedDemoData: enableDemoSeed = false, pool = null } = {}) {
    this.pool = pool ?? createDatabasePool(dbConfig);
    this.seedDemoData = enableDemoSeed;

    const locations = createLocationsRepository(this.pool);
    Object.assign(
      this,
      createOverviewRepository(this.pool),
      createUsersRepository(this.pool),
      createSettingsRepository(this.pool),
      createNotificationsRepository(this.pool),
      locations,
      createScreensRepository(this.pool),
      createCatalogRepository(this.pool),
      createTemplatesRepository(this.pool),
      createSftpRepository(this.pool, { getLocation: locations.getLocation })
    );
  }

  async init() {
    await initialiseSchema(this.pool);
    if (this.seedDemoData) await seedDemoData(this.pool);
  }

  async close() {
    await this.pool.end();
  }
}
