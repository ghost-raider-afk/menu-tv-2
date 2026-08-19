import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorState, markEditorSaved } from '../../../src/web/admin-ui/public/js/editor/state.js';
import { addRow, applyTemplate, moveRow, removeRow, updateRow } from '../../../src/web/admin-ui/public/js/editor/commands.js';
import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableLayout, buildVerticalLayout } from '../../../src/web/admin-ui/public/js/editor/renderer.js';
import { normaliseEditorSettings } from '../../../src/web/admin-ui/public/js/editor/settings.js';

test('editor commands mutate only Editor State and track dirty revision', () => {
  const state = createEditorState();
  addRow(state, { id: 'section-1', kind: 'section', name: 'Пиво', enabled: true });
  addRow(state, { id: 'item-1', kind: 'item', product_id: 1, name: 'Тест', enabled: true });
  assert.equal(state.rows.length, 2);
  assert.equal(state.dirty, true);
  assert.equal(state.revision, 2);
  assert.equal(state.draftRevision, 0);

  updateRow(state, 'item-1', { promotion: true });
  assert.equal(state.rows[1].promotion, true);
  moveRow(state, 'item-1', 0);
  assert.equal(state.rows[0].id, 'item-1');
  assert.equal(removeRow(state, 'section-1'), true);
  assert.equal(state.rows.length, 1);

  markEditorSaved(state);
  assert.equal(state.dirty, false);
});

test('template application replaces editor rows/settings locally', () => {
  const state = createEditorState({ rows: [{ id: 'old', kind: 'section', name: 'Старое', enabled: true }], settings: { font: 'old' } });
  applyTemplate(state, {
    id: 7,
    rows: [{ id: 'new', kind: 'section', name: 'Новое', enabled: true }],
    settings: { font: 'new' }
  });
  assert.equal(state.templateId, 7);
  assert.deepEqual(state.rows.map((row) => row.id), ['new']);
  assert.deepEqual(state.settings, { font: 'new' });
  assert.equal(state.dirty, true);
});

test('renderer model filters disabled rows and respects arbitrary monitor aspect ratio', () => {
  const state = createEditorState({
    rows: [
      { id: 'a', kind: 'section', name: 'A', enabled: true },
      { id: 'b', kind: 'section', name: 'B', enabled: false }
    ]
  });
  const model = buildRenderModel(state, { width: 1024, height: 768 });
  assert.equal(model.viewport.width, 1024);
  assert.equal(model.viewport.height, 768);
  assert.equal(model.viewport.aspectRatio, 4 / 3);
  assert.deepEqual(model.rows.map((row) => row.id), ['a']);
});

test('template background survives settings normalization and uses TV Menu 1 accent by default', () => {
  const url = '/site-assets/templates/background-123e4567-e89b-12d3-a456-426614174000.webp';
  const settings = normaliseEditorSettings({ background_image_url: url });
  assert.equal(settings.background_image_url, url);
  assert.equal(settings.accent_color, '#F4C915');
  assert.equal(normaliseEditorSettings({ background_image_url: 'https://example.com/x.png' }).background_image_url, '');
});

test('TV board table keeps prices separate and places producer next to product name', () => {
  const state = createEditorState({
    settings: { title: 'Меню' },
    rows: [
      { id: 'product-1', kind: 'item', product_id: 1, enabled: true },
      { id: 'pack-1', kind: 'packaging', packaging_id: 10, enabled: true },
      { id: 'pack-2', kind: 'packaging', packaging_id: 11, enabled: true }
    ]
  });
  const lines = buildDisplayLines(buildRenderModel(state), {
    products: [{ id: 1, name: 'Бавария', strength: '4,6%', producer: 'ООО «Портал»', price_primary: '179.00', price_secondary: '268.50' }],
    packaging: [{ id: 10, name: 'ПЭТ 1 л', unit_price: '10' }, { id: 11, name: 'ПЭТ 1,5 л', unit_price: '12' }]
  });
  assert.equal(lines[0].kind, 'section');
  assert.equal(lines[0].showPriceLabels, true);
  assert.equal(lines[1].name, 'Бавария');
  assert.equal(lines[1].strength, '4,6%');
  assert.equal(lines[1].producer, 'ООО «Портал»');
  assert.equal(lines[1].pricePrimary, '179.00');
  assert.equal(lines[1].priceSecondary, '268.50');
  assert.equal(lines[2].kind, 'packaging');
  assert.equal(lines[2].items.length, 2);
});

test('board table is left aligned and leaves the right side for template artwork', () => {
  const layout = buildTableLayout(1920, 'normal');
  assert.equal(layout.left, 15);
  assert.equal(layout.tableWidth, 1498);
  assert.ok(layout.right < 1920 * 0.8);
  assert.ok(layout.primaryBoundary < layout.secondaryBoundary);
});

test('vertical layout scales font and refuses silent clipping', () => {
  const small = buildVerticalLayout(1080, 22, 'small');
  const medium = buildVerticalLayout(1080, 22, 'medium');
  const large = buildVerticalLayout(1080, 22, 'large');
  assert.ok(small.minRowHeight < medium.minRowHeight);
  assert.ok(medium.minRowHeight < large.minRowHeight);
  assert.equal(small.fits, true);
  assert.equal(medium.fits, true);
  assert.equal(large.fits, false);

  const state = createEditorState({
    settings: { font_scale: 'medium', table_width: 'normal' },
    rows: Array.from({ length: 30 }, (_, index) => ({ id: `section-${index}`, kind: 'section', name: `Раздел ${index}`, enabled: true }))
  });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model);
  const layout = buildRenderLayout(model, lines);
  assert.equal(layout.vertical.fits, false);
});
