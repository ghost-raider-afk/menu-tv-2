import { element } from './dom.js';
import { state } from './state.js';
import { setIcon } from '../components/icons.js';

const TV1_DEFAULT_ACCENT = '#F4C915';
const LEGACY_DEFAULT_ACCENT = '#2563EB';

function imageElement(url, label) {
  const image = document.createElement('img');
  image.src = url;
  image.alt = label;
  image.className = 'brand-image';
  return image;
}

function effectiveAccent(site) {
  const configured = String(site?.accent_color || '').toUpperCase();
  if (!configured) return TV1_DEFAULT_ACCENT;
  if (configured === LEGACY_DEFAULT_ACCENT && !site?.updated_by) return TV1_DEFAULT_ACCENT;
  return configured;
}

export function applyPresentation(site) {
  if (!site) return;
  const name = site.app_name || 'ТВ МЕНЮ';
  const accent = effectiveAccent(site);
  document.title = name;
  document.querySelectorAll('[data-app-name], [data-shell-company]').forEach((node) => { node.textContent = name; });
  document.documentElement.style.setProperty('--brand-accent', accent);
  document.documentElement.style.setProperty('--ui-accent', accent);
  document.documentElement.style.setProperty('--primary', accent);
  document.documentElement.style.setProperty('--primary-strong', accent);
  document.querySelectorAll('.brand-mark').forEach((mark) => {
    mark.replaceChildren();
    if (site.logo_url) mark.append(imageElement(site.logo_url, 'Логотип'));
    else mark.textContent = 'ТВ';
  });
  let favicon = document.querySelector("link[rel='icon']");
  if (site.favicon_url) {
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.append(favicon);
    }
    favicon.href = site.favicon_url;
  } else if (favicon) favicon.remove();
  const logoPreview = document.querySelector('[data-logo-preview]');
  if (logoPreview) {
    logoPreview.src = site.logo_url || '';
    logoPreview.classList.toggle('is-hidden', !site.logo_url);
  }
  const faviconPreview = document.querySelector('[data-favicon-preview]');
  if (faviconPreview) {
    faviconPreview.src = site.favicon_url || '';
    faviconPreview.classList.toggle('is-hidden', !site.favicon_url);
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const requested = theme || 'system';
  const actual = requested === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : requested;
  document.documentElement.dataset.theme = actual;
  document.documentElement.dataset.themePreference = requested;
  try { window.localStorage.setItem('menu-tv-theme', requested); } catch { /* Storage can be unavailable. */ }
  const toggle = element('theme-toggle');
  if (toggle) {
    setIcon(toggle, actual === 'dark' ? 'sun' : 'moon');
    toggle.setAttribute('aria-label', actual === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  }
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezone = state.site?.timezone || undefined;
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  const valueFor = (type) => parts.find((part) => part.type === type)?.value || '';
  const calendar = state.site?.date_format === 'YYYY-MM-DD'
    ? `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`
    : `${valueFor('day')}.${valueFor('month')}.${valueFor('year')}`;
  return `${calendar}, ${valueFor('hour')}:${valueFor('minute')}`;
}
