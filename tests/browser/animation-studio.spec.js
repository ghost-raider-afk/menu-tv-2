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

async function request(page, url, init = {}) {
  return page.evaluate(async ({ url, init }) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      ...init
    });
    if (!response.ok) throw new Error(`${init.method || 'GET'} ${url} failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }, { url, init });
}

async function createPreviewFixture(page) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const location = await request(page, '/api/locations', {
    method: 'POST', body: JSON.stringify({ name: `Animation ${suffix}`, address: '', active: true })
  });
  const screen = await request(page, `/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
  const editor = await request(page, `/api/screens/${screen.id}/editor`);
  await request(page, `/api/screens/${screen.id}/draft`, {
    method: 'PUT',
    body: JSON.stringify({
      revision: editor.draft.revision,
      rows: [{ id: 'real-preview-section', kind: 'section', name: 'НАСТОЯЩИЙ ЭКРАН MOTION STUDIO', enabled: true }],
      settings: { background_color: '#123456', accent_color: '#F4C915', text_color: '#F8FAFC' }
    })
  });
  return { locationId: location.id, screenId: screen.id, locationName: location.name, screenName: screen.name };
}

async function createAnimationProfile(page) {
  const profiles = await request(page, '/api/settings/animation/profiles');
  const base = profiles[0];
  return request(page, '/api/settings/animation/profiles', {
    method: 'POST',
    body: JSON.stringify({
      name: `Browser Motion ${Date.now()}`,
      enabled: true,
      preset_id: base.preset_id,
      profile: base.profile
    })
  });
}

async function cleanup(page, fixture, profile) {
  if (fixture?.screenId) {
    await page.evaluate(async (screenId) => {
      await fetch(`/api/screens/${screenId}/animation-profile`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: null })
      }).catch(() => undefined);
    }, fixture.screenId);
  }
  if (profile?.id) {
    await page.evaluate(async (profileId) => {
      await fetch(`/api/settings/animation/profiles/${profileId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    }, profile.id);
  }
  if (fixture) {
    await page.evaluate(async ({ screenId, locationId }) => {
      await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
      await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    }, fixture);
  }
}

test('animation profiles attach to a real screen and run in a public fullscreen TV workspace', async ({ page, browser }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const profile = await createAnimationProfile(page);
  let playerContext = null;

  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Анимация экранов' })).toBeVisible();
    await expect(page.locator('[data-animation-preset]')).toHaveCount(20);
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');
    await expect(page.locator('#animation-stage .animation-screen-background')).toHaveCSS('background-color', 'rgb(18, 52, 86)');

    await page.locator('#animation-profile-select').selectOption(String(profile.id));
    await expect(page.locator('#animation-profile-name')).toHaveValue(profile.name);
    await page.getByRole('button', { name: /Световая волна слева/ }).click();
    await expect(page.locator('#animation-current-preset')).toHaveText('Световая волна слева');
    await expect(page.locator('#animation-pattern')).toHaveValue('wave');
    await expect(page.locator('#animation-flow-direction')).toHaveValue('left-to-right');

    const saveResponse = page.waitForResponse((response) => response.url().endsWith(`/api/settings/animation/profiles/${profile.id}`) && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await saveResponse).ok()).toBeTruthy();
    await expect(page.locator('#animation-message')).toContainText('сохранён');

    await page.locator('#animation-screen-profile').selectOption(String(profile.id));
    const assignResponse = page.waitForResponse((response) => response.url().endsWith(`/api/screens/${fixture.screenId}/animation-profile`) && response.request().method() === 'PUT');
    await page.locator('#animation-assign-profile').click();
    expect((await assignResponse).ok()).toBeTruthy();
    await expect(page.locator('#animation-screen-status')).toContainText(profile.name);
    await expect(page.locator('#animation-profile-screen-count')).toHaveText('1');

    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#animation-stage g.table-section')).opacity)).toBe('1');

    const playerUrl = await page.locator('#animation-player-url').textContent();
    expect(playerUrl).toMatch(/\/player\/[A-Za-z0-9_-]{24,96}$/);
    await expect(page.locator('#animation-player-enabled')).toBeChecked();

    playerContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tvPage = await playerContext.newPage();
    await tvPage.goto(playerUrl);
    await expect(tvPage.locator('#tv-player')).toBeVisible();
    await expect(tvPage.locator('#player-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(tvPage.locator('#player-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');
    await expect(tvPage.locator('.app-shell')).toHaveCount(0);
    await expect.poll(() => tvPage.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      cursor: getComputedStyle(document.body).cursor,
      width: Math.round(document.querySelector('#player-stage').getBoundingClientRect().width),
      height: Math.round(document.querySelector('#player-stage').getBoundingClientRect().height),
      running: document.querySelector('#player-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length
    }))).toEqual({ bodyOverflow: 'hidden', cursor: 'none', width: 1280, height: 720, running: expect.any(Number) });
    await expect.poll(() => tvPage.evaluate(() => document.querySelector('#player-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
  } finally {
    await playerContext?.close();
    await cleanup(page, fixture, profile);
  }
});
