import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

test('packaging uses the same menu visual language instead of card chrome', () => {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { kind: 'section', name: 'Тара', enabled: true },
      { kind: 'packaging', packaging_id: 1, enabled: true },
      { kind: 'packaging', packaging_id: 2, enabled: true }
    ]
  }, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    packaging: [
      { id: 1, name: 'ПЭТ 1 л', unit_price: '20' },
      { id: 2, name: 'ПЭТ 1,5 л', unit_price: '25' }
    ]
  });
  const svg = buildTableSvg(model, lines, buildRenderLayout(model, lines));
  const packagingStart = svg.indexOf('<g class="table-packaging">');
  const packagingEnd = svg.indexOf('</g>', packagingStart + 1);
  const packaging = svg.slice(packagingStart, packagingEnd + 4);

  assert.ok(packagingStart >= 0, 'packaging group must be rendered');
  assert.doesNotMatch(packaging, /<rect\b/);
  assert.doesNotMatch(packaging, /packaging-cell/);
  assert.match(packaging, /class="item-name packaging-name"/);
  assert.match(packaging, /class="price"/);
  assert.match(packaging, /class="separator"/);
});
