import { API } from './config.js';
import { api } from './api.js';
import { state } from './state.js';
import { element } from './dom.js';
import { formatDate } from './presentation.js';

function eventRow(event) {
  const row = document.createElement('article');
  row.className = 'event-row';
  const message = document.createElement('p');
  message.className = 'event-message';
  message.textContent = event.message;
  const details = document.createElement('p');
  details.className = 'event-details';
  details.textContent = `${event.actor_username} · ${formatDate(event.created_at)}`;
  row.append(message, details);
  return row;
}

function renderEvents(list, empty, events) {
  if (!list || !empty) return;
  list.replaceChildren(...events.map(eventRow));
  empty.classList.toggle('is-hidden', events.length !== 0);
}

function updateBadge(count) {
  const badge = document.querySelector('[data-notification-count]');
  if (!badge) return;
  const visible = state.user?.notifications_enabled === false ? 0 : count;
  badge.textContent = visible > 99 ? '99+' : String(visible);
  badge.classList.toggle('is-hidden', visible === 0);
}

function closeNotifications(panel, button) {
  panel.classList.add('is-hidden');
  button.setAttribute('aria-expanded', 'false');
}

export async function loadNotifications(limit = 20) {
  const result = await api.get(`${API.notifications}?limit=${limit}`);
  renderEvents(document.querySelector('[data-notification-list]'), document.querySelector('[data-notification-empty]'), result.items);
  updateBadge(result.unread_count);
  return result;
}

export async function loadActivity(limit = 2000) {
  const result = await api.get(`${API.notifications}/activity?limit=${limit}`);
  renderEvents(document.querySelector('[data-activity-list]'), document.querySelector('[data-activity-empty]'), result.items);
  return result;
}

export function startNotificationPolling() {
  if (state.notificationTimer) window.clearInterval(state.notificationTimer);
  const seconds = Number(state.site?.dashboard_refresh_seconds) || 45;
  state.notificationTimer = window.setInterval(() => {
    if (state.user?.notifications_enabled !== false) void loadNotifications().catch(() => undefined);
  }, seconds * 1000);
}

export function initialiseNotifications() {
  const button = element('notifications-button');
  const panel = element('notifications-panel');
  if (!(button instanceof HTMLButtonElement) || !panel) return;
  void loadNotifications().catch(() => undefined);
  startNotificationPolling();
  button.addEventListener('click', () => {
    const opens = panel.classList.contains('is-hidden');
    panel.classList.toggle('is-hidden', !opens);
    button.setAttribute('aria-expanded', String(opens));
    if (opens) void loadNotifications().catch(() => undefined);
  });
  document.addEventListener('click', (event) => {
    if (panel.classList.contains('is-hidden') || panel.contains(event.target) || button.contains(event.target)) return;
    closeNotifications(panel, button);
  });
  panel.querySelector('[data-open-activity-log]')?.addEventListener('click', () => closeNotifications(panel, button));
  element('mark-notifications-read')?.addEventListener('click', async () => {
    try {
      await api.post(`${API.notifications}/read`);
      await loadNotifications();
      if (document.querySelector('[data-activity-list]')) await loadActivity();
    } catch {
      // Scheduled refresh retries later.
    }
  });
}
