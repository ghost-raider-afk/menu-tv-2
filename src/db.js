import { createDatabasePool } from './db/pool.js';
import { initialiseSchema } from './db/migrations/schema.js';
import { seedDemoData } from './db/migrations/seed.js';
import { createOverviewRepository } from './db/overview.js';
import { createUsersRepository } from './db/users.js';
import { createSettingsRepository } from './db/settings.js';
import { createNotificationsRepository } from './db/notifications.js';
import { createLocationsRepository } from './db/locations.js';
import { createScreensRepository } from './db/screens.js';
import { createCatalogRepository } from './db/catalog.js';
import { createTemplatesRepository } from './db/templates.js';
import { createSftpRepository } from './db/sftp.js';

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
