import { navigationState } from '../core/navigation.js';
import { createSidebar } from './sidebar.js';
import { createContextPanel, refreshContextActive } from './context-panel.js';
import { createHeader, initialiseHeader } from './header.js';

function setCollapsed(shell, context, collapsed) {
  context.classList.toggle('is-collapsed', collapsed);
  shell.classList.toggle('ui-context-collapsed', collapsed);
  try { localStorage.setItem('tv-menu.context-collapsed', collapsed ? '1' : '0'); } catch {}
}

function savedCollapsedState() {
  try { return localStorage.getItem('tv-menu.context-collapsed') === '1'; }
  catch { return false; }
}

function wireContext(shell, rail, context, header, section) {
  if (savedCollapsedState()) setCollapsed(shell, context, true);
  context.querySelector('.ui-context-close')?.addEventListener('click', () => setCollapsed(shell, context, true));
  rail.querySelectorAll('.ui-rail-button').forEach((link) => {
    link.addEventListener('pointerenter', () => {
      if (link.classList.contains('active')) setCollapsed(shell, context, false);
    }, { passive: true });
    link.addEventListener('click', () => setCollapsed(shell, context, false));
  });
  if (section === 'monitors') context.addEventListener('pointerleave', () => setCollapsed(shell, context, true), { passive: true });
  shell.querySelector('.main-content')?.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180) setCollapsed(shell, context, true);
  }, { passive: true });
  header.addEventListener('pointerdown', () => {
    if (window.innerWidth <= 1180 && !context.classList.contains('is-collapsed')) setCollapsed(shell, context, true);
  }, { capture: true, passive: true });
  window.addEventListener('hashchange', () => refreshContextActive(context));
}

export function initialiseShell() {
  const shell = document.querySelector('.app-shell');
  const content = shell?.querySelector('.app-content');
  if (!shell || !content || shell.querySelector('.ui-rail')) return;

  const { section, currentPage } = navigationState();
  document.body.dataset.appPage = currentPage;
  document.body.dataset.uiSection = section;

  const rail = createSidebar();
  const context = createContextPanel();
  const header = createHeader();
  content.prepend(header);
  shell.prepend(context);
  shell.prepend(rail);

  wireContext(shell, rail, context, header, section);
  refreshContextActive(context);
  initialiseHeader();
}
