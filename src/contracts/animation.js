import { ValidationError } from '../shared/errors.js';
import {
  ANIMATION_EASINGS,
  ANIMATION_FLOW_DIRECTIONS,
  ANIMATION_PATTERNS,
  ANIMATION_PROFILE_VERSION,
  BACKGROUND_EFFECTS,
  DEFAULT_ANIMATION_PROFILE,
  ENTITY_IDLE_EFFECTS,
  ITEM_EFFECTS,
  PRICE_EFFECTS,
  SECTION_EFFECTS,
  TICKER_DIRECTIONS,
  completeAnimationProfile
} from '../shared/animation-profile.js';

function enumValue(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return value;
}

function numberValue(value, field, { min, max, integer = false }) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new ValidationError(`Поле «${field}» должно быть числом от ${min} до ${max}.`);
  }
  return number;
}

function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new ValidationError(`Поле «${field}» должно быть логическим значением.`);
  return value;
}

function colorValue(value, field) {
  const color = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new ValidationError(`Поле «${field}» должно содержать цвет в формате #RRGGBB.`);
  return color;
}

function entityAssetUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  if (!/^\/site-assets\/animation-entity-[0-9a-f-]{36}\.(?:png|webp)$/i.test(url)) {
    throw new ValidationError('Файл живого объекта должен быть загружен через студию анимации.');
  }
  return url;
}

function animationEntityInput(source = {}) {
  return {
    enabled: booleanValue(source.enabled, 'Живой объект включён'),
    asset_url: entityAssetUrl(source.asset_url),
    x_percent: numberValue(source.x_percent, 'Позиция объекта X', { min: 0, max: 100 }),
    y_percent: numberValue(source.y_percent, 'Позиция объекта Y', { min: 0, max: 100 }),
    width_percent: numberValue(source.width_percent, 'Размер объекта', { min: 1, max: 100 }),
    depth: numberValue(source.depth, 'Глубина объекта', { min: -20, max: 40, integer: true }),
    opacity: numberValue(source.opacity, 'Прозрачность объекта', { min: 0, max: 100, integer: true }),
    idle_effect: enumValue(source.idle_effect, 'Idle-анимация объекта', ENTITY_IDLE_EFFECTS),
    idle_amount: numberValue(source.idle_amount, 'Живость объекта', { min: 0, max: 100, integer: true }),
    idle_cycle_seconds: numberValue(source.idle_cycle_seconds, 'Цикл живого объекта', { min: 2, max: 60 })
  };
}

function animationTickerInput(source = {}) {
  const text = typeof source.text === 'string' ? source.text.trim() : '';
  if (text.length > 220) throw new ValidationError('Текст бегущей строки не должен превышать 220 символов.');
  if (source.enabled === true && !text) throw new ValidationError('Для включённой бегущей строки нужно указать текст.');
  return {
    enabled: booleanValue(source.enabled, 'Бегущая строка включена'),
    text,
    y_percent: numberValue(source.y_percent, 'Позиция бегущей строки Y', { min: 0, max: 100 }),
    height_percent: numberValue(source.height_percent, 'Высота бегущей строки', { min: 2, max: 25 }),
    font_size_percent: numberValue(source.font_size_percent, 'Размер текста бегущей строки', { min: 1, max: 12 }),
    depth: numberValue(source.depth, 'Глубина бегущей строки', { min: -20, max: 40, integer: true }),
    direction: enumValue(source.direction, 'Направление бегущей строки', TICKER_DIRECTIONS),
    cycle_seconds: numberValue(source.cycle_seconds, 'Скорость бегущей строки', { min: 3, max: 90 }),
    text_color: colorValue(source.text_color, 'Цвет текста бегущей строки'),
    background_color: colorValue(source.background_color, 'Цвет фона бегущей строки'),
    background_opacity: numberValue(source.background_opacity, 'Прозрачность фона бегущей строки', { min: 0, max: 100, integer: true })
  };
}

export function animationProfileInput(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ValidationError('Профиль анимации должен быть объектом.');
  const profile = completeAnimationProfile(source);
  return {
    motion_version: ANIMATION_PROFILE_VERSION,
    pattern: enumValue(profile.pattern, 'Характер движения', ANIMATION_PATTERNS),
    flow_direction: enumValue(profile.flow_direction, 'Направление волны', ANIMATION_FLOW_DIRECTIONS),
    easing: enumValue(profile.easing, 'Easing', ANIMATION_EASINGS),
    cycle_seconds: numberValue(profile.cycle_seconds, 'Период цикла', { min: 4, max: 60 }),
    event_duration_ms: numberValue(profile.event_duration_ms, 'Длительность события', { min: 400, max: 6000, integer: true }),
    wave_stagger_ms: numberValue(profile.wave_stagger_ms, 'Шаг волны', { min: 0, max: 1000, integer: true }),
    travel_px: numberValue(profile.travel_px, 'Амплитуда перемещения', { min: 0, max: 24 }),
    scale_amount: numberValue(profile.scale_amount, 'Амплитуда масштаба', { min: 0, max: 0.08 }),
    brightness_amount: numberValue(profile.brightness_amount, 'Амплитуда яркости', { min: 0, max: 0.5 }),
    section_effect: enumValue(profile.section_effect, 'Эффект разделов', SECTION_EFFECTS),
    item_effect: enumValue(profile.item_effect, 'Эффект строк', ITEM_EFFECTS),
    price_effect: enumValue(profile.price_effect, 'Эффект цен', PRICE_EFFECTS),
    background_effect: enumValue(profile.background_effect, 'Эффект фона', BACKGROUND_EFFECTS),
    background_zoom_percent: numberValue(profile.background_zoom_percent, 'Глубина фона', { min: 0, max: 8 }),
    intensity: numberValue(profile.intensity, 'Интенсивность', { min: 0, max: 100, integer: true }),
    entity: animationEntityInput(profile.entity),
    ticker: animationTickerInput(profile.ticker)
  };
}

export function animationSettingsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Настройки анимации должны быть объектом.');
  const enabled = body.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new ValidationError('Поле «enabled» должно быть логическим значением.');
  const presetId = typeof body.preset_id === 'string' ? body.preset_id.trim() : '';
  if (!/^[a-z0-9-]{1,64}$/.test(presetId)) throw new ValidationError('Идентификатор пресета указан неверно.');
  return {
    enabled,
    preset_id: presetId,
    profile: animationProfileInput(body.profile ?? DEFAULT_ANIMATION_PROFILE)
  };
}
