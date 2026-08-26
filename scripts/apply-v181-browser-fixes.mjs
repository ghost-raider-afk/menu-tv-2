import { readFile, writeFile } from 'node:fs/promises';

async function replace(path, from, to, label) {
  const source = await readFile(path, 'utf8');
  if (!source.includes(from)) throw new Error(`${path}: missing ${label}`);
  await writeFile(path, source.replace(from, to));
}

const player = 'src/web/admin-ui/public/js/player/player.js';
await replace(player,
`function showPairingIntro() {
  clearPairingTimers();
  clearBootstrapRetry();
  showActivationScreen();
  setActivationLead('Этот телевизор ещё не авторизован.');
  showActivationButton.textContent = 'Показать QR-код';
  showActivationButton.disabled = false;
  setHidden(showActivationButton, false);
  setHidden(pairing, true);
}

function showBootstrapUnavailable`,
`function showPairingIntro() {
  clearPairingTimers();
  clearBootstrapRetry();
  showActivationScreen();
  setActivationLead('Этот телевизор ещё не авторизован.');
  showActivationButton.textContent = 'Показать QR-код';
  showActivationButton.disabled = false;
  setHidden(showActivationButton, false);
  setHidden(pairing, true);
}

function keepNeutralBoot() {
  clearPairingTimers();
  clearBootstrapRetry();
  setHidden(activationView, true);
  setHidden(player, true);
  setHidden(playerMessage, true);
}

function showBootstrapUnavailable`,
'neutral boot helper');

await replace(player,
`    if (response.status === 401) {
      clearPlayerContext();
      return { unauthorized: true };
    }`,
`    if (response.status === 401 || response.status === 403) {
      clearPlayerContext();
      return { unauthorized: true };
    }`,
'player-context 401/403');

await replace(player,
`    const pending = activationFromStorage();
    if (pending) {
      rememberDeviceKey(pending.device_key);
      showBootstrapUnavailable('Проверяем ранее созданный код подключения…');
      await pollActivation(pending, { revealPending: false });
      return;
    }`,
`    const pending = activationFromStorage();
    if (pending) {
      rememberDeviceKey(pending.device_key);
      keepNeutralBoot();
      await pollActivation(pending, { revealPending: false });
      return;
    }`,
'network error pending hidden probe');

await replace(player,
`  if (pending) {
    rememberDeviceKey(pending.device_key);
    showBootstrapUnavailable('Проверяем сохранённый код подключения…');
    await pollActivation(pending, { revealPending: false });
    return;
  }`,
`  if (pending) {
    rememberDeviceKey(pending.device_key);
    keepNeutralBoot();
    await pollActivation(pending, { revealPending: false });
    return;
  }`,
'unauthorized pending hidden probe');

const entity = 'src/web/admin-ui/public/js/motion/entity-editor.js';
await replace(entity,
`export function normaliseSceneEntity(value = {}) {
  const transform = value?.transform || {};`,
`export function normaliseSceneEntity(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const transform = value.transform || {};`,
'null entity normalization');

const mobile = 'tests/browser/connect-tv-mobile.spec.js';
await replace(mobile,
`  await page.locator('.ui-context-body .app-route-link[href="/screens.html"]').click({ force: true });
  await expect(page).toHaveURL(/\\/screens\\.html$/);
  await page.locator('.ui-context-body .app-route-link[href="/connect-tv.html"]').click({ force: true });
  await expect(page).toHaveURL(/\\/connect-tv\\.html$/);`,
`  await sectionTrigger.click();
  await expect(sectionTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.ui-context-body .app-route-link[href="/screens.html"]').click();
  await expect(page).toHaveURL(/\\/screens\\.html$/);
  const returnTrigger = page.locator('[data-mobile-context-trigger]');
  await returnTrigger.click();
  await expect(returnTrigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.ui-context-body .app-route-link[href="/connect-tv.html"]').click();
  await expect(page).toHaveURL(/\\/connect-tv\\.html$/);`,
'real mobile context navigation');

const architecture = 'tests/device-player-architecture.test.js';
await replace(architecture,
`  assert.match(player, /void registerOfflinePlayer\\(\\)/);
  assert.doesNotMatch(player, /await registerOfflinePlayer\\(\\)/);`,
`  assert.match(player, /void registerOfflinePlayer\\(\\)/);
  assert.doesNotMatch(player, /await registerOfflinePlayer\\(\\)/);
  assert.match(player, /function keepNeutralBoot\\(\\)/);`,
'neutral bootstrap architecture');

await replace(architecture,
`test('offline player caches Video Entity fully and serves byte ranges from cache', async () => {`,
`test('scene entity normalization accepts an absent entity from player context', async () => {
  const source = await read('src/web/admin-ui/public/js/motion/entity-editor.js');
  assert.match(source, /value = value && typeof value === 'object' \? value : \{\}/);
});

test('offline player caches Video Entity fully and serves byte ranges from cache', async () => {`,
'null entity regression contract');

console.log('Chromium follow-up fixes applied');
