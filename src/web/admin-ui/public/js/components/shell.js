import { navigationState } from '../core/navigation.js';
import { createSidebar, refreshSidebarActive } from './sidebar.js';
import { createContextPanel, refreshContextActive, refreshContextPanel } from './context-panel.js';
import { createHeader, initialiseHeader, refreshHeaderRoute } from './header.js';

const CONTEXT_COLLAPSED_KEY = 'tv-menu.context-collapsed';
const CONTEXT_MOBILE_BREAKPOINT = 1180;

function setCollapsed(shell, context, collapsed, { persist = false } = {}) {
  context.classList.toggle('is-collapsed', collapsed);
  shell.classList.toggle('ui-context-collapsed', collapsed);
  if (!persist) return;
  try { localStorage.setItem(CONTEXT_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
}

function savedCollapsedState() {
  try { return localStorage.getItem(CONTEXT_COLLAPSED_KEY) === '1'; }
  catch { return false; }
}

function responsiveCollapsed() {
  return window.innerWidth <= CONTEXT_MOBILE_BREAKPOINT;
}

function applyViewportState(shell, context) {
  setCollapsed(shell, context, responsiveCollapsed() ? true : savedCollapsedState());
}

function wireContext(shell, rail, context, header) {
  applyViewportState(shell, context);

  context.querySelector('.ui-context-close')?.addEventListener('click', () => {
    setCollapsed(shell, context, true, { persist: true });
  });

  context.addEventListener('click', (event) => {
    const routeLink = event.target instanceof Element ? event.target.closest('.app-route-link') : null;
    if (routeLink && context.contains(routeLink)) setCollapsed(shell, context, true);
  });

  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (!responsiveCollapsed() && link.classList.contains('active')) setCollapsed(shell, context, false);
    }, { passive: true });
    link.addEventListener('click', () => setCollapsed(shell, context, false, { persist: !responsiveCollapsed() }));
  });

  context.addEventListener('pointerleave', () => {
    if (!responsiveCollapsed()) setCollapsed(shell, context, true);
  }, { passive: true });

  shell.querySelector('.main-content')?.addEventListener('pointerdown', () => {
    if (responsiveCollapsed()) setCollapsed(shell, context, true);
  }, { passive: true });

  header.addEventListener('pointerdown', () => {
    if (responsiveCollapsed() && !context.classList.contains('is-collapsed')) setCollapsed(shell, context, true);
  }, { capture: true, passive: true });

  let viewportWasMobile = responsiveCollapsed();
  window.addEventListener('resize', () => {
    const viewportIsMobile = responsiveCollapsed();
    if (viewportIsMobile === viewportWasMobile) return;
    viewportWasMobile = viewportIsMobile;
    applyViewportState(shell, context);
  }, { passive: true });

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
