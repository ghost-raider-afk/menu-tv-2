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

test('animation studio keeps the selected real menu visible while 20 continuous presets loop', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);

  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Анимация экранов' })).toBeVisible();
    await expect(page.getByText('Меню всегда остаётся открытым и читаемым.')).toBeVisible();
    await expect(page.locator('[data-animation-preset]')).toHaveCount(20);
    await expect(page.locator('#animation-stage')).toBeVisible();
    await expect(page.locator('#animation-screen-select')).toHaveValue(String(fixture.screenId));
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');
    await expect(page.locator('#animation-stage .animation-screen-background')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(page.locator('#animation-screen-status')).toContainText(fixture.screenName);

    await page.getByRole('button', { name: /Световая волна слева/ }).click();
    await expect(page.locator('#animation-current-preset')).toHaveText('Световая волна слева');
    await expect(page.locator('#animation-pattern')).toHaveValue('wave');
    await expect(page.locator('#animation-flow-direction')).toHaveValue('left-to-right');

    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#animation-stage g.table-section')).opacity)).toBe('1');

    await page.locator('#animation-pause').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBe(0);
    await page.locator('#animation-timeline').fill('600');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#animation-stage g.table-section')).opacity)).toBe('1');
    await page.locator('#animation-play').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await page.locator('#animation-replay').click();
    await expect(page.locator('#animation-time')).not.toHaveText('0.0 с / 0.0 с');

    await page.locator('#animation-enabled').check();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(page.locator('#animation-message')).toContainText('Профиль постоянной анимации сохранён');

    const saved = await animationSettings(page);
    expect(saved.enabled).toBe(true);
    expect(saved.preset_id).toBe('slide-left');
    expect(saved.profile.motion_version).toBe(2);
    expect(saved.profile.pattern).toBe('wave');
    expect(saved.profile.flow_direction).toBe('left-to-right');
    expect(saved.profile.entrance).toBeUndefined();
  } finally {
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});

test('promotion badge scales as one isolated SVG motion group', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');

  const result = await page.evaluate(async () => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }, { profileForPreset }] = await Promise.all([
      import('/js/motion/screen-preview.js'),
      import('/js/motion/preview-player.js'),
      import('/js/motion/presets.js')
    ]);

    const stage = document.createElement('div');
    stage.className = 'animation-stage';
    stage.style.width = '960px';
    document.body.append(stage);

    renderAnimationScreenPreview(stage, {
      screen: { id: 999999, resolution: '1920x1080' },
      draft: {
        rows: [
          { id: 'section', kind: 'section', name: 'ПРОВЕРКА АКЦИИ', enabled: true },
          {
            id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360',
            promotion: true, promotion_text: 'АКЦИЯ', enabled: true
          }
        ],
        settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' }
      },
      products: [],
      packaging: []
    });

    const row = stage.querySelector('g.table-item');
    const content = row?.querySelector(':scope > g.table-item-content');
    const badge = row?.querySelector(':scope > g.promotion-badge');
    const badgePath = badge?.querySelector('path');
    const badgeText = badge?.querySelector('text.promotion');
    const player = new AnimationPreviewPlayer({ stage });
    const profile = {
      ...profileForPreset('accent-pulse'),
      pattern: 'pulse',
      flow_direction: 'none',
      item_effect: 'pulse',
      price_effect: 'none',
      section_effect: 'none',
      background_effect: 'none',
      cycle_seconds: 8,
      event_duration_ms: 1200,
      scale_amount: 0.05,
      intensity: 100
    };

    player.restart(profile);
    player.seek(600);

    const snapshot = {
      rowMotion: row?.dataset.motion || '',
      contentMotion: content?.dataset.motion || '',
      badgeMotion: badge?.dataset.motion || '',
      contentOrder: content?.dataset.motionOrder || '',
      badgeOrder: badge?.dataset.motionOrder || '',
      rowAnimations: row?.getAnimations().length ?? -1,
      contentAnimations: content?.getAnimations().length ?? -1,
      badgeAnimations: badge?.getAnimations().length ?? -1,
      pathAnimations: badgePath?.getAnimations().length ?? -1,
      textAnimations: badgeText?.getAnimations().length ?? -1,
      contentTransform: content ? getComputedStyle(content).transform : 'none',
      badgeTransform: badge ? getComputedStyle(badge).transform : 'none'
    };

    player.destroy();
    stage.remove();
    return snapshot;
  });

  expect(result.rowMotion).toBe('');
  expect(result.contentMotion).toBe('item');
  expect(result.badgeMotion).toBe('promotion');
  expect(result.contentOrder).toBe(result.badgeOrder);
  expect(result.rowAnimations).toBe(0);
  expect(result.contentAnimations).toBe(1);
  expect(result.badgeAnimations).toBe(1);
  expect(result.pathAnimations).toBe(0);
  expect(result.textAnimations).toBe(0);
  expect(result.contentTransform).not.toBe('none');
  expect(result.badgeTransform).toBe(result.contentTransform);
});
