import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createContextPanel, refreshContextActive, refreshContextPanel } from './context-panel.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';

function setCollapsed(shell, context, collapsed) {
  context.classList.toggle('is-collapsed', collapsed);
  shell.classList.toggle('ui-context-collapsed', collapsed);
  try { localStorage.setItem('tv-menu.context-collapsed', collapsed ? '1' : '0'); } catch {}
}

function savedCollapsedState() {
  try { return localStorage.getItem('tv-menu.context-collapsed') === '1'; }
  catch { return false; }
}

function wireContext(shell, rail, context, header) {
  if (savedCollapsedState()) setCollapsed(shell, context, true);
  context.querySelector('.ui-context-close')?.addEventListener('click', () => setCollapsed(shell, context, true));
  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (link.classList.contains('active')) setCollapsed(shell, context, false);
    }, { passive: true });
    link.addEventListener('click', () => setCollapsed(shell, context, false));
  });
  context.addEventListener('pointerleave', () => {
    if (document.body.dataset.uiSection === 'monitors') setCollapsed(shell, context, true);
  }, { passive: true });
  shell.querySelector('.main-content')?.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180) setCollapsed(shell, context, true);
  }, { passive: true });
  header.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180 && !context.classList.contains('is-collapsed')) setCollapsed(shell, context, true);
  }, { capture: true, passive: true });
  window.addEventListener('hashchange', () => refreshContextActive(context));
}

export function refreshShellRoute() {
  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;
  refreshSidebarActive();
  refreshContextPanel();
  refreshHeaderRoute();
  initialiseHeader();
}

export function initialiseShell() {
  const shell = document.querySelector('.app-shell');
  const content = shell?.querySelector('.app-content');
  if (!shell || !content) return;
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
