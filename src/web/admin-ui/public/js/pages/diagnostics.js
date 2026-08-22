import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { confirmAction } from '../components/dialogs.js';
import { formatDate } from '../core/presentation.js';

let currentItems = [];
let refreshTimer = null;

function labelForSeverity(value) {
  if (value === 'error') return 'Ошибка';
  if (value === 'warn') return 'Предупреждение';
  return 'Информация';
}

function labelForSource(value) {
  return value === 'server' ? 'Сервер' : 'Браузер';
}

function visibleItems() {
  const severity = String(element('diagnostics-severity')?.value || '');
  const source = String(element('diagnostics-source')?.value || '');
  const query = String(element('diagnostics-query')?.value || '').trim().toLocaleLowerCase('ru-RU');
  return currentItems.filter((item) => {
    if (severity && item.severity !== severity) return false;
    if (source && item.source !== source) return false;
    if (!query) return true;
    return [item.page, item.route, item.category, item.code, item.message, item.request_id, item.actor_username]
      .some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query));
  });
}

function detailsText(item) {
  return JSON.stringify({
    request_id: item.request_id || null,
    category: item.category,
    code: item.code || null,
    page: item.page || null,
    route: item.route || null,
    method: item.method || null,
    status: item.status,
    duration_ms: item.duration_ms,
    actor: item.actor_username || null,
    user_agent: item.user_agent || null,
    details: item.details || {}
  }, null, 2);
}

function diagnosticRow(item) {
  const article = document.createElement('article');
  article.className = `diagnostic-event is-${item.severity}`;

  const heading = document.createElement('div');
  heading.className = 'diagnostic-event-heading';
  const badges = document.createElement('div');
  badges.className = 'diagnostic-badges';
  const severity = document.createElement('span');
  severity.className = `diagnostic-badge diagnostic-badge-${item.severity}`;
  severity.textContent = labelForSeverity(item.severity);
  const source = document.createElement('span');
  source.className = 'diagnostic-badge';
  source.textContent = labelForSource(item.source);
  badges.append(severity, source);
  const time = document.createElement('time');
  time.dateTime = item.created_at;
  time.textContent = formatDate(item.created_at);
  heading.append(badges, time);

  const message = document.createElement('p');
  message.className = 'diagnostic-message';
  message.textContent = item.message;

  const meta = document.createElement('p');
  meta.className = 'diagnostic-meta';
  const route = item.route || item.page || 'без маршрута';
  const status = item.status === null || item.status === undefined ? '' : ` · HTTP ${item.status}`;
  const duration = item.duration_ms === null || item.duration_ms === undefined ? '' : ` · ${item.duration_ms} мс`;
  const requestId = item.request_id ? ` · request ${item.request_id}` : '';
  meta.textContent = `${item.category || 'runtime'} · ${route}${status}${duration}${requestId}`;

  const details = document.createElement('details');
  details.className = 'diagnostic-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Технические детали';
  const pre = document.createElement('pre');
  pre.textContent = detailsText(item);
  details.append(summary, pre);

  article.append(heading, message, meta, details);
  return article;
}

function renderDiagnostics() {
  const list = document.querySelector('[data-diagnostics-list]');
  const empty = document.querySelector('[data-diagnostics-empty]');
  if (!list || !empty) return;
  const items = visibleItems();
  list.replaceChildren(...items.map(diagnosticRow));
  empty.classList.toggle('is-hidden', items.length !== 0);

  const counter = element('diagnostics-count');
  if (counter) counter.textContent = `${items.length} из ${currentItems.length}`;
  const summary = element('diagnostics-summary');
  if (summary) {
    const counts = currentItems.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, { error: 0, warn: 0, info: 0 });
    summary.textContent = `Ошибок: ${counts.error} · предупреждений: ${counts.warn} · информационных событий: ${counts.info}`;
  }
}

async function refreshDiagnostics({ quiet = false } = {}) {
  try {
    const result = await api.get(`${API.diagnosticsEvents}?limit=5000`);
    currentItems = Array.isArray(result?.items) ? result.items : [];
    renderDiagnostics();
    if (!quiet) setMessage('diagnostics-message', 'Журнал обновлён.', 'success');
  } catch (error) {
    if (!quiet) setMessage('diagnostics-message', error.message);
  }
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(items) {
  const header = ['Дата','Уровень','Источник','Категория','Код','Страница','Маршрут','Метод','HTTP','мс','Request ID','Пользователь','Сообщение','Детали'];
  const lines = [header.map(csvCell).join(';')];
  items.forEach((item) => lines.push([
    item.created_at, item.severity, item.source, item.category, item.code, item.page, item.route,
    item.method, item.status ?? '', item.duration_ms ?? '', item.request_id, item.actor_username,
    item.message, JSON.stringify(item.details || {})
  ].map(csvCell).join(';')));
  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tv-menu-diagnostics-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function clearDiagnostics() {
  const confirmed = await confirmAction({
    title: 'Очистить журнал ошибок?',
    message: 'Все диагностические события будут удалены. При необходимости сначала сохраните журнал в CSV.',
    confirmLabel: 'Очистить журнал',
    danger: true
  });
  if (!confirmed) return;
  const button = element('clear-diagnostics');
  setPending(button, true, 'Очищаем…');
  try {
    const result = await api.delete(API.diagnosticsEvents);
    currentItems = [];
    renderDiagnostics();
    setMessage('diagnostics-message', `Удалено записей: ${result.cleared || 0}.`, 'success');
  } catch (error) {
    setMessage('diagnostics-message', error.message);
  } finally {
    setPending(button, false, 'Очищаем…');
  }
}

export function initialiseDiagnosticsLog() {
  currentItems = [];
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
  void refreshDiagnostics({ quiet: true });

  element('refresh-diagnostics')?.addEventListener('click', () => void refreshDiagnostics());
  element('save-diagnostics')?.addEventListener('click', () => {
    exportCsv(visibleItems());
    setMessage('diagnostics-message', 'Текущий срез журнала сохранён в CSV.', 'success');
  });
  element('clear-diagnostics')?.addEventListener('click', () => void clearDiagnostics());
  element('diagnostics-severity')?.addEventListener('change', renderDiagnostics);
  element('diagnostics-source')?.addEventListener('change', renderDiagnostics);
  element('diagnostics-query')?.addEventListener('input', renderDiagnostics);

  refreshTimer = window.setInterval(() => {
    if (document.body?.dataset?.page === 'diagnostics') void refreshDiagnostics({ quiet: true });
  }, 30_000);

  return {
    dispose() {
      if (refreshTimer) window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
}
