import { ConflictError, NotFoundError } from '../shared/errors.js';

export function createPublishService({ store, sftp }) {
  return Object.freeze({
    async stageJpeg(screenId, bytes) {
      const screen = await store.getScreen(screenId);
      if (!screen) throw new NotFoundError();
      const asset = await sftp.stageJpeg(screen.id, bytes);
      return store.savePreparedAsset(screen.id, asset);
    },

    async publish(screenId) {
      const screen = await store.getScreen(screenId);
      if (!screen) throw new NotFoundError();
      if (!screen.sftp_directory_name) throw new ConflictError('Сначала вручную привяжите SFTP-каталог к точке.');
      if (!screen.prepared_asset_key) throw new ConflictError('Сначала загрузите подготовленный JPEG.');
      await sftp.publish({
        directoryName: screen.sftp_directory_name,
        deliveryFilename: screen.delivery_filename,
        stagedKey: screen.prepared_asset_key
      });
      return store.markScreenPublished(screen.id);
    }
  });
}
