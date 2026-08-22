import express from 'express';
import { clientDiagnosticInput } from '../../contracts/diagnostics.js';
import { activity } from '../helpers.js';

function requireAdministrator(request, response) {
  if (request.session?.user?.role === 'administrator') return true;
  response.status(403).json({ error: 'Недостаточно прав для очистки журнала ошибок.' });
  return false;
}

export function createDiagnosticsRouter({ store }) {
  const router = express.Router();

  router.get('/events', async (request, response) => {
    response.json({ items: await store.listDiagnosticEvents(request.query) });
  });

  router.post('/client-events', async (request, response) => {
    const input = clientDiagnosticInput(request.body);
    const saved = await store.recordDiagnosticEvent({
      ...input,
      actor_username: request.session.sub,
      user_agent: String(request.get('user-agent') || '').slice(0, 500)
    });
    response.status(201).json({ id: saved.id, created_at: saved.created_at });
  });

  router.delete('/events', async (request, response) => {
    if (!requireAdministrator(request, response)) return;
    const cleared = await store.clearDiagnosticEvents();
    await activity(store, request, {
      action: 'diagnostics.cleared',
      entity_type: 'diagnostic_events',
      entity_id: null,
      message: `Очищен журнал ошибок. Удалено записей: ${cleared}.`
    });
    response.json({ cleared });
  });

  return router;
}
