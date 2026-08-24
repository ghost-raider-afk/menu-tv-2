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

async function animationSettings(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/animation', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`animation settings GET failed: ${response.status}`);
    return response.json();
  });
}

async function restoreAnimationSettings(page, settings) {
  await page.evaluate(async (payload) => {
    const response = await fetch('/api/settings/animation', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`animation settings restore failed: ${response.status}`);
  }, { enabled: settings.enabled, preset_id: settings.preset_id, profile: settings.profile });
}

async function deleteEntityAsset(page) {
  await page.evaluate(async () => {
    const response = await fetch('/api/settings/animation/entity-asset', { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`entity asset DELETE failed: ${response.status}`);
  }).catch(() => undefined);
}

async function createPreviewFixture(page) {
  return page.evaluate(async () => {
    async function request(url, init = {}) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        ...init
      });
      if (!response.ok) throw new Error(`${init.method || 'GET'} ${url} failed: ${response.status}`);
      return response.status === 204 ? null : response.json();
    }

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const location = await request('/api/locations', {
      method: 'POST', body: JSON.stringify({ name: `Animation ${suffix}`, address: '', active: true })
    });
    const screen = await request(`/api/locations/${location.id}/screens`, { method: 'POST', body: '{}' });
    const editor = await request(`/api/screens/${screen.id}/editor`);
    await request(`/api/screens/${screen.id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        revision: editor.draft.revision,
        rows: [{ id: 'real-preview-section', kind: 'section', name: 'НАСТОЯЩИЙ ЭКРАН MOTION STUDIO', enabled: true }],
        settings: { background_color: '#123456', accent_color: '#F4C915', text_color: '#F8FAFC' }
      })
    });
    return { locationId: location.id, screenId: screen.id, locationName: location.name, screenName: screen.name };
  });
}

async function removePreviewFixture(page, fixture) {
  await page.evaluate(async ({ screenId, locationId }) => {
    await fetch(`/api/screens/${screenId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    await fetch(`/api/locations/${locationId}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
  }, fixture);
}

async function transparentEntityPng() {
  return sharp({
    create: { width: 160, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{
    input: Buffer.from('<svg width="160" height="300"><rect x="35" y="35" width="90" height="230" rx="34" fill="#F6C90E" fill-opacity=".92"/><ellipse cx="80" cy="50" rx="45" ry="22" fill="#FFF4C2"/></svg>'),
    top: 0,
    left: 0
  }]).png().toBuffer();
}

test('animation studio keeps the selected real menu visible while 20 continuous presets loop', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);

  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.getByRole('heading', { name: 'Анимация экранов' })).toBeVisible();
    await expect(page.getByText('Меню всегда остаётся открытым и читаемым.')).toBeVisible();
    await expect(page.locator('[data-animation-preset]')).toHaveCount(20);
    await expect(page.locator('#animation-stage')).toBeVisible();
    await expect(page.locator('#animation-screen-select')).toHaveValue(String(fixture.screenId));
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.locator('#animation-stage .section-title')).toHaveText('НАСТОЯЩИЙ ЭКРАН MOTION STUDIO');
    await expect(page.locator('#animation-stage .animation-screen-background')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(page.locator('#animation-screen-status')).toContainText(fixture.screenName);

    await page.getByRole('button', { name: /Световая волна слева/ }).click();
    await expect(page.locator('#animation-current-preset')).toHaveText('Световая волна слева');
    await expect(page.locator('#animation-pattern')).toHaveValue('wave');
    await expect(page.locator('#animation-flow-direction')).toHaveValue('left-to-right');

    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#animation-stage g.table-section')).opacity)).toBe('1');

    await page.locator('#animation-pause').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBe(0);
    await page.locator('#animation-timeline').fill('600');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#animation-stage g.table-section')).opacity)).toBe('1');
    await page.locator('#animation-play').click();
    await expect.poll(() => page.evaluate(() => document.querySelector('#animation-stage').getAnimations({ subtree: true }).filter((item) => item.playState === 'running').length)).toBeGreaterThan(0);
    await page.locator('#animation-replay').click();
    await expect(page.locator('#animation-time')).not.toHaveText('0.0 с / 0.0 с');

    await page.locator('#animation-enabled').check();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-save').click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    await expect(page.locator('#animation-message')).toContainText('Профиль постоянной анимации');

    const saved = await animationSettings(page);
    expect(saved.enabled).toBe(true);
    expect(saved.preset_id).toBe('slide-left');
    expect(saved.profile.motion_version).toBe(2);
    expect(saved.profile.pattern).toBe('wave');
    expect(saved.profile.flow_direction).toBe('left-to-right');
    expect(saved.profile.entrance).toBeUndefined();
  } finally {
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});

test('live entity can be uploaded positioned and animated independently in Motion Studio', async ({ page }) => {
  await login(page);
  const fixture = await createPreviewFixture(page);
  const original = await animationSettings(page);
  const png = await transparentEntityPng();

  try {
    await page.goto(`/animation.html?screen=${fixture.screenId}`);
    await expect(page.locator('#animation-stage')).toHaveAttribute('data-screen-id', String(fixture.screenId));
    await expect(page.getByRole('heading', { name: 'Живой объект' })).toBeVisible();

    const uploadResponse = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation/entity-asset') && response.request().method() === 'PUT');
    await page.locator('#animation-entity-file').setInputFiles({ name: 'beer-glass.png', mimeType: 'image/png', buffer: png });
    expect((await uploadResponse).ok()).toBeTruthy();

    const placement = page.locator('#animation-stage [data-entity-placement]');
    const target = page.locator('#animation-stage [data-motion-entity]');
    await expect(placement).toBeVisible();
    await expect(target).toHaveAttribute('data-motion', 'entity');
    await expect(page.locator('#animation-entity-thumb img')).toBeVisible();
    await expect(page.locator('#animation-entity-status')).toContainText('160×300');
    await expect.poll(() => target.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);

    await page.locator('#animation-entity-x').fill('76.5');
    await page.locator('#animation-entity-y').fill('48.5');
    await page.locator('#animation-entity-width').fill('21.5');
    await page.locator('#animation-entity-opacity').fill('92');
    await page.locator('#animation-entity-idle-effect').selectOption('float');
    await page.locator('#animation-entity-idle-amount').fill('63');
    await page.locator('#animation-entity-idle-cycle').fill('6.4');

    await expect(placement).toHaveCSS('left', /.+/);
    const placementStyle = await placement.evaluate((node) => ({ left: node.style.left, top: node.style.top, width: node.style.width, opacity: node.style.opacity }));
    expect(placementStyle.left).toBe('76.5%');
    expect(placementStyle.top).toBe('48.5%');
    expect(placementStyle.width).toBe('21.5%');
    expect(placementStyle.opacity).toBe('0.92');

    const saveResponse = page.waitForResponse((response) => response.url().endsWith('/api/settings/animation') && response.request().method() === 'PUT');
    await page.locator('#animation-enabled').check();
    await page.locator('#animation-save').click();
    expect((await saveResponse).ok()).toBeTruthy();

    const saved = await animationSettings(page);
    expect(saved.enabled).toBe(true);
    expect(saved.profile.entity.enabled).toBe(true);
    expect(saved.profile.entity.asset_url).toMatch(/^\/site-assets\/animation-entity-[0-9a-f-]{36}\.png$/i);
    expect(saved.profile.entity.x_percent).toBe(76.5);
    expect(saved.profile.entity.y_percent).toBe(48.5);
    expect(saved.profile.entity.width_percent).toBe(21.5);
    expect(saved.profile.entity.opacity).toBe(92);
    expect(saved.profile.entity.idle_effect).toBe('float');
    expect(saved.profile.entity.idle_amount).toBe(63);
    expect(saved.profile.entity.idle_cycle_seconds).toBe(6.4);
  } finally {
    await deleteEntityAsset(page);
    await restoreAnimationSettings(page, original);
    await removePreviewFixture(page, fixture);
  }
});

test('promotion badge scales as one isolated SVG motion group', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');

  const result = await page.evaluate(async () => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }, { profileForPreset }] = await Promise.all([
      import('/js/motion/screen-preview.js'),
      import('/js/motion/preview-player.js'),
      import('/js/motion/presets.js')
    ]);

    const stage = document.createElement('div');
    stage.className = 'animation-stage';
    stage.style.width = '960px';
    document.body.append(stage);

    renderAnimationScreenPreview(stage, {
      screen: { id: 999999, resolution: '1920x1080' },
      draft: {
        rows: [
          { id: 'section', kind: 'section', name: 'ПРОВЕРКА АКЦИИ', enabled: true },
          {
            id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360',
            promotion: true, promotion_text: 'АКЦИЯ', enabled: true
          }
        ],
        settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' }
      },
      products: [],
      packaging: []
    });

    const row = stage.querySelector('g.table-item');
    const content = row?.querySelector(':scope > g.table-item-content');
    const badge = row?.querySelector(':scope > g.promotion-badge');
    const badgePath = badge?.querySelector('path');
    const badgeText = badge?.querySelector('text.promotion');
    const player = new AnimationPreviewPlayer({ stage });
    const profile = {
      ...profileForPreset('accent-pulse'),
      pattern: 'pulse',
      flow_direction: 'none',
      item_effect: 'pulse',
      price_effect: 'none',
      section_effect: 'none',
      background_effect: 'none',
      cycle_seconds: 8,
      event_duration_ms: 1200,
      scale_amount: 0.05,
      intensity: 100
    };

    player.restart(profile);
    player.seek(600);

    const snapshot = {
      rowMotion: row?.dataset.motion || '',
      contentMotion: content?.dataset.motion || '',
      badgeMotion: badge?.dataset.motion || '',
      contentOrder: content?.dataset.motionOrder || '',
      badgeOrder: badge?.dataset.motionOrder || '',
      rowAnimations: row?.getAnimations().length ?? -1,
      contentAnimations: content?.getAnimations().length ?? -1,
      badgeAnimations: badge?.getAnimations().length ?? -1,
      pathAnimations: badgePath?.getAnimations().length ?? -1,
      textAnimations: badgeText?.getAnimations().length ?? -1,
      contentTransform: content ? getComputedStyle(content).transform : 'none',
      badgeTransform: badge ? getComputedStyle(badge).transform : 'none'
    };

    player.destroy();
    stage.remove();
    return snapshot;
  });

  expect(result.rowMotion).toBe('');
  expect(result.contentMotion).toBe('item');
  expect(result.badgeMotion).toBe('promotion');
  expect(result.contentOrder).toBe(result.badgeOrder);
  expect(result.rowAnimations).toBe(0);
  expect(result.contentAnimations).toBe(1);
  expect(result.badgeAnimations).toBe(1);
  expect(result.pathAnimations).toBe(0);
  expect(result.textAnimations).toBe(0);
  expect(result.contentTransform).not.toBe('none');
  expect(result.badgeTransform).toBe(result.contentTransform);
});

test('preview player rebinds scene targets after the preview DOM is replaced', async ({ page }) => {
  await login(page);
  await page.goto('/animation.html');

  const result = await page.evaluate(async () => {
    const [{ renderAnimationScreenPreview }, { AnimationPreviewPlayer }, { profileForPreset }] = await Promise.all([
      import('/js/motion/screen-preview.js'),
      import('/js/motion/preview-player.js'),
      import('/js/motion/presets.js')
    ]);
    const stage = document.createElement('div');
    stage.className = 'animation-stage';
    stage.style.width = '960px';
    document.body.append(stage);
    const player = new AnimationPreviewPlayer({ stage });
    const profile = { ...profileForPreset('accent-pulse'), item_effect: 'pulse', price_effect: 'none', background_effect: 'none' };
    const bundle = (name) => ({
      screen: { id: 999998, resolution: '1920x1080' },
      draft: {
        rows: [
          { id: `section-${name}`, kind: 'section', name: 'ПРОВЕРКА REBIND', enabled: true },
          { id: `item-${name}`, kind: 'item', name, price_primary: '240', price_secondary: '360', enabled: true }
        ],
        settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC' }
      },
      products: [], packaging: []
    });

    renderAnimationScreenPreview(stage, bundle('ПЕРВАЯ ПОЗИЦИЯ'));
    player.restart(profile);
    const firstTarget = player.scene.node('menu.item.0')?.target;

    renderAnimationScreenPreview(stage, bundle('ВТОРАЯ ПОЗИЦИЯ'));
    const oldTargetStillInStage = firstTarget ? stage.contains(firstTarget) : null;
    const secondContentBeforeRestart = stage.querySelector('g.table-item > g.table-item-content');
    player.restart(profile);
    const reboundTarget = player.scene.node('menu.item.0')?.target;

    const snapshot = {
      oldTargetStillInStage,
      targetChanged: firstTarget !== reboundTarget,
      reboundIsCurrentDom: reboundTarget === secondContentBeforeRestart,
      reboundAnimations: reboundTarget?.getAnimations().length ?? -1,
      oldAnimations: firstTarget?.getAnimations().length ?? -1,
      currentName: stage.querySelector('.item-name')?.textContent || ''
    };
    player.destroy();
    stage.remove();
    return snapshot;
  });

  expect(result.oldTargetStillInStage).toBe(false);
  expect(result.targetChanged).toBe(true);
  expect(result.reboundIsCurrentDom).toBe(true);
  expect(result.reboundAnimations).toBeGreaterThan(0);
  expect(result.oldAnimations).toBe(0);
  expect(result.currentName).toBe('ВТОРАЯ ПОЗИЦИЯ');
});
