"use strict";

function loadFrontendTheme() {
  const existing = document.querySelector('link[data-frontend-theme="tv-menu-1"]');
  if (existing) return Promise.resolve();
  return new Promise((resolve) => {
    const tv1Theme = document.createElement('link');
    tv1Theme.rel = 'stylesheet';
    tv1Theme.href = '/css/tv1.css';
    tv1Theme.dataset.frontendTheme = 'tv-menu-1';
    tv1Theme.addEventListener('load', resolve, { once: true });
    tv1Theme.addEventListener('error', resolve, { once: true });
    document.head.append(tv1Theme);
  });
}

document.body?.classList.add('ui-v319');

void loadFrontendTheme()
  .then(() => import('/js/application.js'))
  .catch((error) => {
    console.error('TV Menu frontend failed to load', error);
    const target = document.querySelector('[role="status"], .form-message');
    if (target) {
      target.textContent = 'Не удалось загрузить интерфейс. Обновите страницу.';
      target.classList.remove('is-hidden');
      target.classList.add('is-error');
    }
  });
