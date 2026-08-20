import { pageName } from './config.js';

const SECTION_BY_PAGE = Object.freeze({
  overview: 'overview',
  locations: 'monitors',
  screens: 'monitors',
  'screen-editor': 'monitors',
  catalog: 'catalog',
  settings: 'settings',
  profile: 'settings'
});

const PAGE_TITLES = Object.freeze({
  overview: 'Обзор',
  locations: 'Торговые точки',
  screens: 'Мониторы',
  'screen-editor': 'Редактор меню',
  catalog: 'Каталог',
  settings: 'Настройки сайта',
  profile: 'Профиль'
});

const CONTEXT_LINKS = Object.freeze({
  overview: Object.freeze([['Обзор', '/']]),
  monitors: Object.freeze([['Торговые точки', '/locations.html'], ['Мониторы', '/screens.html']]),
  catalog: Object.freeze([['Продукция', '/catalog.html']]),
  settings: Object.freeze([['Настройки сайта', '/settings.html'], ['Профиль', '/profile.html']])
});

export const PRIMARY_ROUTES = Object.freeze([
  Object.freeze({ key: 'monitors', label: 'Мониторы', href: '/screens.html', icon: 'monitor' }),
  Object.freeze({ key: 'catalog', label: 'Каталог', href: '/catalog.html', icon: 'catalog' }),
  Object.freeze({ key: 'settings', label: 'Настройки', href: '/settings.html', icon: 'settings' })
]);

export function navigationState(currentPage = pageName()) {
  const section = SECTION_BY_PAGE[currentPage] || 'overview';
  return {
    currentPage,
    section,
    title: PAGE_TITLES[currentPage] || 'ТВ МЕНЮ',
    contextLinks: CONTEXT_LINKS[section] || CONTEXT_LINKS.overview
  };
}

export function routeIsActive(href, currentPage = pageName()) {
  if (href === '/') return currentPage === 'overview';
  const target = new URL(href, window.location.origin);
  if (currentPage === 'screen-editor' && target.pathname === '/screens.html') return true;
  if (window.location.pathname !== target.pathname) return false;
  if (!target.hash) return true;
  return window.location.hash === target.hash;
}
