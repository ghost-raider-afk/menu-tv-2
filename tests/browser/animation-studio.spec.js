import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function animationSettings(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/animation', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`animation settings GET failed: ${response.status}`);
    return response.json();
  });
}

async function restoreAnimationSettings(page, settings) {
  await page.evaluate(async (payload) => {
    const response = await fetch('/api/settings/animation', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`animation settings restore failed: ${response.status}`);
  }, { enabled: settings.enabled, preset_id: settings.preset_id, profile: settings.profile });
}

test('animation studio exposes 20 presets, live mini player controls and persistent settings', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');
  await expect(page.getByRole('heading', { name: 'Анимация экранов' })).toBeVisible();
  await expect(page.locator('[data-animation-preset]')).toHaveCount(20);
  await expect(page.locator('#animation-stage')).toBeVisible();
  const original = await animationSettings(page);

  try {
    await page.getByRole('button', { name: /Слайд слева/ }).click();
    await expect(page.locator('#animation-current-preset')).toHaveText('Слайд слева');

    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await page.locator('#animation-pause').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBe(0);
    await page.locator('#animation-play').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await page.locator('#animation-replay').click();
    await expect(page.locator('#animation-time')).not.toHaveText('0.0 с / 0.0 с');

    await page.locator('#animation-enabled').check();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(page.locator('#animation-message')).toContainText('Профиль анимации сохранён');

    const saved = await animationSettings(page);
    expect(saved.enabled).toBe(true);
    expect(saved.preset_id).toBe('slide-left');
    expect(saved.profile.entrance).toBe('slide');
    expect(saved.profile.direction).toBe('left');
  } finally {
    await restoreAnimationSettings(page, original);
  }
});
