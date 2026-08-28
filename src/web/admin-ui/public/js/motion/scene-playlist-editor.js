import { ScenePlaylistRuntime, normaliseScenePlaylist } from './scene-playlist-runtime.js';

const TYPE_LABELS = Object.freeze({ promo: 'PromoScene', content: 'ContentScene', 'object-story': 'Object Story' });
const MODE_LABELS = Object.freeze({ overlay: 'Overlay', split: 'Split', fullscreen: 'Fullscreen' });

function sceneSeed(type, index) {
  const sequence = index + 1;
  if (type === 'content') {
    return { id: `content-${sequence}`, type, enabled: true, mode: 'overlay', duration_seconds: 10, title: 'Информация', body: 'Добавьте текст ContentScene.' };
  }
  if (type === 'object-story') {
    return { id: `object-story-${sequence}`, type, enabled: true, mode: 'split', duration_seconds: 10, title: 'История объекта', body: 'Используется текущий Entity выбранного пресета.' };
  }
  return { id: `promo-${sequence}`, type: 'promo', enabled: true, mode: 'overlay', duration_seconds: 8, title: 'Специальное предложение', body: 'Добавьте текст PromoScene.' };
}

function uniqueId(type, scenes) {
  let index = scenes.length;
  let candidate;
  do {
    candidate = sceneSeed(type, index).id;
    index += 1;
  } while (scenes.some((scene) => scene.id === candidate));
  return candidate;
}

function button(text, className = 'button button-secondary') {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}

function field(label, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const title = document.createElement('span');
  title.textContent = label;
  wrapper.append(title, control);
  return wrapper;
}

export class ScenePlaylistEditor {
  constructor({ stage, getEntity = () => null } = {}) {
    this.stage = stage;
    this.getEntity = getEntity;
    this.runtime = new ScenePlaylistRuntime();
    this.playlist = normaliseScenePlaylist();
    this.root = null;
    this.list = null;
    this.enabled = null;
    this.menuDuration = null;
    this.menuDurationOutput = null;
  }

  destroy() {
    this.runtime.destroy();
    this.root?.remove();
    this.root = null;
  }

  mount(container) {
    if (!(container instanceof Element)) return;
    if (this.root?.isConnected) return;
    const root = document.createElement('section');
    root.className = 'settings-card animation-scene-playlist-card';
    root.setAttribute('aria-label', 'Scene Playlist');
    root.innerHTML = `
      <div class="card-heading"><div><p class="eyebrow">SCENE PLAYLIST</p><h2>Сценарий показа</h2><p>MenuScene остаётся базой. PromoScene, ContentScene и Object Story временно используют только Content/FX и атомарно возвращают меню.</p></div></div>
      <div class="animation-scene-playlist-toolbar"></div>
      <div class="animation-scene-playlist-add" aria-label="Добавить сцену"></div>
      <div class="animation-scene-playlist-list" data-scene-playlist-list></div>`;

    const toolbar = root.querySelector('.animation-scene-playlist-toolbar');
    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'animation-entity-visible';
    this.enabled = document.createElement('input');
    this.enabled.type = 'checkbox';
    this.enabled.id = 'animation-scene-playlist-enabled';
    enabledLabel.append(this.enabled, Object.assign(document.createElement('span'), { textContent: 'Включить Scene Playlist' }));

    this.menuDuration = document.createElement('input');
    this.menuDuration.type = 'range';
    this.menuDuration.min = '5';
    this.menuDuration.max = '300';
    this.menuDuration.step = '5';
    this.menuDuration.id = 'animation-scene-menu-duration';
    this.menuDurationOutput = document.createElement('output');
    this.menuDurationOutput.id = 'animation-scene-menu-duration-output';
    const durationWrap = document.createElement('div');
    durationWrap.className = 'animation-scene-duration-control';
    durationWrap.append(this.menuDuration, this.menuDurationOutput);
    const durationField = field('MenuScene между сценами', durationWrap);
    toolbar.append(enabledLabel, durationField);

    const add = root.querySelector('.animation-scene-playlist-add');
    for (const type of ['promo', 'content', 'object-story']) {
      const control = button(`+ ${TYPE_LABELS[type]}`);
      control.dataset.addScene = type;
      control.addEventListener('click', () => this.addScene(type));
      add.append(control);
    }
    const menu = button('Вернуть MenuScene');
    menu.addEventListener('click', () => this.runtime.resume());
    add.append(menu);

    this.list = root.querySelector('[data-scene-playlist-list]');
    this.enabled.addEventListener('change', () => this.patchPlaylist({ enabled: this.enabled.checked }));
    this.menuDuration.addEventListener('input', () => {
      const seconds = Number(this.menuDuration.value);
      this.menuDurationOutput.textContent = `${seconds} с`;
      this.patchPlaylist({ menu_duration_seconds: seconds });
    });

    container.prepend(root);
    this.root = root;
    this.renderControls();
    this.rebindPreview();
  }

  value() {
    return normaliseScenePlaylist(this.playlist);
  }

  set(value) {
    this.playlist = normaliseScenePlaylist(value);
    this.renderControls();
    this.rebindPreview();
  }

  patchPlaylist(patch) {
    this.playlist = normaliseScenePlaylist({ ...this.playlist, ...patch });
    this.renderSummary();
    this.rebindPreview();
  }

  addScene(type) {
    const scenes = [...this.playlist.scenes];
    const next = sceneSeed(type, scenes.length);
    next.id = uniqueId(type, scenes);
    scenes.push(next);
    this.playlist = normaliseScenePlaylist({ ...this.playlist, enabled: true, scenes });
    this.renderControls();
    this.previewScene(scenes.length - 1);
  }

  updateScene(index, patch, { rerender = false } = {}) {
    const scenes = this.playlist.scenes.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, ...patch } : scene);
    this.playlist = normaliseScenePlaylist({ ...this.playlist, scenes });
    if (rerender) this.renderControls();
    else this.renderSummary();
  }

  moveScene(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= this.playlist.scenes.length) return;
    const scenes = [...this.playlist.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    this.playlist = normaliseScenePlaylist({ ...this.playlist, scenes });
    this.renderControls();
  }

  removeScene(index) {
    const scenes = this.playlist.scenes.filter((_scene, sceneIndex) => sceneIndex !== index);
    this.playlist = normaliseScenePlaylist({ ...this.playlist, enabled: scenes.length ? this.playlist.enabled : false, scenes });
    this.renderControls();
    this.rebindPreview();
  }

  renderSummary() {
    if (this.enabled) this.enabled.checked = this.playlist.enabled;
    if (this.menuDuration) this.menuDuration.value = String(this.playlist.menu_duration_seconds);
    if (this.menuDurationOutput) this.menuDurationOutput.textContent = `${this.playlist.menu_duration_seconds} с`;
  }

  renderControls() {
    this.renderSummary();
    if (!this.list) return;
    this.list.replaceChildren();
    if (!this.playlist.scenes.length) {
      const empty = document.createElement('p');
      empty.className = 'animation-scene-playlist-empty';
      empty.textContent = 'В плейлисте пока нет временных сцен. MenuScene работает постоянно.';
      this.list.append(empty);
      return;
    }

    this.playlist.scenes.forEach((scene, index) => {
      const item = document.createElement('article');
      item.className = 'animation-scene-playlist-item';
      item.dataset.sceneId = scene.id;

      const head = document.createElement('div');
      head.className = 'animation-scene-playlist-item-head';
      const identity = document.createElement('div');
      identity.innerHTML = `<strong>${TYPE_LABELS[scene.type]}</strong><small>${scene.id}</small>`;
      const actions = document.createElement('div');
      actions.className = 'animation-scene-playlist-item-actions';
      const preview = button('Preview');
      preview.addEventListener('click', () => this.previewScene(index));
      const up = button('↑');
      up.disabled = index === 0;
      up.addEventListener('click', () => this.moveScene(index, -1));
      const down = button('↓');
      down.disabled = index === this.playlist.scenes.length - 1;
      down.addEventListener('click', () => this.moveScene(index, 1));
      const remove = button('Удалить');
      remove.addEventListener('click', () => this.removeScene(index));
      actions.append(preview, up, down, remove);
      head.append(identity, actions);

      const grid = document.createElement('div');
      grid.className = 'animation-scene-playlist-grid';
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = scene.enabled;
      const enabledLabel = document.createElement('label');
      enabledLabel.className = 'animation-entity-visible';
      enabledLabel.append(enabled, Object.assign(document.createElement('span'), { textContent: 'Активна' }));
      enabled.addEventListener('change', () => this.updateScene(index, { enabled: enabled.checked }));

      const mode = document.createElement('select');
      for (const value of ['overlay', 'split', 'fullscreen']) mode.add(new Option(MODE_LABELS[value], value));
      mode.value = scene.mode;
      mode.addEventListener('change', () => this.updateScene(index, { mode: mode.value }));

      const duration = document.createElement('input');
      duration.type = 'number';
      duration.min = '2';
      duration.max = '120';
      duration.step = '1';
      duration.value = String(scene.duration_seconds);
      duration.addEventListener('input', () => this.updateScene(index, { duration_seconds: Number(duration.value) }));

      const title = document.createElement('input');
      title.type = 'text';
      title.maxLength = 100;
      title.value = scene.title;
      title.placeholder = TYPE_LABELS[scene.type];
      title.addEventListener('input', () => this.updateScene(index, { title: title.value }));

      const body = document.createElement('textarea');
      body.rows = 3;
      body.maxLength = 500;
      body.value = scene.body;
      body.placeholder = 'Текст сцены';
      body.addEventListener('input', () => this.updateScene(index, { body: body.value }));

      grid.append(enabledLabel, field('Режим', mode), field('Длительность, с', duration), field('Заголовок', title), field('Текст', body));
      item.append(head, grid);
      this.list.append(item);
    });
  }

  previewLayers() {
    if (!(this.stage instanceof Element)) return null;
    const menuLayer = this.stage.querySelector('[data-scene-menu-layer]');
    const contentLayer = this.stage.querySelector('[data-scene-content-layer]');
    const fxLayer = this.stage.querySelector('[data-scene-fx-layer]');
    if (!(menuLayer instanceof HTMLElement) || !(contentLayer instanceof HTMLElement) || !(fxLayer instanceof HTMLElement)) return null;
    return { menuLayer, contentLayer, fxLayer };
  }

  rebindPreview({ autoplay = true } = {}) {
    const layers = this.previewLayers();
    if (!layers) return;
    this.runtime.render(this.playlist, { ...layers, entity: this.getEntity(), autoplay });
  }

  previewScene(index) {
    const scene = this.playlist.scenes[index];
    if (!scene) return;
    this.rebindPreview({ autoplay: false });
    this.runtime.preview(scene);
  }
}
