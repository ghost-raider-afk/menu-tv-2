import { test, expect } from '@playwright/test';

test('admin frontend assets are always revalidated after a deployment', async ({ request }) => {
  for (const asset of ['/css/index.css', '/app.js', '/js/editor/renderer.js']) {
    const response = await request.get(asset);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toContain('no-cache');
    expect(response.headers()['cache-control']).toContain('must-revalidate');
    expect(response.headers()['cache-control']).not.toContain('max-age=3600');
  }
});
