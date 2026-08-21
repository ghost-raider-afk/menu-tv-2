import { test, expect } from '@playwright/test';

test('Player repairs a shell cache entry poisoned with HTML instead of CSS', async ({ page }) => {
  await page.goto('/player');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('Player service worker is not active');
    const cache = await caches.open('tv-menu-player-shell-v14');
    await cache.put('/css/player.css', new Response('<!doctype html><p>poisoned shell</p>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-activation-view]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Показать QR-код' })).toBeVisible();
  await expect(page.locator('.activation-card')).toHaveCSS('background-color', 'rgba(16, 24, 40, 0.94)');
  expect(await page.evaluate(() => [...document.styleSheets].some((sheet) => sheet.href?.endsWith('/css/player.css')))).toBe(true);

  const cachedType = await page.evaluate(async () => {
    const cached = await (await caches.open('tv-menu-player-shell-v14')).match('/css/player.css');
    return cached?.headers.get('content-type') || '';
  });
  expect(cachedType).toContain('text/css');
});
