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

export async function request(url, init = {}) {
  let response;
  try {
    response = await fetch(url, {
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
    });
  } catch (cause) {
    throw new ApiError('Сервер недоступен. Проверьте подключение и повторите попытку.', { body: { cause } });
  }

  const body = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && document.body?.dataset?.page !== 'signin') {
      window.location.replace('/signin.html');
    }
    const message = body && typeof body === 'object' && typeof body.error === 'string'
      ? body.error
      : 'Не удалось выполнить запрос.';
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
