import { api } from '../core/api.js';
import { API } from '../core/config.js';
import { decodeTvActivationQr, recommendedQrFrameSize } from '../device/qr-decoder.js';

let message = null;
let scanButton = null;
let cameraWrap = null;
let video = null;
let codeInput = null;
let codeButton = null;
let deviceFound = null;
let activationValidity = null;
let locationStep = null;
let screenStep = null;
let locationOptions = null;
let screenOptions = null;
let authorizeButton = null;
let success = null;
let successText = null;
let bindingsList = null;
let refreshBindingsButton = null;
const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });

let activationId = null;
let activationExpiresAt = null;
let activationTimer = null;
let bindingsRefreshTimer = null;
let locations = [];
let screens = [];
let selectedLocationId = null;
let selectedScreenId = null;
let mediaStream = null;
let scannerRunning = false;
let mountGeneration = 0;

function bindDom() {
  message = document.querySelector('#connect-tv-message');
  scanButton = document.querySelector('[data-start-scan]');
  cameraWrap = document.querySelector('[data-camera-wrap]');
  video = document.querySelector('[data-camera]');
  codeInput = document.querySelector('#connect-tv-code');
  codeButton = document.querySelector('[data-use-code]');
  deviceFound = document.querySelector('[data-device-found]');
  activationValidity = document.querySelector('[data-activation-validity]');
  locationStep = document.querySelector('[data-connect-step="location"]');
  screenStep = document.querySelector('[data-connect-step="screen"]');
  locationOptions = document.querySelector('[data-location-options]');
  screenOptions = document.querySelector('[data-screen-options]');
  authorizeButton = document.querySelector('[data-authorize]');
  success = document.querySelector('[data-connect-success]');
  successText = document.querySelector('[data-connect-success-text]');
  bindingsList = document.querySelector('[data-device-bindings]');
  refreshBindingsButton = document.querySelector('[data-refresh-bindings]');
}

function isCurrent(generation) {
  return generation === mountGeneration && document.body?.dataset?.page === 'connect-tv';
}

function setMessage(text = '', error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-hidden', !text);
  message.classList.toggle('is-error', Boolean(text && error));
}

function stopActivationTimer() {
  if (activationTimer) window.clearInterval(activationTimer);
  activationTimer = null;
}

function stopBindingsRefreshTimer() {
  if (bindingsRefreshTimer) window.clearTimeout(bindingsRefreshTimer);
  bindingsRefreshTimer = null;
}

function remainingText(expiresAt) {
  const remaining = Math.max(0, Date.parse(expiresAt || '') - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function startActivationTimer(expiresAt) {
  stopActivationTimer();
  activationExpiresAt = expiresAt || null;
  if (!activationValidity || !activationExpiresAt) return;
  const generation = mountGeneration;
  const update = () => {
    if (!isCurrent(generation)) return stopActivationTimer();
    const remaining = Date.parse(activationExpiresAt) - Date.now();
    if (remaining <= 0) {
      stopActivationTimer();
      activationId = null;
      activationExpiresAt = null;
      activationValidity.textContent = 'Код подключения истёк.';
      resetSelection({ keepValidity: true });
      setMessage('Срок действия кода истёк. На телевизоре уже должен появиться новый QR-код и резервный код.', true);
      return;
    }
    activationValidity.textContent = `Код действителен ещё ${remainingText(activationExpiresAt)}`;
  };
  update();
  activationTimer = window.setInterval(update, 500);
}

function stopCamera() {
  scannerRunning = false;
  for (const track of mediaStream?.getTracks?.() || []) track.stop();
  mediaStream = null;
  if (video) video.srcObject = null;
  cameraWrap?.classList.add('is-hidden');
  if (scanButton) scanButton.textContent = 'Сканировать QR';
}

function resetSelection({ keepValidity = false } = {}) {
  selectedLocationId = null;
  selectedScreenId = null;
  locationStep?.classList.add('is-disabled');
  screenStep?.classList.add('is-disabled');
  if (locationOptions) locationOptions.innerHTML = '';
  if (screenOptions) screenOptions.innerHTML = '';
  if (authorizeButton) authorizeButton.disabled = true;
  deviceFound?.classList.add('is-hidden');
  success?.classList.add('is-hidden');
  if (!keepValidity && activationValidity) {
    activationValidity.textContent = '';
    activationValidity.classList.add('is-hidden');
  }
}

function optionButton({ title, subtitle = '', selected = false, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `connect-tv-option${selected ? ' is-selected' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  button.append(strong);
  if (subtitle) {
    const span = document.createElement('span');
    span.textContent = subtitle;
    button.append(span);
  }
  button.addEventListener('click', onClick);
  return button;
}

function renderScreens() {
  if (!screenOptions) return;
  screenOptions.innerHTML = '';
  const available = screens.filter((screen) => Number(screen.location_id) === Number(selectedLocationId) && screen.active !== false);
  if (!available.length) {
    const empty = document.createElement('p');
    empty.textContent = 'В этой торговой точке нет активных мониторов.';
    screenOptions.append(empty);
    if (authorizeButton) authorizeButton.disabled = true;
    return;
  }

  for (const screen of available) {
    screenOptions.append(optionButton({
      title: screen.name,
      subtitle: `${screen.resolution || '1920×1080'} · ТВ ${screen.location_number || screen.id}`,
      selected: Number(screen.id) === Number(selectedScreenId),
      onClick: () => {
        selectedScreenId = Number(screen.id);
        renderScreens();
        if (authorizeButton) authorizeButton.disabled = false;
      }
    }));
  }
}

function renderLocations() {
  if (!locationOptions) return;
  locationOptions.innerHTML = '';
  for (const location of locations.filter((item) => item.active !== false)) {
    locationOptions.append(optionButton({
      title: location.name,
      subtitle: location.address || '',
      selected: Number(location.id) === Number(selectedLocationId),
      onClick: () => {
        selectedLocationId = Number(location.id);
        selectedScreenId = null;
        renderLocations();
        screenStep?.classList.remove('is-disabled');
        renderScreens();
      }
    }));
  }
}

async function loadStructure(generation = mountGeneration) {
  const [nextLocations, nextScreens] = await Promise.all([
    api.get(API.locations),
    api.get(API.screens)
  ]);
  if (!isCurrent(generation)) return false;
  locations = nextLocations;
  screens = nextScreens;
  return true;
}

function formatLastSeen(value) {
  if (!value) return 'последняя связь ещё не зафиксирована';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'последняя связь неизвестна';
  return `последняя связь: ${date.toLocaleString('ru-RU')}`;
}

function bindingRow(binding) {
  const row = document.createElement('div');
  row.className = 'connect-tv-binding';

  const info = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `${binding.location_name} → ${binding.screen_name}`;
  const details = document.createElement('span');
  details.textContent = `ТВ ${binding.location_number || binding.screen_id} · ${formatLastSeen(binding.session_last_seen_at || binding.last_seen_at)}`;
  info.append(title, details);

  const revokeButton = document.createElement('button');
  revokeButton.type = 'button';
  revokeButton.className = 'button button-secondary';
  revokeButton.textContent = 'Отключить';
  revokeButton.addEventListener('click', async () => {
    const confirmed = window.confirm(`Отменить авторизацию телевизора для «${binding.screen_name}»?`);
    if (!confirmed) return;
    const generation = mountGeneration;
    revokeButton.disabled = true;
    setMessage('Отключаем телевизор…');
    try {
      await api.delete(`${API.deviceBindings}/${encodeURIComponent(binding.screen_id)}`);
      if (!isCurrent(generation)) return;
      setMessage(`Авторизация телевизора для «${binding.screen_name}» отменена.`);
      await loadBindings(generation);
    } catch (error) {
      if (!isCurrent(generation)) return;
      setMessage(error.message || 'Не удалось отключить телевизор.', true);
      revokeButton.disabled = false;
    }
  });

  row.append(info, revokeButton);
  return row;
}

async function loadBindings(generation = mountGeneration) {
  if (!bindingsList || !isCurrent(generation)) return;
  if (refreshBindingsButton) refreshBindingsButton.disabled = true;
  try {
    const bindings = await api.get(API.deviceBindings);
    if (!isCurrent(generation) || !bindingsList) return;
    bindingsList.innerHTML = '';
    if (!Array.isArray(bindings) || !bindings.length) {
      const empty = document.createElement('p');
      empty.className = 'connect-tv-bindings-empty';
      empty.textContent = 'Авторизованных телевизоров пока нет.';
      bindingsList.append(empty);
      return;
    }
    bindings.forEach((binding) => bindingsList.append(bindingRow(binding)));
  } catch (error) {
    if (!isCurrent(generation) || !bindingsList) return;
    bindingsList.innerHTML = '';
    const empty = document.createElement('p');
    empty.className = 'connect-tv-bindings-empty';
    empty.textContent = error.message || 'Не удалось загрузить подключённые телевизоры.';
    bindingsList.append(empty);
  } finally {
    if (isCurrent(generation) && refreshBindingsButton) refreshBindingsButton.disabled = false;
  }
}

async function resolveActivation(payload) {
  const generation = mountGeneration;
  resetSelection();
  stopActivationTimer();
  setMessage('Проверяем код подключения…');
  try {
    const body = payload.scan_payload
      ? { scan_payload: payload.scan_payload }
      : { reserve_code: payload.reserve_code };
    const activation = await api.post(API.deviceResolve, body);
    if (!isCurrent(generation)) return;
    activationId = activation.activation_id;
    activationExpiresAt = activation.expires_at;
    if (!await loadStructure(generation) || !isCurrent(generation)) return;
    if (deviceFound) {
      deviceFound.textContent = 'Телевизор найден. Теперь выберите торговую точку и монитор.';
      deviceFound.classList.remove('is-hidden');
    }
    if (activationValidity) activationValidity.classList.remove('is-hidden');
    startActivationTimer(activation.expires_at);
    locationStep?.classList.remove('is-disabled');
    renderLocations();
    setMessage('Телевизор найден. Выберите место установки.');
    stopCamera();
  } catch (error) {
    if (!isCurrent(generation)) return;
    activationId = null;
    activationExpiresAt = null;
    setMessage(error.message || 'Не удалось проверить код подключения.', true);
  }
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(formats) && !formats.includes('qr_code')) return null;
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function decodeCurrentCanvas() {
  if (!scanContext || !scanCanvas.width || !scanCanvas.height) return null;
  return decodeTvActivationQr(scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height));
}

function localScanPayload() {
  if (!scanContext || !video?.videoWidth || !video?.videoHeight) return null;
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  const visibleSquare = Math.min(sourceWidth, sourceHeight);
  const guideCrop = Math.max(1, Math.round(visibleSquare * 0.78));
  const sourceX = Math.max(0, Math.round((sourceWidth - guideCrop) / 2));
  const sourceY = Math.max(0, Math.round((sourceHeight - guideCrop) / 2));
  const target = 720;
  if (scanCanvas.width !== target) scanCanvas.width = target;
  if (scanCanvas.height !== target) scanCanvas.height = target;
  scanContext.drawImage(video, sourceX, sourceY, guideCrop, guideCrop, 0, 0, target, target);
  const guided = decodeCurrentCanvas();
  if (guided) return guided;

  const size = recommendedQrFrameSize(sourceWidth, sourceHeight);
  if (scanCanvas.width !== size.width) scanCanvas.width = size.width;
  if (scanCanvas.height !== size.height) scanCanvas.height = size.height;
  scanContext.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, size.width, size.height);
  return decodeCurrentCanvas();
}

async function scanLoop(detector, generation) {
  while (scannerRunning && isCurrent(generation)) {
    let rawValue = null;
    if (detector) {
      try {
        const codes = await detector.detect(video);
        rawValue = codes.find((entry) => String(entry.rawValue || '').startsWith('TV2:'))?.rawValue || null;
      } catch {}
    }
    if (!rawValue) {
      try { rawValue = localScanPayload(); } catch {}
    }
    if (rawValue && isCurrent(generation)) {
      scannerRunning = false;
      setMessage('QR-код распознан. Проверяем телевизор…');
      await resolveActivation({ scan_payload: rawValue });
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, detector ? 180 : 220));
  }
}

async function improveCameraFocus(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.getCapabilities || !track?.applyConstraints) return;
  try {
    const capabilities = track.getCapabilities();
    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch {}
}

async function startScanner() {
  const generation = mountGeneration;
  setMessage('');
  if (scannerRunning) {
    stopCamera();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setMessage('Этот браузер не предоставляет доступ к камере. Используйте 6-значный код с телевизора.', true);
    return;
  }

  let stream = null;
  try {
    const detector = await nativeDetector();
    if (!isCurrent(generation)) return;
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    if (!isCurrent(generation)) {
      for (const track of stream.getTracks?.() || []) track.stop();
      return;
    }
    mediaStream = stream;
    await improveCameraFocus(mediaStream);
    if (!isCurrent(generation)) return stopCamera();
    video.srcObject = mediaStream;
    await video.play();
    if (!isCurrent(generation)) return stopCamera();
    scannerRunning = true;
    cameraWrap?.classList.remove('is-hidden');
    if (scanButton) scanButton.textContent = 'Остановить камеру';
    setMessage('Поместите QR-код целиком внутрь жёлтой рамки и держите телефон неподвижно.');
    void scanLoop(detector, generation);
  } catch (error) {
    if (!isCurrent(generation)) {
      for (const track of stream?.getTracks?.() || []) track.stop();
      return;
    }
    console.warn('TV QR scanner could not start', error);
    stopCamera();
    setMessage('Не удалось открыть камеру. Разрешите доступ к камере или используйте 6-значный код.', true);
  }
}

function normalizeReserveCode() {
  const digits = String(codeInput?.value || '').replace(/\D/g, '').slice(0, 6);
  if (codeInput) codeInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  return digits;
}

async function authorize() {
  const generation = mountGeneration;
  if (!activationId || !selectedScreenId) return;
  if (Date.parse(activationExpiresAt || '') <= Date.now()) {
    activationId = null;
    if (authorizeButton) authorizeButton.disabled = true;
    setMessage('Срок действия кода подключения истёк. Отсканируйте новый QR-код.', true);
    return;
  }
  if (authorizeButton) authorizeButton.disabled = true;
  setMessage('Авторизуем телевизор…');
  try {
    const result = await api.post(API.deviceAuthorize, {
      activation_id: activationId,
      screen_id: selectedScreenId
    });
    if (!isCurrent(generation)) return;
    stopActivationTimer();
    activationExpiresAt = null;
    if (successText) successText.textContent = `${result.screen.location_name} → ${result.screen.name}. Телевизор автоматически перейдёт в полноэкранный Player.`;
    success?.classList.remove('is-hidden');
    setMessage('Подключение подтверждено.');
    activationId = null;
    stopBindingsRefreshTimer();
    bindingsRefreshTimer = window.setTimeout(() => {
      bindingsRefreshTimer = null;
      if (isCurrent(generation)) void loadBindings(generation);
    }, 2500);
  } catch (error) {
    if (!isCurrent(generation)) return;
    setMessage(error.message || 'Не удалось авторизовать телевизор.', true);
    if (authorizeButton) authorizeButton.disabled = false;
  }
}

function resetRuntimeState() {
  stopCamera();
  stopActivationTimer();
  stopBindingsRefreshTimer();
  activationId = null;
  activationExpiresAt = null;
  locations = [];
  screens = [];
  selectedLocationId = null;
  selectedScreenId = null;
}

export function initialiseConnectTv() {
  resetRuntimeState();
  bindDom();
  const generation = ++mountGeneration;
  resetSelection();
  void loadBindings(generation);
  scanButton?.addEventListener('click', () => void startScanner());
  codeInput?.addEventListener('input', normalizeReserveCode);
  codeButton?.addEventListener('click', () => {
    const code = normalizeReserveCode();
    if (code.length !== 6) {
      setMessage('Введите все 6 цифр резервного кода.', true);
      return;
    }
    void resolveActivation({ reserve_code: code });
  });
  authorizeButton?.addEventListener('click', () => void authorize());
  refreshBindingsButton?.addEventListener('click', () => void loadBindings(generation));

  const onPageHide = () => {
    stopCamera();
    stopActivationTimer();
    stopBindingsRefreshTimer();
  };
  window.addEventListener('pagehide', onPageHide);

  return {
    dispose() {
      if (generation !== mountGeneration) return;
      mountGeneration += 1;
      window.removeEventListener('pagehide', onPageHide);
      resetRuntimeState();
    }
  };
}
