import { pageName } from './config.js';

export const ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ path: '/', page: 'overview', section: 'overview', title: 'Обзор', prefetch: false }),
  Object.freeze({ path: '/locations.html', page: 'locations', section: 'monitors', title: 'Торговые точки', prefetch: true }),
  Object.freeze({ path: '/screens.html', page: 'screens', section: 'monitors', title: 'Мониторы', prefetch: true }),
  Object.freeze({ path: '/connect-tv.html', page: 'connect-tv', section: 'monitors', title: 'Подключить ТВ', prefetch: true }),
  Object.freeze({ path: '/screen-editor.html', page: 'screen-editor', section: 'monitors', title: 'Редактор меню', prefetch: true }),
  Object.freeze({ path: '/catalog.html', page: 'catalog', section: 'catalog', title: 'Каталог', prefetch: true }),
  Object.freeze({ path: '/animation.html', page: 'animation', section: 'animation', title: 'Анимация', prefetch: true }),
  Object.freeze({ path: '/settings.html', page: 'settings', section: 'settings', title: 'Настройки сайта', prefetch: true }),
  Object.freeze({ path: '/sftp-settings.html', page: 'sftp-settings', section: 'settings', title: 'SFTP', prefetch: true }),
  Object.freeze({ path: '/events.html', page: 'events', section: 'settings', title: 'Журнал событий', prefetch: true }),
  Object.freeze({ path: '/profile.html', page: 'profile', section: 'settings', title: 'Профиль', prefetch: true })
]);

const ROUTE_BY_PAGE = new Map(ROUTE_DEFINITIONS.map((route) => [route.page, route]));
const ROUTE_PATHS = new Set(ROUTE_DEFINITIONS.map((route) => route.path));

export function canonicalRoutePath(pathname) {
  return pathname === '/index.html' ? '/' : pathname;
}

export function isAppRoutePath(pathname) {
  return ROUTE_PATHS.has(canonicalRoutePath(pathname));
}

export const PREFETCH_ROUTE_PATHS = Object.freeze(ROUTE_DEFINITIONS.filter((route) => route.prefetch).map((route) => route.path));

const CONTEXT_LINKS = Object.freeze({
  overview: Object.freeze([['Обзор', '/']]),
  monitors: Object.freeze([['Торговые точки', '/locations.html'], ['Мониторы', '/screens.html'], ['Подключить ТВ', '/connect-tv.html']]),
  catalog: Object.freeze([['Продукция', '/catalog.html']]),
  animation: Object.freeze([['Анимация', '/animation.html']]),
  settings: Object.freeze([['Настройки сайта', '/settings.html'], ['SFTP', '/sftp-settings.html'], ['Журнал событий', '/events.html'], ['Профиль', '/profile.html']])
});

export const PRIMARY_ROUTES = Object.freeze([
  Object.freeze({ key: 'monitors', label: 'Мониторы', href: '/screens.html', icon: 'monitor' }),
  Object.freeze({ key: 'catalog', label: 'Каталог', href: '/catalog.html', icon: 'catalog' }),
  Object.freeze({ key: 'animation', label: 'Анимация', href: '/animation.html', icon: 'motion' }),
  Object.freeze({ key: 'settings', label: 'Настройки', href: '/settings.html', icon: 'settings' })
]);

export function navigationState(currentPage = pageName()) {
  const route = ROUTE_BY_PAGE.get(currentPage) || ROUTE_BY_PAGE.get('overview');
  return {
    currentPage,
    section: route.section,
    title: route.title,
    contextLinks: CONTEXT_LINKS[route.section] || CONTEXT_LINKS.overview
  };
}

export function routeIsActive(href, currentPage = pageName()) {
  if (href === '/') return currentPage === 'overview';
  const target = new URL(href, window.location.origin);
  if (currentPage === 'screen-editor' && target.pathname === '/screens.html') return true;
  if (canonicalRoutePath(window.location.pathname) !== canonicalRoutePath(target.pathname)) return false;
  if (!target.hash) return true;
  return window.location.hash === target.hash;
}