import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element } from '../core/dom.js';
import { applyTheme, currentTheme } from '../core/presentation.js';
import { loadNotifications } from '../core/notifications.js';

function initials(value) {
  const parts = String(value || 'ТВ').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'ТВ').toUpperCase();
}

export function updateProfileMenu(user) {
  const displayName = user?.display_name || user?.username || state.session?.display_name || state.session?.username || 'Пользователь';
  document.querySelectorAll('[data-profile-name], [data-session-user], [data-shell-user]').forEach((node) => { node.textContent = displayName; });
  document.querySelectorAll('[data-profile-email]').forEach((node) => { node.textContent = user?.email || 'Настройки учётной записи'; });
  document.querySelectorAll('[data-profile-initials]').forEach((node) => { node.textContent = initials(displayName); });
}

async function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const preferences = state.user || await api.get(API.userSettings);
  const updated = await api.put(API.userSettings, { ...preferences, theme: next });
  state.user = updated;
  applyTheme(updated.theme);
  await loadNotifications();
}

export function initialiseChrome() {
  updateProfileMenu(state.user);
  const menu = document.querySelector('.profile-menu');
  const trigger = document.querySelector('.profile-trigger');
  const panel = document.querySelector('.profile-panel');
  if (menu && trigger && panel) {
    trigger.addEventListener('click', () => {
      const open = panel.classList.contains('is-hidden');
      panel.classList.toggle('is-hidden', !open);
      trigger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) {
        panel.classList.add('is-hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }
  document.querySelectorAll('[data-sidebar-toggle]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector('[data-sidebar]')?.classList.toggle('is-open');
  }));
  document.querySelectorAll('[data-logout]').forEach((button) => {
    if (button.dataset.logoutBound === '1') return;
    button.dataset.logoutBound = '1';
    button.addEventListener('click', async () => {
      try { await api.post(API.logout); }
      finally { window.location.replace('/signin.html'); }
    });
  });
  element('theme-toggle')?.addEventListener('click', () => { void toggleTheme(); });
}
