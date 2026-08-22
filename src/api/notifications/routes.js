import express from 'express';

export function createNotificationsRouter({ store }) {
  const router = express.Router();
  router.get('/', async (request, response) => response.json(await store.listNotifications(request.query.limit)));
  router.get('/activity', async (request, response) => response.json({ items: await store.listActivity(request.query.limit) }));
  router.delete('/activity', async (_request, response) => response.json({ cleared: await store.clearActivity() }));
  router.post('/read', async (_request, response) => response.json({ marked_read: await store.markNotificationsRead() }));
  return router;
}
