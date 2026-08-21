export function createNotificationsControl() {
  const wrap = document.createElement('div');
  wrap.className = 'notification-wrap';
  wrap.innerHTML = `<button class="icon-button notification-button" id="notifications-button" type="button" aria-label="Уведомления" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg><span class="notification-badge is-hidden" data-notification-count></span></button>`;
  return wrap;
}

export function createNotificationsPanel() {
  const panel = document.createElement('section');
  panel.className = 'notification-panel is-hidden';
  panel.id = 'notifications-panel';
  panel.setAttribute('aria-label', 'Уведомления');
  panel.innerHTML = `<div class="panel-heading"><strong>Уведомления</strong><button class="text-button" id="mark-notifications-read" type="button">Прочитать все</button></div><div data-notification-list></div><p class="empty-state is-hidden" data-notification-empty>Новых уведомлений нет.</p><a class="panel-footer" href="/settings.html#activity">Открыть журнал действий</a>`;
  return panel;
}
