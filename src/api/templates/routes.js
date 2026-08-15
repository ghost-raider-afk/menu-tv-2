import express from 'express';
import { positiveId, templateInput } from '../../contracts/input.js';
import { activity, notFound } from '../helpers.js';

export function createTemplatesRouter({ store }) {
  const router = express.Router();
  router.get('/', async (_request, response) => response.json(await store.listTemplates()));
  router.post('/', async (request, response) => {
    const template = await store.createTemplate(templateInput(request.body));
    await activity(store, request, { action: 'template.created', entity_type: 'template', entity_id: template.id, message: `Создан шаблон «${template.name}».` });
    response.status(201).json(template);
  });
  router.put('/:id', async (request, response) => {
    const record = await store.updateTemplate(positiveId(request.params.id, 'id'), templateInput(request.body));
    if (!record) throw notFound();
    await activity(store, request, { action: 'template.updated', entity_type: 'template', entity_id: record.id, message: `Обновлён шаблон «${record.name}».` });
    response.json(record);
  });
  router.delete('/:id', async (request, response) => {
    const id = positiveId(request.params.id, 'id');
    const template = await store.getTemplate(id);
    if (!template || !await store.deleteTemplate(id)) throw notFound();
    await activity(store, request, { action: 'template.deleted', entity_type: 'template', entity_id: template.id, message: `Удалён шаблон «${template.name}».` });
    response.status(204).end();
  });
  return router;
}
