import { test, expect } from '@playwright/test';

const PROMO_PROFILE = {
  motion_version: 3,
  pattern: 'cinematic', flow_direction: 'alternate', easing: 'cinematic', cycle_seconds: 8,
  event_duration_ms: 6500, wave_stagger_ms: 160, travel_px: 24, scale_amount: 0.04,
  brightness_amount: 0.24, section_effect: 'cinematic', item_effect: 'cinematic', price_effect: 'none', intensity: 80,
  promotion_effect: 'cinematic', promotion_intensity: 100, promotion_cycle_seconds: 4.5,
  promotion_event_duration_ms: 1800, promotion_travel_px: 0, promotion_scale_amount: 0.06,
  promotion_brightness_amount: 0.35, promotion_glow_radius: 28, promotion_easing: 'smooth'
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
        name: `Animation product ${suffix}`, producer: '', characteristics: '', strength: '', price_primary: '240',
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
    return { locationId: location.id, screenId: screen.id, productId: product.id };
  });
}

async function removePreviewFixture(page, fixture) {
  await page.evaluate(async ({ screenId, locationId, productId }) => {
    await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/catalog/products/${productId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
  }, fixture);
}

test('animation studio runs continuous WASM row motion, cinematic promo and static background', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);
  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Живое меню' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '«Акция»' })).toBeVisible();
    await expect(page.getByText('ФОН · STATIC')).toBeVisible();
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');

    if (!(await page.locator('#animation-enabled').isChecked())) await page.locator('#animation-enabled').check();
    await page.locator('#animation-item-effect').selectOption('cinematic');
    await page.locator('#animation-promotion-effect').selectOption('cinematic');
    await page.locator('#animation-intensity').fill('82');
    await expect(page.locator('#animation-intensity-output')).toHaveText('82%');
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-motion-mode', 'wasm-continuous');

    const row = page.locator('#animation-stage g.table-item').first();
    const content = row.locator(':scope > g.table-item-content');
    const prices = row.locator(':scope > g.table-item-prices');
    const badge = row.locator(':scope > g.promotion-badge');
    const wave = row.locator(':scope > g.promotion-light-wave');
    await expect(row).toHaveAttribute('data-motion', 'item');
    await expect(badge).toHaveAttribute('data-motion', 'promotion');
    await expect(wave).toHaveAttribute('data-motion', 'promotion-wave');
    await expect(content).not.toHaveAttribute('data-motion', /.+/);
    await expect(prices).not.toHaveAttribute('data-motion', /.+/);
    await expect.poll(() => row.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
    expect(await row.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await badge.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await page.locator('#animation-stage .animation-screen-background').evaluate((node) => node.getAnimations().length)).toBe(0);

    await page.locator('#animation-announcement-enabled').check();
    await page.locator('#animation-announcement-text').fill('Сегодня специальное предложение до 22:00');
    await page.locator('#animation-announcement-speed').fill('110');
    await expect(page.locator('#animation-stage .scene-announcement-text')).toHaveText('Сегодня специальное предложение до 22:00');

    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await responsePromise).ok()).toBeTruthy();
    const saved = await animationSettings(page);
    expect(saved.preset_id).toBe('cinematic-live-menu');
    expect(saved.profile.price_effect).toBe('none');
    expect(saved.profile.promotion_effect).toBe('cinematic');
    expect(saved.profile.promotion_easing).toBe('smooth');
    expect(saved.profile.intensity).toBe(82);
  } finally {
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});

test('promotion badge and light wave are isolated overlays inside one row transform owner', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');
  const result = await page.evaluate(async (profile) => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }] = await Promise.all([
      import('/js/motion/screen-preview.js'), import('/js/motion/preview-player.js')
    ]);
    const stage = document.createElement('div');
    stage.className = 'animation-stage'; stage.style.width = '960px'; document.body.append(stage);
    renderAnimationScreenPreview(stage, {
      screen: { id: 999999, resolution: '1920x1080' },
      draft: { rows: [
        { id: 'section', kind: 'section', name: 'ПРОВЕРКА АКЦИИ', enabled: true },
        { id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360', promotion: true, promotion_text: 'АКЦИЯ', enabled: true }
      ], settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' } }, products: [], packaging: []
    });
    const player = new AnimationPreviewPlayer({ stage });
    player.restart(profile);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const row = stage.querySelector('g.table-item');
    const content = row?.querySelector(':scope > g.table-item-content');
    const prices = row?.querySelector(':scope > g.table-item-prices');
    const badge = row?.querySelector(':scope > g.promotion-badge');
    const wave = row?.querySelector(':scope > g.promotion-light-wave');
    const snapshot = {
      rowMotion: row?.dataset.motion || '', contentMotion: content?.dataset.motion || '', pricesMotion: prices?.dataset.motion || '',
      badgeMotion: badge?.dataset.motion || '', waveMotion: wave?.dataset.motion || '',
      rowTransform: row ? getComputedStyle(row).transform : 'none', badgeTransform: badge ? getComputedStyle(badge).transform : 'none',
      rowAnimations: row?.getAnimations().length ?? -1, badgeAnimations: badge?.getAnimations().length ?? -1
    };
    player.destroy(); stage.remove(); return snapshot;
  }, PROMO_PROFILE);
  expect(result.rowMotion).toBe('item');
  expect(result.contentMotion).toBe('');
  expect(result.pricesMotion).toBe('');
  expect(result.badgeMotion).toBe('promotion');
  expect(result.waveMotion).toBe('promotion-wave');
  expect(result.rowTransform).not.toBe('none');
  expect(result.badgeTransform).not.toBe('none');
  expect(result.rowAnimations).toBe(0);
  expect(result.badgeAnimations).toBe(0);
});

test('preview player rebinds scene targets after preview DOM replacement', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');
  const result = await page.evaluate(async (profile) => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }] = await Promise.all([
      import('/js/motion/screen-preview.js'), import('/js/motion/preview-player.js')
    ]);
    const stage = document.createElement('div'); stage.className = 'animation-stage'; stage.style.width = '960px'; document.body.append(stage);
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
    const snapshot = { oldInStage: stage.contains(firstTarget), targetChanged: firstTarget !== reboundTarget, reboundIsCurrent: reboundTarget === currentBadge, reboundMotion: reboundTarget?.dataset.motion || '' };
    player.destroy(); stage.remove(); return snapshot;
  }, PROMO_PROFILE);
  expect(result.oldInStage).toBe(false);
  expect(result.targetChanged).toBe(true);
  expect(result.reboundIsCurrent).toBe(true);
  expect(result.reboundMotion).toBe('promotion');
});
