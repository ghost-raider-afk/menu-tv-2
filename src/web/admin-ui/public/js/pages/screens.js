import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, makeButton, setMessage } from '../core/dom.js';

async function loadScreens() {
  const [locations, screens] = await Promise.all([api.get(API.locations), api.get(API.screens)]);
  state.locations = locations;
  state.screens = screens;
  renderScreens();
  return screens;
}

function renderScreens() {
  const list = document.querySelector('[data-screen-hierarchy]');
  const empty = document.querySelector('[data-screens-empty]');
  if (!list || !empty) return;
  const groups = state.locations.map((location) => {
    const group = document.createElement('article');
    group.className = 'screen-location-group';
    const header = document.createElement('header');
    header.className = 'screen-location-header';
    const title = document.createElement('div');
    title.className = 'screen-location-title';
    const heading = document.createElement('h2');
    heading.textContent = location.name;
    heading.title = location.name;
    const details = document.createElement('p');
    details.textContent = location.address || 'Адрес не указан';
    const add = makeButton('+ Добавить ТВ', '', () => void createScreenAtLocation(location));
    add.classList.add('screen-location-add');
    title.append(heading, details, add);
    header.append(title);
    const screens = state.screens.filter((screen) => screen.location_id === location.id);
    const items = document.createElement('div');
    items.className = 'screen-location-items';
    screens.forEach((screen) => {
      const row = document.createElement('div');
      row.className = 'screen-location-item';
      const link = document.createElement('a');
      link.href = `/screen-editor.html?id=${screen.id}`;
      const name = document.createElement('strong');
      name.textContent = screen.name;
      const info = document.createElement('span');
      const status = screen.status === 'published' ? 'опубликовано' : screen.status === 'ready' ? 'готово' : 'черновик';
      info.textContent = `${screen.resolution} · ${status}${screen.template_name ? ` · ${screen.template_name}` : ' · без шаблона'}`;
      link.append(name, info);
      row.append(link, makeButton('Удалить', 'danger', () => void deleteScreen(screen)));
      items.append(row);
    });
    if (screens.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'empty-state compact-empty';
      hint.textContent = 'Мониторов пока нет. Добавьте ТВ для этой точки.';
      items.append(hint);
    }
    group.append(header, items);
    return group;
  });
  list.replaceChildren(...groups);
  empty.classList.toggle('is-hidden', state.locations.length !== 0);
}

async function deleteScreen(screen) {
  if (!window.confirm(`Удалить монитор «${screen.name}»?`)) return;
  try {
    await api.delete(`${API.screens}/${screen.id}`);
    await loadScreens();
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

async function createScreenAtLocation(location) {
  try {
    const screen = await api.post(`${API.locations}/${location.id}/screens`);
    window.location.assign(`/screen-editor.html?id=${screen.id}`);
  } catch (error) {
    setMessage('screens-message', error.message);
  }
}

export function initialiseScreens() {
  if (!document.querySelector('[data-screen-hierarchy]')) return;
  void loadScreens().catch((error) => setMessage('screens-message', error.message));
  element('refresh-screens')?.addEventListener('click', () => { void loadScreens(); });
}
