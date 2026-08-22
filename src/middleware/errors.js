import { logger } from '../logger/index.js';
import { httpStatusOf } from '../shared/errors.js';

function captureRuntimeDiagnostic(request, error, status, message) {
  request.runtimeDiagnostic = {
    severity: status >= 500 ? 'error' : 'warn',
    category: status >= 500 ? 'server.exception' : 'server.request',
    code: String(error?.code || `http.${status}`).slice(0, 120),
    message: String(message || error?.message || `HTTP ${status}`).slice(0, 1200),
    error_name: String(error?.name || '').slice(0, 120),
    error_code: String(error?.code || '').slice(0, 120),
    stack: typeof error?.stack === 'string' ? error.stack.slice(0, 8000) : '',
    details: error?.details && typeof error.details === 'object' ? error.details : {}
  };
}

export function errorHandler(error, request, response, _next) {
  if (error.code === '23505') {
    const message = 'Запись с таким названием уже существует.';
    captureRuntimeDiagnostic(request, error, 409, message);
    return response.status(409).json({ error: message });
  }
  if (error.code === '23503') {
    const message = 'Связанная запись не найдена.';
    captureRuntimeDiagnostic(request, error, 409, message);
    return response.status(409).json({ error: message });
  }

  const status = httpStatusOf(error);
  captureRuntimeDiagnostic(request, error, status, error.message);
  if (status >= 500) {
    logger.error('HTTP request failed', {
      request_id: request.diagnosticRequestId,
      method: request.method,
      path: request.originalUrl,
      actor: request.session?.sub,
      error
    });
  }
  return response.status(status).json({
    error: status >= 500 ? 'Внутренняя ошибка сервера.' : error.message,
    ...(status < 500 && error.details !== undefined ? { details: error.details } : {})
  });
}
