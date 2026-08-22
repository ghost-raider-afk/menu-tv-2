import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { DEFAULT_PRESET_ID, profileForPreset } from '../motion/presets.js';
import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { renderAnimationScreenEmpty, renderAnimationScreenPreview } from '../motion/screen-preview.js';

const CONTROL_IDS = Object.freeze([
  'animation-pattern','animation-flow-direction','animation-easing','animation-cycle','animation-event-duration','animation-wave-stagger',
  'animation-travel','animation-scale-amount','animation-brightness','animation-section-effect','animation-item-effect','animation-price-effect',
  'animation-visual-effect','animation-intensity','promo-enabled','promo-badge-effect','promo-badge-scale','promo-badge-glow',
  'promo-row-effect','promo-row-glow','promo-row-tint','promo-price-effect','promo-sweep-seconds','promo-cycle-seconds',
  'brand-enabled','brand-text','brand-start-x','brand-start-y','brand-start-scale','brand-hold-ms','brand-flight-ms',
  'brand-stagger-ms','brand-easing','brand-order','brand-rotation','brand-glow','brand-trigger','brand-interval-seconds'
]);

let player = null;
let previewFrame = null;
let screenLoadSequence = 0;
let customPresets = [];
let selectedPresetId = null;
let dirty = false;
let mountGeneration = 0;

function isCurrent(generation = mountGeneration) {
  return generation === mountGeneration && document.body?.dataset?.page === 'animation';
}
function number(id) { return Number(element(id)?.value ?? 0); }
function checked(id) { return element(id)?.checked === true; }
function value(id) { return element(id)?.value || ''; }
function setValue(id, input) { const node = element(id); if (node) node.value = input == null ? '' : String(input); }
function setChecked(id, input) { const node = element(id); if (node) node.checked = input === true; }

function collectProfile() {
  return {
    motion_version: 5,
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
    visual_effect: value('animation-visual-effect'),
    intensity: number('animation-intensity'),
    promo_style: {
      enabled: checked('promo-enabled'),
      badge_effect: value('promo-badge-effect'),
      badge_scale: number('promo-badge-scale'),
      badge_glow: number('promo-badge-glow'),
      row_effect: value('promo-row-effect'),
      row_glow: number('promo-row-glow'),
      row_tint: number('promo-row-tint'),
      price_effect: value('promo-price-effect'),
      sweep_seconds: number('promo-sweep-seconds'),
      cycle_seconds: number('promo-cycle-seconds')
    },
    brand_reveal: {
      enabled: checked('brand-enabled'),
      text: value('brand-text').trim(),
      start_x_percent: number('brand-start-x'),
      start_y_percent: number('brand-start-y'),
      start_scale: number('brand-start-scale'),
      hold_ms: number('brand-hold-ms'),
      flight_ms: number('brand-flight-ms'),
      stagger_ms: number('brand-stagger-ms'),
      easing: value('brand-easing'),
      order: value('brand-order'),
      rotation_deg: number('brand-rotation'),
      glow: number('brand-glow'),
      trigger: value('brand-trigger'),
      interval_seconds: number('brand-interval-seconds')
    }
  };
}

function populateProfile(profile) {
  const promo = profile?.promo_style || {};
  const brand = profile?.brand_reveal || {};
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
  setValue('animation-visual-effect', profile.visual_effect || 'none');
  setValue('animation-intensity', profile.intensity);
  setChecked('promo-enabled', promo.enabled !== false);
  setValue('promo-badge-effect', promo.badge_effect || 'sheen');
  setValue('promo-badge-scale', promo.badge_scale ?? 1.08);
  setValue('promo-badge-glow', promo.badge_glow ?? 0.82);
  setValue('promo-row-effect', promo.row_effect || 'sweep');
  setValue('promo-row-glow', promo.row_glow ?? 0.48);
  setValue('promo-row-tint', promo.row_tint ?? 0.18);
  setValue('promo-price-effect', promo.price_effect || 'pulse');
  setValue('promo-sweep-seconds', promo.sweep_seconds ?? 1.4);
  setValue('promo-cycle-seconds', promo.cycle_seconds ?? 7.5);
  setChecked('brand-enabled', brand.enabled === true);
  setValue('brand-text', brand.text || '');
  setValue('brand-start-x', brand.start_x_percent ?? 50);
  setValue('brand-start-y', brand.start_y_percent ?? 46);
  setValue('brand-start-scale', brand.start_scale ?? 2.8);
  setValue('brand-hold-ms', brand.hold_ms ?? 1200);
  setValue('brand-flight-ms', brand.flight_ms ?? 1600);
  setValue('brand-stagger-ms', brand.stagger_ms ?? 90);
  setValue('brand-easing', brand.easing || 'cinematic');
  setValue('brand-order', brand.order || 'center');
  setValue('brand-rotation', brand.rotation_deg ?? 8);
  setValue('brand-glow', brand.glow ?? 0.7);
  setValue('brand-trigger', brand.trigger || 'player-start');
  setValue('brand-interval-seconds', brand.interval_seconds ?? 300);
  updateIntensityOutput();
  dirty = false;
  updatePresetUi();
}

function updateIntensityOutput() {
  const output = element('animation-intensity-output');
  if (output) output.textContent = `${Math.round(number('animation-intensity'))}%`;
}

function selectedPreset() {
  return customPresets.find((preset) => Number(preset.id) === Number(selectedPresetId)) || null;
}

function updatePresetUi() {
  const preset = selectedPreset();
  const label = element('animation-current-preset');
  if (label) label.textContent = preset ? `${preset.name}${dirty ? ' • изменён' : ''}` : `Редактируемый стиль${dirty ? ' • изменён' : ''}`;
  const name = element('animation-preset-name');
  if (name && !dirty) name.value = preset?.name || '';
  const updateButton = element('animation-preset-update');
  const deleteButton = element('animation-preset-delete');
  if (updateButton) updateButton.disabled = !preset;
  if (deleteButton) deleteButton.disabled = !preset;
}

function renderPresetSelect() {
  const select = element('animation-preset-select');
  if (!(select instanceof HTMLSelectElement)) return;
  select.innerHTML = `<option value="">Редактируемый стиль</option>${customPresets.map((preset) => `<option value="${preset.id}">${preset.name}</option>`).join('')}`;
  select.value = selectedPresetId ? String(selectedPresetId) : '';
  updatePresetUi();
}

function restartPreview(reason = 'preview', generation = mountGeneration) {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    if (!isCurrent(generation)) return;
    player?.restart(collectProfile(), { reason });
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) player?.pause();
  });
}

function markDirty() {
  if (!isCurrent()) return;
  dirty = true;
  updateIntensityOutput();
  updatePresetUi();
  restartPreview('preview');
}

function bindProfileControls() {
  CONTROL_IDS.forEach((id) => {
    const node = element(id);
    if (!node) return;
    const eventName = node instanceof HTMLInputElement && ['range', 'number', 'text'].includes(node.type) ? 'input' : 'change';
    node.addEventListener(eventName, markDirty);
  });
}

async function loadCustomPresets(generation = mountGeneration) {
  const result = await api.get(API.animationPresets);
  if (!isCurrent(generation)) return false;
  customPresets = Array.isArray(result) ? result : [];
  renderPresetSelect();
  return true;
}

function selectPreset(id) {
  if (!isCurrent()) return;
  selectedPresetId = id ? Number(id) : null;
  const preset = selectedPreset();
  populateProfile(preset?.profile || profileForPreset(DEFAULT_PRESET_ID));
  const name = element('animation-preset-name');
  if (name) name.value = preset?.name || '';
  renderPresetSelect();
  restartPreview('preview');
}

async function savePresetAsNew() {
  const generation = mountGeneration;
  const button = element('animation-preset-save-as');
  const name = value('animation-preset-name').trim();
  if (!name) return setMessage('animation-message', 'Введите название нового пресета.');
  setPending(button, true, 'Сохраняем…');
  try {
    const saved = await api.post(API.animationPresets, { name, profile: collectProfile() });
    if (!isCurrent(generation)) return;
    if (!await loadCustomPresets(generation) || !isCurrent(generation)) return;
    selectedPresetId = Number(saved.id);
    dirty = false;
    renderPresetSelect();
    updatePresetUi();
    setMessage('animation-message', `Пресет «${saved.name}» сохранён.`, 'success');
  } catch (error) {
    if (isCurrent(generation)) setMessage('animation-message', error.message);
  } finally {
    if (isCurrent(generation)) setPending(button, false, 'Сохраняем…');
  }
}

async function updateSelectedPreset() {
  const generation = mountGeneration;
  const preset = selectedPreset();
  if (!preset) return;
  const button = element('animation-preset-update');
  const name = value('animation-preset-name').trim() || preset.name;
  setPending(button, true, 'Обновляем…');
  try {
    const saved = await api.put(`${API.animationPresets}/${preset.id}`, { name, profile: collectProfile() });
    if (!isCurrent(generation)) return;
    if (!await loadCustomPresets(generation) || !isCurrent(generation)) return;
    selectedPresetId = Number(saved.id);
    dirty = false;
    renderPresetSelect();
    updatePresetUi();
    setMessage('animation-message', `Пресет «${saved.name}» обновлён.`, 'success');
  } catch (error) {
    if (isCurrent(generation)) setMessage('animation-message', error.message);
  } finally {
    if (isCurrent(generation)) setPending(button, false, 'Обновляем…');
  }
}

async function deleteSelectedPreset() {
  const generation = mountGeneration;
  const preset = selectedPreset();
  if (!preset) return;
  if (!window.confirm(`Удалить пресет «${preset.name}»?`)) return;
  const button = element('animation-preset-delete');
  setPending(button, true, 'Удаляем…');
  try {
    await api.delete(`${API.animationPresets}/${preset.id}`);
    if (!isCurrent(generation)) return;
    selectedPresetId = null;
    if (!await loadCustomPresets(generation) || !isCurrent(generation)) return;
    populateProfile(profileForPreset(DEFAULT_PRESET_ID));
    renderPresetSelect();
    restartPreview('preview', generation);
    setMessage('animation-message', 'Пресет удалён.', 'success');
  } catch (error) {
    if (isCurrent(generation)) setMessage('animation-message', error.message);
  } finally {
    if (isCurrent(generation)) setPending(button, false, 'Удаляем…');
  }
}

function screenLabel(screen) { return `${screen.location_name || 'Без точки'} — ${screen.name}`; }
function setScreenStatus(text) { const node = element('animation-screen-status'); if (node) node.textContent = text; }
function screenFromUrl(screens) { const candidate = Number(new URL(window.location.href).searchParams.get('screen')); return screens.find((screen) => Number(screen.id) === candidate) || screens[0] || null; }
function rememberSelectedScreen(screenId) { const url = new URL(window.location.href); url.searchParams.set('screen', String(screenId)); history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`); }

async function loadScreenPreview(screenId, generation = mountGeneration) {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !screenId || !isCurrent(generation)) return;
  const sequence = ++screenLoadSequence;
  if (select) select.disabled = true;
  setScreenStatus('Загружаем сохранённый экран…');
  try {
    const bundle = await api.get(`${API.screens}/${screenId}/editor`);
    if (!isCurrent(generation) || sequence !== screenLoadSequence) return;
    renderAnimationScreenPreview(stage, bundle);
    setScreenStatus(`${bundle.screen.location_name || 'Без точки'} · ${bundle.screen.name} · ${bundle.screen.resolution}`);
    restartPreview('preview', generation);
  } catch (error) {
    if (!isCurrent(generation) || sequence !== screenLoadSequence) return;
    renderAnimationScreenEmpty(stage, 'Не удалось загрузить выбранный монитор.');
    setScreenStatus(error.message);
  } finally {
    if (isCurrent(generation) && sequence === screenLoadSequence && select) select.disabled = false;
  }
}

async function loadScreenOptions(generation = mountGeneration) {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !(select instanceof HTMLSelectElement) || !isCurrent(generation)) return false;
  const screens = await api.get(API.screens);
  if (!isCurrent(generation)) return false;
  if (!Array.isArray(screens) || screens.length === 0) {
    select.innerHTML = '<option value="">Нет мониторов</option>';
    select.disabled = true;
    renderAnimationScreenEmpty(stage);
    setScreenStatus('В проекте пока нет мониторов.');
    player?.destroy();
    return true;
  }
  select.innerHTML = screens.map((screen) => `<option value="${screen.id}">${screenLabel(screen)}</option>`).join('');
  const selected = screenFromUrl(screens);
  select.value = String(selected.id);
  select.addEventListener('change', () => {
    if (!isCurrent(generation)) return;
    const id = Number(select.value);
    if (!id) return;
    rememberSelectedScreen(id);
    void loadScreenPreview(id, generation);
  });
  await loadScreenPreview(selected.id, generation);
  return isCurrent(generation);
}

async function loadSettings(generation = mountGeneration) {
  const settings = await api.get(API.animationSettings);
  if (!isCurrent(generation)) return false;
  const match = /^user-(\d+)$/.exec(String(settings?.preset_id || ''));
  selectedPresetId = match ? Number(match[1]) : null;
  const enabled = element('animation-enabled');
  if (enabled) enabled.checked = settings?.enabled === true;
  populateProfile(settings?.profile || profileForPreset(DEFAULT_PRESET_ID));
  renderPresetSelect();
  restartPreview('preview', generation);
  return true;
}

async function saveSettings() {
  const generation = mountGeneration;
  const button = element('animation-save');
  setPending(button, true, 'Применяем…');
  try {
    const presetId = selectedPresetId ? `user-${selectedPresetId}` : DEFAULT_PRESET_ID;
    const saved = await api.put(API.animationSettings, { enabled: checked('animation-enabled'), preset_id: presetId, profile: collectProfile() });
    if (!isCurrent(generation)) return;
    populateProfile(saved.profile);
    renderPresetSelect();
    setMessage('animation-message', 'Редактируемый профиль применён к экранам.', 'success');
  } catch (error) {
    if (isCurrent(generation)) setMessage('animation-message', error.message);
  } finally {
    if (isCurrent(generation)) setPending(button, false, 'Применяем…');
  }
}

function bindPresetManager() {
  element('animation-preset-select')?.addEventListener('change', (event) => selectPreset(event.currentTarget.value));
  element('animation-preset-save-as')?.addEventListener('click', () => void savePresetAsNew());
  element('animation-preset-update')?.addEventListener('click', () => void updateSelectedPreset());
  element('animation-preset-delete')?.addEventListener('click', () => void deleteSelectedPreset());
  element('animation-preset-reset')?.addEventListener('click', () => selectPreset(null));
}

function disposeAnimationStudio(generation) {
  if (generation !== mountGeneration) return;
  mountGeneration += 1;
  screenLoadSequence += 1;
  cancelAnimationFrame(previewFrame);
  previewFrame = null;
  player?.destroy();
  player = null;
  customPresets = [];
  selectedPresetId = null;
  dirty = false;
}

export function initialiseAnimationStudio() {
  const stage = element('animation-stage');
  if (!stage) return;
  player?.destroy();
  cancelAnimationFrame(previewFrame);
  customPresets = [];
  selectedPresetId = null;
  dirty = false;
  const generation = ++mountGeneration;
  player = new AnimationPreviewPlayer({
    stage,
    timeline: element('animation-timeline'),
    timeLabel: element('animation-time'),
    playButton: element('animation-play'),
    pauseButton: element('animation-pause'),
    replayButton: element('animation-replay')
  });
  bindProfileControls();
  bindPresetManager();
  element('animation-save')?.addEventListener('click', () => void saveSettings());
  void Promise.all([loadCustomPresets(generation), loadScreenOptions(generation)])
    .then(() => isCurrent(generation) ? loadSettings(generation) : false)
    .catch((error) => { if (isCurrent(generation)) setMessage('animation-message', error.message); });

  return {
    dispose() {
      disposeAnimationStudio(generation);
    }
  };
}
