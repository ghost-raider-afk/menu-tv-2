import express from 'express';
import { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';
import { menuSettingsInput } from '../../contracts/menu-settings.js';
import { logger } from '../../logger/index.js';
import { createScreenBackground, deleteScreenBackground } from '../../services/screen-background-service.js';
import { activity, conflict, notFound } from '../helpers.js';

async function removeStagedBestEffort(sftp, key, context = {}) {
  if (!key || typeof sftp?.removeStaged !== 'function') return;
  await sftp.removeStaged(key).catch((error) => logger.warn('Stale screen staging file could not be removed', {
    staged_key: key,
    ...context,
    error
  }));
}

function settingsOptions(config) {
  return { allowBackgroundImage: true, maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight };
}

async function cloneScreen(tx, sourceId, targetLocationId, config) {
  const source = await tx.getScreen(sourceId);
  if (!source) throw notFound();
  const draft = await tx.getScreenDraft(source.id);
  const created = await tx.createScreen({
    location_id: targetLocationId,
    resolution: source.resolution,
    status: 'draft',
    active: source.active !== false,
    animation_profile_id: source.animation_profile_id || null
  });
  const saved = await tx.saveScreenDraft(created.id, {
    rows: structuredClone(draft.rows || []),
    settings: menuSettingsInput(draft.settings || {}, settingsOptions(config))
  }, 1);
  if (!saved) throw conflict('Не удалось создать независимую копию монитора.');
  return tx.getScreen(created.id);
}

function draftRevisionHeader(request) {
  return positiveId(request.get('x-draft-revision'), 'x-draft-revision');
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
    const [draft, products, packaging, animationProfile] = await Promise.all([
      store.getScreenDraft(id),
      store.listProducts(),
      store.listPackaging(),
      screen.animation_profile_id ? store.getAnimationProfile(screen.animation_profile_id) : Promise.resolve(null)
    ]);
    response.json({ screen, draft, products, packaging, animation_profile: animationProfile });
  });

  router.put('/screens/:id/animation-profile', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const profileId = request.body?.profile_id == null || request.body?.profile_id === ''
      ? null
      : positiveId(request.body.profile_id, 'profile_id');
    const screen = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (profileId && !await tx.getAnimationProfile(profileId)) throw notFound();
      if (!await tx.assignScreenAnimationProfile(id, profileId)) throw notFound();
      return tx.getScreen(id);
    });
    await activity(store, request, {
      action: 'screen.animation_profile.updated',
      entity_type: 'screen',
      entity_id: id,
      message: profileId
        ? `Монитору «${screen.name}» назначен профиль анимации.`
        : `Для монитора «${screen.name}» отключено назначение профиля анимации.`
    });
    response.json(screen);
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
      draft.settings = menuSettingsInput(draft.settings, settingsOptions(config));
      let screenData = {
        location_id: current.location_id,
        name: current.name,
        resolution: current.resolution,
        status: current.status,
        active: current.active
      };

      if (request.body?.screen && typeof request.body.screen === 'object' && !Array.isArray(request.body.screen)) {
        const siteSettings = await tx.getSiteSettings();
        screenData = screenInput(request.body.screen, {
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

  router.put(
    '/screens/:id/background',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: config.screenBackgroundMaxBytes }),
    async (request, response) => {
      const id = positiveId(request.params.id, 'id');
      const expectedRevision = draftRevisionHeader(request);
      const asset = await createScreenBackground(request.body, config);
      let previousUrl = '';
      try {
        const result = await store.transaction(async (tx) => {
          if (!await tx.lockScreen(id)) throw notFound();
          const screen = await tx.getScreen(id);
          if (!screen) throw notFound();
          if (screen.publication_pending_sha256) throw conflict('Дождитесь завершения публикации перед сменой фона.');
          const draft = await tx.getScreenDraft(id);
          previousUrl = draft.settings?.background_image_url || '';
          const settings = menuSettingsInput({ ...draft.settings, background_image_url: asset.publicUrl }, settingsOptions(config));
          const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings }, expectedRevision);
          if (!saved) throw conflict('Черновик уже изменён в другом окне. Обновите редактор.');
          return { screen: await tx.getScreen(id), draft: saved };
        });
        if (previousUrl && previousUrl !== asset.publicUrl) await deleteScreenBackground(previousUrl, { store, config });
        await activity(store, request, { action: 'screen.background.updated', entity_type: 'screen', entity_id: id, message: `Обновлён фон монитора «${result.screen.name}».` });
        response.json(result);
      } catch (error) {
        await deleteScreenBackground(asset.publicUrl, { store, config, force: true });
        throw error;
      }
    }
  );

  router.delete('/screens/:id/background', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const expectedRevision = draftRevisionHeader(request);
    let previousUrl = '';
    const result = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const screen = await tx.getScreen(id);
      if (!screen) throw notFound();
      if (screen.publication_pending_sha256) throw conflict('Дождитесь завершения публикации перед удалением фона.');
      const draft = await tx.getScreenDraft(id);
      previousUrl = draft.settings?.background_image_url || '';
      const settings = menuSettingsInput({ ...draft.settings, background_image_url: '' }, settingsOptions(config));
      const saved = await tx.saveScreenDraft(id, { rows: draft.rows || [], settings }, expectedRevision);
      if (!saved) throw conflict('Черновик уже изменён в другом окне. Обновите редактор.');
      return { screen: await tx.getScreen(id), draft: saved };
    });
    if (previousUrl) await deleteScreenBackground(previousUrl, { store, config });
    await activity(store, request, { action: 'screen.background.removed', entity_type: 'screen', entity_id: id, message: `Удалён фон монитора «${result.screen.name}».` });
    response.json(result);
  });

  router.post('/locations/:id/screens', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const sourceId = request.body?.source_screen_id ? positiveId(request.body.source_screen_id, 'source_screen_id') : null;
    const screen = await store.transaction(async (tx) => {
      const location = await tx.getLocation(locationId);
      if (!location) throw notFound();
      if (sourceId) return cloneScreen(tx, sourceId, locationId, config);
      const siteSettings = await tx.getSiteSettings();
      return tx.createScreen({
        location_id: locationId,
        resolution: siteSettings.default_screen_resolution,
        status: 'draft',
        active: true
      });
    });
    if (!screen) throw notFound();
    await activity(store, request, {
      action: sourceId ? 'screen.cloned' : 'screen.created',
      entity_type: 'screen',
      entity_id: screen.id,
      message: sourceId ? `Создан монитор «${screen.name}» по образцу другого монитора.` : `Добавлен монитор «${screen.name}» в точку «${screen.location_name}».`
    });
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
      return tx.createScreen(input);
    });
    if (!screen) throw notFound();
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
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (current.publication_pending_sha256) throw conflict('Сейчас выполняется публикация этого монитора. Повторите изменение после её завершения.');
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
    let backgroundUrl = '';
    const screen = await store.transaction(async (tx) => {
      if (!await tx.lockScreen(id)) throw notFound();
      const current = await tx.getScreen(id);
      if (!current) throw notFound();
      if (current.publication_pending_sha256) throw conflict('Сейчас выполняется публикация этого монитора. Дождитесь её завершения перед удалением.');
      const draft = await tx.getScreenDraft(id);
      backgroundUrl = draft.settings?.background_image_url || '';
      if (!await tx.deleteScreen(id)) throw notFound();
      return current;
    });
    await removeStagedBestEffort(sftp, screen.prepared_asset_key, { screen_id: screen.id });
    if (backgroundUrl) await deleteScreenBackground(backgroundUrl, { store, config });
    await activity(store, request, { action: 'screen.deleted', entity_type: 'screen', entity_id: screen.id, message: `Удалён монитор «${screen.name}».` });
    response.status(204).end();
  });

  return router;
}
