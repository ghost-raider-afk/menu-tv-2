export const ENTITY_SCENE = Object.freeze({ width: 1920, height: 1080 });

const DEFAULT_ENTITY = Object.freeze({
  version: 1,
  id: 'beer-glass',
  name: 'Бокал пива',
  asset_url: '',
  asset_width: 0,
  asset_height: 0,
  visible: false,
  transform: Object.freeze({ x: 1580, y: 420, width: 280, scale: 1, rotation: 0, depth: 10, opacity: 1 })
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normaliseSceneEntity(value = {}) {
  const transform = value?.transform || {};
  return {
    version: 1,
    id: typeof value.id === 'string' && value.id ? value.id : DEFAULT_ENTITY.id,
    name: typeof value.name === 'string' && value.name ? value.name : DEFAULT_ENTITY.name,
    asset_url: typeof value.asset_url === 'string' ? value.asset_url : '',
    asset_width: Math.max(0, Math.round(finite(value.asset_width, 0))),
    asset_height: Math.max(0, Math.round(finite(value.asset_height, 0))),
    visible: value.visible === true,
    transform: {
      x: finite(transform.x, DEFAULT_ENTITY.transform.x),
      y: finite(transform.y, DEFAULT_ENTITY.transform.y),
      width: Math.max(24, finite(transform.width, DEFAULT_ENTITY.transform.width)),
      scale: Math.min(4, Math.max(0.1, finite(transform.scale, DEFAULT_ENTITY.transform.scale))),
      rotation: Math.min(180, Math.max(-180, finite(transform.rotation, DEFAULT_ENTITY.transform.rotation))),
      depth: Math.round(Math.min(100, Math.max(-100, finite(transform.depth, DEFAULT_ENTITY.transform.depth)))),
      opacity: Math.min(1, Math.max(0, finite(transform.opacity, DEFAULT_ENTITY.transform.opacity)))
    }
  };
}

function entityHeight(entity) {
  if (!entity.asset_width || !entity.asset_height) return entity.transform.width;
  return entity.transform.width * (entity.asset_height / entity.asset_width);
}

export function renderSceneEntity(stage, source, { editable = true } = {}) {
  if (!stage) return;
  const layer = stage.querySelector('[data-motion-entity-layer]');
  if (!(layer instanceof HTMLElement)) return;
  const entity = normaliseSceneEntity(source);
  layer.replaceChildren();
  layer.dataset.entitySceneWidth = String(ENTITY_SCENE.width);
  layer.dataset.entitySceneHeight = String(ENTITY_SCENE.height);
  if (!entity.asset_url || !entity.visible) return;

  const object = document.createElement('div');
  object.className = 'animation-scene-entity';
  object.dataset.entityId = entity.id;
  object.dataset.entityDrag = editable ? 'true' : 'false';
  object.style.left = `${(entity.transform.x / ENTITY_SCENE.width) * 100}%`;
  object.style.top = `${(entity.transform.y / ENTITY_SCENE.height) * 100}%`;
  object.style.width = `${(entity.transform.width / ENTITY_SCENE.width) * 100}%`;
  object.style.opacity = String(entity.transform.opacity);
  object.style.zIndex = String(entity.transform.depth + 100);
  object.style.transform = `scale(${entity.transform.scale}) rotate(${entity.transform.rotation}deg)`;

  const motion = document.createElement('div');
  motion.className = 'animation-scene-entity-motion';
  motion.dataset.entityMotion = entity.id;

  const image = document.createElement('img');
  image.src = entity.asset_url;
  image.alt = entity.name;
  image.draggable = false;
  motion.append(image);
  object.append(motion);

  if (editable) {
    object.classList.add('is-editable');
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'animation-entity-resize-handle';
    handle.dataset.entityResize = 'true';
    handle.setAttribute('aria-label', 'Изменить размер объекта');
    object.append(handle);
  }

  object.style.setProperty('--entity-height-ratio', String(entityHeight(entity) / entity.transform.width));
  layer.append(object);
}

export class SceneEntityEditor {
  constructor({ stage, onChange, onCommit }) {
    this.stage = stage;
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.entity = normaliseSceneEntity();
    this.pointer = null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    stage?.addEventListener('pointerdown', this.handlePointerDown);
  }

  setEntity(value) {
    this.entity = normaliseSceneEntity(value);
    this.render();
  }

  getEntity() {
    return normaliseSceneEntity(this.entity);
  }

  update(patch) {
    this.entity = normaliseSceneEntity({
      ...this.entity,
      ...patch,
      transform: { ...this.entity.transform, ...(patch.transform || {}) }
    });
    this.render();
    this.onChange?.(this.getEntity());
  }

  render() {
    renderSceneEntity(this.stage, this.entity, { editable: true });
  }

  handlePointerDown(event) {
    const resize = event.target.closest?.('[data-entity-resize="true"]');
    const drag = event.target.closest?.('[data-entity-drag="true"]');
    if (!resize && !drag) return;
    const rect = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    const target = resize || drag;
    target.setPointerCapture?.(event.pointerId);
    this.pointer = {
      pointerId: event.pointerId,
      mode: resize ? 'resize' : 'drag',
      startX: event.clientX,
      startY: event.clientY,
      scenePerPixelX: ENTITY_SCENE.width / rect.width,
      scenePerPixelY: ENTITY_SCENE.height / rect.height,
      entity: this.getEntity()
    };
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp, { once: true });
    window.addEventListener('pointercancel', this.handlePointerUp, { once: true });
  }

  handlePointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) return;
    const dx = (event.clientX - this.pointer.startX) * this.pointer.scenePerPixelX;
    const dy = (event.clientY - this.pointer.startY) * this.pointer.scenePerPixelY;
    if (this.pointer.mode === 'resize') {
      this.update({ transform: { width: Math.max(24, this.pointer.entity.transform.width + dx) } });
      return;
    }
    const height = entityHeight(this.pointer.entity) * this.pointer.entity.transform.scale;
    const width = this.pointer.entity.transform.width * this.pointer.entity.transform.scale;
    this.update({ transform: {
      x: Math.min(ENTITY_SCENE.width - Math.min(width, ENTITY_SCENE.width), Math.max(0, this.pointer.entity.transform.x + dx)),
      y: Math.min(ENTITY_SCENE.height - Math.min(height, ENTITY_SCENE.height), Math.max(0, this.pointer.entity.transform.y + dy))
    } });
  }

  handlePointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) return;
    this.pointer = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.onCommit?.(this.getEntity());
  }

  destroy() {
    this.stage?.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.pointer = null;
  }
}
