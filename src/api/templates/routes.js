import express from 'express';
import { positiveId, templateInput } from '../../contracts/input.js';
import { cleanupTemplateBackground, removeTemplateBackground, replaceTemplateBackground } from '../../services/template-assets-service.js';
import { activity, notFound } from '../helpers.js';

function withoutClientAssetMetadata(input) {
  const settings = { ...(input.settings || {}) };
  delete settings.background_image_url;
  return { ...input, settings };
}

export function createTemplatesRouter({ store, config }) {
  const router = express.Router();
  router.get('/', async (_request, response) => response.json(await store.listTemplates()));
  router.post('/', async (request, response) => {
    const template = await store.createTemplate(withoutClientAssetMetadata(templateInput(request.body)));
    await activity(store, request, { action: 'template.created', entity_type: 'template', entity_id: template.id, message: `Создан шаблон «${template.name}».` });
    response.status(201).json(template);
  });
  router.put('/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const existing = await store.getTemplate(id);
    if (!existing) throw notFound();
    const input = withoutClientAssetMetadata(templateInput(request.body));
    input.settings.background_image_url = existing.settings?.background_image_url || '';
    const record = await store.updateTemplate(id, input);
    if (!record) throw notFound();
    await activity(store, request, { action: 'template.updated', entity_type: 'template', entity_id: record.id, message: `Обновлён шаблон «${record.name}».` });
    response.json(record);
  });
  router.put(
    '/:id/background',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], limit: config.templateBackgroundMaxBytes }),
    async (request, response) => {
      const id = positiveId(request.params.id, 'id');
      const template = await store.getTemplate(id);
      if (!template) throw notFound();
      const record = await replaceTemplateBackground(template, request.body, { store, config });
      await activity(store, request, { action: 'template.background.updated', entity_type: 'template', entity_id: id, message: `Обновлён фон шаблона «${template.name}».` });
      response.json(record);
    }
  );
  router.delete('/:id/background', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const template = await store.getTemplate(id);
    if (!template) throw notFound();
    const record = await removeTemplateBackground(template, { store, config });
    await activity(store, request, { action: 'template.background.removed', entity_type: 'template', entity_id: id, message: `Удалён фон шаблона «${template.name}».` });
    response.json(record);
  });
  router.delete('/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const template = await store.getTemplate(id);
    if (!template || !await store.deleteTemplate(id)) throw notFound();
    await cleanupTemplateBackground(template, { store, config });
    await activity(store, request, { action: 'template.deleted', entity_type: 'template', entity_id: template.id, message: `Удалён шаблон «${template.name}».` });
    response.status(204).end();
  });
  return router;
}
