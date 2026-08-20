import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';

async function loadLocations() {
  state.locations = await api.get(API.locations);
  renderLocations();
  renderLocationCopyOptions();
  renderSftpLocationOptions();
  return state.locations;
}

function renderLocations() {
  const list = document.querySelector('[data-locations-list]');
  const empty = document.querySelector('[data-locations-empty]');
  if (!list || !empty) return;
  refreshList(list, empty, state.locations.map((location) => recordRow(
    location.name,
    `${location.address || 'Адрес не указан'} · мониторов: ${location.screen_count} · ${location.sftp_directory_name ? `SFTP: ${location.sftp_directory_name} (${location.sftp_username})` : 'SFTP не настроен'}`,
    [makeButton('Изменить', '', () => editLocation(location)), makeButton('Удалить', 'danger', () => void deleteLocation(location))]
  )));
}

function renderLocationCopyOptions() {
  const select = element('location-copy-source');
  if (!(select instanceof HTMLSelectElement)) return;
  const selected = select.value;
  select.replaceChildren(
    new Option('Пустая точка', ''),
    ...state.locations.map((location) => new Option(`По образцу: ${location.name}`, String(location.id)))
  );
  select.value = selected;
}

function renderSftpLocationOptions() {
  const select = element('sftp-location');
  if (!(select instanceof HTMLSelectElement)) return;
  const selected = select.value;
  select.replaceChildren(new Option('Выберите торговую точку', ''), ...state.locations.map((location) => new Option(location.name, String(location.id))));
  select.value = selected;
  renderSftpBindingState();
}

async function loadSftpDirectories() {
  const [directories, connection] = await Promise.all([api.get(API.sftpDirectories), api.get(API.sftpConnection)]);
  state.sftpDirectories = directories;
  const connectionNode = element('sftp-connection');
  if (connectionNode) connectionNode.textContent = `${connection.host}:${connection.port}`;
  renderSftpDirectories();
  return directories;
}

function renderSftpDirectories() {
  const select = element('sftp-directory');
  if (select instanceof HTMLSelectElement) {
    const selected = select.value;
    select.replaceChildren(new Option('Выберите SFTP-папку', ''), ...state.sftpDirectories.map((directory) => {
      const suffix = directory.bound_location_name ? ` — занята: ${directory.bound_location_name}` : directory.storage_status === 'ready' ? ' — готова' : ' — не создана';
      const option = new Option(`${directory.name}${suffix}`, String(directory.id));
      option.disabled = Boolean(directory.bound_location_id);
      return option;
    }));
    select.value = selected;
  }
  const list = document.querySelector('[data-sftp-directories-list]');
  const empty = document.querySelector('[data-sftp-directories-empty]');
  if (!list || !empty) return;
  refreshList(list, empty, state.sftpDirectories.map((directory) => recordRow(
    directory.name,
    `${directory.storage_status === 'ready' ? 'Папка создана' : 'Папка ещё не создана'}${directory.bound_location_name ? ` · привязана к: ${directory.bound_location_name}` : ' · не привязана'}`,
    [...(directory.storage_status !== 'ready' ? [makeButton('Создать папку', '', () => void provisionSftpDirectory(directory))] : []), ...(directory.bound_location_name ? [] : [makeButton('Удалить', 'danger', () => void deleteSftpDirectory(directory))])]
  )));
}

function renderSftpBindingState() {
  const locationId = Number(element('sftp-location')?.value);
  const current = state.locations.find((location) => location.id === locationId);
  const details = element('sftp-binding-state');
  const submit = element('sftp-bind-submit');
  const reset = element('sftp-reset-password');
  const unbind = element('sftp-unbind');
  if (!current) {
    if (details) details.textContent = 'Выберите торговую точку, затем вручную создайте и привяжите папку.';
    if (submit) submit.disabled = false;
    reset?.classList.add('is-hidden');
    unbind?.classList.add('is-hidden');
    return;
  }
  const bound = Boolean(current.sftp_directory_id);
  if (details) details.textContent = bound ? `Сейчас: ${current.sftp_directory_name} · логин ${current.sftp_username} · доступ только на чтение.` : 'SFTP-папка и доступ для этой точки ещё не настроены.';
  if (submit) submit.disabled = bound;
  reset?.classList.toggle('is-hidden', !bound);
  unbind?.classList.toggle('is-hidden', !bound);
}

function setSftpCredentials(credentials) {
  const target = element('sftp-credentials');
  if (!target) return;
  target.textContent = credentials ? `Данные для CX Проводника — хост: ${credentials.host}, порт: ${credentials.port}, логин: ${credentials.username}, пароль: ${credentials.password}. Сохраните пароль: повторно он не показывается.` : '';
  target.className = credentials ? 'form-message is-success field-full' : 'form-message is-hidden field-full';
}

async function provisionSftpDirectory(directory) {
  try {
    await api.post(`${API.sftpDirectories}/${directory.id}/provision`);
    await loadSftpDirectories();
    await loadNotifications();
  } catch (error) { setMessage('sftp-message', error.message); }
}

async function deleteSftpDirectory(directory) {
  if (!window.confirm(`Удалить SFTP-папку «${directory.name}»?`)) return;
  try { await api.delete(`${API.sftpDirectories}/${directory.id}`); await loadSftpDirectories(); }
  catch (error) { setMessage('sftp-message', error.message); }
}

function resetLocationForm() {
  const form = element('location-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingLocationId = null;
  form.reset();
  element('location-active').checked = true;
  element('location-copy-source').disabled = false;
  element('location-copy-field')?.classList.remove('is-hidden');
  element('location-form-title').textContent = 'Новая точка';
  element('location-submit').textContent = 'Создать точку';
  element('cancel-location-edit')?.classList.add('is-hidden');
  clearMessage('location-message');
}

function editLocation(location) {
  state.editingLocationId = location.id;
  element('location-name').value = location.name;
  element('location-address').value = location.address || '';
  element('location-active').checked = location.active;
  element('location-copy-source').disabled = true;
  element('location-copy-field')?.classList.add('is-hidden');
  element('location-form-title').textContent = 'Редактирование точки';
  element('location-submit').textContent = 'Сохранить точку';
  element('cancel-location-edit')?.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteLocation(location) {
  if (!window.confirm(`Удалить точку «${location.name}»?`)) return;
  try { await api.delete(`${API.locations}/${location.id}`); await loadLocations(); }
  catch (error) { setMessage('location-message', error.message); }
}

export function initialiseLocations() {
  const form = element('location-form');
  if (!(form instanceof HTMLFormElement)) return;
  void Promise.all([loadLocations(), loadSftpDirectories()]).catch((error) => setMessage('location-message', error.message));
  element('refresh-locations')?.addEventListener('click', () => { void loadLocations(); });
  element('cancel-location-edit')?.addEventListener('click', resetLocationForm);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('location-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = { name: element('location-name').value, address: element('location-address').value, active: element('location-active').checked };
      if (state.editingLocationId) {
        await api.put(`${API.locations}/${state.editingLocationId}`, payload);
      } else {
        const sourceId = Number(element('location-copy-source').value);
        if (sourceId) await api.post(`${API.locations}/${sourceId}/clone`, payload);
        else await api.post(API.locations, payload);
      }
      resetLocationForm();
      await loadLocations();
      await loadNotifications();
    } catch (error) { setMessage('location-message', error.message); }
    finally { setPending(submit, false, 'Сохраняем…'); }
  });

  element('sftp-location')?.addEventListener('change', renderSftpBindingState);
  element('sftp-directory-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('sftp-directory-submit');
    setPending(submit, true, 'Создаём…');
    try {
      const directory = await api.post(API.sftpDirectories, { name: element('sftp-directory-name').value });
      element('sftp-directory-name').value = '';
      await provisionSftpDirectory(directory);
    } catch (error) { setMessage('sftp-message', error.message); }
    finally { setPending(submit, false, 'Создаём…'); }
  });
  element('sftp-binding-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const locationId = Number(element('sftp-location').value);
    const submit = element('sftp-bind-submit');
    setPending(submit, true, 'Привязываем…');
    try {
      const result = await api.post(`${API.locations}/${locationId}/sftp-binding`, { directory_id: Number(element('sftp-directory').value), username: element('sftp-username').value });
      setSftpCredentials(result.credentials);
      await Promise.all([loadLocations(), loadSftpDirectories(), loadNotifications()]);
    } catch (error) { setMessage('sftp-message', error.message); }
    finally { setPending(submit, false, 'Привязываем…'); }
  });
  element('sftp-reset-password')?.addEventListener('click', async () => {
    const locationId = Number(element('sftp-location').value);
    if (!window.confirm('Сгенерировать новый пароль SFTP для этой точки?')) return;
    try {
      const result = await api.post(`${API.locations}/${locationId}/sftp-password`);
      setSftpCredentials(result.credentials);
      await loadNotifications();
    } catch (error) { setMessage('sftp-message', error.message); }
  });
  element('sftp-unbind')?.addEventListener('click', async () => {
    const locationId = Number(element('sftp-location').value);
    if (!window.confirm('Отключить SFTP-доступ выбранной точки?')) return;
    try {
      await api.delete(`${API.locations}/${locationId}/sftp-binding`);
      setSftpCredentials(null);
      await Promise.all([loadLocations(), loadSftpDirectories(), loadNotifications()]);
    } catch (error) { setMessage('sftp-message', error.message); }
  });
}
