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

  const content = [...stage.querySelectorAll('g.table-item-content, g.packaging-cell-content')];
  content.forEach((target, index) => append(nodes, {
    id: `menu.item.${index}`,
    kind: 'item',
    layer: MOTION_LAYERS.MENU,
    target,
    order: index,
    count: content.length,
    depth: 0,
    transformOwner: 'self'
  }));

  const promotions = [...stage.querySelectorAll('g.promotion-badge')];
  promotions.forEach((target, index) => append(nodes, {
    id: `menu.promotion.${index}`,
    kind: 'promotion',
    layer: MOTION_LAYERS.MENU,
    target,
    order: index,
    count: promotions.length,
    depth: 1,
    transformOwner: 'promotion-motion'
  }));

  const prices = [...stage.querySelectorAll('g.table-item-prices, g.packaging-cell-price')];
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

function collectEntityNodes(stage) {
  const nodes = [];
  append(nodes, {
    id: 'entity.beer-glass',
    kind: 'entity',
    layer: MOTION_LAYERS.ENTITY,
    target: stage.querySelector('[data-entity-motion="beer-glass"]'),
    order: 0,
    count: 1,
    depth: 10,
    transformOwner: 'entity-behavior'
  });
  return nodes;
}

export function buildDomMotionScene(stage) {
  if (!(stage instanceof Element)) throw new TypeError('DOM motion scene requires a stage element.');
  const scene = createMotionScene({
    root: stage,
    nodes: [...collectMenuNodes(stage), ...collectEntityNodes(stage)],
    metadata: { adapter: 'dom', backgroundMotion: false, nestedTransforms: false }
  });
  scene.nodes.forEach(markTarget);
  stage.dataset.motionSceneVersion = String(MOTION_SCENE_VERSION);
  return scene;
}
