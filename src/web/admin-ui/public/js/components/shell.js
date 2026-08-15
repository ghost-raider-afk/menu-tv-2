import { API, pageName } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';

const SECTIONS = Object.freeze({
  overview: 'overview',
  locations: 'monitors',
  screens: 'monitors',
  'screen-editor': 'monitors',
  catalog: 'catalog',
  templates: 'settings',
  settings: 'settings',
  profile: 'settings'
});

const PAGE_TITLES = Object.freeze({
  overview: 'Обзор',
  locations: 'Торговые точки',
  screens: 'Мониторы',
  'screen-editor': 'Редактор меню',
  catalog: 'Каталог',
  templates: 'Шаблоны',
  settings: 'Настройки сайта',
  profile: 'Профиль'
});

const CONTEXT_LINKS = Object.freeze({
  overview: [['Обзор', '/']],
  monitors: [['Торговые точки', '/locations.html'], ['Мониторы', '/screens.html']],
  catalog: [['Продукция и тара', '/catalog.html']],
  settings: [['Шаблоны', '/templates.html'], ['Настройки сайта', '/settings.html'], ['Профиль', '/profile.html']]
});

function currentPathMatches(href, currentPage) {
  if (href === '/') return currentPage === 'overview';
  if (currentPage === 'screen-editor' && href === '/screens.html') return true;
  return window.location.pathname === href;
}

function railLink({ key, label, href, icon }, activeSection) {
  const active = key === activeSection;
  return `<a class="ui-rail-button${active ? ' active' : ''}" href="${href}" aria-label="${label}" title="${label}"${active ? ' aria-current="page"' : ''}><span class="ui-rail-icon" aria-hidden="true">${icon}</span><span class="ui-rail-label">${label}</span></a>`;
}

function contextMarkup(section, currentPage) {
  const links = CONTEXT_LINKS[section] || CONTEXT_LINKS.overview;
  return links.map(([label, href]) => `<a class="app-route-link${currentPathMatches(href, currentPage) ? ' active' : ''}" href="${href}"><span>${label}</span><span aria-hidden="true">›</span></a>`).join('');
}

function appName() {
  return state.site?.app_name || state.site?.application_name || state.session?.app_name || document.querySelector('[data-app-name]')?.textContent?.trim() || 'ТВ МЕНЮ';
}

function userName() {
  return state.user?.display_name || state.session?.display_name || state.session?.username || 'Пользователь';
}

function contextTitle(section) {
  return ({ overview: 'Обзор', monitors: 'Мониторы', catalog: 'Каталог', settings: 'Настройки' })[section] || 'ТВ МЕНЮ';
}

function buildRail(section) {
  const rail = document.createElement('aside');
  rail.className = 'ui-rail';
  rail.setAttribute('aria-label', 'Основные разделы');
  rail.innerHTML = `
    <a class="ui-rail-brand" href="/" title="${appName()}"><span class="brand-mark" data-shell-brand>ТВ</span></a>
    <nav class="ui-rail-nav" aria-label="Разделы">
      ${railLink({ key: 'monitors', label: 'Мониторы', href: '/screens.html', icon: '▣' }, section)}
      ${railLink({ key: 'catalog', label: 'Каталог', href: '/catalog.html', icon: '▤' }, section)}
      ${railLink({ key: 'settings', label: 'Настройки', href: '/settings.html', icon: '⚙' }, section)}
    </nav>`;
  const logo = state.site?.logo_url;
  if (logo) {
    const brand = rail.querySelector('[data-shell-brand]');
    brand.replaceChildren(Object.assign(document.createElement('img'), { src: logo, alt: '' }));
  }
  return rail;
}

function buildContext(section, currentPage) {
  const context = document.createElement('aside');
  context.className = 'ui-context';
  context.setAttribute('aria-label', 'Контекст раздела');
  context.innerHTML = `
    <div class="ui-context-head"><div><span class="ui-context-kicker">TV MENU</span><h2>${contextTitle(section)}</h2></div><button class="ui-context-close" type="button" aria-label="Свернуть панель">‹</button></div>
    <div class="ui-context-body">${contextMarkup(section, currentPage)}</div>
    <div class="ui-account-card">
      <span class="company-name" data-shell-company></span>
      <div><span class="ui-account-user-row"><strong data-shell-user></strong><button type="button" data-logout>Выйти</button></span><small class="ui-account-role">Панель управления</small></div>
    </div>`;
  context.querySelector('[data-shell-company]').textContent = appName();
  context.querySelector('[data-shell-user]').textContent = userName();
  return context;
}

function setCollapsed(shell, context, collapsed) {
  context.classList.toggle('is-collapsed', collapsed);
  shell.classList.toggle('ui-context-collapsed', collapsed);
  try { localStorage.setItem('tv-menu.ui.contextCollapsed', collapsed ? '1' : '0'); } catch {}
}

function wireShell(shell, rail, context, section) {
  let collapsed = false;
  try { collapsed = localStorage.getItem('tv-menu.ui.contextCollapsed') === '1'; } catch {}
  if (collapsed) setCollapsed(shell, context, true);

  context.querySelector('.ui-context-close')?.addEventListener('click', () => setCollapsed(shell, context, true));
  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (link.classList.contains('active')) setCollapsed(shell, context, false);
    }, { passive: true });
    link.addEventListener('click', () => setCollapsed(shell, context, false));
  });
  if (section === 'monitors') context.addEventListener('pointerleave', () => setCollapsed(shell, context, true), { passive: true });
  document.querySelector('.main-content')?.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180) setCollapsed(shell, context, true);
  }, { passive: true });

  context.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try { await api.post(API.logout); }
    finally { window.location.replace('/signin.html'); }
  });
}

export function initialiseShell() {
  const currentPage = pageName();
  const shell = document.querySelector('.app-shell');
  if (!shell || document.querySelector('.ui-rail')) return;
  const section = SECTIONS[currentPage] || 'overview';

  document.body.classList.add('ui-v319', 'app-page-v2');
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;

  const legacySidebar = shell.querySelector('.sidebar');
  legacySidebar?.classList.add('legacy-sidebar');

  const rail = buildRail(section);
  const context = buildContext(section, currentPage);
  shell.prepend(context);
  shell.prepend(rail);

  const pageHeading = document.querySelector('.page-heading');
  if (pageHeading) pageHeading.classList.add('workspace-header', 'app-page-heading');
  const content = document.querySelector('.main-content');
  content?.classList.add('app-page-content');
  const topbar = document.querySelector('.topbar');
  topbar?.setAttribute('aria-label', `${PAGE_TITLES[currentPage] || 'ТВ МЕНЮ'}: быстрые действия`);

  wireShell(shell, rail, context, section);
}
