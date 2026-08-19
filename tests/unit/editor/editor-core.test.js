import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorState, markEditorSaved } from '../../../src/web/admin-ui/public/js/editor/state.js';
import { addRow, applyTemplate, moveRow, removeRow, updateRow } from '../../../src/web/admin-ui/public/js/editor/commands.js';
import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg, MENU_REFERENCE } from '../../../src/web/admin-ui/public/js/editor/renderer.js';
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
  const state = createEditorState({ rows: [{ id: 'old', kind: 'section', name: 'Старое', enabled: true }], settings: { font_scale_percent: 90 } });
  applyTemplate(state, {
    id: 7,
    rows: [{ id: 'new', kind: 'section', name: 'Новое', enabled: true }],
    settings: { font_scale_percent: 110, font_family: 'tahoma-bold' }
  });
  assert.equal(state.templateId, 7);
  assert.deepEqual(state.rows.map((row) => row.id), ['new']);
  assert.deepEqual(state.settings, { font_scale_percent: 110, font_family: 'tahoma-bold' });
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

test('template background survives settings normalization and uses canonical defaults', () => {
  const url = '/site-assets/templates/background-123e4567-e89b-12d3-a456-426614174000.webp';
  const settings = normaliseEditorSettings({ background_image_url: url });
  assert.equal(settings.background_image_url, url);
  assert.equal(settings.accent_color, '#F4C915');
  assert.equal(settings.font_scale_percent, 100);
  assert.equal(settings.font_family, 'arial-narrow');
  assert.equal(normaliseEditorSettings({ background_image_url: 'https://example.com/x.png' }).background_image_url, '');
});

test('canonical table keeps prices separate and builds second line only from catalog fields', () => {
  const state = createEditorState({
    settings: { font_scale_percent: 100, font_family: 'arial-narrow' },
    rows: [
      { id: 'product-1', kind: 'item', product_id: 1, enabled: true },
      { id: 'pack-1', kind: 'packaging', packaging_id: 10, enabled: true },
      { id: 'pack-2', kind: 'packaging', packaging_id: 11, enabled: true }
    ]
  });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, {
    products: [{ id: 1, name: 'Бавария', strength: '4,6°', producer: 'ООО «Портал»', beverage_color: 'light', filtration: 'unfiltered', price_primary: '179.00', price_secondary: '268.50' }],
    packaging: [{ id: 10, name: 'ПЭТ 1 л', unit_price: '10' }, { id: 11, name: 'ПЭТ 1,5 л', unit_price: '12' }]
  });
  assert.equal(lines[0].kind, 'section');
  assert.equal(lines[0].showPriceLabels, true);
  assert.equal(lines[1].name, 'Бавария');
  assert.equal(lines[1].strength, '4,6%');
  assert.equal(lines[1].producer, 'ООО «Портал»');
  assert.equal(lines[1].metadata, 'ООО «Портал» · 4,6% · светлое · нефильтрованное');
  assert.equal(lines[1].pricePrimary, '179.00');
  assert.equal(lines[1].priceSecondary, '268.50');
  assert.equal(lines[2].kind, 'packaging');
  assert.equal(lines[2].items.length, 2);

  const layout = buildRenderLayout(model, lines);
  const svg = buildTableSvg(model, lines, layout);
  assert.match(svg, /class="item-name"[^>]*>БАВАРИЯ<\/text>/);
  assert.doesNotMatch(svg, /class="item-name"[^>]*4,6%/);
  assert.match(svg, /ООО «Портал» · 4,6% · светлое · нефильтрованное/);
  assert.doesNotMatch(svg, /°/);
  assert.match(svg, />179<tspan/);
});

test('board horizontal geometry stays locked to the supplied reference and leaves artwork on the right', () => {
  assert.equal(MENU_REFERENCE.tableX, 15);
  assert.equal(MENU_REFERENCE.tableRight, 1605);
  assert.equal(MENU_REFERENCE.tableWidth, 1590);
  assert.equal(MENU_REFERENCE.primaryBoundary, 1231);
  assert.equal(MENU_REFERENCE.secondaryBoundary, 1417);
  assert.ok(MENU_REFERENCE.tableRight < MENU_REFERENCE.width * 0.8);
});

test('automatic font fitting reduces scale and refuses silent clipping', () => {
  const state = createEditorState({
    settings: { font_scale_percent: 100, font_family: 'arial-narrow' },
    rows: Array.from({ length: 30 }, (_, index) => ({ id: `section-${index}`, kind: 'section', name: `Раздел ${index}`, enabled: true }))
  });
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model);
  const layout = buildRenderLayout(model, lines);
  assert.equal(layout.vertical.effectivePercent, MENU_REFERENCE.fontScaleMinPercent);
  assert.equal(layout.vertical.autoReduced, true);
  assert.equal(layout.vertical.fits, false);
});
