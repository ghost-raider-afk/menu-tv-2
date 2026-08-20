import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { ANIMATION_PRESETS, DEFAULT_PRESET_ID, PRESET_BY_ID, profileForPreset } from '../motion/presets.js';
import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { renderAnimationScreenEmpty, renderAnimationScreenPreview } from '../motion/screen-preview.js';

const CONTROL_IDS = Object.freeze([
  'animation-entrance', 'animation-direction', 'animation-easing', 'animation-distance', 'animation-scale',
  'animation-blur', 'animation-opacity', 'animation-duration', 'animation-stagger', 'animation-section-delay',
  'animation-item-delay', 'animation-price-delay', 'animation-hold', 'animation-section-emphasis',
  'animation-price-emphasis', 'animation-shimmer', 'animation-glow', 'animation-background-motion',
  'animation-ambient-speed', 'animation-intensity'
]);

let currentPresetId = DEFAULT_PRESET_ID;
let player = null;
let previewFrame = null;
let screenLoadSequence = 0;

function number(id) {
  return Number(element(id)?.value ?? 0);
}

function checked(id) {
  return element(id)?.checked === true;
}

function value(id) {
  return element(id)?.value || '';
}

function collectProfile() {
  return {
    entrance: value('animation-entrance'),
    direction: value('animation-direction'),
    easing: value('animation-easing'),
    duration_ms: number('animation-duration'),
    stagger_ms: number('animation-stagger'),
    distance_px: number('animation-distance'),
    scale_from: number('animation-scale'),
    opacity_from: number('animation-opacity'),
    blur_px: number('animation-blur'),
    section_delay_ms: number('animation-section-delay'),
    item_delay_ms: number('animation-item-delay'),
    price_delay_ms: number('animation-price-delay'),
    section_emphasis: value('animation-section-emphasis'),
    price_emphasis: value('animation-price-emphasis'),
    shimmer: checked('animation-shimmer'),
    glow: checked('animation-glow'),
    background_motion: checked('animation-background-motion'),
    ambient_speed_seconds: number('animation-ambient-speed'),
    intensity: number('animation-intensity'),
    hold_seconds: number('animation-hold')
  };
}

function setValue(id, value) {
  const node = element(id);
  if (!node) return;
  if (node instanceof HTMLInputElement && node.type === 'checkbox') node.checked = value === true;
  else node.value = String(value);
}

function populateProfile(profile) {
  setValue('animation-entrance', profile.entrance);
  setValue('animation-direction', profile.direction);
  setValue('animation-easing', profile.easing);
  setValue('animation-duration', profile.duration_ms);
  setValue('animation-stagger', profile.stagger_ms);
  setValue('animation-distance', profile.distance_px);
  setValue('animation-scale', profile.scale_from);
  setValue('animation-opacity', profile.opacity_from);
  setValue('animation-blur', profile.blur_px);
  setValue('animation-section-delay', profile.section_delay_ms);
  setValue('animation-item-delay', profile.item_delay_ms);
  setValue('animation-price-delay', profile.price_delay_ms);
  setValue('animation-section-emphasis', profile.section_emphasis);
  setValue('animation-price-emphasis', profile.price_emphasis);
  setValue('animation-shimmer', profile.shimmer);
  setValue('animation-glow', profile.glow);
  setValue('animation-background-motion', profile.background_motion);
  setValue('animation-ambient-speed', profile.ambient_speed_seconds);
  setValue('animation-intensity', profile.intensity);
  setValue('animation-hold', profile.hold_seconds);
  updateIntensityOutput();
}

function presetName(id) {
  return PRESET_BY_ID.get(id)?.name || 'Пользовательский профиль';
}

function updatePresetSelection() {
  document.querySelectorAll('[data-animation-preset]').forEach((node) => {
    const active = node.dataset.animationPreset === currentPresetId;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-pressed', 'true');
    else node.setAttribute('aria-pressed', 'false');
  });
  const label = element('animation-current-preset');
  if (label) label.textContent = presetName(currentPresetId);
}

function updateIntensityOutput() {
  const output = element('animation-intensity-output');
  if (output) output.textContent = `${Math.round(number('animation-intensity'))}%`;
}

function restartPreview() {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    const profile = collectProfile();
    player?.restart(profile);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) player?.pause();
  });
}

function markCustom() {
  currentPresetId = 'custom';
  updatePresetSelection();
  updateIntensityOutput();
  restartPreview();
}

function renderPresets() {
  const root = element('animation-presets');
  if (!root) return;
  root.innerHTML = ANIMATION_PRESETS.map((preset, index) => `
    <button class="animation-preset-button" type="button" data-animation-preset="${preset.id}" aria-pressed="false">
      <span class="animation-preset-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="animation-preset-copy"><small>${preset.category}</small><strong>${preset.name}</strong><span>${preset.description}</span></span>
      <span class="animation-preset-arrow" aria-hidden="true">›</span>
    </button>`).join('');
  root.querySelectorAll('[data-animation-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.animationPreset;
      if (!PRESET_BY_ID.has(id)) return;
      currentPresetId = id;
      populateProfile(profileForPreset(id));
      updatePresetSelection();
      restartPreview();
    });
  });
}

function bindProfileControls() {
  CONTROL_IDS.forEach((id) => {
    const node = element(id);
    if (!node) return;
    const eventName = node instanceof HTMLInputElement && (node.type === 'range' || node.type === 'number') ? 'input' : 'change';
    node.addEventListener(eventName, markCustom);
  });
}

function screenLabel(screen) {
  const location = screen.location_name || 'Без точки';
  return `${location} — ${screen.name}`;
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
  currentPresetId = settings?.preset_id || DEFAULT_PRESET_ID;
  const base = PRESET_BY_ID.has(currentPresetId) ? profileForPreset(currentPresetId) : profileForPreset(DEFAULT_PRESET_ID);
  const profile = { ...base, ...(settings?.profile || {}) };
  const enabled = element('animation-enabled');
  if (enabled) enabled.checked = settings?.enabled === true;
  populateProfile(profile);
  updatePresetSelection();
  restartPreview();
}

async function saveSettings() {
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    const saved = await api.put(API.animationSettings, {
      enabled: checked('animation-enabled'),
      preset_id: currentPresetId,
      profile: collectProfile()
    });
    currentPresetId = saved.preset_id;
    populateProfile(saved.profile);
    updatePresetSelection();
    setMessage('animation-message', 'Профиль анимации сохранён.', 'success');
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
  player = new AnimationPreviewPlayer({
    stage,
    timeline: element('animation-timeline'),
    timeLabel: element('animation-time'),
    playButton: element('animation-play'),
    pauseButton: element('animation-pause'),
    replayButton: element('animation-replay')
  });
  renderPresets();
  bindProfileControls();
  element('animation-save')?.addEventListener('click', () => { void saveSettings(); });
  void Promise.all([loadSettings(), loadScreenOptions()]).catch((error) => setMessage('animation-message', error.message));
}
