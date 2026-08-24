import { api } from '../core/api.js';
import { API } from '../core/config.js';

const message = document.querySelector('#connect-tv-message');
const scanButton = document.querySelector('[data-start-scan]');
const scanner = document.querySelector('[data-scanner]');
const scannerClose = document.querySelector('[data-scanner-close]');
const scannerCode = document.querySelector('[data-scanner-code]');
const scannerStatus = document.querySelector('[data-scanner-status]');
const video = document.querySelector('[data-camera]');
const scanCanvas = document.querySelector('[data-scan-canvas]');
const codeToggle = document.querySelector('[data-code-toggle]');
const codePanel = document.querySelector('[data-code-panel]');
const codeInput = document.querySelector('#connect-tv-code');
const codeButton = document.querySelector('[data-use-code]');
const deviceFound = document.querySelector('[data-device-found]');
const locationStep = document.querySelector('[data-connect-step="location"]');
const screenStep = document.querySelector('[data-connect-step="screen"]');
const locationOptions = document.querySelector('[data-location-options]');
const screenOptions = document.querySelector('[data-screen-options]');
const authorizeButton = document.querySelector('[data-authorize]');
const success = document.querySelector('[data-connect-success]');
const successText = document.querySelector('[data-connect-success-text]');

let activationId = null;
let locations = [];
let screens = [];
let bindings = [];
let selectedLocationId = null;
let selectedScreenId = null;
let mediaStream = null;
let scannerRunning = false;
let scanDetector = null;
let scanFrame = 0;

function setMessage(text = '', error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-hidden', !text);
  message.classList.toggle('is-error', Boolean(text && error));
}

function setProgress(step) {
  const order = ['scan', 'location', 'screen'];
  const current = order.indexOf(step);
  document.querySelectorAll('[data-progress-step]').forEach((item) => {
    const index = order.indexOf(item.dataset.progressStep);
    item.classList.toggle('is-active', index === current);
    item.classList.toggle('is-done', index >= 0 && index < current);
  });
}

function focusStep(element, name) {
  setProgress(name);
  if (window.matchMedia('(max-width: 760px)').matches) {
    requestAnimationFrame(() => element?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

function stopCamera() {
  scannerRunning = false;
  scanDetector = null;
  if (scanFrame) cancelAnimationFrame(scanFrame);
  scanFrame = 0;
  for (const track of mediaStream?.getTracks?.() || []) track.stop();
  mediaStream = null;
  if (video) video.srcObject = null;
  scanner?.classList.add('is-hidden');
  document.documentElement.classList.remove('connect-tv-scanner-open');
}

function resetSelection() {
  activationId = null;
  selectedLocationId = null;
  selectedScreenId = null;
  locationStep?.classList.add('is-disabled');
  screenStep?.classList.add('is-disabled');
  locationOptions.innerHTML = '';
  screenOptions.innerHTML = '';
  authorizeButton.disabled = true;
  authorizeButton.textContent = 'Подключить ТВ';
  deviceFound?.classList.add('is-hidden');
  success?.classList.add('is-hidden');
  setProgress('scan');
}

function bindingForScreen(screenId) {
  return bindings.find((binding) => Number(binding.screen_id) === Number(screenId)) || null;
}

function optionButton({ title, subtitle = '', selected = false, occupied = false, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `connect-tv-option${selected ? ' is-selected' : ''}${occupied ? ' is-occupied' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  button.append(strong);
  if (subtitle) {
    const span = document.createElement('span');
    span.textContent = subtitle;
    button.append(span);
  }
  if (occupied) {
    const state = document.createElement('em');
    state.className = 'connect-tv-option-state';
    state.textContent = 'ТВ подключён';
    button.append(state);
  }
  button.addEventListener('click', onClick);
  return button;
}

function renderScreens() {
  screenOptions.innerHTML = '';
  const available = screens.filter((screen) => Number(screen.location_id) === Number(selectedLocationId) && screen.active !== false);
  if (!available.length) {
    const empty = document.createElement('p');
    empty.className = 'connect-tv-empty';
    empty.textContent = 'В этой торговой точке нет активных мониторов.';
    screenOptions.append(empty);
    authorizeButton.disabled = true;
    return;
  }
  for (const screen of available) {
    const binding = bindingForScreen(screen.id);
    screenOptions.append(optionButton({
      title: screen.name,
      subtitle: `${screen.resolution || '1920×1080'} · ТВ ${screen.location_number || screen.id}`,
      selected: Number(screen.id) === Number(selectedScreenId),
      occupied: Boolean(binding),
      onClick: () => {
        selectedScreenId = Number(screen.id);
        renderScreens();
        authorizeButton.disabled = false;
        authorizeButton.textContent = binding ? 'Заменить подключённый ТВ' : 'Подключить ТВ';
      }
    }));
  }
}

function renderLocations() {
  locationOptions.innerHTML = '';
  for (const location of locations.filter((item) => item.active !== false)) {
    locationOptions.append(optionButton({
      title: location.name,
      subtitle: location.address || '',
      selected: Number(location.id) === Number(selectedLocationId),
      onClick: () => {
        selectedLocationId = Number(location.id);
        selectedScreenId = null;
        authorizeButton.disabled = true;
        authorizeButton.textContent = 'Подключить ТВ';
        renderLocations();
        screenStep?.classList.remove('is-disabled');
        renderScreens();
        focusStep(screenStep, 'screen');
      }
    }));
  }
}

async function loadStructure() {
  [locations, screens, bindings] = await Promise.all([
    api.get(API.locations),
    api.get(API.screens),
    api.get(API.deviceBindings)
  ]);
  if (!Array.isArray(bindings)) bindings = [];
}

async function resolveActivation(payload) {
  setMessage('Проверяем телевизор…');
  try {
    const body = payload.scan_payload ? { scan_payload: payload.scan_payload } : { reserve_code: payload.reserve_code };
    const activation = await api.post(API.deviceResolve, body);
    activationId = activation.activation_id;
    await loadStructure();
    deviceFound.textContent = 'Телевизор найден ✓';
    deviceFound.classList.remove('is-hidden');
    locationStep?.classList.remove('is-disabled');
    setMessage('');
    stopCamera();
    renderLocations();
    focusStep(locationStep, 'location');
  } catch (error) {
    activationId = null;
    const text = error.message || 'Не удалось проверить код подключения.';
    setMessage(text, true);
    if (!scanner?.classList.contains('is-hidden')) scannerStatus.textContent = text;
  }
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(formats) && !formats.includes('qr_code')) return null;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    return async () => {
      const codes = await detector.detect(video);
      return codes.find((entry) => String(entry.rawValue || '').startsWith('TV2:'))?.rawValue || '';
    };
  } catch {
    return null;
  }
}

function jsQrDetector() {
  if (typeof window.jsQR !== 'function' || !scanCanvas) return null;
  const context = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  return async () => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return '';
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / width);
    scanCanvas.width = Math.max(1, Math.round(width * scale));
    scanCanvas.height = Math.max(1, Math.round(height * scale));
    context.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
    const image = context.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
    const result = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    const value = String(result?.data || '');
    return value.startsWith('TV2:') ? value : '';
  };
}

async function scanLoop() {
  if (!scannerRunning || !scanDetector) return;
  try {
    const rawValue = await scanDetector();
    if (rawValue) {
      scannerRunning = false;
      scannerStatus.textContent = 'QR-код найден. Проверяем телевизор…';
      await resolveActivation({ scan_payload: rawValue });
      return;
    }
  } catch {}
  if (!scannerRunning) return;
  scanFrame = requestAnimationFrame(() => setTimeout(() => void scanLoop(), 110));
}

async function startScanner() {
  setMessage('');
  if (scannerRunning) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    codePanel?.classList.remove('is-hidden');
    setMessage('Камера недоступна в этом браузере. Введите 6-значный код.', true);
    codeInput?.focus();
    return;
  }
  scanner?.classList.remove('is-hidden');
  document.documentElement.classList.add('connect-tv-scanner-open');
  scannerStatus.textContent = 'Запрашиваем доступ к камере…';
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = mediaStream;
    await video.play();
    scanDetector = await nativeDetector() || jsQrDetector();
    if (!scanDetector) throw new Error('decoder-unavailable');
    scannerRunning = true;
    scannerStatus.textContent = 'Наведите камеру на QR-код телевизора';
    void scanLoop();
  } catch (error) {
    stopCamera();
    codePanel?.classList.remove('is-hidden');
    const text = error?.message === 'decoder-unavailable'
      ? 'QR-сканер недоступен. Введите резервный 6-значный код.'
      : 'Не удалось открыть камеру. Разрешите доступ или введите 6-значный код.';
    setMessage(text, true);
    codeInput?.focus();
  }
}

function normalizeReserveCode() {
  const digits = String(codeInput.value || '').replace(/\D/g, '').slice(0, 6);
  codeInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  return digits;
}

async function sendAuthorization(replaceExisting) {
  return api.post(API.deviceAuthorize, {
    activation_id: activationId,
    screen_id: selectedScreenId,
    replace_existing: replaceExisting
  });
}

async function authorize() {
  if (!activationId || !selectedScreenId) return;
  const screen = screens.find((item) => Number(item.id) === Number(selectedScreenId));
  const occupied = Boolean(bindingForScreen(selectedScreenId));
  if (occupied) {
    const confirmed = window.confirm(`К монитору «${screen?.name || selectedScreenId}» уже подключён ТВ. Отвязать его и подключить этот телевизор?`);
    if (!confirmed) return;
  }

  authorizeButton.disabled = true;
  setMessage(occupied ? 'Заменяем привязку телевизора…' : 'Подключаем телевизор…');
  try {
    let result;
    try {
      result = await sendAuthorization(occupied);
    } catch (error) {
      const collision = error?.status === 409 && error?.body?.details?.reason === 'screen_already_bound';
      if (!collision || occupied) throw error;
      const confirmed = window.confirm(`К монитору «${screen?.name || selectedScreenId}» только что подключили другой ТВ. Заменить его?`);
      if (!confirmed) throw error;
      result = await sendAuthorization(true);
    }
    successText.textContent = `${result.screen.location_name} → ${result.screen.name}. ${result.replaces_existing ? 'Предыдущий ТВ будет отвязан. ' : ''}Телевизор автоматически откроет ТВ МЕНЮ.`;
    success.classList.remove('is-hidden');
    document.querySelector('.connect-tv-flow')?.classList.add('is-hidden');
    setMessage('');
    activationId = null;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    setMessage(error.message || 'Не удалось подключить телевизор.', true);
    authorizeButton.disabled = false;
  }
}

export function initialiseConnectTv() {
  resetSelection();
  scanButton?.addEventListener('click', () => void startScanner());
  scannerClose?.addEventListener('click', stopCamera);
  scannerCode?.addEventListener('click', () => {
    stopCamera();
    codePanel?.classList.remove('is-hidden');
    codeInput?.focus();
  });
  codeToggle?.addEventListener('click', () => {
    codePanel?.classList.toggle('is-hidden');
    if (!codePanel?.classList.contains('is-hidden')) codeInput?.focus();
  });
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
  window.addEventListener('pagehide', stopCamera, { once: true });
}
