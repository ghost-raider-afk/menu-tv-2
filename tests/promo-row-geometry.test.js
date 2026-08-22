import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDisplayLines, buildRenderLayout, buildRenderModel } from '../src/web/admin-ui/public/js/editor/renderer.js';

const screenPreviewUrl = new URL('../src/web/admin-ui/public/js/motion/screen-preview.js', import.meta.url);

test('promo row geometry is anchored to canonical layout instead of DOM measurement', async () => {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { kind: 'section', name: 'Светлое', enabled: true },
      { kind: 'item', product_id: 1, promotion: true, enabled: true },
      { kind: 'item', product_id: 2, enabled: true }
    ]
  }, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    products: [
      { id: 1, name: 'Снежный эль', price_primary: '230', price_secondary: '345' },
      { id: 2, name: 'Другой эль', price_primary: '220', price_secondary: '330' }
    ]
  });
  const layout = buildRenderLayout(model, lines);
  const promotionIndex = lines.findIndex((line) => line.kind === 'item' && line.promotion === true);

  assert.equal(promotionIndex, 1);
  assert.equal(layout.vertical.boxes[promotionIndex].top, layout.vertical.boxes[0].bottom);
  assert.ok(layout.vertical.boxes[promotionIndex].top > 0);
  assert.ok(layout.vertical.boxes[promotionIndex].height > 0);

  const source = await readFile(screenPreviewUrl, 'utf8');
  assert.doesNotMatch(source, /getBBox\s*\(/, 'promo geometry must not depend on visibility-sensitive DOM measurements');
  assert.match(source, /injectPromoRowLayer\(row, layout\?\.vertical\?\.boxes\?\.\[lineIndex\]\)/);
  assert.match(source, /const top = Number\(box\.top\)/);
  assert.match(source, /const height = Number\(box\.height\)/);
  assert.match(source, /markMotionTargets\(stage, lines, layout\)/);
});
