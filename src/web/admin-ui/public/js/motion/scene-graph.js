export const MOTION_SCENE_VERSION = 3;

export const MOTION_LAYERS = Object.freeze({
  BACKGROUND: 'background',
  MENU: 'menu',
  ATMOSPHERE: 'atmosphere',
  ENTITY: 'entity'
});

function freezeNode(node) {
  return Object.freeze({
    id: node.id,
    kind: node.kind,
    layer: node.layer,
    element: node.element,
    order: node.order ?? 0,
    count: node.count ?? 1,
    depth: node.depth ?? 0,
    transformOwner: node.transformOwner || 'self'
  });
}

function markNode(node) {
  const { element } = node;
  if (!(element instanceof Element)) return;
  element.dataset.motion = node.kind;
  element.dataset.motionNode = node.id;
  element.dataset.motionLayer = node.layer;
  element.dataset.motionOrder = String(node.order ?? 0);
  element.dataset.motionCount = String(node.count ?? 1);
  element.dataset.motionDepth = String(node.depth ?? 0);
  element.dataset.motionTransformOwner = node.transformOwner || 'self';
}

function appendNode(nodes, node) {
  if (!(node.element instanceof Element)) return;
  const frozen = freezeNode(node);
  markNode(frozen);
  nodes.push(frozen);
}

function menuNodes(stage) {
  const nodes = [];
  const sections = [...stage.querySelectorAll('g.table-section')];
  sections.forEach((element, index) => appendNode(nodes, {
    id: `menu.section.${index}`,
    kind: 'section',
    layer: MOTION_LAYERS.MENU,
    element,
    order: index,
    count: sections.length,
    depth: 0,
    transformOwner: 'self'
  }));

  const rows = [...stage.querySelectorAll('g.table-item, g.table-packaging')];
  rows.forEach((row, index) => {
    if (row.classList.contains('table-packaging')) {
      appendNode(nodes, {
        id: `menu.packaging.${index}`,
        kind: 'item',
        layer: MOTION_LAYERS.MENU,
        element: row,
        order: index,
        count: rows.length,
        depth: 0,
        transformOwner: 'self'
      });
      return;
    }

    appendNode(nodes, {
      id: `menu.item.${index}`,
      kind: 'item',
      layer: MOTION_LAYERS.MENU,
      element: row.querySelector(':scope > g.table-item-content'),
      order: index,
      count: rows.length,
      depth: 0,
      transformOwner: 'self'
    });

    appendNode(nodes, {
      id: `menu.promotion.${index}`,
      kind: 'promotion',
      layer: MOTION_LAYERS.MENU,
      element: row.querySelector(':scope > g.promotion-badge'),
      order: index,
      count: rows.length,
      depth: 1,
      transformOwner: 'self'
    });
  });

  const prices = [...stage.querySelectorAll('text.price, text.packaging-price')];
  prices.forEach((element, index) => appendNode(nodes, {
    id: `menu.price.${index}`,
    kind: 'price',
    layer: MOTION_LAYERS.MENU,
    element,
    order: index,
    count: prices.length,
    depth: 1,
    transformOwner: 'self'
  }));

  return nodes;
}

function auxiliaryNodes(stage) {
  const nodes = [];
  appendNode(nodes, {
    id: 'background.primary',
    kind: 'background',
    layer: MOTION_LAYERS.BACKGROUND,
    element: stage.querySelector('[data-motion-background]'),
    order: 0,
    count: 1,
    depth: -10,
    transformOwner: 'self'
  });
  appendNode(nodes, {
    id: 'atmosphere.shimmer',
    kind: 'shimmer',
    layer: MOTION_LAYERS.ATMOSPHERE,
    element: stage.querySelector('.animation-screen-shimmer'),
    order: 0,
    count: 1,
    depth: 10,
    transformOwner: 'self'
  });
  return nodes;
}

export function buildMotionScene(stage) {
  if (!(stage instanceof Element)) throw new TypeError('Motion scene requires a DOM stage element.');
  const nodes = Object.freeze([...menuNodes(stage), ...auxiliaryNodes(stage)]);
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate motion scene node id: ${node.id}`);
    ids.add(node.id);
  }
  stage.dataset.motionSceneVersion = String(MOTION_SCENE_VERSION);
  return Object.freeze({
    version: MOTION_SCENE_VERSION,
    root: stage,
    nodes,
    layers: Object.freeze(Object.values(MOTION_LAYERS)),
    find(kind) {
      return nodes.filter((node) => node.kind === kind);
    },
    node(id) {
      return nodes.find((node) => node.id === id) || null;
    }
  });
}
