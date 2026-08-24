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

test('Motion Engine v3 keeps promotion and row content as sibling scene nodes with shared phase', async () => {
  const [sceneGraph, motionPlan, player] = await Promise.all([
    readFile(new URL('js/motion/scene-graph.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/motion-plan.js', publicRoot), 'utf8'),
    readFile(new URL('js/motion/preview-player.js', publicRoot), 'utf8')
  ]);

  assert.match(sceneGraph, /row\.classList\.contains\('table-packaging'\)/);
  assert.match(sceneGraph, /:scope > g\.table-item-content/);
  assert.match(sceneGraph, /:scope > g\.promotion-badge/);
  assert.match(sceneGraph, /id: `menu\.item\.\$\{index\}`/);
  assert.match(sceneGraph, /id: `menu\.promotion\.\$\{index\}`/);
  assert.match(sceneGraph, /order: index,[\s\S]*count: rows\.length/);
  assert.match(sceneGraph, /transformOwner: 'self'/);
  assert.match(motionPlan, /node\.kind === 'promotion' \? 'item' : node\.kind/);
  assert.match(motionPlan, /targetDelay\(profile, node\.order, node\.count, duration\)/);
  assert.match(player, /buildMotionScene\(this\.stage\)/);
  assert.match(player, /compileMotionPlan\(this\.scene, profile\)/);
  assert.doesNotMatch(player, /\.animate\(/);
});
