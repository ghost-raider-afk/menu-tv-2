import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { applyPresentation } from '../core/presentation.js';
import { loadNotifications, loadActivity, startNotificationPolling } from '../core/notifications.js';

function populateSiteForm(site) {
  element('site-app-name').value = site.app_name;
  element('site-domain').value = site.domain;
  element('site-accent-color').value = site.accent_color;
  element('site-signin-logo-size').value = String(site.signin_logo_size || 1);
  element('site-timezone').value = site.timezone;
  element('site-date-format').value = site.date_format;
  element('site-refresh-seconds').value = String(site.dashboard_refresh_seconds);
  element('site-default-resolution').value = site.default_screen_resolution;
  element('site-session-ttl').textContent = `${site.session_ttl_hours} ч`;
  element('site-sftp-port').textContent = String(site.sftp_port);
}

function uploadSiteAsset(kind) {
  const fileInput = element(kind === 'logo' ? 'site-logo-file' : 'site-favicon-file');
  const button = element(kind === 'logo' ? 'upload-logo' : 'upload-favicon');
  const file = fileInput?.files?.[0];
  if (!file) return setMessage('site-settings-message', 'Сначала выберите файл.');
  setPending(button, true, 'Загружаем…');
  void api.put(`${API.siteSettings}/${kind}`, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    .then((site) => {
      state.site = site;
      applyPresentation(site);
      populateSiteForm(site);
      setMessage('site-settings-message', `${kind === 'logo' ? 'Логотип' : 'Favicon'} сохранён.`, 'success');
      return loadNotifications();
    })
    .catch((error) => setMessage('site-settings-message', error.message))
    .finally(() => setPending(button, false, 'Загружаем…'));
}

export function initialiseSettings() {
  const siteForm = element('site-settings-form');
  if (!(siteForm instanceof HTMLFormElement)) return;
  populateSiteForm(state.site);
  void loadActivity().catch(() => undefined);
  element('refresh-activity')?.addEventListener('click', () => { void loadActivity(); });
  element('upload-logo')?.addEventListener('click', () => uploadSiteAsset('logo'));
  element('upload-favicon')?.addEventListener('click', () => uploadSiteAsset('favicon'));
  siteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('site-settings-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const site = await api.put(API.siteSettings, {
        application_name: element('site-app-name').value,
        accent_color: element('site-accent-color').value,
        signin_logo_size: Number(element('site-signin-logo-size').value),
        timezone: element('site-timezone').value,
        date_format: element('site-date-format').value,
        dashboard_refresh_seconds: Number(element('site-refresh-seconds').value),
        default_screen_resolution: element('site-default-resolution').value
      });
      state.site = site;
      applyPresentation(site);
      populateSiteForm(site);
      startNotificationPolling();
      setMessage('site-settings-message', 'Настройки сайта сохранены.', 'success');
      await Promise.all([loadNotifications(), loadActivity()]);
    } catch (error) {
      setMessage('site-settings-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
