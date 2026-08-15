"use strict";

const tv1Theme = document.createElement('link');
tv1Theme.rel = 'stylesheet';
tv1Theme.href = '/css/tv1.css';
tv1Theme.dataset.frontendTheme = 'tv-menu-1';
document.head.append(tv1Theme);
document.body?.classList.add('ui-v319');

void import('/js/application.js').catch((error) => {
  console.error('TV Menu frontend failed to load', error);
  const target = document.querySelector('[role="status"], .form-message');
  if (target) {
    target.textContent = 'Не удалось загрузить интерфейс. Обновите страницу.';
    target.classList.remove('is-hidden');
    target.classList.add('is-error');
  }
});
