const ENTITY_ASSET = /^\/site-assets\/animation-entity-[0-9a-f-]{36}\.(?:png|webp)$/i;

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normaliseEntityView(entity = {}) {
  return Object.freeze({
    enabled: entity?.enabled === true,
    asset_url: typeof entity?.asset_url === 'string' && ENTITY_ASSET.test(entity.asset_url) ? entity.asset_url : '',
    x_percent: clamp(number(entity?.x_percent, 82), 0, 100),
    y_percent: clamp(number(entity?.y_percent, 53), 0, 100),
    width_percent: clamp(number(entity?.width_percent, 18), 1, 100),
    depth: clamp(Math.round(number(entity?.depth, 6)), -20, 40),
    opacity: clamp(Math.round(number(entity?.opacity, 100)), 0, 100),
    idle_effect: typeof entity?.idle_effect === 'string' ? entity.idle_effect : 'alive',
    idle_amount: clamp(Math.round(number(entity?.idle_amount, 38)), 0, 100),
    idle_cycle_seconds: clamp(number(entity?.idle_cycle_seconds, 8.5), 2, 60)
  });
}

function applyPlacement(placement, entity) {
  placement.style.left = `${entity.x_percent}%`;
  placement.style.top = `${entity.y_percent}%`;
  placement.style.width = `${entity.width_percent}%`;
  placement.style.opacity = String(entity.opacity / 100);
  placement.style.zIndex = String(20 + entity.depth);
  placement.dataset.entityDepth = String(entity.depth);
  placement.dataset.entityAsset = entity.asset_url;
}

export function renderDomEntity(root, source, { draggable = false } = {}) {
  if (!(root instanceof Element)) return { visible: false, targetChanged: false, placement: null, target: null };
  const layer = root.querySelector('[data-entity-layer]');
  if (!(layer instanceof Element)) return { visible: false, targetChanged: false, placement: null, target: null };
  const entity = normaliseEntityView(source);
  let placement = layer.querySelector(':scope > [data-entity-placement]');
  const existingAsset = placement?.dataset?.entityAsset || '';

  if (!entity.enabled || !entity.asset_url) {
    const changed = Boolean(placement);
    layer.replaceChildren();
    return { visible: false, targetChanged: changed, placement: null, target: null };
  }

  let targetChanged = false;
  if (!(placement instanceof HTMLElement) || existingAsset !== entity.asset_url) {
    placement = document.createElement('div');
    placement.className = 'motion-entity-placement';
    placement.dataset.entityPlacement = '';
    const target = document.createElement('div');
    target.className = 'motion-entity-target';
    target.dataset.motionEntity = '';
    const image = document.createElement('img');
    image.className = 'motion-entity-image';
    image.src = entity.asset_url;
    image.alt = '';
    image.draggable = false;
    target.append(image);
    placement.append(target);
    layer.replaceChildren(placement);
    targetChanged = true;
  }

  applyPlacement(placement, entity);
  placement.dataset.entityDraggable = draggable ? 'true' : 'false';
  const target = placement.querySelector(':scope > [data-motion-entity]');
  if (target instanceof HTMLElement) {
    target.dataset.entityIdleEffect = entity.idle_effect;
    target.dataset.entityIdleAmount = String(entity.idle_amount);
    target.dataset.entityIdleCycle = String(entity.idle_cycle_seconds);
  }
  return { visible: true, targetChanged, placement, target };
}

export function updateDomEntityPlacement(root, source) {
  if (!(root instanceof Element)) return null;
  const placement = root.querySelector('[data-entity-placement]');
  if (!(placement instanceof HTMLElement)) return null;
  applyPlacement(placement, normaliseEntityView(source));
  return placement;
}
