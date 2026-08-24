import { ValidationError } from '../shared/errors.js';

export const ENTITY_SCENE_WIDTH = 1920;
export const ENTITY_SCENE_HEIGHT = 1080;

const ENTITY_ASSET_URL = /^\/site-assets\/entities\/entity-[0-9a-f-]{36}\.(?:png|webp)$/i;
const ENTITY_ID = /^[a-z0-9-]{1,64}$/;

export const DEFAULT_SCENE_ENTITY = Object.freeze({
  version: 1,
  id: 'beer-glass',
  name: 'Бокал пива',
  asset_url: '',
  asset_width: 0,
  asset_height: 0,
  visible: false,
  transform: Object.freeze({
    x: 1580,
    y: 420,
    width: 280,
    scale: 1,
    rotation: 0,
    depth: 10,
    opacity: 1
  })
});

function finiteNumber(value, field, { min, max, fallback }) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ValidationError(`Поле «${field}» должно быть числом от ${min} до ${max}.`);
  }
  return number;
}

function integer(value, field, { min, max, fallback }) {
  const number = finiteNumber(value, field, { min, max, fallback });
  if (!Number.isInteger(number)) throw new ValidationError(`Поле «${field}» должно быть целым числом.`);
  return number;
}

function entityName(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_SCENE_ENTITY.name;
  if (typeof value !== 'string') throw new ValidationError('Название объекта указано неверно.');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) throw new ValidationError('Название объекта должно содержать от 1 до 80 символов.');
  return trimmed;
}

function assetUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !ENTITY_ASSET_URL.test(value)) throw new ValidationError('Изображение объекта имеет недопустимый адрес.');
  return value;
}

export function sceneEntityInput(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const transform = source.transform && typeof source.transform === 'object' && !Array.isArray(source.transform)
    ? source.transform
    : {};
  const id = typeof source.id === 'string' ? source.id.trim() : DEFAULT_SCENE_ENTITY.id;
  if (!ENTITY_ID.test(id)) throw new ValidationError('Идентификатор объекта указан неверно.');
  const visible = source.visible ?? DEFAULT_SCENE_ENTITY.visible;
  if (typeof visible !== 'boolean') throw new ValidationError('Поле «visible» должно быть логическим значением.');

  return Object.freeze({
    version: 1,
    id,
    name: entityName(source.name),
    asset_url: assetUrl(source.asset_url),
    asset_width: integer(source.asset_width, 'asset_width', { min: 0, max: 7680, fallback: 0 }),
    asset_height: integer(source.asset_height, 'asset_height', { min: 0, max: 4320, fallback: 0 }),
    visible,
    transform: Object.freeze({
      x: finiteNumber(transform.x, 'X', { min: -ENTITY_SCENE_WIDTH, max: ENTITY_SCENE_WIDTH * 2, fallback: DEFAULT_SCENE_ENTITY.transform.x }),
      y: finiteNumber(transform.y, 'Y', { min: -ENTITY_SCENE_HEIGHT, max: ENTITY_SCENE_HEIGHT * 2, fallback: DEFAULT_SCENE_ENTITY.transform.y }),
      width: finiteNumber(transform.width, 'Ширина', { min: 24, max: ENTITY_SCENE_WIDTH * 2, fallback: DEFAULT_SCENE_ENTITY.transform.width }),
      scale: finiteNumber(transform.scale, 'Масштаб', { min: 0.1, max: 4, fallback: DEFAULT_SCENE_ENTITY.transform.scale }),
      rotation: finiteNumber(transform.rotation, 'Поворот', { min: -180, max: 180, fallback: DEFAULT_SCENE_ENTITY.transform.rotation }),
      depth: integer(transform.depth, 'Глубина Z', { min: -100, max: 100, fallback: DEFAULT_SCENE_ENTITY.transform.depth }),
      opacity: finiteNumber(transform.opacity, 'Opacity', { min: 0, max: 1, fallback: DEFAULT_SCENE_ENTITY.transform.opacity })
    })
  });
}

export function completeSceneEntity(value) {
  try {
    return sceneEntityInput(value);
  } catch {
    return sceneEntityInput(DEFAULT_SCENE_ENTITY);
  }
}
