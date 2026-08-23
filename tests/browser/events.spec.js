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

test('user message appears once at top, reaches bell and persists in event journal', async ({ page }) => {
  await login(page);
  await page.goto('/settings.html');
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');

  const marker = `toast-${Date.now()}`;
  await page.evaluate(async (message) => {
    const { showToast } = await import('/js/core/toasts.js');
    showToast(message, { severity: 'warning', category: 'settings' });
  }, marker);

  const toast = page.locator('.system-toast').filter({ hasText: marker });
  await expect(toast).toBeVisible();
  const toastBox = await toast.boundingBox();
  expect(toastBox?.y).toBeLessThan(140);
  await expect(page.locator('.form-message').filter({ hasText: marker })).toHaveCount(0);

  await expect.poll(async () => {
    const response = await page.request.get('/api/notifications?limit=50');
    const body = await response.json();
    return body.items.some((item) => item.message === marker && item.severity === 'warning' && item.category === 'settings');
  }).toBe(true);

  await page.locator('#notifications-button').click();
  await expect(page.locator('[data-notification-list] .event-row').filter({ hasText: marker })).toBeVisible();

  await page.getByRole('link', { name: 'Открыть журнал событий' }).click();
  await expect(page).toHaveURL(/\/events\.html$/);
  await page.locator('#event-filter-severity').selectOption('warning');
  await page.locator('#event-filter-category').selectOption('settings');
  await page.locator('#event-filter-query').fill(marker);
  await expect(page.locator('.event-journal-entry-message').filter({ hasText: marker })).toBeVisible();
  await expect(page.locator('#event-policy')).toContainText('Хранение:');

  await expect(toast).toBeHidden({ timeout: 7000 });
});

test('unhandled browser failure is persisted as an interface error in the same journal', async ({ page }) => {
  await login(page);
  const marker = `frontend-${Date.now()}`;
  await page.evaluate((message) => {
    Promise.reject(new Error(message));
  }, marker);

  await expect.poll(async () => {
    const response = await page.request.get(`/api/notifications/events?limit=50&severity=error&category=interface&q=${encodeURIComponent(marker)}`);
    if (!response.ok()) return false;
    const body = await response.json();
    return body.items.some((item) => item.message.includes(marker) && item.action === 'frontend.unhandledrejection');
  }).toBe(true);

  await page.goto('/events.html');
  await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
  await page.locator('#event-filter-severity').selectOption('error');
  await page.locator('#event-filter-category').selectOption('interface');
  await page.locator('#event-filter-query').fill(marker);
  const entry = page.locator('.event-journal-entry').filter({ hasText: marker });
  await expect(entry).toBeVisible();
  await expect(entry.locator('.event-severity')).toHaveText('Ошибка');
  await expect(entry.locator('.event-category')).toHaveText('Интерфейс');
});
