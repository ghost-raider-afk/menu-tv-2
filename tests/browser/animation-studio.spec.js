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
  const response = await page.request.get('/api/settings/animation');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function restoreAnimationSettings(page, settings) {
  const response = await page.request.put('/api/settings/animation', {
    data: { enabled: settings.enabled, preset_id: settings.preset_id, profile: settings.profile }
  });
  expect(response.ok()).toBeTruthy();
}

async function createPreviewFixture(page) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const locationResponse = await page.request.post('/api/locations', {
    data: { name: `Animation ${suffix}`, address: 'Motion Studio CI', active: true }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const productResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: `СНЕЖНЫЙ ЭЛЬ ${suffix}`,
      producer: 'Motion Studio CI',
      characteristics: 'Светлое',
      strength: '4,5%',
      price_primary: '256',
      alcoholic: true,
      beverage_color: 'light',
      filtration: 'filtered',
      active: true
    }
  });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();

  const draftResponse = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: [
        { id: `section-${suffix}`, kind: 'section', name: 'АКЦИОННОЕ МЕНЮ', enabled: true },
        { id: `item-${suffix}`, kind: 'item', product_id: product.id, promotion: true, promotion_text: 'АКЦИЯ 3+1', enabled: true }
      ],
      settings: {
        background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC',
        font_scale_percent: 100, font_family: 'arial-narrow',
        table_x: 56, table_y: 15, table_width_px: 1374, table_height_px: 925
      },
      screen: { location_id: screen.location_id, name: screen.name, resolution: '1920×1080', status: 'draft', active: true }
    }
  });
  expect(draftResponse.ok()).toBeTruthy();
  return { locationId: location.id, screenId: screen.id, productId: product.id };
}

async function removePreviewFixture(page, fixture) {
  await page.request.delete(`/api/screens/${fixture.screenId}`).catch(() => undefined);
  await page.request.delete(`/api/locations/${fixture.locationId}`).catch(() => undefined);
  await page.request.delete(`/api/catalog/products/${fixture.productId}`).catch(() => undefined);
}

test('Motion Studio animates promo badge as one object and allows a truly invisible red row background', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);

  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Редактируемый пресет экрана' })).toBeVisible();
    await expect(page.locator('#animation-preset-select')).toBeVisible();
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));

    const badge = page.locator('#animation-stage g.promotion-badge-group');
    await expect(badge).toHaveCount(1);
    await expect(badge.locator('path.promotion-badge')).toHaveCount(1);
    await expect(badge.locator('text.promotion')).toHaveText('АКЦИЯ 3+1');
    await expect(badge).toHaveAttribute('data-motion-promo-badge', 'true');
    await expect(badge.locator('path.promotion-badge')).not.toHaveAttribute('data-motion-promo-badge', 'true');
    await expect(badge.locator('text.promotion')).not.toHaveAttribute('data-motion-promo-badge', 'true');

    await page.locator('#promo-badge-effect').selectOption('pulse');
    await page.locator('#promo-badge-scale').fill('1.25');
    await expect.poll(() => badge.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
    expect(await badge.locator('path.promotion-badge').evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await badge.locator('text.promotion').evaluate((node) => node.getAnimations().length)).toBe(0);

    const tint = page.locator('#promo-row-tint');
    await expect(tint).toHaveAttribute('min', '0');
    await expect(tint).toHaveAttribute('max', '0.18');
    await tint.fill('0');
    await expect.poll(() => page.locator('#animation-stage .promotion-row-highlight').getAttribute('opacity')).toBe('0');

    await page.locator('#animation-enabled').check();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    const saved = await animationSettings(page);
    expect(saved.enabled).toBe(true);
    expect(saved.profile.motion_version).toBe(5);
    expect(saved.profile.promo_style.badge_effect).toBe('pulse');
    expect(saved.profile.promo_style.badge_scale).toBe(1.25);
    expect(saved.profile.promo_style.row_tint).toBe(0);
  } finally {
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});
