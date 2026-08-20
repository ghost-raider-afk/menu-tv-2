import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { renderAnimationScreenPreview } from '../motion/screen-preview.js';

const ACTIVATION_STORAGE_KEY = 'tv-menu.device-activation';
const PLAYER_CONTEXT_STORAGE_KEY = 'tv-menu.player-context.v1';
const bootView = document.querySelector('[data-player-boot]');
const bootMessage = document.querySelector('[data-player-boot-message]');
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
let initialRetryTimer = null;
let wakeLock = null;
let motionPlayer = null;
let lastRenderedFingerprint = '';
let playerRefreshMs = 5000;

function setHidden(element, hidden) {
  element?.classList.toggle('is-hidden', hidden);
}

function showBootScreen(message = 'Проверяем авторизацию телевизора…') {
  if (bootMessage) bootMessage.textContent = message;
  setHidden(bootView, false);
  setHidden(activationView, true);
  setHidden(player, true);
  setHidden(playerMessage, true);
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

function cachedPlayerContext() {
  try {
    const record = JSON.parse(localStorage.getItem(PLAYER_CONTEXT_STORAGE_KEY) || 'null');
    return record?.context ? record : null;
  } catch {
    return null;
  }
}

function savePlayerContext(context) {
  try {
    localStorage.setItem(PLAYER_CONTEXT_STORAGE_KEY, JSON.stringify({
      saved_at: new Date().toISOString(),
      context
    }));
  } catch {}
}

function clearPlayerContext() {
  try { localStorage.removeItem(PLAYER_CONTEXT_STORAGE_KEY); } catch {}
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

function stopPlayerMotion() {
  motionPlayer?.destroy();
  if (playerStage) delete playerStage.dataset.motionMode;
}

function showActivationScreen() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (initialRetryTimer) clearTimeout(initialRetryTimer);
  initialRetryTimer = null;
  lastRenderedFingerprint = '';
  stopPlayerMotion();
  setHidden(bootView, true);
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
    if (response.status === 409) {
      clearActivation();
      await loadPlayer();
      return;
    }
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

async function warmPlayerAssetCache(context) {
  const background = sameOriginAsset(context?.draft?.settings?.background_image_url);
  if (!background) return;
  await fetch(background, { cache: 'reload' }).catch(() => undefined);
}

function playerMotion() {
  if (!motionPlayer) motionPlayer = new AnimationPreviewPlayer({ stage: playerStage });
  return motionPlayer;
}

function renderFingerprint(context) {
  return JSON.stringify({
    screen: context?.screen || null,
    draft: context?.draft || null,
    products: context?.products || [],
    packaging: context?.packaging || [],
    animation: context?.animation || null
  });
}

function renderPlayerContext(context) {
  playerRefreshMs = Math.max(2000, Number(context.refresh_interval_ms) || 5000);
  const fingerprint = renderFingerprint(context);
  if (fingerprint === lastRenderedFingerprint) return false;

  stopPlayerMotion();
  const backgroundUrl = sameOriginAsset(context?.draft?.settings?.background_image_url);
  const rendered = renderAnimationScreenPreview(playerStage, context, {
    fallbackTitle: context.screen?.name || 'Меню',
    backgroundUrl
  });

  const animation = context?.animation;
  if (!rendered?.invalidResolution && animation?.enabled === true && animation.profile) {
    playerMotion().restart(animation.profile);
  }
  lastRenderedFingerprint = fingerprint;
  return true;
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

async function fetchPlayerContext(timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/device/player-context', { cache: 'no-store', signal: controller.signal });
    if (response.status === 401) {
      clearPlayerContext();
      return { unauthorized: true };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const context = await response.json();
    savePlayerContext(context);
    void warmPlayerAssetCache(context);
    return {
      context,
      offline: response.headers.get('x-tv-menu-offline') === '1'
    };
  } finally {
    clearTimeout(timer);
  }
}

function showCachedPlayer(record, message = 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.') {
  if (!record?.context) return false;
  renderPlayerContext(record.context);
  setHidden(bootView, true);
  setHidden(activationView, true);
  setHidden(player, false);
  showConnectionMessage(message);
  void requestWakeLock();
  schedulePlayerRefresh();
  return true;
}

async function refreshPlayer() {
  try {
    const result = await fetchPlayerContext();
    if (result.unauthorized) {
      clearActivation();
      showActivationScreen();
      setHidden(pairing, true);
      showActivationButton.textContent = 'Показать QR-код';
      return;
    }
    renderPlayerContext(result.context);
    showConnectionMessage(result.offline ? 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.' : '');
  } catch (error) {
    console.error('TV player refresh failed', error);
    if (!showCachedPlayer(cachedPlayerContext())) {
      showConnectionMessage('Связь с сервером временно потеряна.');
    }
    return;
  }
  schedulePlayerRefresh();
}

async function loadPlayer() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  try {
    const result = await fetchPlayerContext();
    if (result.unauthorized) {
      showActivationScreen();
      setHidden(pairing, true);
      showActivationButton.textContent = 'Показать QR-код';
      return false;
    }
    renderPlayerContext(result.context);
    setHidden(bootView, true);
    setHidden(activationView, true);
    setHidden(player, false);
    showConnectionMessage(result.offline ? 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.' : '');
    await requestWakeLock();
    schedulePlayerRefresh();
    return true;
  } catch (error) {
    console.error('TV player could not start online', error);
    const cached = cachedPlayerContext();
    if (showCachedPlayer(cached)) return true;
    showBootScreen('Нет связи с сервером. Ожидаем восстановление соединения…');
    return false;
  }
}

async function registerOfflinePlayer() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/player-sw.js', { scope: '/player' });
    await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('Offline TV player service worker could not start', error);
  }
}

function scheduleInitialRetry() {
  if (initialRetryTimer) clearTimeout(initialRetryTimer);
  initialRetryTimer = setTimeout(() => void resolveInitialPlayerState(), 3000);
}

async function resolveInitialPlayerState() {
  if (initialRetryTimer) clearTimeout(initialRetryTimer);
  initialRetryTimer = null;
  showBootScreen();

  try {
    const response = await fetch('/api/device/session', { cache: 'no-store' });
    if (response.ok) {
      await loadPlayer();
      return;
    }
    if (response.status !== 401) throw new Error(`HTTP ${response.status}`);
    clearPlayerContext();
  } catch (error) {
    console.warn('TV session state could not be resolved', error);
    if (showCachedPlayer(cachedPlayerContext())) return;
    showBootScreen('Нет связи с сервером. Проверяем повторно…');
    scheduleInitialRetry();
    return;
  }

  const pending = activationFromStorage();
  if (pending) {
    showPairing(pending);
    schedulePoll(pending);
  } else {
    showActivationScreen();
    setHidden(pairing, true);
    showActivationButton.textContent = 'Показать QR-код';
  }
}

async function initialisePlayer() {
  showBootScreen();
  showActivationButton.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });

  await registerOfflinePlayer();
  await resolveInitialPlayerState();
}

void initialisePlayer();
