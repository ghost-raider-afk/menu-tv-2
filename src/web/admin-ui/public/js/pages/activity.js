import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { loadActivity, loadNotifications } from '../core/notifications.js';
import { confirmAction } from '../components/dialogs.js';

let currentItems = [];

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(items) {
  const header = ['Дата', 'Пользователь', 'Действие', 'Тип объекта', 'ID объекта', 'Сообщение', 'Метаданные'];
  const lines = [header.map(csvCell).join(';')];
  for (const item of items) {
    lines.push([
      item.created_at,
      item.actor_username,
      item.action,
      item.entity_type,
      item.entity_id ?? '',
      item.message,
      JSON.stringify(item.metadata || {})
    ].map(csvCell).join(';'));
  }
  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `tv-menu-activity-${stamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function refreshActivity() {
  const result = await loadActivity(5000);
  currentItems = result.items || [];
  const counter = element('activity-count');
  if (counter) counter.textContent = `${currentItems.length} событий`;
  return result;
}

async function clearActivity() {
  const confirmed = await confirmAction({
    title: 'Очистить журнал действий?',
    message: 'Все записи журнала будут удалены без возможности восстановления. Перед очисткой при необходимости сохраните журнал в CSV.',
    confirmLabel: 'Очистить журнал',
    danger: true
  });
  if (!confirmed) return;
  const button = element('clear-activity');
  setPending(button, true, 'Очищаем…');
  try {
    const result = await api.delete(`${API.notifications}/activity`);
    currentItems = [];
    await Promise.all([refreshActivity(), loadNotifications()]);
    setMessage('activity-message', `Удалено записей: ${result.cleared || 0}.`, 'success');
  } catch (error) {
    setMessage('activity-message', error.message);
  } finally {
    setPending(button, false, 'Очищаем…');
  }
}

export function initialiseActivityLog() {
  void refreshActivity().catch((error) => setMessage('activity-message', error.message));
  element('refresh-activity')?.addEventListener('click', () => {
    void refreshActivity().catch((error) => setMessage('activity-message', error.message));
  });
  element('save-activity')?.addEventListener('click', async () => {
    try {
      if (!currentItems.length) await refreshActivity();
      exportCsv(currentItems);
      setMessage('activity-message', 'Журнал сохранён в CSV.', 'success');
    } catch (error) {
      setMessage('activity-message', error.message);
    }
  });
  element('clear-activity')?.addEventListener('click', () => { void clearActivity(); });
}
