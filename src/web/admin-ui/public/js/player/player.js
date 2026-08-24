import {
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../editor/renderer.js';
import { renderSceneEntity } from '../motion/entity-editor.js';
import { renderAnnouncementLayer } from '../motion/announcement.js';

const ACTIVATION_STORAGE_KEY = 'tv-menu.device-activation';
const PLAYER_CONTEXT_STORAGE_KEY = 'tv-menu.player-context.v1';
const activationView = document.querySelector('[data-activation-view]');
const showActivationButton = document.querySelector('[data-show-activation]');
const pairing = document.querySelector('[data-activation-pairing]');
const qrContainer = document.querySelector('[data-activation-qr]');
const reserveCode = document.querySelector('[data-reserve-code]');
const activationExpiry = document.querySelector('[data-activation-expiry]');
const activationStatus = document.querySelector('[data-activation-status]');
const player = document.querySelector('[data-tv-player]');
const playerStage = document.querySelector('[data-player-stage]');
const playerMessage = document.querySelector('[data-player-message]');

let pollTimer = null;
let expiryTimer = null;
let rotationRetryTimer = null;
let refreshTimer = null;
let wakeLock = null;
let playerRefreshMs = 5000;
let activationRequestInFlight = false;

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
    localStorage.setItem(PLAYER_CONTEXT_STORAGE_KEY, JSON.stringify({ saved_at: new Date().toISOString(), context }));
  } catch {}
}

function clearPlayerContext() {
  try { localStorage.removeItem(PLAYER_CONTEXT_STORAGE_KEY); } catch {}
}

function formatReserveCode(value) {
  const code = String(value || '').replace(/\D/g, '').slice(0, 6);
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : '—— ——';
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clearPairingTimers() {
  if (pollTimer) clearTimeout(pollTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  if (rotationRetryTimer) clearTimeout(rotationRetryTimer);
  pollTimer = null;
  expiryTimer = null;
  rotationRetryTimer = null;
}

function invalidatePairing(text = 'Обновляем код подключения…') {
  qrContainer.innerHTML = '';
  reserveCode.textContent = '—— ——';
  if (activationExpiry) activationExpiry.textContent = 'QR обновляется';
  activationStatus.textContent = text;
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

function startExpiryCountdown(record) {
  if (expiryTimer) clearInterval(expiryTimer);
  let rotationStarted = false;
  const tick = () => {
    const remaining = Date.parse(record.expires_at) - Date.now();
    if (remaining > 0) {
      if (activationExpiry) activationExpiry.textContent = `QR действителен ${formatRemaining(remaining)}`;
      return;
    }
    if (rotationStarted) return;
    rotationStarted = true;
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
    clearActivation();
    invalidatePairing();
    void createActivation({ automatic: true });
  };
  tick();
  if (!rotationStarted) expiryTimer = setInterval(tick, 250);
}

function showPairing(record) {
  showActivationScreen();
  qrContainer.innerHTML = record.qr_svg;
  reserveCode.textContent = formatReserveCode(record.reserve_code);
  activationStatus.textContent = 'Ожидание авторизации…';
  showActivationButton.textContent = 'Обновить код сейчас';
  setHidden(pairing, false);
  startExpiryCountdown(record);
}

function schedulePoll(record) {
  if (pollTimer) clearTimeout(pollTimer);
  const delay = Math.max(1000, Number(record.poll_interval_ms) || 2000);
  pollTimer = setTimeout(() => void pollActivation(record), delay);
}

async function pollActivation(record) {
  if (Date.parse(record.expires_at) <= Date.now()) return;
  try {
    const response = await fetch(`/api/device/activations/${encodeURIComponent(record.activation_id)}/status`, {
      headers: { 'x-device-activation-secret': record.poll_secret },
      cache: 'no-store'
    });
    if (response.status === 410 || response.status === 404) {
      clearActivation();
      invalidatePairing();
      await createActivation({ automatic: true });
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status === 'authorized') {
      clearActivation();
      clearPairingTimers();
      activationStatus.textContent = 'Авторизовано. Запускаем ТВ МЕНЮ…';
      await loadPlayer();
      return;
    }
    activationStatus.textContent = 'Ожидание авторизации…';
  } catch {
    activationStatus.textContent = 'Нет связи с сервером. QR действует до окончания таймера.';
  }
  if (Date.parse(record.expires_at) > Date.now()) schedulePoll(record);
}

async function createActivation({ automatic = false } = {}) {
  if (activationRequestInFlight) return;
  activationRequestInFlight = true;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (!automatic) {
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
  }
  showActivationButton.disabled = true;
  activationStatus.textContent = automatic ? 'Обновляем код подключения…' : 'Создаём код подключения…';
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
    clearPairingTimers();
    saveActivation(record);
    showPairing(record);
    schedulePoll(record);
  } catch (error) {
    console.error('TV activation could not start', error);
    clearActivation();
    setHidden(pairing, false);
    invalidatePairing('Нет связи с сервером. Новый QR появится автоматически после восстановления связи.');
    rotationRetryTimer = setTimeout(() => void createActivation({ automatic: true }), 5000);
  } finally {
    activationRequestInFlight = false;
    showActivationButton.disabled = false;
  }
}

function resolutionOf(screen) {
  const match = String(screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  return { width: Number(match?.[1]) || 1920, height: Number(match?.[2]) || 1080 };
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
  const assets = [
    sameOriginAsset(context?.draft?.settings?.background_image_url),
    sameOriginAsset(context?.entity?.asset_url)
  ].filter(Boolean);
  await Promise.all(assets.map((asset) => fetch(asset, { cache: 'reload' }).catch(() => undefined)));
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
  playerStage.innerHTML = `
    <div class="tv-player-menu-layer">${buildTableSvg(model, lines, layout)}</div>
    <div class="tv-player-entity-layer" data-motion-entity-layer aria-hidden="true"></div>
    <div class="tv-player-announcement-layer" data-announcement-layer aria-label="Объявление"></div>`;
  playerStage.style.backgroundColor = model.settings.background_color || '#101828';
  const background = sameOriginAsset(model.settings.background_image_url);
  playerStage.style.backgroundImage = background ? `url(${JSON.stringify(background)})` : 'none';
  renderSceneEntity(playerStage, context.entity, { editable: false });
  renderAnnouncementLayer(playerStage.querySelector('[data-announcement-layer]'), context.announcement);
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
    return { context, offline: response.headers.get('x-tv-menu-offline') === '1' };
  } finally {
    clearTimeout(timer);
  }
}

function showCachedPlayer(record, message = 'Нет связи с сервером. ТВ работает по последней сохранённой версии меню.') {
  if (!record?.context) return false;
  clearPairingTimers();
  renderPlayerContext(record.context);
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
    if (!showCachedPlayer(cachedPlayerContext())) showConnectionMessage('Связь с сервером временно потеряна.');
    return;
  }
  schedulePlayerRefresh();
}

async function loadPlayer() {
  clearPairingTimers();
  try {
    const result = await fetchPlayerContext();
    if (result.unauthorized) {
      showActivationScreen();
      return false;
    }
    renderPlayerContext(result.context);
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
    showActivationScreen();
    return false;
  }
}

async function registerOfflinePlayer() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/player-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn('Offline TV player service worker could not start', error);
  }
}

async function initialisePlayer() {
  showActivationButton.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });
  await registerOfflinePlayer();
  try {
    const response = await fetch('/api/device/session', { cache: 'no-store' });
    if (response.ok) {
      await loadPlayer();
      return;
    }
    if (response.status === 401) clearPlayerContext();
  } catch {
    if (showCachedPlayer(cachedPlayerContext())) return;
  }
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