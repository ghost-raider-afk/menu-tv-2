import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDisplayLines, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);

test('promotion badge remains one SVG object and cinematic wave spans its row', () => {
  const model = buildRenderModel({
    settings: {},
    rows: [
      { id: 'section', kind: 'section', name: 'Меню', enabled: true },
      {
        id: 'item', kind: 'item', name: 'Тестовая позиция', price_primary: '240', price_secondary: '360',
        promotion: true, promotion_text: 'АКЦИЯ', enabled: true
      }
    ]
  }, { width: 1920, height: 1080 });

  const lines = buildDisplayLines(model);
  const svg = buildTableSvg(model, lines);
  const rowStart = svg.indexOf('<g class="table-item');
  const badgeStart = svg.indexOf('<g class="promotion-badge">', rowStart);
  const badgeEnd = svg.indexOf('</g>', badgeStart);
  const pricesStart = svg.indexOf('<g class="table-item-prices">', rowStart);
  const rowEnd = svg.indexOf('</g>', pricesStart);
  const badge = badgeStart >= 0 && badgeEnd > badgeStart ? svg.slice(badgeStart, badgeEnd + 4) : '';

  assert.ok(rowStart >= 0, 'whole item row must exist');
  assert.ok(badge, 'promotion-badge group must exist');
  assert.match(badge, /<path\b[^>]*fill="#D92D35"\/?>/);
  assert.match(badge, /<text\b[^>]*class="promotion"[^>]*>АКЦИЯ<\/text>/);
  assert.match(svg, /class="promotion-light-wave"/);
  assert.match(svg, /data-wave-travel=/);
  assert.match(svg, /id="mira-promo-wave"/);
  assert.ok(badgeStart > rowStart && pricesStart > rowStart && rowEnd > pricesStart, 'badge, content and prices must stay inside the same table-item row');
});

test('DOM scene graph has exactly one row transform owner and no price transform nodes', async () => {
  const [adapter, plan, driver, renderer] = await Promise.all([
    readFile(new URL('js/motion/dom-scene-adapter.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/motion-plan.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/drivers/wasm-motion-driver.js', publicRoot), 'utf8'),
    readFile(new URL('js/editor/renderer-svg.js', publicRoot), 'utf8')
  ]);

  assert.match(adapter, /g\.table-item, g\.table-packaging/);
  assert.match(adapter, /transformOwner: 'row'/);
  assert.match(adapter, /g\.promotion-badge/);
  assert.match(adapter, /g\.promotion-light-wave/);
  assert.doesNotMatch(adapter, /table-item-content, g\.packaging-cell-content/);
  assert.doesNotMatch(adapter, /table-item-prices, g\.packaging-cell-price/);
  assert.doesNotMatch(adapter, /kind: 'price'/);
  assert.doesNotMatch(adapter, /menu\.price/);
  assert.match(plan, /procedural:/);
  assert.doesNotMatch(plan, /keyframes:/);
  assert.match(driver, /requestAnimationFrame/);
  assert.match(driver, /_mira_promo_wave_progress/);
  assert.match(renderer, /<g class="table-item tone-/);
  assert.match(renderer, /<g class="table-item-prices">/);
});
