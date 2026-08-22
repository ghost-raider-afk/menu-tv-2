import crypto from 'node:crypto';
import { logger } from '../logger/index.js';
import { sanitizeDiagnosticDetails } from '../contracts/diagnostics.js';

function safeRequestId(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(text) ? text : crypto.randomUUID();
}

function requestRoute(request) {
  return String(request.originalUrl || request.url || '').split('?', 1)[0].slice(0, 500);
}

function durationMs(startedAt) {
  return Math.max(0, Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000));
}

export function createRequestDiagnosticsMiddleware({ store }) {
  return function requestDiagnostics(request, response, next) {
    const requestId = safeRequestId(request.get('x-request-id'));
    const startedAt = process.hrtime.bigint();
    request.diagnosticRequestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    response.once('finish', () => {
      const status = Number(response.statusCode) || 0;
      if (status < 400 && !request.runtimeDiagnostic) return;
      const runtime = request.runtimeDiagnostic || {};
      const severity = runtime.severity || (status >= 500 ? 'error' : 'warn');
      const route = requestRoute(request);
      const message = String(runtime.message || `HTTP ${status}: ${request.method} ${route}`).slice(0, 1200);
      const details = sanitizeDiagnosticDetails({
        ...(runtime.details || {}),
        error_name: runtime.error_name,
        error_code: runtime.error_code,
        stack: runtime.stack,
        referrer: String(request.get('referer') || '').slice(0, 500)
      });
      void store.recordDiagnosticEvent({
        severity,
        source: 'server',
        category: runtime.category || 'http',
        code: runtime.code || `http.${status}`,
        message,
        page: '',
        route,
        method: request.method,
        status,
        duration_ms: durationMs(startedAt),
        request_id: requestId,
        actor_username: request.session?.sub || '',
        user_agent: String(request.get('user-agent') || '').slice(0, 500),
        details
      }).catch((error) => {
        logger.warn('Diagnostic event could not be recorded', { request_id: requestId, error });
      });
    });

    next();
  };
}
