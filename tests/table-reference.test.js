import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MENU_REFERENCE,
  buildDisplayLines,
  buildRenderLayout,
  buildRenderModel,
  buildTableSvg
} from '../src/web/admin-ui/public/js/editor/renderer.js';

const products = Array.from({ length: 16 }, (_, index) => ({
  id: index + 1,
  name: `ПРОДУКЦИЯ ${index + 1}`,
  producer: `ПРОИЗВОДИТЕЛЬ ${index + 1}`,
  strength: '4,6°',
  beverage_color: index % 2 === 0 ? 'light' : 'dark',
  filtration: index % 2 === 0 ? 'unfiltered' : 'filtered',
  price_primary: '179',
  price_secondary: '268.50',
  active: true
}));

function referenceRows() {
  return [
    { id: 's1', kind: 'section', name: 'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled: true },
    ...products.slice(0, 4).map((product, index) => ({ id: `a${index}`, kind: 'item', product_id: product.id, enabled: true })),
    { id: 's2', kind: 'section', name: 'ПИВО ТЕМНОЕ ФИЛЬТРОВАННОЕ', enabled: true },
    ...products.slice(4, 9).map((product, index) => ({ id: `b${index}`, kind: 'item', product_id: product.id, enabled: true })),
    { id: 's3', kind: 'section', name: 'АЛКОГОЛЬНЫЕ НАПИТКИ', enabled: true },
    ...products.slice(9, 16).map((product, index) => ({ id: `c${index}`, kind: 'item', product_id: product.id, enabled: true }))
  ];
}

test('canonical coordinates stay fixed while redesigned vertical geometry supports two-line items', () => {
  assert.deepEqual(MENU_REFERENCE, {
    width: 2048,
    height: 1152,
    tableX: 15,
    tableRight: 1605,
    tableWidth: 1590,
    primaryBoundary: 1231,
    secondaryBoundary: 1417,
    tableTop: 64,
    tableBottom: 1032,
    firstSectionHeight: 58,
    sectionHeight: 50,
    sectionGap: 10,
    itemHeight: 52,
    packagingHeight: 48,
    fontScaleMinPercent: 55,
    fontScaleMaxPercent: 130
  });
});

test('TV Menu 1 reference density fits by a small automatic reduction without clipping', () => {
  const state = {
    rows: referenceRows(),
    settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow' }
  };
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);
  assert.equal(lines.length, 19);
  assert.equal(layout.vertical.availableHeight, 968);
  assert.equal(layout.vertical.baseContentHeight, 1010);
  assert.equal(layout.vertical.effectivePercent, 95.8);
  assert.equal(layout.vertical.autoReduced, true);
  assert.equal(layout.vertical.fits, true);
  assert.ok(Math.abs(layout.vertical.boxes.at(-1).bottom - 1032) < 0.01);
});

test('overflow automatically reduces scale while preserving exact horizontal reference columns', () => {
  const rows = [
    { id: 's1', kind: 'section', name: 'РАЗДЕЛ', enabled: true },
    ...Array.from({ length: 25 }, (_, index) => ({ id: `r${index}`, kind: 'item', product_id: (index % products.length) + 1, enabled: true }))
  ];
  const model = buildRenderModel({
    rows,
    settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow' }
  }, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);
  assert.equal(layout.horizontal.left, 15);
  assert.equal(layout.horizontal.primaryBoundary, 1231);
  assert.equal(layout.horizontal.secondaryBoundary, 1417);
  assert.equal(layout.horizontal.right, 1605);
  assert.equal(layout.vertical.autoReduced, true);
  assert.ok(layout.vertical.effectivePercent < 100);
  assert.ok(layout.vertical.effectivePercent >= 55);
  assert.equal(layout.vertical.fits, true);

  const svg = buildTableSvg(model, lines, layout);
  assert.match(svg, /viewBox="0 0 2048 1152"/);
  assert.match(svg, /x1="1231"/);
  assert.match(svg, /x1="1417"/);
  assert.match(svg, />1 л\.<\/text>/);
  assert.match(svg, />1,5 л\.<\/text>/);
  assert.doesNotMatch(svg, /°/);
});
