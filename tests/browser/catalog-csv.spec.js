import { readFile } from 'node:fs/promises';
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

async function waitForRouteReady(page) {
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
}

test('products can be exported and imported as one round-trip CSV', async ({ page }) => {
  await login(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const originalName = `CSV ${suffix}`;
  const updatedName = `CSV UPDATED ${suffix}`;
  const createResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: originalName,
      producer: 'Browser CI',
      characteristics: 'светлое; тест',
      strength: '4,5%',
      price_primary: '240',
      alcoholic: true,
      beverage_color: 'light',
      filtration: 'filtered',
      active: true
    }
  });
  expect(createResponse.status()).toBe(201);
  const product = await createResponse.json();

  await page.goto('/catalog.html');
  await waitForRouteReady(page);
  await expect(page.getByRole('button', { name: 'Загрузить в базу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выгрузить из базы' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Выгрузить из базы' }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('\uFEFFID;Название;Производитель;');
  expect(csv).toContain(originalName);

  const importCsv = `\uFEFFID;Название;Производитель;Характеристики;Крепость;Цена 1 л;Цена 1,5 л;Алкогольная;Цвет напитка;Фильтрация;Активна\r\n${product.id};${updatedName};Browser CI;после импорта;4,5%;250;375;да;светлый;фильтрованное;да\r\n;CSV NEW ${suffix};Новый;создано импортом;;100;150;нет;;;да\r\n`;
  await page.locator('#product-import-file').setInputFiles({
    name: 'products.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(importCsv, 'utf8')
  });

  await expect(page.locator('#product-message')).toContainText('создано 1, обновлено 1');
  const productsResponse = await page.request.get('/api/catalog/products');
  expect(productsResponse.status()).toBe(200);
  const products = await productsResponse.json();
  const updated = products.find((item) => item.id === product.id);
  const created = products.find((item) => item.name === `CSV NEW ${suffix}`);
  expect(updated?.name).toBe(updatedName);
  expect(updated?.price_primary).toBe('250');
  expect(created?.price_primary).toBe('100');

  await page.request.delete(`/api/catalog/products/${product.id}`);
  if (created) await page.request.delete(`/api/catalog/products/${created.id}`);
});

test('mobile catalog shows existing products before the creation form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const productName = `MOBILE ${suffix}`;
  const createResponse = await page.request.post('/api/catalog/products', {
    data: {
      name: productName,
      producer: 'Browser CI',
      characteristics: 'mobile list regression',
      strength: '',
      price_primary: '120',
      alcoholic: false,
      beverage_color: 'none',
      filtration: 'none',
      active: true
    }
  });
  expect(createResponse.status()).toBe(201);
  const product = await createResponse.json();

  try {
    await page.goto('/catalog.html');
    await waitForRouteReady(page);
    await expect(page.locator('#products-list')).toBeVisible();
    await expect(page.locator('#products-list .record-title', { hasText: productName })).toBeVisible();

    const listBox = await page.locator('#products-list').boundingBox();
    const formBox = await page.locator('#products').boundingBox();
    expect(listBox).not.toBeNull();
    expect(formBox).not.toBeNull();
    expect(listBox.y).toBeLessThan(formBox.y);
  } finally {
    await page.request.delete(`/api/catalog/products/${product.id}`);
  }
});
