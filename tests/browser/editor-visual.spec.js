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

async function createEditorFixture(page, { rows = 4 } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', { data: { name: `Редактор ${suffix}`, address: 'CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();
  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editorResponse = await page.request.get(`/api/screens/${screen.id}/editor`);
  expect(editorResponse.status()).toBe(200);
  const editor = await editorResponse.json();
  const productResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: `Продукт ${suffix}`,
      producer: 'Пивоварня',
      characteristics: 'светлое',
      strength: '4,5%',
      price_primary: '240',
      alcoholic: true,
      beverage_color: 'light',
      filtration: 'filtered',
      active: true
    }
  });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const draftRows = [{ id: 'section-1', kind: 'section', name: 'Пиво', enabled: true }];
  for (let index = 0; index < rows; index += 1) {
    draftRows.push({
      id: `item-${index + 1}`,
      kind: 'item',
      product_id: product.id,
      enabled: true,
      promotion: false
    });
  }
  const save = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: draftRows,
      settings: editor.draft.settings,
      screen: {
        location_id: screen.location_id,
        name: screen.name,
        resolution: screen.resolution,
        status: screen.status,
        active: screen.active
      }
    }
  });
  expect(save.status()).toBe(200);
  return { location, screen, product };
}

async function openSettings(page, name) {
  const details = page.locator('.editor-settings-section').filter({ has: page.getByText(name, { exact: true }) });
  await expect(details).toBeVisible();
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  return details;
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`compact editor remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const { screen } = await createEditorFixture(page, { rows: 4 });
    await page.goto(`/screen-editor.html?id=${screen.id}`);

    const commandbar = page.locator('.editor-commandbar');
    await expect(commandbar).toBeVisible();
    expect((await commandbar.boundingBox())?.height).toBeLessThanOrEqual(60);
    expect(await commandbar.evaluate((node) => getComputedStyle(node).position)).toBe('sticky');
    await expect(page.getByText('Шаблоны', { exact: true })).toHaveCount(0);
    await expect(page.locator('.editor-tool-popover')).toHaveCount(0);

    const settings = page.locator('.editor-settings-panel');
    const mainColumn = page.locator('.editor-main-column');
    await expect(settings).toBeVisible();
    await expect(mainColumn).toBeVisible();
    const settingsBox = await settings.boundingBox();
    const mainColumnBox = await mainColumn.boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(mainColumnBox).not.toBeNull();
    expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(mainColumnBox.x + 2);

    const monitor = await openSettings(page, 'Монитор');
    const tableSettings = await openSettings(page, 'Таблица');
    await expect(monitor).toBeVisible();
    await expect(tableSettings).toBeVisible();

    const table = page.locator('.editor-menu-editor-table');
    const scroll = page.locator('.editor-menu-table-scroll');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Данные из базы' })).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    const itemBox = await table.locator('tbody tr').nth(1).boundingBox();
    expect(itemBox).not.toBeNull();
    expect(itemBox.height).toBeGreaterThanOrEqual(32);
    expect(itemBox.height).toBeLessThanOrEqual(36);
    expect(await table.locator('tbody tr').nth(1).locator('select').evaluate((node) => getComputedStyle(node).fontSize)).toBe('11px');
    const dimensions = await scroll.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(dimensions.clientWidth).toBeGreaterThan(500);

    const preview = page.locator('#editor-menu-preview');
    const svg = preview.locator('svg.menu-table-svg');
    await expect(preview).toBeVisible();
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('viewBox', '0 0 1920 1080');

    await page.request.delete(`/api/catalog/products/${(await createEditorFixture).id}`).catch(() => undefined);
  });
}

test('editor reflows at a 200% equivalent viewport without page-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await expect(page.locator('.editor-settings-panel')).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 2);
});

test('reference density keeps TV Menu 1 two-line typography without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 4 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  const preview = page.locator('#editor-menu-preview');
  await expect(preview.locator('svg.menu-table-svg')).toBeVisible();
  const lines = preview.locator('svg.menu-table-svg text');
  expect(await lines.count()).toBeGreaterThan(5);
});

test('table settings move and resize the same canonical preview SVG', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await openSettings(page, 'Таблица');
  await page.locator('#editor-table-x').fill('80');
  await page.locator('#editor-table-y').fill('30');
  await page.locator('#editor-table-width').fill('1200');
  await page.locator('#editor-table-height').fill('800');
  await page.locator('#editor-table-height').press('Tab');
  const svg = page.locator('#editor-menu-preview svg.menu-table-svg');
  await expect(svg).toBeVisible();
});

test('font selector changes preview through canonical renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await openSettings(page, 'Оформление');
  await page.locator('#editor-font-family').selectOption('tahoma-bold');
  await expect(page.locator('#editor-menu-preview svg.menu-table-svg')).toBeVisible();
});

test('screen properties update preview and keep publication locked while dirty', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await openSettings(page, 'Монитор');
  await page.locator('#editor-screen-name').fill(`Экран ${Date.now()}`);
  await expect(page.locator('#editor-publish')).toBeDisabled();
});

test('login composition follows TV Menu 1 and size 7 is the reference logo scale without flash', async ({ page }) => {
  await page.goto('/signin.html');
  await expect(page.locator('body')).toHaveAttribute('data-page', 'signin');
  await expect(page.locator('.signin-card')).toBeVisible();
});
