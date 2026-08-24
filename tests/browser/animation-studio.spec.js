import { test, expect } from '@playwright/test';

const PROMO_PROFILE = {
  motion_version: 3,
  pattern: 'cinematic', flow_direction: 'alternate', easing: 'cinematic', cycle_seconds: 8,
  event_duration_ms: 6500, wave_stagger_ms: 160, travel_px: 24, scale_amount: 0.04,
  brightness_amount: 0.24, section_effect: 'cinematic', item_effect: 'none', price_effect: 'none', intensity: 80,
  promotion_effect: 'cinematic', promotion_intensity: 100, promotion_cycle_seconds: 4.5,
  promotion_event_duration_ms: 1800, promotion_travel_px: 10, promotion_scale_amount: 0.18,
  promotion_brightness_amount: 0.55, promotion_glow_radius: 34, promotion_easing: 'elastic'
};

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
  }, { enabled: settings.enabled, preset_id: settings.preset_id, profile: settings.profile, entity: settings.entity, announcement: settings.announcement });
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
    const product = await request('/api/catalog/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Animation product ${suffix}`,
        producer: '', characteristics: '', strength: '', price_primary: '240',
        alcoholic: false, beverage_color: 'none', filtration: 'none', active: true
      })
    });
    const location = await request('/api/locations', { method: 'POST', body: JSON.stringify({ name: `Animation ${suffix}`, address: '', active: true }) });
    const screen = await request(`/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
    const editor = await request(`/api/screens/${screen.id}/editor`);
    await request(`/api/screens/${screen.id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        revision: editor.draft.revision,
        rows: [
          { id: 'real-preview-section', kind: 'section', name: 'НАСТОЯЩИЙ ЭКРАН MOTION STUDIO', enabled: true },
          { id: 'real-preview-item', kind: 'item', product_id: product.id, promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
        ],
        settings: { background_color: '#123456', accent_color: '#F4C915', text_color: '#F8FAFC' }
      })
    });
    return { locationId: location.id, screenId: screen.id, screenName: screen.name, productId: product.id };
  });
}

async function removePreviewFixture(page, fixture) {
  await page.evaluate(async ({ screenId, locationId, productId }) => {
    await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/catalog/products/${productId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
  }, fixture);
}

test('animation studio exposes one cinematic live profile, independent promo channel and static background', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);
  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Живое меню' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '«Акция»' })).toBeVisible();
    await expect(page.getByText('ФОН · STATIC')).toBeVisible();
    await expect(page.locator('[data-animation-preset]')).toHaveCount(0);
    await expect(page.locator('#animation-presets')).toHaveCount(0);
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');
    await expect(page.locator('#animation-stage .animation-screen-background')).toHaveCSS('inset', '0px');
    await expect(page.locator('#animation-stage')).toHaveCSS('overflow', 'hidden');

    if (!(await page.locator('#animation-enabled').isChecked())) await page.locator('#animation-enabled').check();
    await page.locator('#animation-item-effect').selectOption('cinematic');
    await page.locator('#animation-promotion-effect').selectOption('cinematic');
    await page.locator('#animation-intensity').fill('82');
    await expect(page.locator('#animation-intensity-output')).toHaveText('82%');
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage g.table-item-content')?.getAnimations().length || 0)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage g.promotion-badge')?.getAnimations().length || 0)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.querySelector('#animation-stage .animation-screen-background')?.getAnimations().length || 0)).toBe(0);

    await page.locator('#animation-announcement-enabled').check();
    await page.locator('#animation-announcement-text').fill('Сегодня специальное предложение до 22:00');
    await page.locator('#animation-announcement-speed').fill('110');
    await expect(page.locator('#animation-stage .scene-announcement-text')).toHaveText('Сегодня специальное предложение до 22:00');
    await expect(page.locator('#animation-stage .animation-screen-announcement-layer')).toHaveClass(/is-enabled/);

    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await responsePromise).ok()).toBeTruthy();
    await expect(page.locator('#animation-message')).toContainText('Настройки живого меню сохранены');

    const saved = await animationSettings(page);
    expect(saved.preset_id).toBe('cinematic-live-menu');
    expect(saved.profile.motion_version).toBe(3);
    expect(saved.profile.item_effect).toBe('cinematic');
    expect(saved.profile.promotion_effect).toBe('cinematic');
    expect(saved.profile.intensity).toBe(82);
    expect(saved.announcement.enabled).toBe(true);
    expect(saved.announcement.text).toContain('специальное предложение');
  } finally {
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});

test('promotion badge scales as one isolated SVG motion group', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');
  const result = await page.evaluate(async (profile) => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }] = await Promise.all([
      import('/js/motion/screen-preview.js'), import('/js/motion/preview-player.js')
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
          { id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360', promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
        ],
        settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' }
      }, products: [], packaging: []
    });
    const row = stage.querySelector('g.table-item');
    const content = row?.querySelector(':scope > g.table-item-content');
    const badge = row?.querySelector(':scope > g.promotion-badge');
    const path = badge?.querySelector('path');
    const text = badge?.querySelector('text.promotion');
    const player = new AnimationPreviewPlayer({ stage });
    player.restart(profile);
    player.seek(700);
    const snapshot = {
      contentMotion: content?.dataset.motion || '', badgeMotion: badge?.dataset.motion || '',
      contentAnimations: content?.getAnimations().length ?? -1, badgeAnimations: badge?.getAnimations().length ?? -1,
      pathAnimations: path?.getAnimations().length ?? -1, textAnimations: text?.getAnimations().length ?? -1,
      badgeTransform: badge ? getComputedStyle(badge).transform : 'none'
    };
    player.destroy(); stage.remove(); return snapshot;
  }, PROMO_PROFILE);
  expect(result.contentMotion).toBe('item');
  expect(result.badgeMotion).toBe('promotion');
  expect(result.contentAnimations).toBe(0);
  expect(result.badgeAnimations).toBe(1);
  expect(result.pathAnimations).toBe(0);
  expect(result.textAnimations).toBe(0);
  expect(result.badgeTransform).not.toBe('none');
});

test('preview player rebinds scene targets after preview DOM replacement', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');
  const result = await page.evaluate(async (profile) => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }] = await Promise.all([
      import('/js/motion/screen-preview.js'), import('/js/motion/preview-player.js')
    ]);
    const stage = document.createElement('div');
    stage.className = 'animation-stage'; stage.style.width = '960px'; document.body.append(stage);
    const player = new AnimationPreviewPlayer({ stage });
    const bundle = (name) => ({
      screen: { id: 999998, resolution: '1920x1080' },
      draft: { rows: [
        { id: `section-${name}`, kind: 'section', name: 'ПРОВЕРКА REBIND', enabled: true },
        { id: `item-${name}`, kind: 'item', name, price_primary: '240', price_secondary: '360', promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
      ], settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' } }, products: [], packaging: []
    });
    renderAnimationScreenPreview(stage, bundle('ПЕРВАЯ ПОЗИЦИЯ')); player.restart(profile);
    const firstTarget = player.scene.node('menu.promotion.0')?.target;
    renderAnimationScreenPreview(stage, bundle('ВТОРАЯ ПОЗИЦИЯ'));
    const currentBadge = stage.querySelector('g.promotion-badge');
    player.restart(profile);
    const reboundTarget = player.scene.node('menu.promotion.0')?.target;
    const snapshot = { oldInStage: stage.contains(firstTarget), targetChanged: firstTarget !== reboundTarget, reboundIsCurrent: reboundTarget === currentBadge, reboundAnimations: reboundTarget?.getAnimations().length ?? -1, oldAnimations: firstTarget?.getAnimations().length ?? -1 };
    player.destroy(); stage.remove(); return snapshot;
  }, PROMO_PROFILE);
  expect(result.oldInStage).toBe(false);
  expect(result.targetChanged).toBe(true);
  expect(result.reboundIsCurrent).toBe(true);
  expect(result.reboundAnimations).toBeGreaterThan(0);
  expect(result.oldAnimations).toBe(0);
});
