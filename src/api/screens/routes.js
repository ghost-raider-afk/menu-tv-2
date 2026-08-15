import express from 'express';
import { menuDraftInput, positiveId, screenInput } from '../../contracts/input.js';
import { activity, conflict, notFound } from '../helpers.js';

export function createScreensRouter({ store, config }) {
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
    const screen = await store.getScreen(id);
    if (!screen) throw notFound();
    const draft = await menuDraftInput(request.body, store, config.menuDraftMaxBytes);
    const templateId = request.body.template_id === undefined
      ? screen.template_id
      : request.body.template_id === null || request.body.template_id === ''
        ? null
        : positiveId(request.body.template_id, 'template_id');
    if (templateId && !await store.getTemplate(templateId)) throw notFound();
    const updatedScreen = await store.updateScreen(id, {
      location_id: screen.location_id,
      name: screen.name,
      resolution: screen.resolution,
      status: screen.status,
      active: screen.active,
      template_id: templateId
    });
    const saved = await store.saveScreenDraft(id, draft);
    await activity(store, request, { action: 'screen.draft.saved', entity_type: 'screen', entity_id: id, message: `Сохранён черновик меню монитора «${screen.name}».` });
    response.json({ screen: updatedScreen, draft: saved });
  });

  router.post('/locations/:id/screens', async (request, response) => {
    const locationId = positiveId(request.params.id, 'id');
    const location = await store.getLocation(locationId);
    if (!location) throw notFound();
    const siteSettings = await store.getSiteSettings();
    const screen = await store.createScreen({
      location_id: locationId,
      name: await store.nextScreenName(locationId),
      resolution: siteSettings.default_screen_resolution,
      status: 'draft',
      active: true,
      template_id: null
    });
    await activity(store, request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Добавлен монитор «${screen.name}» в точке «${location.name}».` });
    response.status(201).json(screen);
  });

  router.post('/screens', async (request, response) => {
    const siteSettings = await store.getSiteSettings();
    const input = screenInput(request.body, {
      defaultScreenResolution: siteSettings.default_screen_resolution,
      maxWidth: config.screenMaxWidth,
      maxHeight: config.screenMaxHeight
    });
    if (!await store.getLocation(input.location_id)) throw notFound();
    if (input.template_id && !await store.getTemplate(input.template_id)) throw notFound();
    const screen = await store.createScreen(input);
    await activity(store, request, { action: 'screen.created', entity_type: 'screen', entity_id: screen.id, message: `Добавлен монитор «${screen.name}».` });
    response.status(201).json(screen);
  });

  router.put('/screens/:id', async (request, response) => {
    const siteSettings = await store.getSiteSettings();
    const input = screenInput(request.body, {
      defaultScreenResolution: siteSettings.default_screen_resolution,
      maxWidth: config.screenMaxWidth,
      maxHeight: config.screenMaxHeight
    });
    if (!await store.getLocation(input.location_id)) throw notFound();
    if (input.template_id && !await store.getTemplate(input.template_id)) throw notFound();
    const id = positiveId(request.params.id, 'id');
    const current = await store.getScreen(id);
    if (!current) throw notFound();
    if (current.published_at && current.location_id !== input.location_id) {
      throw conflict('Опубликованный телевизор нельзя перенести в другую точку: его SFTP-путь должен остаться стабильным.');
    }
    const record = await store.updateScreen(id, input);
    if (!record) throw notFound();
    await activity(store, request, { action: 'screen.updated', entity_type: 'screen', entity_id: record.id, message: `Обновлён монитор «${record.name}».` });
    response.json(record);
  });

  router.delete('/screens/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const screen = await store.getScreen(id);
    if (!screen || !await store.deleteScreen(id)) throw notFound();
    await activity(store, request, { action: 'screen.deleted', entity_type: 'screen', entity_id: screen.id, message: `Удалён монитор «${screen.name}».` });
    response.status(204).end();
  });

  return router;
}
