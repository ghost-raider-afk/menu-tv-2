import { AnimationPreviewPlayer } from '../motion/preview-player.js';
import { renderAnimationScreenPreview } from '../motion/screen-preview.js';

const ACTIVATION_STORAGE_KEY = 'tv-menu.device-activation';
const PLAYER_CONTEXT_STORAGE_KEY = 'tv-menu.player-context.v1';
const NETWORK_TIMEOUT_MS = 5000;
const ACTIVATION_RENEW_RETRY_MS = 5000;
const bootView = document.querySelector('[data-player-boot]');
const bootMessage = document.querySelector('[data-player-boot-message]');
const activationView = document.querySelector('[data-activation-view]');
const showActivationButton = document.querySelector('[data-show-activation]');
const pairing = document.querySelector('[data-activation-pairing]');
const qrContainer = document.querySelector('[data-activation-qr]');
const reserveCode = document.querySelector('[data-reserve-code]');
const activationCountdown = document.querySelector('[data-activation-countdown]');
const activationStatus = document.querySelector('[data-activation-status]');
const player = document.querySelector('[data-tv-player]');
const playerStage = document.querySelector('[data-player-stage]');
const playerMessage = document.querySelector('[data-player-message]');

let pollTimer = null;
let activationCountdownTimer = null;
let activationRenewTimer = null;
let activationCreationInFlight = false;
let refreshTimer = null;
let initialRetryTimer = null;
let wakeLock = null;
let motionPlayer = null;
let lastRenderedFingerprint = '';
let playerRefreshMs = 5000;

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = Boolean(hidden);
  element.classList.toggle('is-hidden', Boolean(hidden));
}

function showBootScreen(message = 'Проверяем авторизацию телевизора…') {
  if (bootMessage) bootMessage.textContent = message;
  setHidden(bootView, false);
  setHidden(activationView, true);
  setHidden(player, true);
  setHidden(playerMessage, true);
}

async function fetchWithTimeout(input, init = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { controller?.abort(); } catch {}
      reject(new Error('network-timeout'));
    }, Math.max(1000, Number(timeoutMs) || NETWORK_TIMEOUT_MS));
  });
  try {
    const request = fetch(input, controller ? { ...init, signal: controller.signal } : init);
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

function formatRemaining(expiresAt) {
  const remainingMs = Math.max(0, Date.parse(expiresAt || '') - Date.now());
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function stopActivationTimers() {
  if (pollTimer) clearTimeout(pollTimer);
  if (activationCountdownTimer) clearInterval(activationCountdownTimer);
  if (activationRenewTimer) clearTimeout(activationRenewTimer);
  pollTimer = null;
  activationCountdownTimer = null;
  activationRenewTimer = null;
}

function scheduleActivationRenew(delay = ACTIVATION_RENEW_RETRY_MS) {
  if (activationRenewTimer) clearTimeout(activationRenewTimer);
  activationRenewTimer = setTimeout(() => {
    activationRenewTimer = null;
    void createActivation({ automatic: true });
  }, Math.max(250, Number(delay) || ACTIVATION_RENEW_RETRY_MS));
}

function expireActivation(record) {
  const stored = (() => {
    try { return JSON.parse(sessionStorage.getItem(ACTIVATION_STORAGE_KEY) || 'null'); } catch { return null; }
  })();
  if (stored?.activation_id && record?.activation_id && stored.activation_id !== record.activation_id) return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (activationCountdownTimer) clearInterval(activationCountdownTimer);
  activationCountdownTimer = null;
  clearActivation();
  if (qrContainer) qrContainer.innerHTML = '';
  if (reserveCode) reserveCode.textContent = '—— ——';
  if (activationCountdown) activationCountdown.textContent = '00:00';
  if (activationStatus) activationStatus.textContent = 'Срок действия истёк. Обновляем код…';
  if (showActivationButton) showActivationButton.textContent = 'Обновить код сейчас';
  scheduleActivationRenew(250);
}

function startActivationCountdown(record) {
  if (activationCountdownTimer) clearInterval(activationCountdownTimer);
  activationCountdownTimer = null;
  const update = () => {
    const expiresAt = Date.parse(record?.expires_at || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      expireActivation(record);
      return;
    }
    if (activationCountdown) activationCountdown.textContent = formatRemaining(record.expires_at);
  };
  update();
  if (Date.parse(record?.expires_at || '') > Date.now()) {
    activationCountdownTimer = setInterval(update, 500);
  }
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
  if (qrContainer) qrContainer.innerHTML = record.qr_svg;
  if (reserveCode) reserveCode.textContent = formatReserveCode(record.reserve_code);
  if (activationStatus) activationStatus.textContent = 'Ожидание авторизации…';
  if (showActivationButton) showActivationButton.textContent = 'Получить новый код';
  setHidden(pairing, false);
  startActivationCountdown(record);
}

function schedulePoll(record) {
  if (pollTimer) clearTimeout(pollTimer);
  const delay = Math.max(1000, Number(record.poll_interval_ms) || 2000);
  pollTimer = setTimeout(() => void pollActivation(record), delay);
}

async function pollActivation(record) {
  if (Date.parse(record.expires_at) <= Date.now()) {
    expireActivation(record);
    return;
  }

  try {
    const response = await fetchWithTimeout(`/api/device/activations/${encodeURIComponent(record.activation_id)}/status`, {
      headers: { 'x-device-activation-secret': record.poll_secret },
      cache: 'no-store'
    });
    if (response.status === 410 || response.status === 404) {
      expireActivation(record);
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status === 'authorized') {
      stopActivationTimers();
      clearActivation();
      if (activationStatus) activationStatus.textContent = 'Авторизовано. Запускаем ТВ МЕНЮ…';
      await loadPlayer();
      return;
    }
    if (activationStatus) activationStatus.textContent = 'Ожидание авторизации…';
  } catch {
    if (activationStatus) activationStatus.textContent = 'Нет связи с сервером. Повторяем…';
  }
  schedulePoll(record);
}

async function createActivation({ automatic = false } = {}) {
  if (activationCreationInFlight) return;
  activationCreationInFlight = true;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (activationRenewTimer) clearTimeout(activationRenewTimer);
  activationRenewTimer = null;
  if (showActivationButton) showActivationButton.disabled = true;
  if (activationStatus) activationStatus.textContent = automatic ? 'Обновляем код подключения…' : 'Создаём код подключения…';
  try {
    if (!automatic) await enterImmersiveMode();
    const response = await fetchWithTimeout('/api/device/activations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store'
    });
    if (response.status === 409) {
      stopActivationTimers();
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
    if (qrContainer) qrContainer.innerHTML = '';
    if (reserveCode) reserveCode.textContent = '—— ——';
    if (activationCountdown) activationCountdown.textContent = '00:00';
    if (activationStatus) {
      activationStatus.textContent = automatic
        ? 'Не удалось обновить код. Повторяем через несколько секунд…'
        : 'Не удалось получить код. Проверьте соединение с сервером.';
    }
    if (automatic) scheduleActivationRenew();
  } finally {
    activationCreationInFlight = false;
    if (showActivationButton) showActivationButton.disabled = false;
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

async function fetchPlayerContext(timeoutMs = NETWORK_TIMEOUT_MS) {
  const response = await fetchWithTimeout('/api/device/player-context', { cache: 'no-store' }, timeoutMs);
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
}

function showCachedPlayer(record, message = 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.') {
  if (!record?.context) return false;
  stopActivationTimers();
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
      stopActivationTimers();
      clearActivation();
      showActivationScreen();
      setHidden(pairing, true);
      if (showActivationButton) showActivationButton.textContent = 'Показать QR-код';
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
  stopActivationTimers();
  try {
    const result = await fetchPlayerContext();
    if (result.unauthorized) {
      showActivationScreen();
      setHidden(pairing, true);
      if (showActivationButton) showActivationButton.textContent = 'Показать QR-код';
      return false;
    }
    renderPlayerContext(result.context);
    setHidden(bootView, true);
    setHidden(activationView, true);
    setHidden(player, false);
    showConnectionMessage(result.offline ? 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.' : '');
    void requestWakeLock();
    schedulePlayerRefresh();
    return true;
  } catch (error) {
    console.error('TV player could not start online', error);
    const cached = cachedPlayerContext();
    if (showCachedPlayer(cached)) return true;
    showBootScreen('Нет связи с сервером. Ожидаем восстановление соединения…');
    scheduleInitialRetry();
    return false;
  }
}

function registerOfflinePlayer() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/player-sw.js', { scope: '/player' }).catch((error) => {
    console.warn('Offline TV player service worker could not start', error);
  });
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
    const response = await fetchWithTimeout('/api/device/session', { cache: 'no-store' });
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
    stopActivationTimers();
    showActivationScreen();
    setHidden(pairing, true);
    if (showActivationButton) showActivationButton.textContent = 'Показать QR-код';
  }
}

async function initialisePlayer() {
  showBootScreen();
  showActivationButton?.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });

  registerOfflinePlayer();
  await resolveInitialPlayerState();
}

void initialisePlayer();
