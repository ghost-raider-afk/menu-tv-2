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

async function expectCatalogContextItems(page) {
  const links = page.locator('.ui-context-body .app-route-link');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveText(['Продукция']);
  await expect(page.getByRole('link', { name: /^Тара$/ })).toHaveCount(0);
}

async function expectContextCollapsed(page) {
  const context = page.locator('.ui-context');
  await expect(context).toHaveClass(/is-collapsed/);
  await page.waitForTimeout(100);
  await expect(context).toHaveClass(/is-collapsed/);
}

test('main menu and context submenu navigate inside one persistent document', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { window.__tvMenuSpaSentinel = `sentinel-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__tvMenuSpaSentinel);
  const documentRequests = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests.push(request.url());
  });

  await page.locator('.ui-rail-button[aria-label="Мониторы"]').click();
  await expect(page).toHaveURL(/\/screens\.html$/);
  await expect(page.locator('[data-screen-hierarchy]')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.getByRole('link', { name: /Торговые точки/ }).click();
  await expect(page).toHaveURL(/\/locations\.html$/);
  await expect(page.locator('#location-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.locator('.ui-rail-button[aria-label="Каталог"]').click();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await expect(page.locator('#product-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);
  await expectCatalogContextItems(page);

  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings\.html$/);
  await expect(page.locator('#site-settings-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  await page.getByRole('link', { name: /^SFTP$/ }).click();
  await expect(page).toHaveURL(/\/sftp-settings\.html$/);
  await expect(page.locator('#sftp-directory-form')).toBeVisible();
  await expect(page.locator('#sftp-file-list')).toBeAttached();
  expect(await page.evaluate(() => window.__tvMenuSpaSentinel)).toBe(sentinel);

  expect(documentRequests).toEqual([]);
});

test('catalog submenu closes after product selection on desktop and stays closed after hover reflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);

  const catalogButton = page.locator('.ui-rail-button[aria-label="Каталог"]');
  await catalogButton.click();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await expectCatalogContextItems(page);

  await page.getByRole('link', { name: /^Продукция$/ }).click();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await expectContextCollapsed(page);
});

test('catalog submenu closes after product selection on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const catalogButton = page.locator('.ui-rail-button[aria-label="Каталог"]');
  await catalogButton.click();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await expectCatalogContextItems(page);

  await page.getByRole('link', { name: /^Продукция$/ }).click();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await expectContextCollapsed(page);
});

test('browser back and forward keep the same application document', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { window.__tvMenuSpaHistorySentinel = `history-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__tvMenuSpaHistorySentinel);

  await page.locator('.ui-rail-button[aria-label="Каталог"]').click();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await page.locator('.ui-rail-button[aria-label="Настройки"]').click();
  await expect(page).toHaveURL(/\/settings\.html$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\.html$/);
  await expect(page.locator('#product-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaHistorySentinel)).toBe(sentinel);

  await page.goForward();
  await expect(page).toHaveURL(/\/settings\.html$/);
  await expect(page.locator('#site-settings-form')).toBeVisible();
  expect(await page.evaluate(() => window.__tvMenuSpaHistorySentinel)).toBe(sentinel);
});
