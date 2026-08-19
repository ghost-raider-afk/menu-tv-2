import express from 'express';
import { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';
import { logger } from '../../logger/index.js';
import { activity, conflict, notFound } from '../helpers.js';

function requestedTemplateId(body, screen) {
  const value = body?.screen?.template_id ?? body?.template_id;
  if (value === undefined) return screen.template_id;
  return value === null || value === '' ? null : positiveId(value, 'template_id');
}

async function removeStagedBestEffort(sftp, key, context = {}) {
  if (!key || typeof sftp?.removeStaged !== 'function') return;
  await sftp.removeStaged(key).catch((error) => logger.warn('Stale screen staging file could not be removed', {
    staged_key: key,
    ...context,
    error
  }));
}

export function createScreensRouter({ store, sftp, config }) {
  const router = express.Router();

  router.get('/screens', async (_request, response) => response.json(await store.listScreens()));
  router.get('/screens/:id', async (request, response) => {
    const screen = await store.getScreen(positiveId(request.params.id, 'id'));
    if (!screen) throw notFound();
    response.json(screen);
  });
  router.get('/screens/:id/editor', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(id);
    if (!screen) throw notFound();
    const [draft, products, packaging, templates] = await Promise.all([
      store.getScreenDraft(id), store.listProducts(), store.listPackaging(), store.listTemplates()
    ]);
    response.json({ screen, draft, products, packaging, templates });
  });

  router.put('/screens/:id/draft', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = positiveId(request.body?.revision, 'revision');
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (current.publication_pending_sha256) {
        throw conflict('Сейчас выполняется публикация этого монитора. Дождитесь её завершения и повторите сохранение.');
      }

      const draft = await menuDraftInput(request.body, tx, config.menuDraftMaxBytes);
      const templateId = requestedTemplateId(request.body, current);
      if (templateId && !await tx.getTemplate(templateId)) throw notFound();

      let screenData = {
        location_id: current.location_id,
        name: current.name,
        resolution: current.resolution,
        status: current.status,
        active: current.active,
        template_id: templateId
      };

      if (request.body?.screen && typeof request.body.screen === 'object' && !Array.isArray(request.body.screen)) {
        const siteSettings = await tx.getSiteSettings();
        screenData = screenInput({ ...request.body.screen, template_id: templateId }, {
          defaultScreenResolution: siteSettings.default_screen_resolution,
          maxWidth: config.screenMaxWidth,
          maxHeight: config.screenMaxHeight
        });
        if (!await tx.getLocation(screenData.location_id)) throw notFound();
        if (current.published_at && current.location_id !== screenData.location_id) {
          throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');
        }
      }

      const updatedScreen = await tx.updateScreen(id, screenData);
      if (!updatedScreen) throw notFound();
      const saved = await tx.saveScreenDraft(id, draft, expectedRevision);
      if (!saved) {
        throw conflict('Меню уже было изменено в другом окне. Обновите редактор и повторите изменения.', { expected_revision: expectedRevision });
      }
      return {
        screen: await tx.getScreen(id),
        draft: saved,
        invalidatedAssetKey: current.prepared_asset_key || null
      };
    });

    await removeStagedBestEffort(sftp, result.invalidatedAssetKey, { screen_id: id });
    await activity(store, request, { action: 'screen.draft.saved', entity_type: 'screen', entity_id: id, message: `Сохранён черновик меню монитора «${result.screen.name}».` });
    response.json({ screen: result.screen, draft: result.draft });
  });

  router.post('/locations/:id/screens', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const screen = await store.transaction(async (tx) => {
      const location = await tx.getLocation(locationId);
      if (!location) throw notFound();
      const siteSettings = await tx.getSiteSettings();
      return tx.createScreen({
        location_id: locationId,
        name: await tx.nextScreenName(locationId),
        resolution: siteSettings.default_screen_resolution,
        status: 'draft',
        active: true,
        template_id: null
      });
    });
    await activity(store, request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Добавлен монитор «${screen.name}» в точку «${screen.location_name}».` });
    response.status(201).json(screen);
  });

  router.post('/screens', async (request, response) => {
    const screen = await store.transaction(async (tx) => {
      const siteSettings = await tx.getSiteSettings();
      const input = screenInput(request.body, {
        defaultScreenResolution: siteSettings.default_screen_resolution,
        maxWidth: config.screenMaxWidth,
        maxHeight: config.screenMaxHeight
      });
      if (!await tx.getLocation(input.location_id)) throw notFound();
      if (input.template_id && !await tx.getTemplate(input.template_id)) throw notFound();
      return tx.createScreen(input);
    });
    await activity(store, request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Добавлен монитор «${screen.name}».` });
    response.status(201).json(screen);
  });

  router.put('/screens/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const siteSettings = await tx.getSiteSettings();
      const input = screenInput(request.body, {
        defaultScreenResolution: siteSettings.default_screen_resolution,
        maxWidth: config.screenMaxWidth,
        maxHeight: config.screenMaxHeight
      });
      if (!await tx.getLocation(input.location_id)) throw notFound();
      if (input.template_id && !await tx.getTemplate(input.template_id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (current.publication_pending_sha256) {
        throw conflict('Сейчас выполняется публикация этого монитора. Повторите изменение после её завершения.');
      }
      if (current.published_at && current.location_id !== input.location_id) {
        throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');
      }

      const presentationChanged = current.name !== input.name || current.resolution !== input.resolution;
      const invalidatedAssetKey = presentationChanged ? current.prepared_asset_key || null : null;
      if (presentationChanged && current.prepared_asset_key) {
        await tx.invalidatePreparedAsset(id);
        input.status = 'draft';
      }

      const updated = await tx.updateScreen(id, input);
      if (!updated) throw notFound();
      return { record: updated, invalidatedAssetKey };
    });
    await removeStagedBestEffort(sftp, result.invalidatedAssetKey, { screen_id: id });
    await activity(store, request, { action: 'screen.updated', entity_type: 'screen', entity_id: result.record.id, message: `Обновлён монитор «${result.record.name}».` });
    response.json(result.record);
  });

  router.delete('/screens/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (current.publication_pending_sha256) {
        throw conflict('Сейчас выполняется публикация этого монитора. Дождитесь её завершения перед удалением.');
      }
      if (!await tx.deleteScreen(id)) throw notFound();
      return current;
    });
    await removeStagedBestEffort(sftp, screen.prepared_asset_key, { screen_id: screen.id });
    await activity(store, request, { action: 'screen.deleted', entity_type: 'screen', entity_id: screen.id, message: `Удалён монитор «${screen.name}».` });
    response.status(204).end();
  });

  return router;
}
