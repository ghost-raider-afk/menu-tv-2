import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { ANIMATION_PRESETS, DEFAULT_PRESET_ID, PRESET_BY_ID, profileForPreset } from '../motion/presets.js';
import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { renderAnimationScreenEmpty, renderAnimationScreenPreview } from '../motion/screen-preview.js';

const CONTROL_IDS = Object.freeze([
  'animation-pattern', 'animation-flow-direction', 'animation-easing', 'animation-cycle',
  'animation-event-duration', 'animation-wave-stagger', 'animation-travel', 'animation-scale-amount',
  'animation-brightness', 'animation-section-effect', 'animation-item-effect', 'animation-price-effect',
  'animation-background-effect', 'animation-background-zoom', 'animation-intensity'
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
    motion_version: 2,
    pattern: value('animation-pattern'),
    flow_direction: value('animation-flow-direction'),
    easing: value('animation-easing'),
    cycle_seconds: number('animation-cycle'),
    event_duration_ms: number('animation-event-duration'),
    wave_stagger_ms: number('animation-wave-stagger'),
    travel_px: number('animation-travel'),
    scale_amount: number('animation-scale-amount'),
    brightness_amount: number('animation-brightness'),
    section_effect: value('animation-section-effect'),
    item_effect: value('animation-item-effect'),
    price_effect: value('animation-price-effect'),
    background_effect: value('animation-background-effect'),
    background_zoom_percent: number('animation-background-zoom'),
    intensity: number('animation-intensity')
  };
}

function setValue(id, value) {
  const node = element(id);
  if (!node) return;
  node.value = String(value);
}

function populateProfile(profile) {
  setValue('animation-pattern', profile.pattern);
  setValue('animation-flow-direction', profile.flow_direction);
  setValue('animation-easing', profile.easing);
  setValue('animation-cycle', profile.cycle_seconds);
  setValue('animation-event-duration', profile.event_duration_ms);
  setValue('animation-wave-stagger', profile.wave_stagger_ms);
  setValue('animation-travel', profile.travel_px);
  setValue('animation-scale-amount', profile.scale_amount);
  setValue('animation-brightness', profile.brightness_amount);
  setValue('animation-section-effect', profile.section_effect);
  setValue('animation-item-effect', profile.item_effect);
  setValue('animation-price-effect', profile.price_effect);
  setValue('animation-background-effect', profile.background_effect);
  setValue('animation-background-zoom', profile.background_zoom_percent);
  setValue('animation-intensity', profile.intensity);
  updateIntensityOutput();
}

function presetName(id) {
  return PRESET_BY_ID.get(id)?.name || 'Пользовательский профиль';
}

function updatePresetSelection() {
  document.querySelectorAll('[data-animation-preset]').forEach((node) => {
    const active = node.dataset.animationPreset === currentPresetId;
    node.classList.toggle('active', active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
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
    player?.restart(collectProfile());
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
  const profile = { ...base, ...(settings?.profile || {}), motion_version: 2 };
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
    setMessage('animation-message', 'Профиль постоянной анимации сохранён.', 'success');
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
