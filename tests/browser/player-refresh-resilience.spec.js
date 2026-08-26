import { test, expect } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

test('pending TV pairing survives repeated player reloads without creating new activations', async ({ page }) => {
  let activationPosts = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/device/activations') activationPosts += 1;
  });

  await page.goto('/player.html');
  await page.locator('[data-show-activation]').click();
  await expect(page.locator('[data-activation-pairing]')).toBeVisible();
  await expect(page.locator('[data-activation-status]')).toContainText('Ожидание авторизации');

  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('tv-menu.device-activation.v2') || 'null'));
  expect(first?.activation_id).toBeTruthy();
  expect(first?.poll_secret).toBeTruthy();
  expect(activationPosts).toBe(1);

  for (let index = 0; index < 6; index += 1) {
    await page.reload();
    await expect(page.locator('[data-activation-pairing]')).toBeVisible();
    await expect(page.locator('[data-activation-status]')).toContainText('Ожидание авторизации');
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('tv-menu.device-activation.v2') || 'null'));
    expect(current?.activation_id).toBe(first.activation_id);
    expect(current?.poll_secret).toBe(first.poll_secret);
  }

  expect(activationPosts).toBe(1);
});

test('pending approval is probed before pairing UI can flash during player bootstrap', async ({ browser }) => {
  const activationId = '11111111-1111-4111-8111-111111111111';
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  let playerContextRequests = 0;
  try {
    await page.addInitScript(({ activationId }) => {
      localStorage.setItem('tv-menu.device-activation.v2', JSON.stringify({
        activation_id: activationId,
        poll_secret: 'x'.repeat(40),
        expires_at: new Date(Date.now() + 120000).toISOString(),
        poll_interval_ms: 2000,
        reserve_code: '123456',
        qr_svg: '<svg viewBox="0 0 10 10"></svg>',
        device_key: 'device-key-1234567890'
      }));
    }, { activationId });

    await page.route('**/api/device/session', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: false })
    }));
    await page.route(`**/api/device/activations/${activationId}/status`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'authorized', screen: { id: 1, name: 'ТВ 1' } })
      });
    });
    await page.route('**/api/device/player-context', (route) => {
      playerContextRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          screen: { id: 1, name: 'ТВ 1', resolution: '1920x1080', location_id: 1, location_name: 'Точка 1', location_number: 1 },
          draft: { rows: [], settings: {}, revision: 1 },
          products: [], packaging: [], animation: { enabled: false, profile: null },
          entity: null, announcement: null, brand: null, aquarium: null,
          refresh_interval_ms: 60000
        })
      });
    });

    await page.goto('/player.html');
    await page.waitForTimeout(180);
    await expect(page.locator('[data-activation-view]')).toBeHidden();
    await expect.poll(() => playerContextRequests, { timeout: 3000 }).toBe(1);
    await expect(page.locator('[data-activation-view]')).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('tv-menu.device-activation.v2'))).toBeNull();
  } finally {
    await context.close();
  }
});

test('pairing card stays fully inside common TV viewports', async ({ browser }) => {
  for (const viewport of [{ width: 1648, height: 928 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ baseURL, viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await page.route('**/api/device/session', (route) => route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ authorized: false })
      }));
      await page.goto('/player.html');
      await page.evaluate(() => {
        const activation = document.querySelector('[data-activation-view]');
        const pairing = document.querySelector('[data-activation-pairing]');
        const qr = document.querySelector('[data-activation-qr]');
        const code = document.querySelector('[data-reserve-code]');
        activation?.classList.remove('is-hidden');
        pairing?.classList.remove('is-hidden');
        if (qr) qr.innerHTML = '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="white"/><rect x="1" y="1" width="8" height="8" fill="black"/></svg>';
        if (code) code.textContent = '911 487';
      });
      await expect(page.locator('[data-activation-pairing]')).toBeVisible();
      const box = await page.locator('.activation-card').boundingBox();
      expect(box).toBeTruthy();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    } finally {
      await context.close();
    }
  }
});
