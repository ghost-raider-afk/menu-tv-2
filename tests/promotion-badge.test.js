import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildDisplayLines, buildRenderModel, buildTableSvg } from '../src/web/admin-ui/public/js/editor/renderer.js';

const publicRoot = new URL('../src/web/admin-ui/public/', import.meta.url);

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
  const badgeStart = svg.indexOf('<g class="promotion-badge">');
  const badgeEnd = svg.indexOf('</g>', badgeStart);
  const contentStart = svg.indexOf('<g class="table-item-content">');
  const badge = badgeStart >= 0 && badgeEnd > badgeStart ? svg.slice(badgeStart, badgeEnd + 4) : '';

  assert.ok(badge, 'promotion-badge group must exist');
  assert.match(badge, /<path\b[^>]*fill="#D92D35"\/?>/);
  assert.match(badge, /<text\b[^>]*class="promotion"[^>]*>АКЦИЯ<\/text>/);
  assert.equal((svg.match(/class="promotion-badge"/g) || []).length, 1);
  assert.ok(contentStart > badgeEnd, 'promotion badge must be a sibling of the item motion content, not nested inside it');
});

test('motion preview isolates promotion scaling from the parent table item and keeps row phase synchronized', async () => {
  const [screenPreview, player] = await Promise.all([
    readFile(new URL('js/motion/screen-preview.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/preview-player.js', publicRoot), 'utf8')
  ]);

  assert.match(screenPreview, /:scope > g\.table-item-content/);
  assert.match(screenPreview, /:scope > g\.promotion-badge/);
  assert.match(screenPreview, /markMotionTarget\(content, 'item', index, rows\.length\)/);
  assert.match(screenPreview, /markMotionTarget\(promotion, 'promotion', index, rows\.length\)/);
  assert.doesNotMatch(screenPreview, /markMotionTarget\(row, 'item'/);
  assert.match(player, /promotion:\s*\[\.\.\.this\.stage\.querySelectorAll\('\[data-motion="promotion"\]'\)\]/);
  assert.match(player, /sequenceFor\(element, index, targets\.length\)/);
  assert.match(player, /kind === 'promotion' \? 'item' : kind/);
});
