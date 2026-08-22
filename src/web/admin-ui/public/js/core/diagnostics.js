import { API, pageName } from './config.js';

const SENSITIVE_KEY = /(password|passwd|secret|token|cookie|authorization|credential|api[_-]?key|session|poll[_-]?secret)/i;
const recent = new Map();
let initialised = false;

function randomPart() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createClientRequestId() {
  return `web-${randomPart()}`.slice(0, 120);
}

function safeValue(value, depth = 0) {
  if (depth >= 4) return '[truncated]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value ?? null;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeValue(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      const safeKey = String(key).slice(0, 100);
      result[safeKey] = SENSITIVE_KEY.test(safeKey) ? '[redacted]' : safeValue(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 2000);
}

function currentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`.slice(0, 500);
}

function normalizedEvent(event) {
  return {
    severity: ['info', 'warn', 'error'].includes(event?.severity) ? event.severity : 'error',
    category: String(event?.category || 'client.runtime').slice(0, 80),
    code: String(event?.code || '').slice(0, 120),
    message: String(event?.message || 'Неизвестная ошибка браузера.').slice(0, 1200),
    page: String(event?.page || pageName() || '').slice(0, 80),
    route: String(event?.route || currentRoute()).slice(0, 500),
    method: String(event?.method || '').slice(0, 16).toUpperCase(),
    status: Number.isInteger(Number(event?.status)) ? Number(event.status) : null,
    duration_ms: Number.isInteger(Number(event?.duration_ms)) ? Math.max(0, Number(event.duration_ms)) : null,
    request_id: String(event?.request_id || '').slice(0, 128),
    details: safeValue(event?.details || {})
  };
}

function signature(event) {
  return [event.severity, event.category, event.code, event.message, event.page, event.route, event.status].join('|');
}

export async function reportClientDiagnostic(event, { dedupeMs = 5000 } = {}) {
  if (document.body?.dataset?.page === 'signin') return false;
  const payload = normalizedEvent(event);
  const key = signature(payload);
  const now = Date.now();
  const previous = recent.get(key) || 0;
  if (now - previous < Math.max(0, Number(dedupeMs) || 0)) return false;
  recent.set(key, now);
  if (recent.size > 200) {
    for (const [entry, timestamp] of recent) if (now - timestamp > 60_000) recent.delete(entry);
  }

  try {
    const response = await fetch(API.diagnosticsClientEvents, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function reportClientDiagnosticSoon(event, options) {
  void reportClientDiagnostic(event, options);
}

function errorDetails(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: typeof error.stack === 'string' ? error.stack.slice(0, 8000) : ''
    };
  }
  return { reason: safeValue(error) };
}

export function initialiseClientDiagnostics() {
  if (initialised || document.body?.dataset?.page === 'signin') return;
  initialised = true;

  window.addEventListener('error', (event) => {
    reportClientDiagnosticSoon({
      severity: 'error',
      category: 'client.exception',
      code: 'window.error',
      message: event.message || event.error?.message || 'Необработанная ошибка JavaScript.',
      details: {
        filename: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0,
        ...errorDetails(event.error)
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const details = errorDetails(event.reason);
    reportClientDiagnosticSoon({
      severity: 'error',
      category: 'client.promise',
      code: 'unhandledrejection',
      message: details.message || 'Необработанное отклонение Promise.',
      details
    });
  });

  reportClientDiagnosticSoon({
    severity: 'info',
    category: 'client.lifecycle',
    code: 'app.boot',
    message: 'Клиентское приложение запущено.'
  }, { dedupeMs: 0 });
}
