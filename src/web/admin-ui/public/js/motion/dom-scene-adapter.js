import { createMotionScene, MOTION_LAYERS, MOTION_SCENE_VERSION } from './scene-graph.js';

function markTarget(node) {
  const { target } = node;
  if (!(target instanceof Element)) return;
  target.dataset.motion = node.kind;
  target.dataset.motionNode = node.id;
  target.dataset.motionLayer = node.layer;
  target.dataset.motionOrder = String(node.order ?? 0);
  target.dataset.motionCount = String(node.count ?? 1);
  target.dataset.motionDepth = String(node.depth ?? 0);
  target.dataset.motionTransformOwner = node.transformOwner || 'self';
}

function append(nodes, node) {
  if (!(node.target instanceof Element)) return;
  nodes.push(node);
}

function collectMenuNodes(stage) {
  const nodes = [];
  const sections = [...stage.querySelectorAll('g.table-section')];
  sections.forEach((target, index) => append(nodes, {
    id: `menu.section.${index}`,
    kind: 'section',
    layer: MOTION_LAYERS.MENU,
    target,
    order: index,
    count: sections.length,
    depth: 0,
    transformOwner: 'self'
  }));

  const rows = [...stage.querySelectorAll('g.table-item, g.table-packaging')];
  rows.forEach((row, index) => {
    if (row.classList.contains('table-packaging')) {
      append(nodes, {
        id: `menu.packaging.${index}`,
        kind: 'item',
        layer: MOTION_LAYERS.MENU,
        target: row,
        order: index,
        count: rows.length,
        depth: 0,
        transformOwner: 'self'
      });
      return;
    }
    append(nodes, {
      id: `menu.item.${index}`,
      kind: 'item',
      layer: MOTION_LAYERS.MENU,
      target: row.querySelector(':scope > g.table-item-content'),
      order: index,
      count: rows.length,
      depth: 0,
      transformOwner: 'self'
    });
    append(nodes, {
      id: `menu.promotion.${index}`,
      kind: 'promotion',
      layer: MOTION_LAYERS.MENU,
      target: row.querySelector(':scope > g.promotion-badge'),
      order: index,
      count: rows.length,
      depth: 1,
      transformOwner: 'self'
    });
  });

  const prices = [...stage.querySelectorAll('text.price, text.packaging-price')];
  prices.forEach((target, index) => append(nodes, {
    id: `menu.price.${index}`,
    kind: 'price',
    layer: MOTION_LAYERS.MENU,
    target,
    order: index,
    count: prices.length,
    depth: 1,
    transformOwner: 'self'
  }));
  return nodes;
}

function collectAuxiliaryNodes(stage) {
  const nodes = [];
  append(nodes, {
    id: 'background.primary',
    kind: 'background',
    layer: MOTION_LAYERS.BACKGROUND,
    target: stage.querySelector('[data-motion-background]'),
    order: 0,
    count: 1,
    depth: -10,
    transformOwner: 'self'
  });
  append(nodes, {
    id: 'atmosphere.shimmer',
    kind: 'shimmer',
    layer: MOTION_LAYERS.ATMOSPHERE,
    target: stage.querySelector('.animation-screen-shimmer'),
    order: 0,
    count: 1,
    depth: 10,
    transformOwner: 'self'
  });
  return nodes;
}

export function buildDomMotionScene(stage) {
  if (!(stage instanceof Element)) throw new TypeError('DOM motion scene requires a stage element.');
  const scene = createMotionScene({
    root: stage,
    nodes: [...collectMenuNodes(stage), ...collectAuxiliaryNodes(stage)],
    metadata: { adapter: 'dom' }
  });
  scene.nodes.forEach(markTarget);
  stage.dataset.motionSceneVersion = String(MOTION_SCENE_VERSION);
  return scene;
}
