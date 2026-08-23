import express from 'express';
import { ValidationError } from '../../shared/errors.js';
import { activity } from '../helpers.js';

const ERROR_TYPES = new Set(['error', 'unhandledrejection', 'api-network', 'api-response', 'application']);

function text(value, maximum) {
  return String(value ?? '').trim().slice(0, maximum);
}

function optionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function frontendErrorInput(body = {}) {
  const errorType = text(body.error_type, 40);
  const message = text(body.message, 2000);
  if (!ERROR_TYPES.has(errorType)) throw new ValidationError('Неизвестный тип ошибки интерфейса.');
  if (!message) throw new ValidationError('Сообщение ошибки интерфейса не может быть пустым.');
  return {
    error_type: errorType,
    message,
    stack: text(body.stack, 12000),
    page: text(body.page, 1000),
    source: text(body.source, 1000),
    line_number: optionalInteger(body.line_number),
    column_number: optionalInteger(body.column_number)
  };
}

export function createDiagnosticsRouter({ store, config }) {
  const router = express.Router();

  router.get('/frontend-errors', async (request, response) => {
    response.json({
      items: await store.listFrontendErrors(request.query.limit),
      retention_days: config.frontendErrorRetentionDays,
      max_entries: config.frontendErrorMaxEntries
    });
  });

  router.post('/frontend-errors', async (request, response) => {
    const input = frontendErrorInput(request.body);
    await store.recordFrontendError({
      ...input,
      user_agent: text(request.get('user-agent'), 1000),
      username: request.session.sub
    }, {
      retentionDays: config.frontendErrorRetentionDays,
      maxEntries: config.frontendErrorMaxEntries
    });
    response.status(204).end();
  });

  router.delete('/frontend-errors', async (request, response) => {
    const removed = await store.clearFrontendErrors();
    await activity(store, request, {
      action: 'diagnostics.frontend_errors.cleared',
      entity_type: 'frontend_error_journal',
      entity_id: null,
      message: `Очищен журнал ошибок интерфейса (${removed}).`
    });
    response.json({ removed });
  });

  return router;
}
