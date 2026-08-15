import { ConflictError, NotFoundError } from '../shared/errors.js';
import { generateSftpPassword } from '../sftp.js';

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
      await sftp.createReadOnlyUser({ username: input.username, password, directoryName: directory.name });
      let bound;
      try {
        bound = await store.bindLocationSftp(locationId, input);
      } catch (error) {
        await sftp.removeUser(input.username).catch(() => undefined);
        throw error;
      }
      if (!bound) {
        await sftp.removeUser(input.username).catch(() => undefined);
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
      await store.touchLocationSftpPassword(location.id);
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
