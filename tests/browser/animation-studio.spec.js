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

async function createPreviewFixture(page) {
  return page.evaluate(async () => {
    async function request(url, init = {}) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        ...init
      });
      if (!response.ok) throw new Error(`${init.method || 'GET'} ${url} failed: ${response.status}`);
      return response.status === 204 ? null : response.json();
    }

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const location = await request('/api/locations', {
      method: 'POST', body: JSON.stringify({ name: `Animation ${suffix}`, address: '', active: true })
    });
    const screen = await request(`/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
    const editor = await request(`/api/screens/${screen.id}/editor`);
    await request(`/api/screens/${screen.id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        revision: editor.draft.revision,
        rows: [{ id: 'real-preview-section', kind: 'section', name: 'НАСТОЯЩИЙ ЭКРАН MOTION STUDIO', enabled: true }],
        settings: { background_color: '#123456', accent_color: '#F4C915', text_color: '#F8FAFC' }
      })
    });
    return { locationId: location.id, screenId: screen.id, locationName: location.name, screenName: screen.name };
  });
}

async function removePreviewFixture(page, fixture) {
  await page.evaluate(async ({ screenId, locationId }) => {
    await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
  }, fixture);
}

test('animation studio renders the selected real screen with 20 presets, player controls and persistent settings', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);

  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Анимация экранов' })).toBeVisible();
    await expect(page.locator('[data-animation-preset]')).toHaveCount(20);
    await expect(page.locator('#animation-stage')).toBeVisible();
    await expect(page.locator('#animation-screen-select')).toHaveValue(String(fixture.screenId));
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');
    await expect(page.locator('#animation-stage .animation-screen-background')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(page.locator('#animation-screen-status')).toContainText(fixture.screenName);

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
    await removePreviewFixture(page, fixture);
  }
});
