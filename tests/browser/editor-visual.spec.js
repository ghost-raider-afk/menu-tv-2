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

async function createEditorFixture(page, { rows = 1 } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', {
    data: { name: `Browser ${suffix}`, address: 'Visual CI' }
  });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const productResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: `БАВАРИЯ ПШЕНИЧНОЕ ${suffix}`,
      producer: 'ООО «Портал», п. Солнечный',
      characteristics: 'Светлое нефильтрованное',
      strength: '4,6%',
      price_primary: '179',
      alcoholic: true,
      beverage_color: 'light',
      filtration: 'unfiltered',
      active: true
    }
  });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`);
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();

  const draftRows = [{ id: `section-${suffix}`, kind: 'section', name: 'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled: true }];
  for (let index = 0; index < rows; index += 1) {
    draftRows.push({ id: `item-${suffix}-${index}`, kind: 'item', product_id: product.id, enabled: true });
  }
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows: draftRows,
      settings: {
        background_color: '#101828',
        accent_color: '#F4C915',
        text_color: '#F8FAFC',
        font_scale_percent: 100
      },
      screen: {
        location_id: screen.location_id,
        name: screen.name,
        resolution: '1920×1080',
        status: 'draft',
        active: true,
        template_id: null
      }
    }
  });
  expect(saved.status()).toBe(200);
  return { screen, product };
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`editor keeps professional layout at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const { screen } = await createEditorFixture(page, { rows: 4 });
    await page.goto(`/screen-editor.html?id=${screen.id}`);

    const rows = page.locator('#editor-menu-rows');
    await expect(rows).toBeVisible();
    const dimensions = await rows.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(dimensions.clientWidth).toBeGreaterThanOrEqual(760);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);

    const preview = page.locator('#editor-menu-preview');
    await expect(preview.locator('svg.menu-table-svg')).toBeVisible();
    await expect(preview.locator('svg.menu-table-svg')).toHaveAttribute('viewBox', '0 0 2048 1152');
    await expect(preview.locator('line[x1="1231"]')).toHaveCount(5);
    await expect(preview.locator('line[x1="1417"]')).toHaveCount(5);

    await test.info().attach(`editor-${viewport.width}x${viewport.height}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  });
}

test('reference geometry, manual scale and automatic fitting use one SVG renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 25 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);

  const preview = page.locator('#editor-menu-preview');
  const svg = preview.locator('svg.menu-table-svg');
  await expect(svg).toBeVisible();
  await expect(svg.locator('rect[x="15"]')).toHaveCount(1);
  await expect(page.locator('#editor-font-scale-effective')).toContainText('автоматически применено');

  const scale = page.locator('#editor-font-scale-number');
  await scale.fill('90');
  await expect(page.locator('#editor-dirty-state')).toContainText('несохранённые изменения');
  await expect(page.locator('#editor-upload')).toBeDisabled();
  await expect(page.locator('#editor-source-file')).toBeDisabled();

  const effective = Number(await preview.getAttribute('data-font-scale-effective'));
  expect(effective).toBeLessThanOrEqual(90);
  expect(effective).toBeGreaterThanOrEqual(55);
});
