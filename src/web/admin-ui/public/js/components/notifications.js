export function createNotificationsControl() {
  const wrap = document.createElement('div');
  wrap.className = 'notification-wrap';
  wrap.innerHTML = `<button class="icon-button notification-button" id="notifications-button" type="button" aria-label="События" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg><span class="notification-badge is-hidden" data-notification-count></span></button><section class="notification-panel is-hidden" id="notifications-panel" aria-label="Последние события"><div class="panel-heading"><strong>События</strong><button class="text-button" id="mark-notifications-read" type="button">Прочитать все</button></div><div data-notification-list></div><p class="empty-state is-hidden" data-notification-empty>Новых событий нет.</p><a class="panel-footer" href="/events.html">Открыть журнал событий</a></section>`;
  return wrap;
}
