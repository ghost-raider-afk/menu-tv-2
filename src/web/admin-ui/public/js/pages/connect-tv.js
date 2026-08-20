import { api } from '../core/api.js';
import { API } from '../core/config.js';

const message = document.querySelector('#connect-tv-message');
const scanButton = document.querySelector('[data-start-scan]');
const cameraWrap = document.querySelector('[data-camera-wrap]');
const video = document.querySelector('[data-camera]');
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
const bindingsList = document.querySelector('[data-device-bindings]');
const refreshBindingsButton = document.querySelector('[data-refresh-bindings]');

let activationId = null;
let locations = [];
let screens = [];
let selectedLocationId = null;
let selectedScreenId = null;
let mediaStream = null;
let scannerRunning = false;

function setMessage(text = '', error = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('is-hidden', !text);
  message.classList.toggle('is-error', Boolean(text && error));
}

function stopCamera() {
  scannerRunning = false;
  for (const track of mediaStream?.getTracks?.() || []) track.stop();
  mediaStream = null;
  if (video) video.srcObject = null;
  cameraWrap?.classList.add('is-hidden');
  if (scanButton) scanButton.textContent = 'Сканировать QR';
}

function resetSelection() {
  selectedLocationId = null;
  selectedScreenId = null;
  locationStep?.classList.add('is-disabled');
  screenStep?.classList.add('is-disabled');
  locationOptions.innerHTML = '';
  screenOptions.innerHTML = '';
  authorizeButton.disabled = true;
  deviceFound?.classList.add('is-hidden');
  success?.classList.add('is-hidden');
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
  screenOptions.innerHTML = '';
  const available = screens.filter((screen) => Number(screen.location_id) === Number(selectedLocationId) && screen.active !== false);
  if (!available.length) {
    const empty = document.createElement('p');
    empty.textContent = 'В этой торговой точке нет активных мониторов.';
    screenOptions.append(empty);
    authorizeButton.disabled = true;
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
        authorizeButton.disabled = false;
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
        renderLocations();
        screenStep?.classList.remove('is-disabled');
        renderScreens();
      }
    }));
  }
}

async function loadStructure() {
  [locations, screens] = await Promise.all([
    api.get(API.locations),
    api.get(API.screens)
  ]);
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
    revokeButton.disabled = true;
    setMessage('Отключаем телевизор…');
    try {
      await api.delete(`${API.deviceBindings}/${encodeURIComponent(binding.screen_id)}`);
      setMessage(`Авторизация телевизора для «${binding.screen_name}» отменена.`);
      await loadBindings();
    } catch (error) {
      setMessage(error.message || 'Не удалось отключить телевизор.', true);
      revokeButton.disabled = false;
    }
  });

  row.append(info, revokeButton);
  return row;
}

async function loadBindings() {
  if (!bindingsList) return;
  refreshBindingsButton && (refreshBindingsButton.disabled = true);
  try {
    const bindings = await api.get(API.deviceBindings);
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
    bindingsList.innerHTML = '';
    const empty = document.createElement('p');
    empty.className = 'connect-tv-bindings-empty';
    empty.textContent = error.message || 'Не удалось загрузить подключённые телевизоры.';
    bindingsList.append(empty);
  } finally {
    refreshBindingsButton && (refreshBindingsButton.disabled = false);
  }
}

async function resolveActivation(payload) {
  resetSelection();
  setMessage('Проверяем код подключения…');
  try {
    const body = payload.scan_payload
      ? { scan_payload: payload.scan_payload }
      : { reserve_code: payload.reserve_code };
    const activation = await api.post(API.deviceResolve, body);
    activationId = activation.activation_id;
    await loadStructure();
    deviceFound.textContent = 'Телевизор найден. Теперь выберите торговую точку и монитор.';
    deviceFound.classList.remove('is-hidden');
    locationStep?.classList.remove('is-disabled');
    renderLocations();
    setMessage('Телевизор найден. Выберите место установки.');
    stopCamera();
  } catch (error) {
    activationId = null;
    setMessage(error.message || 'Не удалось проверить код подключения.', true);
  }
}

async function scanLoop(detector) {
  while (scannerRunning) {
    try {
      const codes = await detector.detect(video);
      const rawValue = codes.find((entry) => String(entry.rawValue || '').startsWith('TV2:'))?.rawValue;
      if (rawValue) {
        scannerRunning = false;
        await resolveActivation({ scan_payload: rawValue });
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
}

async function startScanner() {
  setMessage('');
  if (scannerRunning) {
    stopCamera();
    return;
  }
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    setMessage('На этом телефоне автоматическое сканирование QR недоступно. Введите 6-значный код с телевизора.', true);
    return;
  }

  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(formats) && !formats.includes('qr_code')) throw new Error('qr-not-supported');
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = mediaStream;
    await video.play();
    scannerRunning = true;
    cameraWrap.classList.remove('is-hidden');
    scanButton.textContent = 'Остановить камеру';
    setMessage('Наведите камеру на QR-код телевизора.');
    void scanLoop(detector);
  } catch (error) {
    stopCamera();
    setMessage('Не удалось открыть QR-сканер. Разрешите доступ к камере или используйте 6-значный код.', true);
  }
}

function normalizeReserveCode() {
  const digits = String(codeInput.value || '').replace(/\D/g, '').slice(0, 6);
  codeInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  return digits;
}

async function authorize() {
  if (!activationId || !selectedScreenId) return;
  authorizeButton.disabled = true;
  setMessage('Авторизуем телевизор…');
  try {
    const result = await api.post(API.deviceAuthorize, {
      activation_id: activationId,
      screen_id: selectedScreenId
    });
    successText.textContent = `${result.screen.location_name} → ${result.screen.name}. Телевизор автоматически перейдёт в полноэкранный Player.`;
    success.classList.remove('is-hidden');
    setMessage('Подключение подтверждено.');
    activationId = null;
    window.setTimeout(() => void loadBindings(), 2500);
  } catch (error) {
    setMessage(error.message || 'Не удалось авторизовать телевизор.', true);
    authorizeButton.disabled = false;
  }
}

export function initialiseConnectTv() {
  resetSelection();
  void loadBindings();
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
  refreshBindingsButton?.addEventListener('click', () => void loadBindings());
  window.addEventListener('pagehide', stopCamera, { once: true });
}
