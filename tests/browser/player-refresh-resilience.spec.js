import { test, expect } from '@playwright/test';

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
