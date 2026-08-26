import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, replacements) {
  let source = await readFile(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (!source.includes(from)) throw new Error(`${path}: missing patch anchor: ${label}`);
    source = source.replace(from, to);
  }
  await writeFile(path, source);
}

const playerPath = 'src/web/admin-ui/public/js/player/player.js';
await patch(playerPath, [
  [
    "const activationStatus = document.querySelector('[data-activation-status]');\nconst player = document.querySelector('[data-tv-player]');",
    "const activationStatus = document.querySelector('[data-activation-status]');\nconst activationLead = document.querySelector('.activation-lead');\nconst player = document.querySelector('[data-tv-player]');",
    'activation lead reference'
  ],
  [
    'let activationRequestInFlight = false;',
    'let activationRequestInFlight = false;\nlet bootstrapRetryTimer = null;',
    'bootstrap timer state'
  ],
  [
`function clearPairingTimers() {
  if (pollTimer) clearTimeout(pollTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  if (rotationRetryTimer) clearTimeout(rotationRetryTimer);
  pollTimer = null;
  expiryTimer = null;
  rotationRetryTimer = null;
}`,
`function clearPairingTimers() {
  if (pollTimer) clearTimeout(pollTimer);
  if (expiryTimer) clearInterval(expiryTimer);
  if (rotationRetryTimer) clearTimeout(rotationRetryTimer);
  pollTimer = null;
  expiryTimer = null;
  rotationRetryTimer = null;
}

function clearBootstrapRetry() {
  if (bootstrapRetryTimer) clearTimeout(bootstrapRetryTimer);
  bootstrapRetryTimer = null;
}

function setActivationLead(text) {
  if (activationLead) activationLead.textContent = text;
}`,
    'pairing timer helpers'
  ],
  [
`function showActivationScreen() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  liveMotion.destroy();
  setHidden(player, true);
  setHidden(activationView, false);
  setHidden(playerMessage, true);
}`,
`function showActivationScreen() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  liveMotion.destroy();
  setHidden(player, true);
  setHidden(activationView, false);
  setHidden(playerMessage, true);
}

function showPairingIntro() {
  clearPairingTimers();
  clearBootstrapRetry();
  showActivationScreen();
  setActivationLead('Этот телевизор ещё не авторизован.');
  showActivationButton.textContent = 'Показать QR-код';
  showActivationButton.disabled = false;
  setHidden(showActivationButton, false);
  setHidden(pairing, true);
}

function showBootstrapUnavailable(text = 'Связь с сервером временно недоступна. Повторяем проверку…') {
  showActivationScreen();
  setActivationLead(text);
  setHidden(pairing, true);
  setHidden(showActivationButton, true);
}

function scheduleBootstrapRetry(delay = 3000) {
  clearBootstrapRetry();
  bootstrapRetryTimer = setTimeout(() => void bootstrapPlayer(), delay);
}`,
    'bootstrap UI state helpers'
  ],
  [
`function showPairing(record) {
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

async function pollActivation(record, { revealPending = true } = {}) {
  if (Date.parse(record.expires_at) <= Date.now()) return;
  try {
    const response = await fetch(\`/api/device/activations/\${encodeURIComponent(record.activation_id)}/status\`, {
      headers: { 'x-device-activation-secret': record.poll_secret },
      cache: 'no-store'
    });
    if (response.status === 410 || response.status === 404) {
      clearActivation();
      invalidatePairing();
      await createActivation({ automatic: true });
      return;
    }
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    const body = await response.json();
    if (body.status === 'authorized') {
      clearActivation();
      clearPairingTimers();
      activationStatus.textContent = 'Авторизовано. Запускаем MIRA-TV…';
      await loadPlayer();
      return;
    }
    if (!revealPending) showPairing(record);
    else activationStatus.textContent = 'Ожидание авторизации…';
  } catch {
    if (!revealPending) showPairing(record);
    activationStatus.textContent = 'Нет связи с сервером. QR действует до окончания таймера.';
  }
  if (Date.parse(record.expires_at) > Date.now()) schedulePoll(record);
}`,
`function showPairing(record) {
  clearBootstrapRetry();
  showActivationScreen();
  setActivationLead('Этот телевизор ещё не авторизован.');
  setHidden(showActivationButton, false);
  qrContainer.innerHTML = record.qr_svg;
  reserveCode.textContent = formatReserveCode(record.reserve_code);
  activationStatus.textContent = 'Ожидание авторизации…';
  showActivationButton.textContent = 'Обновить код сейчас';
  setHidden(pairing, false);
  startExpiryCountdown(record);
}

function schedulePoll(record, options = {}) {
  if (pollTimer) clearTimeout(pollTimer);
  const delay = Math.max(1000, Number(record.poll_interval_ms) || 2000);
  pollTimer = setTimeout(() => void pollActivation(record, options), delay);
}

async function pollActivation(record, { revealPending = true } = {}) {
  if (Date.parse(record.expires_at) <= Date.now()) return;
  try {
    const response = await fetch(\`/api/device/activations/\${encodeURIComponent(record.activation_id)}/status\`, {
      headers: { 'x-device-activation-secret': record.poll_secret },
      cache: 'no-store'
    });
    if (response.status === 410 || response.status === 404) {
      clearActivation();
      if (revealPending) invalidatePairing();
      else showBootstrapUnavailable('Код подключения истёк. Создаём новый…');
      await createActivation({ automatic: true });
      return;
    }
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    const body = await response.json();
    if (body.status === 'authorized') {
      clearPairingTimers();
      activationStatus.textContent = 'Авторизовано. Запускаем MIRA-TV…';
      const started = await loadPlayer({ fallbackToActivation: false });
      if (started) {
        clearActivation();
        clearBootstrapRetry();
        return;
      }
      showBootstrapUnavailable('Авторизация получена. Завершаем подключение…');
      schedulePoll(record, { revealPending: false });
      return;
    }
    if (!revealPending) showPairing(record);
    else activationStatus.textContent = 'Ожидание авторизации…';
  } catch (error) {
    console.warn('TV activation poll failed', error);
    if (revealPending) {
      activationStatus.textContent = 'Нет связи с сервером. QR действует до окончания таймера.';
    } else {
      showBootstrapUnavailable('Проверяем сохранённое подключение…');
    }
  }
  if (Date.parse(record.expires_at) > Date.now()) schedulePoll(record, { revealPending });
}`,
    'activation polling state machine'
  ],
  [
`async function createActivation({ automatic = false } = {}) {
  if (activationRequestInFlight) return;
  const previous = activationFromStorage();`,
`async function createActivation({ automatic = false } = {}) {
  if (activationRequestInFlight) return;
  clearBootstrapRetry();
  setActivationLead('Этот телевизор ещё не авторизован.');
  setHidden(showActivationButton, false);
  const previous = activationFromStorage();`,
    'activation request entry'
  ],
  [
`    setHidden(pairing, false);
    if (error?.status === 429) {`,
`    showActivationScreen();
    setHidden(showActivationButton, false);
    setHidden(pairing, false);
    if (error?.status === 429) {`,
    'activation request failure visibility'
  ],
  [
`async function fetchPlayerContext(timeoutMs = 5000) {`,
`async function fetchDeviceSession(timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/device/session', { cache: 'no-store', signal: controller.signal });
    if (response.status === 401 || response.status === 403) return { unauthorized: true };
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return { session: await response.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlayerContext(timeoutMs = 5000) {`,
    'device session probe'
  ],
  [
`    if (result.unauthorized) {
      clearActivation();
      showActivationScreen();
      setHidden(pairing, true);
      showActivationButton.textContent = 'Показать QR-код';
      return;
    }`,
`    if (result.unauthorized) {
      clearActivation();
      showPairingIntro();
      return;
    }`,
    'refresh unauthorized state'
  ],
  [
`async function loadPlayer() {
  clearPairingTimers();
  try {
    const result = await fetchPlayerContext();
    if (result.unauthorized) {
      showActivationScreen();
      return false;
    }`,
`async function loadPlayer({ fallbackToActivation = true } = {}) {
  clearPairingTimers();
  try {
    const result = await fetchPlayerContext();
    if (result.unauthorized) {
      if (fallbackToActivation) showPairingIntro();
      return false;
    }`,
    'load player options'
  ],
  [
`    const cached = cachedPlayerContext();
    if (showCachedPlayer(cached)) return true;
    showActivationScreen();
    return false;`,
`    const cached = cachedPlayerContext();
    if (showCachedPlayer(cached)) return true;
    if (fallbackToActivation) showPairingIntro();
    return false;`,
    'load player failure fallback'
  ],
  [
`async function initialisePlayer() {
  showActivationButton.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });
  await registerOfflinePlayer();
  try {
    const response = await fetch('/api/device/session', { cache: 'no-store' });
    if (response.ok) {
      const session = await response.json().catch(() => null);
      rememberDeviceKey(session?.device_key);
      await loadPlayer();
      return;
    }
    if (response.status === 401) clearPlayerContext();
  } catch {
    if (showCachedPlayer(cachedPlayerContext())) return;
  }
  const pending = activationFromStorage();
  if (pending) {
    rememberDeviceKey(pending.device_key);
    await pollActivation(pending, { revealPending: false });
  } else {
    showActivationScreen();
    setHidden(pairing, true);
  }
}

void initialisePlayer();`,
`async function bootstrapPlayer() {
  clearBootstrapRetry();
  try {
    const result = await fetchDeviceSession();
    if (!result.unauthorized) {
      rememberDeviceKey(result.session?.device_key);
      const started = await loadPlayer({ fallbackToActivation: false });
      if (started) {
        clearActivation();
        return;
      }
      const pending = activationFromStorage();
      if (pending) {
        rememberDeviceKey(pending.device_key);
        showBootstrapUnavailable('Завершаем авторизацию телевизора…');
        await pollActivation(pending, { revealPending: false });
        return;
      }
      showBootstrapUnavailable('Проверяем привязку телевизора…');
      scheduleBootstrapRetry();
      return;
    }
    clearPlayerContext();
  } catch (error) {
    console.warn('TV session bootstrap failed', error);
    if (showCachedPlayer(cachedPlayerContext())) return;
    const pending = activationFromStorage();
    if (pending) {
      rememberDeviceKey(pending.device_key);
      showBootstrapUnavailable('Проверяем ранее созданный код подключения…');
      await pollActivation(pending, { revealPending: false });
      return;
    }
    showBootstrapUnavailable();
    scheduleBootstrapRetry();
    return;
  }

  const pending = activationFromStorage();
  if (pending) {
    rememberDeviceKey(pending.device_key);
    showBootstrapUnavailable('Проверяем сохранённый код подключения…');
    await pollActivation(pending, { revealPending: false });
    return;
  }
  showPairingIntro();
}

async function initialisePlayer() {
  showActivationButton.addEventListener('click', () => void createActivation());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });
  void registerOfflinePlayer();
  await bootstrapPlayer();
}

void initialisePlayer();`,
    'non-blocking bootstrap state machine'
  ]
]);

const connectPath = 'src/web/admin-ui/public/js/pages/connect-tv.js';
await patch(connectPath, [
  [
`const message = document.querySelector('#connect-tv-message');
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
const successText = document.querySelector('[data-connect-success-text]');`,
`let message;
let scanButton;
let scanner;
let scannerClose;
let scannerCode;
let scannerStatus;
let video;
let scanCanvas;
let codeToggle;
let codePanel;
let codeInput;
let codeButton;
let deviceFound;
let locationStep;
let screenStep;
let locationOptions;
let screenOptions;
let authorizeButton;
let success;
let successText;

function bindDom() {
  message = document.querySelector('#connect-tv-message');
  scanButton = document.querySelector('[data-start-scan]');
  scanner = document.querySelector('[data-scanner]');
  scannerClose = document.querySelector('[data-scanner-close]');
  scannerCode = document.querySelector('[data-scanner-code]');
  scannerStatus = document.querySelector('[data-scanner-status]');
  video = document.querySelector('[data-camera]');
  scanCanvas = document.querySelector('[data-scan-canvas]');
  codeToggle = document.querySelector('[data-code-toggle]');
  codePanel = document.querySelector('[data-code-panel]');
  codeInput = document.querySelector('#connect-tv-code');
  codeButton = document.querySelector('[data-use-code]');
  deviceFound = document.querySelector('[data-device-found]');
  locationStep = document.querySelector('[data-connect-step="location"]');
  screenStep = document.querySelector('[data-connect-step="screen"]');
  locationOptions = document.querySelector('[data-location-options]');
  screenOptions = document.querySelector('[data-screen-options]');
  authorizeButton = document.querySelector('[data-authorize]');
  success = document.querySelector('[data-connect-success]');
  successText = document.querySelector('[data-connect-success-text]');
}

function releaseDom() {
  message = scanButton = scanner = scannerClose = scannerCode = scannerStatus = null;
  video = scanCanvas = codeToggle = codePanel = codeInput = codeButton = null;
  deviceFound = locationStep = screenStep = locationOptions = screenOptions = null;
  authorizeButton = success = successText = null;
}`,
    'remountable connect-tv DOM references'
  ],
  [
`export function initialiseConnectTv() {
  resetSelection();`,
`export function initialiseConnectTv() {
  bindDom();
  resetSelection();`,
    'bind DOM on every mount'
  ],
  [
`      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopCamera();
    }`,
`      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopCamera();
      releaseDom();
    }`,
    'release DOM on dispose'
  ]
]);

const cssPath = 'src/web/admin-ui/public/css/player.css';
await patch(cssPath, [
  [
`  max-height: calc(100dvh - clamp(20px, 4vh, 56px));
  padding: clamp(18px, 2.8vh, 34px) clamp(24px, 3vw, 44px);
  overflow: hidden;`,
`  max-height: calc(100vh - clamp(20px, 4vh, 56px));
  max-height: calc(100dvh - clamp(20px, 4vh, 56px));
  padding: clamp(18px, 2.8vh, 34px) clamp(24px, 3vw, 44px);`,
    'viewport fallback without clipping'
  ]
]);

const playerSpec = 'tests/browser/player-refresh-resilience.spec.js';
await patch(playerSpec, [
  [
`    await expect(page.locator('[data-activation-view]')).toBeHidden();
    await expect.poll(() => playerContextRequests, { timeout: 3000 }).toBe(1);`,
`    await expect(page.locator('[data-activation-view]')).toBeHidden();
    await expect.poll(() => playerContextRequests, { timeout: 3000 }).toBe(1);`,
    'bootstrap probe anchor'
  ],
  [
`      const box = await page.locator('.activation-card').boundingBox();
      expect(box).toBeTruthy();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);`,
`      for (const selector of [
        '.activation-card',
        '[data-show-activation]',
        '[data-activation-qr]',
        '[data-reserve-code]',
        '[data-activation-expiry]',
        '[data-activation-status]',
        '.activation-hint'
      ]) {
        const locator = page.locator(selector);
        await expect(locator).toBeVisible();
        const box = await locator.boundingBox();
        expect(box, selector).toBeTruthy();
        expect(box.y, selector).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 1);
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
      }`,
    'viewport checks visible content not card clipping'
  ],
  [
`test('pairing card stays fully inside common TV viewports', async ({ browser }) => {`,
`test('temporary session server errors keep cached Player visible instead of revealing pairing', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.setItem('tv-menu.player-context.v1', JSON.stringify({
        saved_at: new Date().toISOString(),
        context: {
          screen: { id: 1, name: 'ТВ 1', resolution: '1920x1080', location_id: 1, location_name: 'Точка 1', location_number: 1 },
          draft: { rows: [], settings: {}, revision: 1 },
          products: [], packaging: [], animation: { enabled: false, profile: null },
          entity: null, announcement: null, brand: null, aquarium: null,
          refresh_interval_ms: 60000
        }
      }));
    });
    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporary' })
    }));
    await page.goto('/player.html');
    await expect(page.locator('[data-tv-player]')).toBeVisible();
    await expect(page.locator('[data-activation-view]')).toBeHidden();
    await expect(page.locator('[data-player-message]')).toContainText('последней сохранённой версии');
  } finally {
    await context.close();
  }
});

test('pairing card stays fully inside common TV viewports', async ({ browser }) => {`,
    'transient session error regression'
  ]
]);

const mobileSpec = 'tests/browser/connect-tv-mobile.spec.js';
await patch(mobileSpec, [
  [
`  const decoder = await page.request.get('/vendor/jsQR.js');
  expect(decoder.ok()).toBeTruthy();`,
`  const decoder = await page.request.get('/vendor/jsQR.js');
  expect(decoder.ok()).toBeTruthy();

  await page.locator('.ui-context-body .app-route-link[href="/screens.html"]').click({ force: true });
  await expect(page).toHaveURL(/\\/screens\\.html$/);
  await page.locator('.ui-context-body .app-route-link[href="/connect-tv.html"]').click({ force: true });
  await expect(page).toHaveURL(/\\/connect-tv\\.html$/);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await page.getByRole('button', { name: /ввести код/i }).first().click();
  await expect(page.getByLabel('6-значный резервный код')).toBeVisible();`,
    'second SPA mount regression'
  ]
]);

const architectureSpec = 'tests/device-player-architecture.test.js';
await patch(architectureSpec, [
  [
`  assert.match(player, /serviceWorker\\.register\\('\\/player-sw\\.js'/);`,
`  assert.match(player, /serviceWorker\\.register\\('\\/player-sw\\.js'/);
  assert.match(player, /void registerOfflinePlayer\\(\\)/);
  assert.doesNotMatch(player, /await registerOfflinePlayer\\(\\)/);`,
    'service worker must not block bootstrap'
  ],
  [
`  assert.match(page, /document\\.head\\.append\\(script\\)/);
  assert.doesNotMatch(html, /\\/vendor\\/jsQR\\.js/);`,
`  assert.match(page, /document\\.head\\.append\\(script\\)/);
  assert.match(page, /function bindDom\\(\\)/);
  assert.match(page, /function releaseDom\\(\\)/);
  assert.doesNotMatch(page, /const scanButton = document\\.querySelector/);
  assert.doesNotMatch(html, /\\/vendor\\/jsQR\\.js/);`,
    'connect-tv remount architecture'
  ]
]);

console.log('v1.8.1 review fixes applied');
