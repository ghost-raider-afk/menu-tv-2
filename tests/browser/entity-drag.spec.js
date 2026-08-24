import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function login(page) {
  await page.goto('/signin.html');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function requestJson(page, url, init = {}) {
  return page.evaluate(async ({ url, init }) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
      ...init
    });
    if (!response.ok) throw new Error(`${init.method || 'GET'} ${url} failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }, { url, init });
}

async function transparentEntityPng() {
  return sharp({
    create: { width: 180, height: 360, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{
    input: Buffer.from('<svg width="180" height="360"><path d="M45 25H135L150 320Q90 350 30 320Z" fill="#E9B949"/><ellipse cx="90" cy="48" rx="48" ry="22" fill="#FFF1B8"/></svg>')
  }]).png().toBuffer();
}

test('dragging Live Entity updates relative placement and persists it on Save', async ({ page }) => {
  await login(page);
  const original = await requestJson(page, '/api/settings/animation');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const location = await requestJson(page, '/api/locations', {
    method: 'POST', body: JSON.stringify({ name: `Entity drag ${suffix}`, address: '', active: true })
  });
  const screen = await requestJson(page, `/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
  const png = await transparentEntityPng();

  try {
    await page.goto(`/animation.html?screen=${screen.id}`);
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(screen.id));

    const upload = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation/entity-asset') && response.request().method() === 'PUT');
    await page.locator('#animation-entity-file').setInputFiles({ name: 'beer-glass.png', mimeType: 'image/png', buffer: png });
    expect((await upload).ok()).toBeTruthy();

    const stage = page.locator('#animation-stage');
    const placement = stage.locator('[data-entity-placement]');
    await expect(placement).toBeVisible();

    const stageBox = await stage.boundingBox();
    const placementBox = await placement.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(placementBox).not.toBeNull();

    const targetXPercent = 69;
    const targetYPercent = 43;
    await page.mouse.move(placementBox.x + placementBox.width / 2, placementBox.y + placementBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      stageBox.x + stageBox.width * targetXPercent / 100,
      stageBox.y + stageBox.height * targetYPercent / 100,
      { steps: 6 }
    );
    await page.mouse.up();

    await expect.poll(() => Number(page.locator('#animation-entity-x').inputValue())).toBeCloseTo(targetXPercent, 0);
    await expect.poll(() => Number(page.locator('#animation-entity-y').inputValue())).toBeCloseTo(targetYPercent, 0);
    const placementStyle = await placement.evaluate((node) => ({ left: node.style.left, top: node.style.top }));
    expect(Number.parseFloat(placementStyle.left)).toBeCloseTo(targetXPercent, 0);
    expect(Number.parseFloat(placementStyle.top)).toBeCloseTo(targetYPercent, 0);

    const save = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    expect((await save).ok()).toBeTruthy();

    const saved = await requestJson(page, '/api/settings/animation');
    expect(saved.profile.entity.x_percent).toBeCloseTo(targetXPercent, 0);
    expect(saved.profile.entity.y_percent).toBeCloseTo(targetYPercent, 0);
  } finally {
    await page.evaluate(async () => {
      await fetch('/api/settings/animation/entity-asset', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    });
    await page.evaluate(async (settings) => {
      await fetch('/api/settings/animation', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: settings.enabled, preset_id: settings.preset_id, profile: settings.profile })
      }).catch(() => undefined);
    }, original);
    await page.evaluate(async ({ screenId, locationId }) => {
      await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
      await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    }, { screenId: screen.id, locationId: location.id });
  }
});
