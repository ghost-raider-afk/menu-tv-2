import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisplayLines, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

test('promotion badge keeps shape and label inside one SVG group', () => {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { id: 'section', kind: 'section', name: 'Меню', enabled: true },
      {
        id: 'item',
        kind: 'item',
        name: 'Тестовая позиция',
        price_primary: '240',
        price_secondary: '360',
        promotion: true,
        promotion_text: 'АКЦИЯ',
        enabled: true
      }
    ]
  }, { width: 1920, height: 1080 });

  const lines = buildDisplayLines(model);
  const svg = buildTableSvg(model, lines);
  const badge = svg.match(/<g class="promotion-badge">([\s\S]*?)<\/g>/)?.[1] || '';

  assert.ok(badge, 'promotion-badge group must exist');
  assert.match(badge, /<path\b[^>]*fill="#D92D35"\/?>/);
  assert.match(badge, /<text\b[^>]*class="promotion"[^>]*>АКЦИЯ<\/text>/);
  assert.equal((svg.match(/class="promotion-badge"/g) || []).length, 1);
});
