import {
  isSessionAuthorityUrl,
  SESSION_AUTHORITY_STATES,
  transitionToSignIn,
  verifySessionAuthority
} from './session-authority.js';
import { createClientRequestId, reportClientDiagnosticSoon } from './diagnostics.js';

export class ApiError extends Error {
  constructor(message, { status = 0, body = null, requestId = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  if (response.status === 204) return null;
  return response.text().catch(() => '');
}

function fetchInit(init = {}, requestId = '') {
  return {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Blob) && typeof init.body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
      ...(init.headers || {})
    },
    body: init.body && !(init.body instanceof Blob) && typeof init.body !== 'string'
      ? JSON.stringify(init.body)
      : init.body
  };
}

async function fetchResponse(url, init, requestId) {
  try {
    return await fetch(url, fetchInit(init, requestId));
  } catch (cause) {
    throw new ApiError('Сервер недоступен. Проверьте подключение и повторите попытку.', {
      body: { cause },
      requestId
    });
  }
}

async function sessionAwareResponse(url, init, requestId) {
  let response = await fetchResponse(url, init, requestId);
  if (response.status !== 401 || document.body?.dataset?.page === 'signin') return response;

  if (isSessionAuthorityUrl(url)) {
    const state = String(response.headers.get('x-session-state') || '').toLowerCase();
    if (state === SESSION_AUTHORITY_STATES.UNAUTHENTICATED) transitionToSignIn();
    return response;
  }

  const state = await verifySessionAuthority();
  if (state === SESSION_AUTHORITY_STATES.UNAUTHENTICATED) {
    transitionToSignIn();
    return response;
  }
  if (state === SESSION_AUTHORITY_STATES.UNKNOWN) {
    reportClientDiagnosticSoon({
      severity: 'warn',
      category: 'session.authority',
      code: 'session.state_unknown',
      message: 'Прикладной API вернул 401, но состояние сессии не удалось подтвердить.',
      method: init.method || 'GET',
      route: String(url),
      status: 401,
      request_id: requestId
    }, { dedupeMs: 2000 });
    throw new ApiError('Не удалось подтвердить состояние сессии. Повторите запрос.', { status: 0, requestId });
  }

  reportClientDiagnosticSoon({
    severity: 'error',
    category: 'session.anomaly',
    code: 'session.false_401',
    message: 'Прикладной API вернул 401 при подтверждённой активной сессии.',
    method: init.method || 'GET',
    route: String(url),
    status: 401,
    request_id: requestId
  }, { dedupeMs: 2000 });

  response = await fetchResponse(url, init, requestId);
  return response;
}

export async function request(url, init = {}) {
  const requestId = createClientRequestId();
  const startedAt = performance.now();
  try {
    const response = await sessionAwareResponse(url, init, requestId);
    const body = await parseResponse(response);
    const duration = Math.max(0, Math.round(performance.now() - startedAt));
    if (!response.ok) {
      let message = body && typeof body === 'object' && typeof body.error === 'string'
        ? body.error
        : 'Не удалось выполнить запрос.';
      if (response.status === 401 && !isSessionAuthorityUrl(url)) {
        message = 'Сессия подтверждена, но сервер отклонил этот запрос. Повторите действие.';
      }
      if (!String(url).includes('/api/diagnostics/client-events')) {
        reportClientDiagnosticSoon({
          severity: response.status >= 500 ? 'error' : 'warn',
          category: 'api.http',
          code: `api.http_${response.status}`,
          message,
          method: init.method || 'GET',
          route: String(url),
          status: response.status,
          duration_ms: duration,
          request_id: response.headers.get('x-request-id') || requestId,
          details: { response: body && typeof body === 'object' ? body : undefined }
        });
      }
      throw new ApiError(message, { status: response.status, body, requestId: response.headers.get('x-request-id') || requestId });
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError && error.status === 0 && !String(url).includes('/api/diagnostics/client-events')) {
      reportClientDiagnosticSoon({
        severity: 'error',
        category: 'api.network',
        code: 'api.network_error',
        message: error.message,
        method: init.method || 'GET',
        route: String(url),
        status: 0,
        duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        request_id: error.requestId || requestId,
        details: { error_name: error.name }
      });
    }
    throw error;
  }
}

export const api = Object.freeze({
  get(url, init) { return request(url, { ...init, method: 'GET' }); },
  post(url, body, init) { return request(url, { ...init, method: 'POST', body }); },
  put(url, body, init) { return request(url, { ...init, method: 'PUT', body }); },
  delete(url, init) { return request(url, { ...init, method: 'DELETE' }); }
});
