import { ValidationError } from '../shared/errors.js';

const SEVERITIES = new Set(['info', 'warn', 'error']);
const SENSITIVE_KEY = /(password|passwd|secret|token|cookie|authorization|credential|api[_-]?key|session|poll[_-]?secret)/i;

function text(value, field, { maximum = 500, required = false } = {}) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new ValidationError(`Поле «${field}» обязательно.`);
  if (result.length > maximum) throw new ValidationError(`Поле «${field}» слишком длинное.`);
  return result;
}

function integerOrNull(value, field, { minimum = 0, maximum = 300000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ValidationError(`Поле «${field}» содержит некорректное число.`);
  }
  return number;
}

function safePrimitive(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  return String(value).slice(0, 2000);
}

export function sanitizeDiagnosticDetails(value, depth = 0) {
  if (depth >= 4) return '[truncated]';
  if (value === null || typeof value !== 'object') return safePrimitive(value);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeDiagnosticDetails(item, depth + 1));
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    const safeKey = String(key).slice(0, 100);
    result[safeKey] = SENSITIVE_KEY.test(safeKey) ? '[redacted]' : sanitizeDiagnosticDetails(item, depth + 1);
  }
  return result;
}

export function clientDiagnosticInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Диагностическое событие должно быть объектом.');
  const severity = text(body.severity, 'Уровень', { maximum: 10, required: true }).toLowerCase();
  if (!SEVERITIES.has(severity)) throw new ValidationError('Уровень диагностического события указан неверно.');
  const method = text(body.method, 'HTTP-метод', { maximum: 16 }).toUpperCase();
  return {
    severity,
    source: 'client',
    category: text(body.category, 'Категория', { maximum: 80, required: true }),
    code: text(body.code, 'Код', { maximum: 120 }),
    message: text(body.message, 'Сообщение', { maximum: 1200, required: true }),
    page: text(body.page, 'Страница', { maximum: 80 }),
    route: text(body.route, 'Маршрут', { maximum: 500 }),
    method,
    status: integerOrNull(body.status, 'HTTP-статус', { minimum: 0, maximum: 599 }),
    duration_ms: integerOrNull(body.duration_ms, 'Длительность', { minimum: 0, maximum: 300000 }),
    request_id: text(body.request_id, 'Request ID', { maximum: 128 }),
    details: sanitizeDiagnosticDetails(body.details || {})
  };
}
