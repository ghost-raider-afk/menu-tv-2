import { logger } from '../logger/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { validateScreenJpeg } from './image-validation.js';

function publicationMatches(screen, info) {
  return Boolean(
    screen?.publication_pending_sha256 &&
    info?.sha256 &&
    info.sha256 === screen.publication_pending_sha256
  );
}

export function createPublishService({ store, sftp }) {
  async function finishPublished(screen) {
    const stagedKey = screen.prepared_asset_key;
    const updated = await store.markScreenPublished(screen.id, screen.publication_pending_sha256);
    if (!updated) throw new ConflictError('Состояние публикации изменилось. Обновите страницу и повторите действие.');
    if (stagedKey) {
      await sftp.removeStaged(stagedKey).catch((error) => logger.warn('Published staging file could not be removed', {
        screen_id: screen.id,
        staged_key: stagedKey,
        error
      }));
    }
    return updated;
  }

  return Object.freeze({
    async stageJpeg(screenId, bytes) {
      const screen = await store.getScreen(screenId);
      if (!screen) throw new NotFoundError();
      if (screen.publication_pending_sha256) {
        throw new ConflictError('Сейчас выполняется публикация этого монитора. Дождитесь её завершения перед подготовкой нового JPEG.');
      }
      const draft = await store.getScreenDraft(screenId);
      if (!draft?.revision) throw new ConflictError('Черновик монитора не найден. Сохраните меню и повторите подготовку JPEG.');
      validateScreenJpeg(bytes, screen.resolution);
      const previousKey = screen.prepared_asset_key;
      const asset = await sftp.stageJpeg(screen.id, bytes);
      let updated;
      try {
        updated = await store.savePreparedAsset(screen.id, asset, draft.revision);
        if (!updated) throw new ConflictError('Меню изменилось во время подготовки JPEG. Сохраните актуальную версию и повторите операцию.');
      } catch (error) {
        await sftp.removeStaged(asset.key).catch(() => undefined);
        throw error;
      }
      if (previousKey && previousKey !== asset.key) {
        await sftp.removeStaged(previousKey).catch((error) => logger.warn('Superseded staging file could not be removed', {
          screen_id: screen.id,
          staged_key: previousKey,
          error
        }));
      }
      return updated;
    },

    async publish(screenId) {
      let screen = await store.getScreen(screenId);
      if (!screen) throw new NotFoundError();
      if (!screen.sftp_directory_name) throw new ConflictError('Сначала вручную привяжите SFTP-каталог к точке.');

      if (screen.publication_pending_sha256) {
        const info = await sftp.publishedInfo(screen.sftp_directory_name, screen.delivery_filename);
        if (publicationMatches(screen, info)) return finishPublished(screen);
      }

      if (!screen.prepared_asset_key || !screen.prepared_asset_sha256 || !screen.prepared_draft_revision) {
        throw new ConflictError('Сначала сохраните текущее меню и подготовьте JPEG.');
      }

      const expectedSha256 = screen.prepared_asset_sha256;
      screen = await store.markPublicationStarted(screen.id, expectedSha256);
      if (!screen) throw new ConflictError('Меню или подготовленный JPEG изменились. Обновите страницу и повторите публикацию.');

      try {
        const info = await sftp.publish({
          directoryName: screen.sftp_directory_name,
          deliveryFilename: screen.delivery_filename,
          stagedKey: screen.prepared_asset_key,
          expectedSha256
        });
        if (info.sha256 !== expectedSha256) throw new ConflictError('Контрольная сумма опубликованного JPEG не совпала.');
      } catch (error) {
        await store.clearPublicationPending(screen.id, expectedSha256).catch((dbError) => logger.warn('Publication pending state could not be cleared', {
          screen_id: screen.id,
          expected_sha256: expectedSha256,
          error: dbError
        }));
        throw error;
      }

      screen = await store.getScreen(screen.id);
      if (!screen?.publication_pending_sha256) {
        throw new ConflictError('Состояние публикации изменилось до подтверждения.');
      }
      return finishPublished(screen);
    },

    async reconcilePending() {
      const pending = await store.listPendingPublications();
      const result = { recovered: 0, unresolved: 0 };
      for (const screen of pending) {
        if (!screen.sftp_directory_name || !screen.delivery_filename) {
          result.unresolved += 1;
          continue;
        }
        try {
          const info = await sftp.publishedInfo(screen.sftp_directory_name, screen.delivery_filename);
          if (!publicationMatches(screen, info)) {
            result.unresolved += 1;
            continue;
          }
          await finishPublished(screen);
          result.recovered += 1;
        } catch (error) {
          result.unresolved += 1;
          logger.warn('Pending publication could not be reconciled', { screen_id: screen.id, error });
        }
      }
      return result;
    },

    async cleanupStaging(options) {
      const keys = await store.listPreparedAssetKeys();
      return sftp.cleanupStaging(keys, options);
    }
  });
}
