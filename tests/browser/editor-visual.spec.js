import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([page.waitForURL((url) => url.pathname === '/'), page.getByRole('button', { name: /войти/i }).click()]);
}

async function createEditorFixture(page, { rows = 1 } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', { data: { name: `Browser ${suffix}`, address: 'Visual CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();
  const productResponse = await page.request.post('/api/catalog/products', { data: {
    name: `БАВАРИЯ ПШЕНИЧНОЕ ${suffix}`, producer: 'ООО «Портал», п. Солнечный', characteristics: 'Светлое нефильтрованное', strength: '4,6°',
    price_primary: '179', alcoholic: true, beverage_color: 'light', filtration: 'unfiltered', active: true
  } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data: {} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const draftRows = [{ id: `section-${suffix}`, kind: 'section', name: 'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled: true }];
  for (let index = 0; index < rows; index += 1) draftRows.push({ id: `item-${suffix}-${index}`, kind: 'item', product_id: product.id, enabled: true });
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data: {
    revision: editor.draft.revision,
    rows: draftRows,
    settings: {
      background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow',
      table_x: 56, table_y: 15, table_width_px: 1374, table_height_px: 925
    },
    screen: { location_id: screen.location_id, name: screen.name, resolution: '1920×1080', status: 'draft', active: true }
  } });
  expect(saved.status()).toBe(200);
  return { screen, product };
}

async function createReferenceDensityFixture(page) {
  const { screen, product } = await createEditorFixture(page, { rows: 0 });
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const sections = [['ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', 4], ['ПИВО ТЕМНОЕ ФИЛЬТРОВАННОЕ', 5], ['АЛКОГОЛЬНЫЕ НАПИТКИ', 7]];
  const rows = [];
  let itemIndex = 0;
  sections.forEach(([name, count], sectionIndex) => {
    rows.push({ id: `reference-section-${sectionIndex}`, kind: 'section', name, enabled: true });
    for (let index = 0; index < count; index += 1) rows.push({ id: `reference-item-${itemIndex++}`, kind: 'item', product_id: product.id, enabled: true });
  });
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data: {
    revision: editor.draft.revision, rows,
    settings: { background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow', table_x: 56, table_y: 15, table_width_px: 1374, table_height_px: 925 },
    screen: { location_id: screen.location_id, name: screen.name, resolution: '1920×1080', status: 'draft', active: true }
  } });
  expect(saved.status()).toBe(200);
  return { screen };
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`compact editor remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const { screen } = await createEditorFixture(page, { rows: 4 });
    await page.goto(`/screen-editor.html?id=${screen.id}`);

    const commandbar = page.locator('.editor-commandbar');
    await expect(commandbar).toBeVisible();
    expect((await commandbar.boundingBox())?.height).toBeLessThanOrEqual(viewport.width < 1500 ? 82 : 56);
    const position = await commandbar.evaluate((node) => getComputedStyle(node).position);
    expect(position).toBe('sticky');
    await expect(page.getByText('Шаблоны', { exact: true })).toHaveCount(0);

    const table = page.locator('.editor-menu-editor-table');
    const scroll = page.locator('.editor-menu-table-scroll');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Данные из базы' })).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    const itemBox = await table.locator('tbody tr').nth(1).boundingBox();
    expect(itemBox).not.toBeNull();
    expect(itemBox.height).toBeLessThanOrEqual(34);
    expect(await table.locator('tbody tr').nth(1).locator('select').evaluate((node) => getComputedStyle(node).fontSize)).toBe('11px');
    const dimensions = await scroll.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(dimensions.clientWidth).toBeGreaterThan(500);

    const preview = page.locator('#editor-menu-preview');
    const svg = preview.locator('svg.menu-table-svg');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('viewBox', '0 0 1920 1080');
    await expect(svg.locator('line.separator[x1="65"][x2="1430"]')).toHaveCount(4);
    await expect(svg.locator('line[x1="1258"]')).toHaveCount(0);
    await expect(svg.locator('line[x1="1405"]')).toHaveCount(0);
    await expect(svg.locator('.item-name').first()).toContainText('БАВАРИЯ ПШЕНИЧНОЕ');
    await expect(svg.locator('.item-name').first()).not.toContainText('4,6%');
    await expect(svg.locator('.item-meta').first()).toContainText('ООО «Портал», п. Солнечный · 4,6% · светлое · нефильтрованное');
    await expect(svg.locator('.table-section rect').first()).toHaveAttribute('x', '56');
    await expect(svg.locator('.table-section rect').first()).toHaveAttribute('width', '1374');
    await expect(svg.locator('.price').first()).toHaveAttribute('text-anchor', 'end');

    await test.info().attach(`editor-${viewport.width}x${viewport.height}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}

test('reference density keeps TV Menu 1 two-line typography without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const { screen } = await createReferenceDensityFixture(page);
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  const preview = page.locator('#editor-menu-preview');
  const svg = preview.locator('svg.menu-table-svg');
  await expect(svg.locator('.table-section')).toHaveCount(3);
  await expect(svg.locator('.table-item')).toHaveCount(16);
  const effective = Number(await preview.getAttribute('data-font-scale-effective'));
  expect(effective).toBeGreaterThan(90);
  expect(effective).toBeLessThanOrEqual(100);
  const overlaps = await svg.locator('.table-item').evaluateAll((items) => items.map((item) => {
    const title = item.querySelector('.item-name')?.getBBox();
    const meta = item.querySelector('.item-meta')?.getBBox();
    return title && meta ? title.y + title.height > meta.y + 1 : false;
  }));
  expect(overlaps.some(Boolean)).toBe(false);
});

test('table dropdown moves and resizes the same canonical preview SVG', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await page.getByText('Таблица', { exact: true }).click();
  const x = page.locator('#editor-table-x');
  const width = page.locator('#editor-table-width');
  await expect(x).toHaveValue('56');
  await x.fill('100');
  await width.fill('1200');
  await expect(page.locator('#editor-dirty-state')).toHaveText('Не сохранено');
  const rect = page.locator('svg.menu-table-svg .table-section rect').first();
  await expect(rect).toHaveAttribute('x', '100');
  await expect(rect).toHaveAttribute('width', '1200');
  await expect(page.locator('#editor-publish')).toBeDisabled();
});

test('font selector changes preview through canonical renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await page.getByText('Таблица', { exact: true }).click();
  const font = page.locator('#editor-font-family');
  await expect(font).toHaveValue('arial-narrow');
  await font.selectOption('tahoma-bold');
  await expect(page.locator('#editor-dirty-state')).toHaveText('Не сохранено');
  await expect(page.locator('svg.menu-table-svg')).toHaveAttribute('font-family', 'Tahoma, Arial, sans-serif');
});

test('screen properties update preview and keep publication locked while dirty', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);
  await page.getByText('Монитор', { exact: true }).click();
  const resolution = page.locator('#editor-resolution');
  await resolution.fill('1024×768');
  await expect(page.locator('#editor-dirty-state')).toHaveText('Не сохранено');
  await expect(page.locator('#editor-publish')).toBeDisabled();
  const aspect = await page.locator('#editor-menu-preview').evaluate((node) => getComputedStyle(node).aspectRatio);
  expect(aspect.replace(/\s+/g, '')).toBe('1024/768');
});

test('login logo size setting has seven visible levels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.goto('/settings.html');
  const size = page.locator('#site-signin-logo-size');
  await expect(size.locator('option')).toHaveCount(7);
  await size.selectOption('7');
  await page.locator('#site-settings-submit').click();
  await expect(page.locator('#site-settings-message')).toContainText('сохранены');
  await page.goto('/signin.html');
  await expect(page.locator('html')).toHaveAttribute('data-signin-logo-size', '7');
  const mark = page.locator('.signin-brand .brand-mark');
  expect((await mark.boundingBox())?.width).toBeGreaterThanOrEqual(95);
});
