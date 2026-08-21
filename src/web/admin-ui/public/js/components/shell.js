import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createContextPanel, refreshContextActive, refreshContextPanel } from './context-panel.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';
import { createNotificationsPanel } from './notifications.js';

function ensureOverlayRoot() {
  let root = document.querySelector('[data-overlay-root]');
  if (root) return root;
  root = document.createElement('div');
  root.className = 'ui-overlay-root';
  root.dataset.overlayRoot = 'true';
  document.body.append(root);
  return root;
}

function ensureShellOverlays() {
  const root = ensureOverlayRoot();
  if (!document.getElementById('notifications-panel')) root.append(createNotificationsPanel());
  return root;
}

function setCollapsed(shell, context, collapsed, { persist = true } = {}) {
  context.classList.toggle('is-collapsed', collapsed);
  shell.classList.toggle('ui-context-collapsed', collapsed);
  if (!persist) return;
  try { localStorage.setItem('tv-menu.context-collapsed', collapsed ? '1' : '0'); } catch {}
}

function savedCollapsedState() {
  try { return localStorage.getItem('tv-menu.context-collapsed') === '1'; }
  catch { return false; }
}

function isMobileShell() {
  return window.matchMedia?.('(max-width: 720px)').matches === true;
}

function wireContext(shell, rail, context, header) {
  if (isMobileShell()) setCollapsed(shell, context, true, { persist: false });
  else if (savedCollapsedState()) setCollapsed(shell, context, true, { persist: false });

  context.querySelector('.ui-context-close')?.addEventListener('click', () => setCollapsed(shell, context, true));
  context.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('.app-route-link') : null;
    if (!link || !context.contains(link)) return;
    setCollapsed(shell, context, true);
  });

  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (window.innerWidth > 720 && link.classList.contains('active')) setCollapsed(shell, context, false);
    }, { passive: true });
    link.addEventListener('click', (event) => {
      if (window.innerWidth <= 720) {
        const section = link.dataset.routeSection;
        const usesContextMenu = section === 'monitors' || section === 'settings' || section === 'catalog';
        if (usesContextMenu && link.classList.contains('active')) event.preventDefault();
        setCollapsed(shell, context, !usesContextMenu);
        return;
      }
      setCollapsed(shell, context, false);
    });
  });
  context.addEventListener('pointerleave', () => {
    if (window.innerWidth > 720 && document.body.dataset.uiSection === 'monitors') setCollapsed(shell, context, true);
  }, { passive: true });
  shell.querySelector('.main-content')?.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180) setCollapsed(shell, context, true);
  }, { passive: true });
  header.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180 && !context.classList.contains('is-collapsed')) setCollapsed(shell, context, true);
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 720) setCollapsed(shell, context, true, { persist: false });
  }, { passive: true });
  window.addEventListener('hashchange', () => refreshContextActive(context));
}

export function refreshShellRoute() {
  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;
  ensureShellOverlays();
  refreshSidebarActive();
  refreshContextPanel();
  refreshHeaderRoute();
  initialiseHeader();
}

export function initialiseShell() {
  const shell = document.querySelector('.app-shell');
  const content = shell?.querySelector('.app-content');
  if (!shell || !content) return;
  ensureShellOverlays();
  if (shell.querySelector('.ui-rail')) {
    refreshShellRoute();
    return;
  }

  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;

  const rail = createSidebar();
  const context = createContextPanel();
  const header = createHeader();
  content.prepend(header);
  shell.prepend(context);
  shell.prepend(rail);

  wireContext(shell, rail, context, header);
  refreshShellRoute();
}
