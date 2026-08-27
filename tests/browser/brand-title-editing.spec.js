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

async function getSettings(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/animation', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`GET animation settings failed: ${response.status}`);
    return response.json();
  });
}

async function putSettings(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/settings/animation', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`PUT animation settings failed: ${response.status}`);
    return response.json();
  }, payload);
}

test('Brand Entity is user-owned and can be cleared, replaced and persisted independently of MIRA-TV branding', async ({ page }) => {
  await login(page);
  const original = await getSettings(page);
  try {
    await page.goto('/animation.html');
    const textTab = page.locator('[data-animation-inspector-tab="text"]');
    await textTab.click();
    await expect(textTab).toHaveClass(/active/);
    const input = page.locator('#animation-brand-text');
    await expect(input).toBeVisible();
    await expect(input).toHaveJSProperty('tagName', 'TEXTAREA');

    await input.fill('');
    await expect(input).toHaveValue('');
    await input.fill('БАР\nСЕВЕР');
    await expect(input).toHaveValue('БАР\nСЕВЕР');
    if (!(await page.locator('#animation-brand-enabled').isChecked())) await page.locator('#animation-brand-enabled').check();
    const lines = page.locator('#animation-stage .scene-brand-title-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText('БАР');
    await expect(lines.nth(1)).toHaveText('СЕВЕР');

    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await responsePromise).ok()).toBeTruthy();

    const saved = await getSettings(page);
    expect(saved.brand.text).toBe('БАР\nСЕВЕР');
    expect(saved.brand.enabled).toBe(true);
    await expect(page).toHaveTitle('MIRA-TV — Анимация');
  } finally {
    await putSettings(page, {
      enabled: original.enabled,
      preset_id: original.preset_id,
      profile: original.profile,
      entity: original.entity,
      announcement: original.announcement,
      brand: original.brand,
      aquarium: original.aquarium
    });
  }
});
