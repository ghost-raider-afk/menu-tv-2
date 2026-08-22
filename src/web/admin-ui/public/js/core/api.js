import {
  isSessionAuthorityUrl,
  SESSION_AUTHORITY_STATES,
  transitionToSignIn,
  verifySessionAuthority
} from './session-authority.js';

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  if (response.status === 204) return null;
  return response.text().catch(() => '');
}

function fetchInit(init = {}) {
  return {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Blob) && typeof init.body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    },
    body: init.body && !(init.body instanceof Blob) && typeof init.body !== 'string'
      ? JSON.stringify(init.body)
      : init.body
  };
}

async function fetchResponse(url, init) {
  try {
    return await fetch(url, fetchInit(init));
  } catch (cause) {
    throw new ApiError('Сервер недоступен. Проверьте подключение и повторите попытку.', { body: { cause } });
  }
}

async function sessionAwareResponse(url, init) {
  let response = await fetchResponse(url, init);
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
    throw new ApiError('Не удалось подтвердить состояние сессии. Повторите запрос.', { status: 0 });
  }

  response = await fetchResponse(url, init);
  return response;
}

export async function request(url, init = {}) {
  const response = await sessionAwareResponse(url, init);
  const body = await parseResponse(response);
  if (!response.ok) {
    let message = body && typeof body === 'object' && typeof body.error === 'string'
      ? body.error
      : 'Не удалось выполнить запрос.';
    if (response.status === 401 && !isSessionAuthorityUrl(url)) {
      message = 'Сессия подтверждена, но сервер отклонил этот запрос. Повторите действие.';
    }
    throw new ApiError(message, { status: response.status, body });
  }
  return body;
}

export const api = Object.freeze({
  get(url, init) { return request(url, { ...init, method: 'GET' }); },
  post(url, body, init) { return request(url, { ...init, method: 'POST', body }); },
  put(url, body, init) { return request(url, { ...init, method: 'PUT', body }); },
  delete(url, init) { return request(url, { ...init, method: 'DELETE' }); }
});
