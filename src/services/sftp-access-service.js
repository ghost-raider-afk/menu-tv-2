import { logger } from '../logger/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { generateSftpPassword } from '../sftp/index.js';

async function createManagedSftpUser({ store, sftp, username, password, directoryName }) {
  try {
    await sftp.createReadOnlyUser({ username, password, directoryName });
    return;
  } catch (error) {
    if (error?.status !== 409) throw error;
    const owner = await store.getLocationBySftpUsername(username);
    if (owner) throw new ConflictError('Этот логин SFTP уже используется другой торговой точкой.');
    logger.warn('Removing orphaned SFTP user before retrying binding', { username, directory_name: directoryName });
    await sftp.removeUser(username);
    await sftp.createReadOnlyUser({ username, password, directoryName });
  }
}

export function createSftpAccessService({ store, sftp, config }) {
  return Object.freeze({
    connection() {
      return { host: config.sftp.publicHost, port: config.sftp.port };
    },

    async directoriesWithStatus() {
      const directories = await store.listSftpDirectories();
      return Promise.all(directories.map(async (directory) => ({ ...directory, storage_status: await sftp.directoryStatus(directory.name) })));
    },

    async provisionDirectory(id) {
      const directory = await store.getSftpDirectory(id);
      if (!directory) throw new NotFoundError();
      await sftp.provisionDirectory(directory.name);
      const updated = await store.markSftpDirectoryProvisioned(id);
      return { ...updated, storage_status: await sftp.directoryStatus(updated.name) };
    },

    async bindLocation(locationId, input) {
      const location = await store.getLocation(locationId);
      if (!location) throw new NotFoundError();
      if (location.sftp_directory_id) throw new ConflictError('Для изменения SFTP-каталога сначала явно отключите текущую привязку.');
      const directory = await store.getSftpDirectory(input.directoryId);
      if (!directory) throw new NotFoundError();
      if (directory.bound_location_id) throw new ConflictError('Этот SFTP-каталог уже привязан к другой точке.');
      const password = generateSftpPassword(config.generatedPasswordLength);
      await createManagedSftpUser({ store, sftp, username: input.username, password, directoryName: directory.name });
      let bound;
      try {
        bound = await store.bindLocationSftp(locationId, input);
      } catch (error) {
        await sftp.removeUser(input.username).catch((cleanupError) => logger.warn('SFTP user rollback failed after binding error', {
          username: input.username,
          error: cleanupError
        }));
        throw error;
      }
      if (!bound) {
        await sftp.removeUser(input.username).catch((cleanupError) => logger.warn('SFTP user rollback failed after binding conflict', {
          username: input.username,
          error: cleanupError
        }));
        throw new ConflictError('Точка уже получила SFTP-привязку. Обновите страницу.');
      }
      return {
        location: bound,
        credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: input.username, password }
      };
    },

    async resetPassword(locationId) {
      const location = await store.getLocation(locationId);
      if (!location) throw new NotFoundError();
      if (!location.sftp_username) throw new ConflictError('У точки нет SFTP-доступа.');
      const password = generateSftpPassword(config.generatedPasswordLength);
      await sftp.resetPassword({ username: location.sftp_username, password });
      try {
        await store.touchLocationSftpPassword(location.id);
      } catch (error) {
        logger.warn('SFTP password changed but issuance timestamp could not be recorded', {
          location_id: location.id,
          username: location.sftp_username,
          error
        });
      }
      return {
        location,
        credentials: { host: config.sftp.publicHost, port: config.sftp.port, username: location.sftp_username, password }
      };
    },

    async unbindLocation(locationId) {
      const location = await store.getLocation(locationId);
      if (!location) throw new NotFoundError();
      if (!location.sftp_username) throw new ConflictError('У точки нет SFTP-доступа.');
      await sftp.removeUser(location.sftp_username);
      await store.unbindLocationSftp(location.id);
      return location;
    }
  });
}
