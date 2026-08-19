import { test, expect } from '@playwright/test';

test('admin frontend assets are never served from a stale browser cache', async ({ request }) => {
  for (const asset of ['/css/index.css', '/app.js', '/js/editor/renderer.js']) {
    const response = await request.get(asset);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
