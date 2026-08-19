import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg, MENU_REFERENCE } from '../src/web/admin-ui/public/js/editor/renderer.js';

const product = Object.freeze({
  id: 1,
  name: 'БАВАРИЯ ПШЕНИЧНОЕ',
  producer: 'ООО «Портал», п. Солнечный',
  strength: '4,6%',
  characteristics: 'Светлое нефильтрованное',
  price_primary: '179',
  price_secondary: '268.50',
  active: true
});

function state(count = 4, scale = 100) {
  return {
    settings: { background_color: '#101828', accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: scale },
    rows: [
      { id: 'section', kind: 'section', name: 'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ', enabled: true },
      ...Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, kind: 'item', product_id: 1, enabled: true }))
    ]
  };
}

function rendered(count = 4, scale = 100) {
  const model = buildRenderModel(state(count, scale), { width: 1920, height: 1080 });
  const lines = buildDisplayLines(model, { products: [product] });
  const layout = buildRenderLayout(model, lines);
  return { model, lines, layout, svg: buildTableSvg(model, lines, layout) };
}

test('canonical table geometry is locked to the supplied 2048x1152 reference', () => {
  assert.deepEqual({
    width: MENU_REFERENCE.width,
    height: MENU_REFERENCE.height,
    left: MENU_REFERENCE.tableX,
    right: MENU_REFERENCE.tableRight,
    primary: MENU_REFERENCE.primaryBoundary,
    secondary: MENU_REFERENCE.secondaryBoundary,
    top: MENU_REFERENCE.tableTop
  }, {
    width: 2048,
    height: 1152,
    left: 15,
    right: 1605,
    primary: 1231,
    secondary: 1417,
    top: 64
  });
});

test('one canonical SVG contains sections, producer and both price columns', () => {
  const { svg } = rendered();
  assert.match(svg, /viewBox="0 0 2048 1152"/);
  assert.match(svg, /x1="1231"/);
  assert.match(svg, /x1="1417"/);
  assert.match(svg, /1,0л\./);
  assert.match(svg, /1,5л\./);
  assert.match(svg, /ООО «Портал», п\. Солнечный/);
  assert.match(svg, />179<tspan/);
  assert.match(svg, />268<tspan/);
});

test('canonical SVG is CSP-safe and carries its visual presentation without inline style blocks', () => {
  const { svg } = rendered();
  assert.doesNotMatch(svg, /<style[\s>]/i);
  assert.match(svg, /class="item-name"[^>]*fill="#F8FAFC"/);
  assert.match(svg, /class="separator"[^>]*stroke="#E2E6EA"[^>]*stroke-dasharray=/);
  assert.match(svg, /class="section-title"[^>]*fill="#101317"/);
  assert.match(svg, /font-family="Arial Narrow, Liberation Sans Narrow, DejaVu Sans Condensed, Arial, sans-serif"/);
});

test('font scale automatically reduces to fit but respects manual maximum', () => {
  const { layout } = rendered(25, 100);
  assert.equal(layout.vertical.fits, true);
  assert.equal(layout.vertical.autoReduced, true);
  assert.ok(layout.vertical.effectivePercent < 100);
  assert.ok(layout.vertical.effectivePercent >= MENU_REFERENCE.fontScaleMinPercent);

  const manual = rendered(4, 82).layout;
  assert.equal(manual.vertical.effectivePercent, 82);
  assert.equal(manual.vertical.autoReduced, false);
});

test('menu that cannot fit even at minimum scale is explicitly rejected by layout', () => {
  const { layout } = rendered(50, 130);
  assert.equal(layout.vertical.effectivePercent, MENU_REFERENCE.fontScaleMinPercent);
  assert.equal(layout.vertical.fits, false);
});
