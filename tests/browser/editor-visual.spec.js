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
      strength: '4,6°',
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
        accent_color: '#F6C90E',
        text_color: '#F8FAFC',
        font_scale_percent: 100,
        font_family: 'arial-narrow'
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

async function createReferenceDensityFixture(page) {
  const { screen, product } = await createEditorFixture(page, { rows: 0 });
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const sections = [
    ['ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', 4],
    ['ПИВО ТЕМНОЕ ФИЛЬТРОВАННОЕ', 5],
    ['АЛКОГОЛЬНЫЕ НАПИТКИ', 7]
  ];
  const rows = [];
  let itemIndex = 0;
  sections.forEach(([name, count], sectionIndex) => {
    rows.push({ id: `reference-section-${sectionIndex}`, kind: 'section', name, enabled: true });
    for (let index = 0; index < count; index += 1) {
      rows.push({ id: `reference-item-${itemIndex}`, kind: 'item', product_id: product.id, enabled: true });
      itemIndex += 1;
    }
  });
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, {
    data: {
      revision: editor.draft.revision,
      rows,
      settings: {
        background_color: '#101828',
        accent_color: '#F6C90E',
        text_color: '#F8FAFC',
        font_scale_percent: 100,
        font_family: 'arial-narrow'
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
  return { screen };
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`editor keeps compact professional table usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    const { screen } = await createEditorFixture(page, { rows: 4 });
    await page.goto(`/screen-editor.html?id=${screen.id}`);

    const table = page.locator('.editor-menu-editor-table');
    const scroll = page.locator('.editor-menu-table-scroll');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Данные из базы' })).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(5);

    const itemRow = table.locator('tbody tr').nth(1);
    const itemBox = await itemRow.boundingBox();
    expect(itemBox).not.toBeNull();
    expect(itemBox.height).toBeLessThanOrEqual(34);
    const selectFontSize = await itemRow.locator('select').evaluate((node) => getComputedStyle(node).fontSize);
    expect(selectFontSize).toBe('11px');

    const dimensions = await scroll.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
    expect(dimensions.clientWidth).toBeGreaterThan(500);
    expect(dimensions.scrollWidth).toBeGreaterThanOrEqual(dimensions.clientWidth);
    if (dimensions.scrollWidth > dimensions.clientWidth) {
      await scroll.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      await expect(table.locator('tbody tr').nth(1).locator('.editor-menu-actions')).toBeVisible();
    }

    const menuCard = page.locator('.editor-menu-card');
    const previewCard = page.locator('.editor-preview-card');
    const adjacency = await Promise.all([menuCard.boundingBox(), previewCard.boundingBox()]);
    expect(adjacency[0]).not.toBeNull();
    expect(adjacency[1]).not.toBeNull();
    expect(Math.abs(adjacency[1].y - (adjacency[0].y + adjacency[0].height))).toBeLessThanOrEqual(2);

    const preview = page.locator('#editor-menu-preview');
    const svg = preview.locator('svg.menu-table-svg');
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('viewBox', '0 0 1920 1080');
    await expect(svg.locator('line.separator')).toHaveCount(4);
    await expect(svg.locator('line.separator[x1="65"][x2="1430"]')).toHaveCount(4);
    await expect(svg.locator('line[x1="1258"]')).toHaveCount(0);
    await expect(svg.locator('line[x1="1405"]')).toHaveCount(0);
    await expect(svg.locator('.item-name').first()).toContainText('БАВАРИЯ ПШЕНИЧНОЕ');
    await expect(svg.locator('.item-name').first()).not.toContainText('4,6%');
    await expect(svg.locator('.item-name').first()).not.toContainText('°');
    await expect(svg.locator('.item-meta').first()).toContainText('ООО «Портал», п. Солнечный · 4,6% · светлое · нефильтрованное');
    await expect(svg.locator('.table-section rect').first()).toHaveAttribute('x', '56');
    await expect(svg.locator('.table-section rect').first()).toHaveAttribute('width', '1374');
    await expect(svg.locator('.table-section rect').first()).toHaveAttribute('rx', '5');
    await expect(svg.locator('.price').first()).toHaveAttribute('text-anchor', 'end');

    const sizes = await svg.locator('.table-item').first().evaluate((item) => ({
      title: Number(item.querySelector('.item-name')?.getAttribute('font-size')),
      meta: Number(item.querySelector('.item-meta')?.getAttribute('font-size')),
      price: Number(item.querySelector('.price')?.getAttribute('font-size'))
    }));
    expect(sizes.title).toBeGreaterThan(sizes.meta * 1.7);
    expect(sizes.price).toBeGreaterThan(sizes.title);

    await test.info().attach(`editor-${viewport.width}x${viewport.height}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png'
    });
  });
}

test('reference density fits cleanly with TV Menu 1 two-line product typography', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const { screen } = await createReferenceDensityFixture(page);
  await page.goto(`/screen-editor.html?id=${screen.id}`);

  const preview = page.locator('#editor-menu-preview');
  const svg = preview.locator('svg.menu-table-svg');
  await expect(svg).toBeVisible();
  await expect(svg.locator('.table-section')).toHaveCount(3);
  await expect(svg.locator('.table-item')).toHaveCount(16);
  const effective = Number(await preview.getAttribute('data-font-scale-effective'));
  expect(effective).toBeLessThanOrEqual(100);
  expect(effective).toBeGreaterThan(90);

  const overlaps = await svg.locator('.table-item').evaluateAll((items) => items.map((item) => {
    const title = item.querySelector('.item-name')?.getBBox();
    const meta = item.querySelector('.item-meta')?.getBBox();
    if (!title || !meta) return false;
    return title.y + title.height > meta.y + 1;
  }));
  expect(overlaps.some(Boolean)).toBe(false);

  await test.info().attach('reference-density-1920x1080.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});

test('reference geometry, manual scale and automatic fitting use one SVG renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 25 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);

  const preview = page.locator('#editor-menu-preview');
  const svg = preview.locator('svg.menu-table-svg');
  await expect(svg).toBeVisible();
  await expect(svg.locator('rect[x="56"][width="1374"]')).toHaveCount(1);
  await expect(page.locator('#editor-font-scale-effective')).toContainText('автоматически применено');

  const scale = page.locator('#editor-font-scale-number');
  await scale.fill('90');
  await expect(page.locator('#editor-dirty-state')).toContainText('несохранённые изменения');
  await expect(page.locator('#editor-publish')).toBeDisabled();
  await expect(page.locator('#editor-upload')).toBeDisabled();
  await expect(page.locator('#editor-source-file')).toBeDisabled();

  const effective = Number(await preview.getAttribute('data-font-scale-effective'));
  expect(effective).toBeLessThanOrEqual(90);
  expect(effective).toBeGreaterThanOrEqual(55);
});

test('font selector updates preview through the canonical renderer', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);

  const font = page.locator('#editor-font-family');
  await expect(font).toHaveValue('arial-narrow');
  await font.selectOption('tahoma-bold');
  await expect(page.locator('#editor-dirty-state')).toContainText('несохранённые изменения');
  await expect(page.locator('svg.menu-table-svg')).toHaveAttribute('font-family', 'Tahoma, Arial, sans-serif');
});

test('screen property edits immediately update preview and block stale publication', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  const { screen } = await createEditorFixture(page, { rows: 3 });
  await page.goto(`/screen-editor.html?id=${screen.id}`);

  const resolution = page.locator('#editor-resolution');
  await resolution.fill('1024×768');
  await expect(page.locator('#editor-dirty-state')).toContainText('несохранённые изменения');
  await expect(page.locator('#editor-publish')).toBeDisabled();
  const aspect = await page.locator('#editor-menu-preview').evaluate((node) => getComputedStyle(node).aspectRatio);
  expect(aspect.replace(/\s+/g, '')).toBe('1024/768');
});
