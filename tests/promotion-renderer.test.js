import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

function renderPromotionRow(row) {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { kind: 'section', name: 'Пиво', enabled: true },
      { kind: 'item', product_id: 1, enabled: true, ...row }
    ]
  }, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    products: [{ id: 1, name: 'Снежный эль', price_primary: '230', price_secondary: '345' }]
  });
  return buildTableSvg(model, lines, buildRenderLayout(model, lines));
}

test('promotion flag is visually self-contained even without custom promotion text', () => {
  const svg = renderPromotionRow({ promotion: true, promotion_text: '' });
  assert.match(svg, /<g class="promotion-badge-group">[\s\S]*class="promotion-badge"[\s\S]*class="promotion"[\s\S]*<\/g>/);
  assert.match(svg, />АКЦИЯ<\/text>/);
  assert.match(svg, /stroke="#F6C90E"/);
  assert.match(svg, /font-weight="900"/);
});

test('custom promotion text replaces default АКЦИЯ label', () => {
  const svg = renderPromotionRow({ promotion: true, promotion_text: 'ХИТ ДНЯ' });
  assert.match(svg, />ХИТ ДНЯ<\/text>/);
  assert.doesNotMatch(svg, />АКЦИЯ<\/text>/);
});

test('non-promotion rows do not render promotion badge', () => {
  const svg = renderPromotionRow({ promotion: false, promotion_text: 'ХИТ ДНЯ' });
  assert.doesNotMatch(svg, /promotion-badge|class="promotion"/);
});
