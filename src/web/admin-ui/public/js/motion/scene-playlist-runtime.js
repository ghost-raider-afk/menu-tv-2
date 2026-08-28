const SCENE_TYPES = Object.freeze(['promo', 'content', 'object-story']);
const SCENE_MODES = Object.freeze(['overlay', 'split', 'fullscreen']);

export const DEFAULT_SCENE_PLAYLIST = Object.freeze({ enabled: false, menu_duration_seconds: 40, scenes: Object.freeze([]) });

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function ensurePlaylistFxHost(layer) {
  let host = layer.querySelector(':scope > [data-scene-playlist-fx-host]');
  if (!(host instanceof HTMLElement)) {
    host = document.createElement('div');
    host.className = 'scene-playlist-fx-host';
    host.dataset.scenePlaylistFxHost = '';
    layer.append(host);
  }
  return host;
}

export function normaliseScenePlaylist(value = {}) {
  const source = sourceObject(value);
  const scenes = Array.isArray(source.scenes) ? source.scenes.slice(0, 20) : [];
  return {
    enabled: source.enabled === true && scenes.length > 0,
    menu_duration_seconds: clamp(source.menu_duration_seconds, 40, 5, 300),
    scenes: scenes.map((item, index) => {
      const scene = sourceObject(item);
      return {
        id: /^[a-z0-9-]{1,64}$/.test(String(scene.id || '')) ? String(scene.id) : `scene-${index + 1}`,
        type: SCENE_TYPES.includes(scene.type) ? scene.type : 'promo',
        enabled: scene.enabled !== false,
        mode: SCENE_MODES.includes(scene.mode) ? scene.mode : 'overlay',
        duration_seconds: clamp(scene.duration_seconds, 8, 2, 120),
        title: String(scene.title || '').trim().slice(0, 100),
        body: String(scene.body || '').trim().slice(0, 500)
      };
    })
  };
}

function typeLabel(type) {
  if (type === 'promo') return 'PROMO SCENE';
  if (type === 'object-story') return 'OBJECT STORY';
  return 'CONTENT SCENE';
}

function entityMedia(entity) {
  const source = sourceObject(entity);
  const url = String(source.asset_url || '').trim();
  if (!url) return null;
  if (source.asset_type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.loop = source.loop !== false;
    video.muted = source.muted !== false;
    video.playsInline = true;
    video.playbackRate = clamp(source.playback_rate, 1, 0.25, 4);
    video.setAttribute('aria-hidden', 'true');
    return video;
  }
  const image = document.createElement('img');
  image.src = url;
  image.alt = '';
  image.decoding = 'async';
  return image;
}

function buildSceneContent(scene, entity) {
  const root = document.createElement('div');
  root.className = `scene-playlist-content scene-type-${scene.type} scene-mode-${scene.mode}`;
  root.dataset.scenePlaylistId = scene.id;
  root.setAttribute('aria-label', scene.title || typeLabel(scene.type));

  const card = document.createElement('div');
  card.className = 'scene-playlist-card';
  const copy = document.createElement('div');
  copy.className = 'scene-playlist-copy';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'scene-playlist-eyebrow';
  eyebrow.textContent = typeLabel(scene.type);
  copy.append(eyebrow);

  if (scene.title) {
    const title = document.createElement('h1');
    title.className = 'scene-playlist-title';
    title.textContent = scene.title;
    copy.append(title);
  }
  if (scene.body) {
    const body = document.createElement('p');
    body.className = 'scene-playlist-body';
    body.textContent = scene.body;
    copy.append(body);
  }

  if (scene.type === 'object-story') {
    const media = entityMedia(entity);
    if (media) {
      const shell = document.createElement('div');
      shell.className = 'scene-playlist-object-media';
      shell.append(media);
      card.append(shell);
    }
  }
  card.append(copy);
  root.append(card);
  return root;
}

function buildSceneFx(scene) {
  const fx = document.createElement('div');
  fx.className = `scene-playlist-fx scene-type-${scene.type} scene-mode-${scene.mode}`;
  fx.setAttribute('aria-hidden', 'true');
  return fx;
}

function animateEntrance(node, mode) {
  if (!(node instanceof Element) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const x = mode === 'split' ? '3.5%' : '0';
  node.animate(
    [{ opacity: 0, transform: `translate3d(${x},2.5%,0) scale(.985)` }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }],
    { duration: 520, easing: 'cubic-bezier(.2,.72,.22,1)', fill: 'both' }
  );
}

export class ScenePlaylistRuntime {
  constructor() {
    this.timer = null;
    this.generation = 0;
    this.playlist = DEFAULT_SCENE_PLAYLIST;
    this.layers = null;
    this.entity = null;
    this.sceneIndex = 0;
  }

  destroy() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.showMenu();
    this.layers = null;
  }

  render(value, { menuLayer, contentLayer, fxLayer, entity = null, autoplay = true } = {}) {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.playlist = normaliseScenePlaylist(value);
    this.layers = { menuLayer, contentLayer, fxLayer };
    this.entity = entity;
    this.sceneIndex = 0;
    this.showMenu();
    if (!autoplay || !this.playlist.enabled || !this.activeScenes().length) return this.playlist;
    this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
    return this.playlist;
  }

  activeScenes() {
    return this.playlist.scenes.filter((scene) => scene.enabled);
  }

  preview(scene) {
    const value = sourceObject(scene);
    const normalised = normaliseScenePlaylist({ enabled: true, scenes: [value] }).scenes[0];
    if (!normalised || !this.layers) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.showScene(normalised, false);
  }

  resume() {
    if (!this.layers) return;
    this.sceneIndex = 0;
    this.showMenu();
    if (this.playlist.enabled && this.activeScenes().length) this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
  }

  scheduleMenu(delay) {
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      const scenes = this.activeScenes();
      if (!scenes.length) return this.showMenu();
      const scene = scenes[this.sceneIndex % scenes.length];
      this.showScene(scene, true);
    }, Math.max(0, delay));
  }

  showScene(scene, scheduleReturn) {
    try {
      const { menuLayer, contentLayer, fxLayer } = this.layers || {};
      if (!(contentLayer instanceof Element) || !(fxLayer instanceof Element)) return this.showMenu();
      const fxHost = ensurePlaylistFxHost(fxLayer);
      contentLayer.replaceChildren(buildSceneContent(scene, this.entity));
      fxHost.replaceChildren(buildSceneFx(scene));
      contentLayer.dataset.scenePlaylistMode = scene.mode;
      fxHost.dataset.scenePlaylistMode = scene.mode;
      if (menuLayer instanceof HTMLElement) menuLayer.classList.toggle('scene-menu-suppressed', scene.mode === 'fullscreen');
      animateEntrance(contentLayer.firstElementChild, scene.mode);
      animateEntrance(fxHost.firstElementChild, scene.mode);
      if (!scheduleReturn) return;
      const generation = this.generation;
      this.timer = setTimeout(() => {
        if (generation !== this.generation) return;
        this.sceneIndex += 1;
        this.showMenu();
        this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
      }, scene.duration_seconds * 1000);
    } catch (error) {
      console.error('Scene Playlist could not render scene', error);
      this.showMenu();
      if (scheduleReturn) this.scheduleMenu(this.playlist.menu_duration_seconds * 1000);
    }
  }

  showMenu() {
    const { menuLayer, contentLayer, fxLayer } = this.layers || {};
    if (menuLayer instanceof HTMLElement) menuLayer.classList.remove('scene-menu-suppressed');
    if (contentLayer instanceof Element) {
      contentLayer.replaceChildren();
      delete contentLayer.dataset.scenePlaylistMode;
    }
    if (fxLayer instanceof Element) {
      const fxHost = fxLayer.querySelector(':scope > [data-scene-playlist-fx-host]');
      fxHost?.replaceChildren();
      if (fxHost instanceof HTMLElement) delete fxHost.dataset.scenePlaylistMode;
    }
  }
}
