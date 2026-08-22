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

async function spaNavigate(page, path) {
  await page.evaluate((href) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = 'audit-navigation';
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, path);
  await expect(page).toHaveURL((url) => url.pathname === path, { timeout: 10_000 });
}

const ROUTES = [
  ['/', 'overview'],
  ['/locations.html', 'locations'],
  ['/screens.html', 'screens'],
  ['/connect-tv.html', 'connect-tv'],
  ['/catalog.html', 'catalog'],
  ['/settings.html', 'settings'],
  ['/sftp-settings.html', 'sftp-settings'],
  ['/animation.html', 'animation'],
  ['/activity.html', 'activity'],
  ['/diagnostics.html', 'diagnostics'],
  ['/profile.html', 'profile']
];

test('all admin pages survive two complete SPA mount/unmount cycles without auth loss', async ({ page }) => {
  const pageErrors = [];
  const documentRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests.push(request.url());
  });

  await login(page);
  documentRequests.length = 0;
  await page.evaluate(() => { window.__fullPageAuditSentinel = `audit-${Math.random()}`; });
  const sentinel = await page.evaluate(() => window.__fullPageAuditSentinel);

  for (let cycle = 0; cycle < 2; cycle += 1) {
    for (const [path, pageName] of ROUTES) {
      if (page.url().endsWith(path) && cycle === 0 && path === '/') {
        await expect(page.locator('body')).toHaveAttribute('data-page', pageName);
      } else {
        await spaNavigate(page, path);
      }
      await expect(page.locator('body')).toHaveAttribute('data-page', pageName);
      await expect(page.locator('.main-content')).toHaveAttribute('data-route-state', 'ready');
      await expect(page).not.toHaveURL(/signin\.html/);
      expect(await page.evaluate(() => window.__fullPageAuditSentinel)).toBe(sentinel);
    }
  }

  expect(documentRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('browser and server failures become visible in the error journal with correlation context', async ({ page }) => {
  await login(page);
  const clientMessage = `browser-audit-${Date.now()}`;
  await page.evaluate((message) => {
    window.dispatchEvent(new ErrorEvent('error', {
      message,
      filename: '/audit-sentinel.js',
      lineno: 17,
      colno: 4,
      error: new Error(message)
    }));
  }, clientMessage);

  const serverResponse = await page.evaluate(async () => {
    const response = await fetch('/api/audit-intentional-not-found', {
      credentials: 'same-origin',
      headers: { 'X-Request-Id': `audit-server-${Date.now()}` }
    });
    return response.status;
  });
  expect(serverResponse).toBe(404);

  await spaNavigate(page, '/diagnostics.html');
  await expect(page.locator('[data-diagnostics-list]')).toContainText(clientMessage, { timeout: 10_000 });
  await expect(page.locator('[data-diagnostics-list]')).toContainText('/api/audit-intentional-not-found', { timeout: 10_000 });
  await expect(page.locator('[data-diagnostics-list]')).toContainText(/request/i);
});
