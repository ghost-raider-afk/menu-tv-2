import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../editor/renderer.js';

const ACTIVATION_STORAGE_KEY = 'tv-menu.device-activation';
const activationView = document.querySelector('[data-activation-view]');
const showActivationButton = document.querySelector('[data-show-activation]');
const pairing = document.querySelector('[data-activation-pairing]');
const qrContainer = document.querySelector('[data-activation-qr]');
const reserveCode = document.querySelector('[data-reserve-code]');
const activationStatus = document.querySelector('[data-activation-status]');
const player = document.querySelector('[data-tv-player]');
const playerStage = document.querySelector('[data-player-stage]');
const playerMessage = document.querySelector('[data-player-message]');

let pollTimer = null;
let refreshTimer = null;
let wakeLock = null;
let playerRefreshMs = 5000;

function setHidden(element, hidden) {
  element?.classList.toggle('is-hidden', hidden);
}

function activationFromStorage() {
  try {
    const record = JSON.parse(sessionStorage.getItem(ACTIVATION_STORAGE_KEY) || 'null');
    if (!record || Date.parse(record.expires_at) <= Date.now()) return null;
    return record;
  } catch {
    return null;
  }
}

function saveActivation(record) {
  try { sessionStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(record)); } catch {}
}

function clearActivation() {
  try { sessionStorage.removeItem(ACTIVATION_STORAGE_KEY); } catch {}
}

function formatReserveCode(value) {
  const code = String(value || '').replace(/\D/g, '').slice(0, 6);
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : '—— ——';
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
  } catch {}
}

async function enterImmersiveMode() {
  await requestWakeLock();
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }
}

function showActivationScreen() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  setHidden(player, true);
  setHidden(activationView, false);
  setHidden(playerMessage, true);
}

function showPairing(record) {
  showActivationScreen();
  qrContainer.innerHTML = record.qr_svg;
  reserveCode.textContent = formatReserveCode(record.reserve_code);
  activationStatus.textContent = 'Ожидание авторизации…';
  showActivationButton.textContent = 'Получить новый код';
  setHidden(pairing, false);
}

function schedulePoll(record) {
  if (pollTimer) clearTimeout(pollTimer);
  const delay = Math.max(1000, Number(record.poll_interval_ms) || 2000);
  pollTimer = setTimeout(() => void pollActivation(record), delay);
}

async function pollActivation(record) {
  if (Date.parse(record.expires_at) <= Date.now()) {
    clearActivation();
    activationStatus.textContent = 'Код подключения истёк. Получите новый.';
    showActivationButton.textContent = 'Получить новый код';
    return;
  }

  try {
    const response = await fetch(`/api/device/activations/${encodeURIComponent(record.activation_id)}/status`, {
      headers: { 'x-device-activation-secret': record.poll_secret },
      cache: 'no-store'
    });
    if (response.status === 410 || response.status === 404) {
      clearActivation();
      activationStatus.textContent = 'Код подключения больше не действителен.';
      showActivationButton.textContent = 'Получить новый код';
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status === 'authorized') {
      clearActivation();
      activationStatus.textContent = 'Авторизовано. Запускаем ТВ МЕНЮ…';
      await loadPlayer();
      return;
    }
    activationStatus.textContent = 'Ожидание авторизации…';
  } catch {
    activationStatus.textContent = 'Нет связи с сервером. Повторяем…';
  }
  schedulePoll(record);
}

async function createActivation() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  showActivationButton.disabled = true;
  activationStatus.textContent = 'Создаём код подключения…';
  try {
    await enterImmersiveMode();
    const response = await fetch('/api/device/activations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const record = await response.json();
    saveActivation(record);
    showPairing(record);
    schedulePoll(record);
  } catch (error) {
    console.error('TV activation could not start', error);
    setHidden(pairing, false);
    qrContainer.innerHTML = '';
    reserveCode.textContent = '—— ——';
    activationStatus.textContent = 'Не удалось получить код. Проверьте соединение с сервером.';
  } finally {
    showActivationButton.disabled = false;
  }
}

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  const width = Number(match?.[1]) || 1920;
  const height = Number(match?.[2]) || 1080;
  return { width, height };
}

function sameOriginAsset(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, window.location.origin);
    return url.origin === window.location.origin ? url.href : '';
  } catch {
    return '';
  }
}

function renderPlayerContext(context) {
  const viewport = resolutionOf(context.screen);
  const model = buildRenderModel(context.draft, viewport);
  const lines = buildDisplayLines(model, {
    products: context.products || [],
    packaging: context.packaging || [],
    fallbackTitle: context.screen?.name || 'Меню'
  });
  const layout = buildRenderLayout(model, lines);
  playerStage.innerHTML = buildTableSvg(model, lines, layout);
  playerStage.style.backgroundColor = model.settings.background_color || '#101828';
  const background = sameOriginAsset(model.settings.background_image_url);
  playerStage.style.backgroundImage = background ? `url(${JSON.stringify(background)})` : 'none';
  playerRefreshMs = Math.max(2000, Number(context.refresh_interval_ms) || 5000);
}

function showConnectionMessage(message) {
  if (!message) {
    setHidden(playerMessage, true);
    playerMessage.textContent = '';
    return;
  }
  playerMessage.textContent = message;
  setHidden(playerMessage, false);
}

function schedulePlayerRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshPlayer(), playerRefreshMs);
}

async function refreshPlayer() {
  try {
    const response = await fetch('/api/device/player-context', { cache: 'no-store' });
    if (response.status === 401) {
      clearActivation();
      showActivationScreen();
      setHidden(pairing, true);
      showActivationButton.textContent = 'Показать QR-код';
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const context = await response.json();
    renderPlayerContext(context);
    showConnectionMessage('');
  } catch (error) {
    console.error('TV player refresh failed', error);
    showConnectionMessage('Связь с сервером временно потеряна. Показывается последнее сохранённое меню.');
  }
  schedulePlayerRefresh();
}

async function loadPlayer() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  try {
    const response = await fetch('/api/device/player-context', { cache: 'no-store' });
    if (response.status === 401) {
      showActivationScreen();
      return false;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const context = await response.json();
    renderPlayerContext(context);
    setHidden(activationView, true);
    setHidden(player, false);
    showConnectionMessage('');
    await requestWakeLock();
    schedulePlayerRefresh();
    return true;
  } catch (error) {
    console.error('TV player could not start', error);
    showActivationScreen();
    return false;
  }
}

async function initialisePlayer() {
  showActivationButton.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });

  try {
    const response = await fetch('/api/device/session', { cache: 'no-store' });
    if (response.ok) {
      await loadPlayer();
      return;
    }
  } catch {}

  const pending = activationFromStorage();
  if (pending) {
    showPairing(pending);
    schedulePoll(pending);
  } else {
    showActivationScreen();
    setHidden(pairing, true);
  }
}

void initialisePlayer();
