import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { SceneEntityEditor, normaliseSceneEntity } from '../motion/entity-editor.js';
import { normaliseAnnouncement, renderAnnouncementLayer } from '../motion/announcement.js';
import { renderAnimationScreenEmpty, renderAnimationScreenPreview } from '../motion/screen-preview.js';

const PROFILE_ID = 'single-promo-focus';
const PROFILE_BASE = Object.freeze({
  motion_version: 2,
  pattern: 'ambient',
  flow_direction: 'none',
  easing: 'smooth',
  cycle_seconds: 11,
  event_duration_ms: 1500,
  wave_stagger_ms: 0,
  travel_px: 0,
  scale_amount: 0.045,
  brightness_amount: 0.18,
  section_effect: 'none',
  item_effect: 'none',
  promotion_effect: 'pulse',
  price_effect: 'none',
  background_effect: 'none',
  background_zoom_percent: 0,
  intensity: 45
});

let currentEntity = normaliseSceneEntity();
let currentAnnouncement = normaliseAnnouncement();
let player = null;
let entityEditor = null;
let previewFrame = null;
let screenLoadSequence = 0;

function number(id) { return Number(element(id)?.value ?? 0); }
function checked(id) { return element(id)?.checked === true; }
function value(id) { return element(id)?.value || ''; }
function setValue(id, next) { const node = element(id); if (node) node.value = String(next); }

function collectProfile() {
  return { ...PROFILE_BASE, intensity: Math.max(0, Math.min(100, Math.round(number('animation-intensity')))) };
}

function populateProfile(profile = {}) {
  setValue('animation-intensity', Number.isFinite(Number(profile.intensity)) ? profile.intensity : PROFILE_BASE.intensity);
  updateIntensityOutput();
}

function updateIntensityOutput() {
  const output = element('animation-intensity-output');
  if (output) output.textContent = `${Math.round(number('animation-intensity'))}%`;
}

function announcementFromControls() {
  return normaliseAnnouncement({
    enabled: checked('animation-announcement-enabled'),
    text: value('animation-announcement-text'),
    position: value('animation-announcement-position'),
    speed_px_per_second: number('animation-announcement-speed'),
    font_size: number('animation-announcement-font-size'),
    text_color: value('animation-announcement-text-color'),
    background_color: value('animation-announcement-background-color'),
    background_opacity: number('animation-announcement-opacity')
  });
}

function syncAnnouncementControls(announcement = currentAnnouncement) {
  const current = normaliseAnnouncement(announcement);
  const enabled = element('animation-announcement-enabled');
  if (enabled) enabled.checked = current.enabled;
  setValue('animation-announcement-text', current.text);
  setValue('animation-announcement-position', current.position);
  setValue('animation-announcement-speed', current.speed_px_per_second);
  setValue('animation-announcement-font-size', current.font_size);
  setValue('animation-announcement-text-color', current.text_color);
  setValue('animation-announcement-background-color', current.background_color);
  setValue('animation-announcement-opacity', current.background_opacity);
  const speed = element('animation-announcement-speed-output');
  const font = element('animation-announcement-font-output');
  const opacity = element('animation-announcement-opacity-output');
  if (speed) speed.textContent = `${Math.round(current.speed_px_per_second)} px/с`;
  if (font) font.textContent = `${Math.round(current.font_size)} px`;
  if (opacity) opacity.textContent = `${Math.round(current.background_opacity * 100)}%`;
}

function renderAnnouncementPreview() {
  const layer = element('animation-stage')?.querySelector('[data-announcement-layer]');
  if (layer) renderAnnouncementLayer(layer, currentAnnouncement);
}

function restartPreview() {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    entityEditor?.render();
    renderAnnouncementPreview();
    player?.restart(collectProfile(), currentEntity);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) player?.pause();
  });
}

function bindProfileControls() {
  element('animation-intensity')?.addEventListener('input', () => {
    updateIntensityOutput();
    restartPreview();
  });
}

function bindAnnouncementControls() {
  const ids = [
    'animation-announcement-enabled', 'animation-announcement-text', 'animation-announcement-position',
    'animation-announcement-speed', 'animation-announcement-font-size', 'animation-announcement-text-color',
    'animation-announcement-background-color', 'animation-announcement-opacity'
  ];
  ids.forEach((id) => {
    const node = element(id);
    if (!node) return;
    const eventName = node instanceof HTMLInputElement && (node.type === 'range' || node.type === 'color') ? 'input' : node instanceof HTMLTextAreaElement ? 'input' : 'change';
    node.addEventListener(eventName, () => {
      currentAnnouncement = announcementFromControls();
      syncAnnouncementControls(currentAnnouncement);
      renderAnnouncementPreview();
    });
  });
}

function entityHeight(entity) {
  const ratio = entity.asset_width > 0 && entity.asset_height > 0 ? entity.asset_height / entity.asset_width : 1;
  return entity.transform.width * ratio * entity.transform.scale;
}

function syncEntityControls(entity = currentEntity) {
  const current = normaliseSceneEntity(entity);
  setValue('animation-entity-name', current.name);
  const visible = element('animation-entity-visible');
  if (visible) visible.checked = current.visible;
  setValue('animation-entity-x', Math.round(current.transform.x));
  setValue('animation-entity-y', Math.round(current.transform.y));
  setValue('animation-entity-width', Math.round(current.transform.width));
  setValue('animation-entity-rotation', current.transform.rotation);
  setValue('animation-entity-scale', current.transform.scale);
  setValue('animation-entity-depth', current.transform.depth);
  setValue('animation-entity-opacity', current.transform.opacity);
  const scale = element('animation-entity-scale-output');
  const depth = element('animation-entity-depth-output');
  const opacity = element('animation-entity-opacity-output');
  if (scale) scale.textContent = `${current.transform.scale.toFixed(2)}×`;
  if (depth) depth.textContent = String(current.transform.depth);
  if (opacity) opacity.textContent = `${Math.round(current.transform.opacity * 100)}%`;

  const thumbnail = element('animation-entity-thumbnail');
  if (thumbnail) {
    thumbnail.replaceChildren();
    if (current.asset_url) {
      const image = document.createElement('img');
      image.src = current.asset_url;
      image.alt = current.name;
      thumbnail.append(image);
    } else {
      thumbnail.append(Object.assign(document.createElement('span'), { textContent: 'PNG / WebP' }));
    }
  }
}

function applyEntity(entity) {
  currentEntity = normaliseSceneEntity(entity);
  syncEntityControls(currentEntity);
  entityEditor?.setEntity(currentEntity);
  restartPreview();
}

function patchEntity(patch) {
  currentEntity = normaliseSceneEntity({
    ...currentEntity,
    ...patch,
    transform: { ...currentEntity.transform, ...(patch.transform || {}) }
  });
  syncEntityControls(currentEntity);
  entityEditor?.setEntity(currentEntity);
  restartPreview();
}

async function uploadEntityAsset(file) {
  if (!(file instanceof Blob) || !['image/png', 'image/webp'].includes(file.type)) {
    setMessage('animation-message', 'Для объекта поддерживаются только PNG и WebP.', 'error');
    return;
  }
  const button = element('animation-entity-upload');
  setPending(button, true, 'Загружаем…');
  try {
    const saved = await api.put(API.animationEntityAsset, file, { headers: { 'Content-Type': file.type } });
    applyEntity(saved.entity);
    setMessage('animation-message', 'Изображение объекта загружено. Разместите его и сохраните настройки.', 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  } finally {
    setPending(button, false, 'Загружаем…');
  }
}

function alignEntity(mode) {
  const entity = normaliseSceneEntity(currentEntity);
  const width = entity.transform.width * entity.transform.scale;
  const height = entityHeight(entity);
  const margin = 48;
  const transform = {};
  if (mode === 'left') transform.x = margin;
  if (mode === 'center') transform.x = (1920 - width) / 2;
  if (mode === 'right') transform.x = 1920 - width - margin;
  if (mode === 'top') transform.y = margin;
  if (mode === 'middle') transform.y = (1080 - height) / 2;
  if (mode === 'bottom') transform.y = 1080 - height - margin;
  patchEntity({ transform });
}

function bindEntityControls() {
  element('animation-entity-upload')?.addEventListener('click', () => element('animation-entity-file')?.click());
  element('animation-entity-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) void uploadEntityAsset(file);
    event.target.value = '';
  });
  element('animation-entity-name')?.addEventListener('input', () => patchEntity({ name: value('animation-entity-name') || 'Бокал пива' }));
  element('animation-entity-visible')?.addEventListener('change', () => patchEntity({ visible: checked('animation-entity-visible') }));
  const transformControls = {
    'animation-entity-x': 'x',
    'animation-entity-y': 'y',
    'animation-entity-width': 'width',
    'animation-entity-rotation': 'rotation',
    'animation-entity-scale': 'scale',
    'animation-entity-depth': 'depth',
    'animation-entity-opacity': 'opacity'
  };
  Object.entries(transformControls).forEach(([id, key]) => {
    element(id)?.addEventListener('input', () => patchEntity({ transform: { [key]: number(id) } }));
  });
  document.querySelectorAll('[data-entity-align]').forEach((button) => button.addEventListener('click', () => alignEntity(button.dataset.entityAlign)));
  element('animation-entity-reset')?.addEventListener('click', () => patchEntity({ transform: { x: 1580, y: 420, width: 280, scale: 1, rotation: 0, depth: 10, opacity: 1 } }));
}

function screenLabel(screen) {
  return `${screen.location_name || 'Без точки'} — ${screen.name}`;
}

function setScreenStatus(text) {
  const node = element('animation-screen-status');
  if (node) node.textContent = text;
}

function screenFromUrl(screens) {
  const candidate = Number(new URL(window.location.href).searchParams.get('screen'));
  return screens.find((screen) => Number(screen.id) === candidate) || screens[0] || null;
}

function rememberSelectedScreen(screenId) {
  const url = new URL(window.location.href);
  url.searchParams.set('screen', String(screenId));
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

async function loadScreenPreview(screenId) {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !screenId) return;
  const sequence = ++screenLoadSequence;
  if (select) select.disabled = true;
  setScreenStatus('Загружаем сохранённый экран…');
  try {
    const bundle = await api.get(`${API.screens}/${screenId}/editor`);
    if (sequence !== screenLoadSequence) return;
    renderAnimationScreenPreview(stage, bundle);
    entityEditor?.render();
    renderAnnouncementPreview();
    setScreenStatus(`${bundle.screen.location_name || 'Без точки'} · ${bundle.screen.name} · ${bundle.screen.resolution}`);
    restartPreview();
  } catch (error) {
    if (sequence !== screenLoadSequence) return;
    renderAnimationScreenEmpty(stage, 'Не удалось загрузить выбранный монитор.');
    setScreenStatus(error.message);
  } finally {
    if (sequence === screenLoadSequence && select) select.disabled = false;
  }
}

async function loadScreenOptions() {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !(select instanceof HTMLSelectElement)) return;
  const screens = await api.get(API.screens);
  if (!Array.isArray(screens) || screens.length === 0) {
    select.innerHTML = '<option value="">Нет мониторов</option>';
    select.disabled = true;
    renderAnimationScreenEmpty(stage);
    setScreenStatus('В проекте пока нет мониторов.');
    player?.destroy();
    return;
  }
  select.innerHTML = screens.map((screen) => `<option value="${screen.id}">${screenLabel(screen)}</option>`).join('');
  const selected = screenFromUrl(screens);
  select.value = String(selected.id);
  select.addEventListener('change', () => {
    const id = Number(select.value);
    if (!id) return;
    rememberSelectedScreen(id);
    void loadScreenPreview(id);
  });
  await loadScreenPreview(selected.id);
}

async function loadSettings() {
  const settings = await api.get(API.animationSettings);
  const enabled = element('animation-enabled');
  if (enabled) enabled.checked = settings?.enabled === true;
  populateProfile(settings?.profile || PROFILE_BASE);
  currentAnnouncement = normaliseAnnouncement(settings?.announcement);
  syncAnnouncementControls(currentAnnouncement);
  applyEntity(settings?.entity);
  renderAnnouncementPreview();
  restartPreview();
}

async function saveSettings() {
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    currentAnnouncement = announcementFromControls();
    const saved = await api.put(API.animationSettings, {
      enabled: checked('animation-enabled'),
      preset_id: PROFILE_ID,
      profile: collectProfile(),
      entity: currentEntity,
      announcement: currentAnnouncement
    });
    populateProfile(saved.profile);
    currentAnnouncement = normaliseAnnouncement(saved.announcement);
    syncAnnouncementControls(currentAnnouncement);
    applyEntity(saved.entity);
    renderAnnouncementPreview();
    setMessage('animation-message', 'Настройки анимации сохранены.', 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  } finally {
    setPending(button, false, 'Сохраняем…');
  }
}

export function initialiseAnimationStudio() {
  const stage = element('animation-stage');
  if (!stage) return;
  player?.destroy();
  entityEditor?.destroy();
  player = new AnimationPreviewPlayer({
    stage,
    timeline: element('animation-timeline'),
    timeLabel: element('animation-time'),
    playButton: element('animation-play'),
    pauseButton: element('animation-pause'),
    replayButton: element('animation-replay')
  });
  entityEditor = new SceneEntityEditor({
    stage,
    onChange(entity) {
      currentEntity = entity;
      syncEntityControls(entity);
    },
    onCommit() {
      restartPreview();
    }
  });
  bindProfileControls();
  bindAnnouncementControls();
  bindEntityControls();
  syncEntityControls();
  syncAnnouncementControls();
  element('animation-save')?.addEventListener('click', () => { void saveSettings(); });
  void Promise.all([loadSettings(), loadScreenOptions()]).catch((error) => setMessage('animation-message', error.message));
}
