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

test('canonical coordinates match the full TV Menu 1 1920x1080 file', () => {
  assert.deepEqual(MENU_REFERENCE, {
    width: 1920,
    height: 1080,
    tableX: 56,
    tableRight: 1430,
    tableWidth: 1374,
    tableTop: 15,
    tableBottom: 940,
    rowHeight: 53.5,
    sectionInset: 4,
    separatorInset: 9,
    secondaryPriceX: 1405,
    priceColumnGap: 147,
    rightZoneX: 1495,
    bottomZoneY: 940,
    fontScaleMinPercent: 55,
    fontScaleMaxPercent: 130
  });
});

test('TV Menu 1 reference density fits by scaling the same fixed row geometry', () => {
  const state = {
    rows: referenceRows(),
    settings: { background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow' }
  };
  const model = buildRenderModel(state, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);
  assert.equal(lines.length, 19);
  assert.equal(layout.vertical.availableHeight, 925);
  assert.equal(layout.vertical.baseContentHeight, 1016.5);
  assert.equal(layout.vertical.effectivePercent, 91);
  assert.equal(layout.vertical.autoReduced, true);
  assert.equal(layout.vertical.fits, true);
  assert.ok(Math.abs(layout.vertical.boxes.at(-1).bottom - 940) < 0.5);
});

test('overflow reduces one shared scale while TV Menu 1 price anchors stay right aligned', () => {
  const rows = [
    { id: 's1', kind: 'section', name: 'РАЗДЕЛ', enabled: true },
    ...Array.from({ length: 25 }, (_, index) => ({ id: `r${index}`, kind: 'item', product_id: (index % products.length) + 1, enabled: true }))
  ];
  const model = buildRenderModel({
    rows,
    settings: { background_color: '#101828', accent_color: '#F6C90E', text_color: '#F8FAFC', font_scale_percent: 100, font_family: 'arial-narrow' }
  }, { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, { products });
  const layout = buildRenderLayout(model, lines);
  assert.equal(layout.horizontal.left, 56);
  assert.equal(layout.horizontal.right, 1430);
  assert.equal(layout.horizontal.secondaryPriceX, 1405);
  assert.equal(layout.vertical.autoReduced, true);
  assert.ok(layout.vertical.effectivePercent < 100);
  assert.ok(layout.vertical.effectivePercent >= 55);
  assert.equal(layout.vertical.fits, true);

  const svg = buildTableSvg(model, lines, layout);
  assert.match(svg, /viewBox="0 0 1920 1080"/);
  assert.match(svg, /text-anchor="end"/);
  assert.match(svg, />1 л<\/text>/);
  assert.match(svg, />1,5 л<\/text>/);
  assert.doesNotMatch(svg, /°/);
  assert.doesNotMatch(svg, /<line[^>]*x1="1405"/);
});
