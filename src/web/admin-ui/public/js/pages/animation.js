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
let currentProfileId = null;
let profiles = [];
let screens = [];
let currentScreen = null;
let playerWorkspace = null;
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

function currentProfile() {
  return profiles.find((profile) => Number(profile.id) === Number(currentProfileId)) || null;
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

function profilePayload() {
  return {
    name: value('animation-profile-name').trim(),
    enabled: checked('animation-enabled'),
    preset_id: currentPresetId,
    profile: collectProfile()
  };
}

function setValue(id, nextValue) {
  const node = element(id);
  if (!node) return;
  node.value = String(nextValue ?? '');
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
    if (!element('animation-stage')?.dataset?.screenId) return;
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

function renderProfileOptions() {
  const profileSelect = element('animation-profile-select');
  if (profileSelect instanceof HTMLSelectElement) {
    profileSelect.replaceChildren(...profiles.map((profile) => new Option(profile.name, String(profile.id))));
    if (currentProfileId && profiles.some((profile) => Number(profile.id) === Number(currentProfileId))) {
      profileSelect.value = String(currentProfileId);
    }
  }

  const screenProfile = element('animation-screen-profile');
  if (screenProfile instanceof HTMLSelectElement) {
    screenProfile.replaceChildren(new Option('Без анимации', ''), ...profiles.map((profile) => new Option(profile.name, String(profile.id))));
    screenProfile.value = currentScreen?.animation_profile_id ? String(currentScreen.animation_profile_id) : '';
  }
}

function selectProfile(profileId) {
  const profile = profiles.find((item) => Number(item.id) === Number(profileId));
  if (!profile) return;
  currentProfileId = Number(profile.id);
  currentPresetId = profile.preset_id || DEFAULT_PRESET_ID;
  const base = PRESET_BY_ID.has(currentPresetId) ? profileForPreset(currentPresetId) : profileForPreset(DEFAULT_PRESET_ID);
  populateProfile({ ...base, ...(profile.profile || {}), motion_version: 2 });
  setValue('animation-profile-name', profile.name);
  const enabled = element('animation-enabled');
  if (enabled) enabled.checked = profile.enabled === true;
  const count = element('animation-profile-screen-count');
  if (count) count.textContent = String(profile.assigned_screen_count || 0);
  renderProfileOptions();
  updatePresetSelection();
  restartPreview();
}

async function loadProfiles(preferredId = currentProfileId) {
  const result = await api.get(API.animationProfiles);
  profiles = Array.isArray(result) ? result : [];
  if (!profiles.length) throw new Error('Библиотека профилей анимации пуста.');
  const selected = profiles.find((item) => Number(item.id) === Number(preferredId)) || profiles[0];
  currentProfileId = Number(selected.id);
  renderProfileOptions();
  selectProfile(selected.id);
}

function nextProfileName() {
  let index = profiles.length + 1;
  while (profiles.some((profile) => profile.name === `Профиль ${index}`)) index += 1;
  return `Профиль ${index}`;
}

async function createProfile() {
  const button = element('animation-new-profile');
  setPending(button, true, 'Создаём…');
  try {
    const created = await api.post(API.animationProfiles, {
      ...profilePayload(),
      name: nextProfileName()
    });
    await loadProfiles(created.id);
    setMessage('animation-message', `Создан профиль «${created.name}».`, 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  } finally {
    setPending(button, false, 'Создаём…');
  }
}

async function deleteProfile() {
  const profile = currentProfile();
  if (!profile) return;
  if (profiles.length <= 1) return setMessage('animation-message', 'В библиотеке должен остаться хотя бы один профиль.');
  if (Number(profile.assigned_screen_count || 0) > 0) return setMessage('animation-message', 'Профиль назначен мониторам. Сначала переназначьте их.');
  if (!window.confirm(`Удалить профиль «${profile.name}»?`)) return;
  try {
    await api.delete(`${API.animationProfiles}/${profile.id}`);
    currentProfileId = null;
    await loadProfiles();
    setMessage('animation-message', `Профиль «${profile.name}» удалён.`, 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  }
}

async function saveProfile() {
  const profile = currentProfile();
  if (!profile) return;
  const button = element('animation-save');
  setPending(button, true, 'Сохраняем…');
  try {
    const saved = await api.put(`${API.animationProfiles}/${profile.id}`, profilePayload());
    await loadProfiles(saved.id);
    setMessage('animation-message', `Профиль «${saved.name}» сохранён. Все назначенные ему мониторы используют эту конфигурацию.`, 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  } finally {
    setPending(button, false, 'Сохраняем…');
  }
}

function screenLabel(screen) {
  const location = screen.location_name || 'Без точки';
  return `${location} — ${screen.name}`;
}

function setScreenStatus(text) {
  const node = element('animation-screen-status');
  if (node) node.textContent = text;
}

function screenFromUrl() {
  const candidate = Number(new URL(window.location.href).searchParams.get('screen'));
  return screens.find((screen) => Number(screen.id) === candidate) || screens[0] || null;
}

function rememberSelectedScreen(screenId) {
  const url = new URL(window.location.href);
  url.searchParams.set('screen', String(screenId));
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function playerUrl() {
  return playerWorkspace?.token ? `${window.location.origin}/player/${playerWorkspace.token}` : '';
}

function renderPlayerWorkspace() {
  const url = playerUrl();
  const target = element('animation-player-url');
  if (target) target.textContent = url || '—';
  const enabled = element('animation-player-enabled');
  if (enabled) {
    enabled.checked = playerWorkspace?.enabled === true;
    enabled.disabled = !playerWorkspace;
  }
  for (const id of ['animation-player-copy', 'animation-player-open', 'animation-player-rotate']) {
    const node = element(id);
    if (node) node.disabled = !playerWorkspace;
  }
}

async function loadPlayerWorkspace(screenId) {
  playerWorkspace = null;
  renderPlayerWorkspace();
  if (!screenId) return;
  playerWorkspace = await api.get(`${API.screens}/${screenId}/player-workspace`);
  renderPlayerWorkspace();
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
    currentScreen = bundle.screen;
    const local = screens.findIndex((screen) => Number(screen.id) === Number(bundle.screen.id));
    if (local >= 0) screens[local] = bundle.screen;
    renderAnimationScreenPreview(stage, bundle);
    renderProfileOptions();
    const assigned = profiles.find((profile) => Number(profile.id) === Number(bundle.screen.animation_profile_id));
    setScreenStatus(`${bundle.screen.location_name || 'Без точки'} · ${bundle.screen.name} · ${bundle.screen.resolution} · ${assigned ? `профиль: ${assigned.name}` : 'без анимации'}`);
    restartPreview();
    await loadPlayerWorkspace(screenId);
  } catch (error) {
    if (sequence !== screenLoadSequence) return;
    renderAnimationScreenEmpty(stage, 'Не удалось загрузить выбранный монитор.');
    setScreenStatus(error.message);
    playerWorkspace = null;
    renderPlayerWorkspace();
  } finally {
    if (sequence === screenLoadSequence && select) select.disabled = false;
  }
}

async function loadScreenOptions() {
  const stage = element('animation-stage');
  const select = element('animation-screen-select');
  if (!stage || !(select instanceof HTMLSelectElement)) return;
  const result = await api.get(API.screens);
  screens = Array.isArray(result) ? result : [];
  if (!screens.length) {
    select.innerHTML = '<option value="">Нет мониторов</option>';
    select.disabled = true;
    currentScreen = null;
    renderAnimationScreenEmpty(stage);
    setScreenStatus('В проекте пока нет мониторов.');
    renderProfileOptions();
    player?.destroy();
    return;
  }

  select.innerHTML = screens.map((screen) => `<option value="${screen.id}">${screenLabel(screen)}</option>`).join('');
  const selected = screenFromUrl();
  currentScreen = selected;
  select.value = String(selected.id);
  select.addEventListener('change', () => {
    const id = Number(select.value);
    if (!id) return;
    currentScreen = screens.find((screen) => Number(screen.id) === id) || null;
    rememberSelectedScreen(id);
    renderProfileOptions();
    void loadScreenPreview(id);
  });
  await loadScreenPreview(selected.id);
}

async function assignProfileToScreen() {
  if (!currentScreen) return;
  const profileId = value('animation-screen-profile');
  const button = element('animation-assign-profile');
  setPending(button, true, 'Применяем…');
  try {
    const screen = await api.put(`${API.screens}/${currentScreen.id}/animation-profile`, { profile_id: profileId || null });
    currentScreen = screen;
    const index = screens.findIndex((item) => Number(item.id) === Number(screen.id));
    if (index >= 0) screens[index] = screen;
    await loadProfiles(currentProfileId);
    renderProfileOptions();
    const assigned = profiles.find((profile) => Number(profile.id) === Number(screen.animation_profile_id));
    setScreenStatus(`${screen.location_name || 'Без точки'} · ${screen.name} · ${screen.resolution} · ${assigned ? `профиль: ${assigned.name}` : 'без анимации'}`);
    setMessage('animation-message', assigned ? `Профиль «${assigned.name}» назначен монитору «${screen.name}».` : `Анимация для монитора «${screen.name}» отключена.`, 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  } finally {
    setPending(button, false, 'Применяем…');
  }
}

async function rotatePlayerWorkspace() {
  if (!currentScreen || !window.confirm('Создать новую ссылку TV Player? Старая ссылка сразу перестанет работать.')) return;
  try {
    playerWorkspace = await api.post(`${API.screens}/${currentScreen.id}/player-workspace/rotate`);
    renderPlayerWorkspace();
    setMessage('animation-message', 'Создана новая ссылка fullscreen-плеера. Старую ссылку можно удалить с телевизора.', 'success');
  } catch (error) {
    setMessage('animation-message', error.message);
  }
}

async function setPlayerWorkspaceEnabled() {
  if (!currentScreen || !playerWorkspace) return;
  try {
    playerWorkspace = await api.put(`${API.screens}/${currentScreen.id}/player-workspace`, {
      enabled: checked('animation-player-enabled')
    });
    renderPlayerWorkspace();
  } catch (error) {
    renderPlayerWorkspace();
    setMessage('animation-message', error.message);
  }
}

async function copyPlayerUrl() {
  const url = playerUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setMessage('animation-message', 'Ссылка TV Player скопирована.', 'success');
  } catch {
    setMessage('animation-message', 'Не удалось скопировать ссылку автоматически. Выделите её вручную.');
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
  element('animation-profile-select')?.addEventListener('change', (event) => selectProfile(Number(event.currentTarget.value)));
  element('animation-save')?.addEventListener('click', () => { void saveProfile(); });
  element('animation-new-profile')?.addEventListener('click', () => { void createProfile(); });
  element('animation-delete-profile')?.addEventListener('click', () => { void deleteProfile(); });
  element('animation-assign-profile')?.addEventListener('click', () => { void assignProfileToScreen(); });
  element('animation-player-rotate')?.addEventListener('click', () => { void rotatePlayerWorkspace(); });
  element('animation-player-copy')?.addEventListener('click', () => { void copyPlayerUrl(); });
  element('animation-player-open')?.addEventListener('click', () => {
    const url = playerUrl();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });
  element('animation-player-enabled')?.addEventListener('change', () => { void setPlayerWorkspaceEnabled(); });

  void (async () => {
    await loadProfiles();
    await loadScreenOptions();
  })().catch((error) => setMessage('animation-message', error.message));
}
