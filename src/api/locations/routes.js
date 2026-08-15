import express from 'express';
import { locationInput, positiveId } from '../../contracts/input.js';
import { activity, conflict, notFound } from '../helpers.js';

export function createLocationsRouter({ store }) {
  const router = express.Router();
  router.get('/', async (_request, response) => response.json(await store.listLocations()));
  router.post('/', async (request, response) => {
    const location = await store.createLocation(locationInput(request.body));
    await activity(store, request, { action: 'location.created', entity_type: 'location', entity_id: location.id, message: `Создана торговая точка «${location.name}».` });
    response.status(201).json(location);
  });
  router.put('/:id', async (request, response) => {
    const record = await store.updateLocation(positiveId(request.params.id, 'id'), locationInput(request.body));
    if (!record) throw notFound();
    await activity(store, request, { action: 'location.updated', entity_type: 'location', entity_id: record.id, message: `Обновлена торговая точка «${record.name}».` });
    response.json(record);
  });
  router.delete('/:id', async (request, response) => {
    const location = await store.getLocation(positiveId(request.params.id, 'id'));
    if (!location) throw notFound();
    if (location.sftp_directory_id) throw conflict('Сначала явно отключите SFTP-доступ точки. Каталог и файлы останутся без изменений.');
    if (!await store.deleteLocation(location.id)) throw notFound();
    await activity(store, request, { action: 'location.deleted', entity_type: 'location', entity_id: location.id, message: `Удалена торговая точка «${location.name}».` });
    response.status(204).end();
  });
  return router;
}
