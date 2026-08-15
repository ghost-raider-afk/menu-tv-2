import { pageName } from './config.js';

const PAGE_BY_HREF = new Map([
  ['/', 'overview'],
  ['/index.html', 'overview'],
  ['/locations.html', 'locations'],
  ['/screens.html', 'screens'],
  ['/catalog.html', 'catalog'],
  ['/templates.html', 'templates'],
  ['/settings.html', 'settings']
]);

export function initialiseNavigation() {
  const current = pageName() === 'screen-editor' ? 'screens' : pageName();
  document.querySelectorAll('.navigation .nav-link').forEach((link) => {
    let pathname;
    try { pathname = new URL(link.href, window.location.origin).pathname; }
    catch { pathname = ''; }
    link.classList.toggle('is-active', PAGE_BY_HREF.get(pathname) === current);
  });
}
