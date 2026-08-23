import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
}

test('unhandled browser failure is persisted and visible in Settings error journal', async ({ page }) => {
  await login(page);
  const marker = `journal-${Date.now()}`;
  await page.evaluate((message) => {
    Promise.reject(new Error(message));
  }, marker);

  await expect.poll(async () => {
    const response = await page.request.get('/api/diagnostics/frontend-errors?limit=20');
    if (!response.ok()) return false;
    const body = await response.json();
    return body.items.some((item) => item.message.includes(marker));
  }).toBe(true);

  await page.getByRole('link', { name: 'Настройки' }).click();
  await page.getByRole('link', { name: 'Журнал ошибок' }).click();
  await expect(page).toHaveURL(/\/error-log\.html$/);
  await expect(page.locator('.error-log-entry-message').filter({ hasText: marker })).toBeVisible();
  await expect(page.locator('#error-log-policy')).toContainText('Хранение:');
});
