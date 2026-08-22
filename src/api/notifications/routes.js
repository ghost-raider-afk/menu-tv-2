import express from 'express';

function requireAdministrator(request, response) {
  if (request.session?.user?.role === 'administrator') return true;
  response.status(403).json({ error: 'Недостаточно прав для очистки журнала действий.' });
  return false;
}

export function createNotificationsRouter({ store }) {
  const router = express.Router();
  router.get('/', async (request, response) => response.json(await store.listNotifications(request.query.limit)));
  router.get('/activity', async (request, response) => response.json({ items: await store.listActivity(request.query.limit) }));
  router.delete('/activity', async (request, response) => {
    if (!requireAdministrator(request, response)) return;
    response.json({ cleared: await store.clearActivity() });
  });
  router.post('/read', async (_request, response) => response.json({ marked_read: await store.markNotificationsRead() }));
  return router;
}
