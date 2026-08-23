import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { clearMessage, element, setMessage, setPending } from '../core/dom.js';

let journal = { items: [], retention_days: 0, max_entries: 0 };

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('ru-RU');
}

function matches(entry, query) {
  if (!query) return true;
  return [entry.error_type, entry.message, entry.page, entry.source, entry.stack, entry.username]
    .some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query));
}

function errorCard(entry) {
  const article = document.createElement('article');
  article.className = 'settings-card error-log-entry';

  const head = document.createElement('div');
  head.className = 'error-log-entry-head';
  const badge = document.createElement('span');
  badge.className = 'error-log-type';
  badge.textContent = entry.error_type;
  const time = document.createElement('time');
  time.dateTime = entry.created_at || '';
  time.textContent = timestamp(entry.created_at);
  head.append(badge, time);

  const message = document.createElement('p');
  message.className = 'error-log-entry-message';
  message.textContent = entry.message;

  const meta = document.createElement('div');
  meta.className = 'error-log-entry-meta';
  const metaValues = [
    entry.page ? `Страница: ${entry.page}` : '',
    entry.source ? `Источник: ${entry.source}${entry.line_number !== null && entry.line_number !== undefined ? `:${entry.line_number}${entry.column_number !== null && entry.column_number !== undefined ? `:${entry.column_number}` : ''}` : ''}` : '',
    entry.username ? `Пользователь: ${entry.username}` : '',
    entry.user_agent ? `Браузер: ${entry.user_agent}` : ''
  ].filter(Boolean);
  for (const value of metaValues) {
    const line = document.createElement('span');
    line.textContent = value;
    meta.append(line);
  }

  article.append(head, message, meta);
  if (entry.stack) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Stack trace';
    const pre = document.createElement('pre');
    pre.textContent = entry.stack;
    details.append(summary, pre);
    article.append(details);
  }
  return article;
}

function render() {
  const list = element('error-log-list');
  const empty = element('error-log-empty');
  if (!list || !empty) return;
  const query = String(element('error-log-filter')?.value || '').trim().toLocaleLowerCase('ru-RU');
  const items = journal.items.filter((entry) => matches(entry, query));
  list.replaceChildren(...items.map(errorCard));
  empty.classList.toggle('is-hidden', items.length !== 0);
  empty.textContent = query && journal.items.length ? 'По фильтру ошибок не найдено.' : 'Ошибок веб-интерфейса пока нет.';
  const count = element('error-log-count');
  if (count) count.textContent = String(items.length);
  const policy = element('error-log-policy');
  if (policy) policy.textContent = `Хранение: ${journal.retention_days} дн. · максимум ${journal.max_entries} записей`;
}

async function loadJournal() {
  const button = element('error-log-refresh');
  setPending(button, true, 'Обновляем…');
  clearMessage('error-log-message');
  try {
    journal = await api.get(`${API.frontendErrors}?limit=500`);
    render();
  } catch (error) {
    setMessage('error-log-message', error.message);
  } finally {
    setPending(button, false, 'Обновляем…');
  }
}

async function clearJournal() {
  if (!window.confirm('Очистить весь журнал ошибок веб-интерфейса?')) return;
  const button = element('error-log-clear');
  setPending(button, true, 'Очищаем…');
  clearMessage('error-log-message');
  try {
    await api.delete(API.frontendErrors);
    journal = { ...journal, items: [] };
    render();
    setMessage('error-log-message', 'Журнал ошибок очищен.', 'success');
  } catch (error) {
    setMessage('error-log-message', error.message);
  } finally {
    setPending(button, false, 'Очищаем…');
  }
}

export function initialiseErrorLog() {
  element('error-log-filter')?.addEventListener('input', render);
  element('error-log-refresh')?.addEventListener('click', () => void loadJournal());
  element('error-log-clear')?.addEventListener('click', () => void clearJournal());
  void loadJournal();
}
