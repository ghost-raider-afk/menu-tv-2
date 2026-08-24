import { ValidationError } from '../shared/errors.js';
import {
  ANIMATION_EASINGS,
  ANIMATION_FLOW_DIRECTIONS,
  ANIMATION_PATTERNS,
  ANIMATION_PROFILE_VERSION,
  BACKGROUND_EFFECTS,
  DEFAULT_ANIMATION_PROFILE,
  ITEM_EFFECTS,
  PRICE_EFFECTS,
  PROMOTION_EFFECTS,
  SECTION_EFFECTS,
  completeAnimationProfile
} from '../shared/animation-profile.js';
import { sceneEntityInput } from './scene-entity.js';
import { announcementInput } from './announcement.js';

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
    promotion_effect: enumValue(profile.promotion_effect, 'Эффект плашки «Акция»', PROMOTION_EFFECTS),
    price_effect: enumValue(profile.price_effect, 'Эффект цен', PRICE_EFFECTS),
    background_effect: enumValue(profile.background_effect, 'Эффект фона', BACKGROUND_EFFECTS),
    background_zoom_percent: numberValue(profile.background_zoom_percent, 'Глубина фона', { min: 0, max: 8 }),
    intensity: numberValue(profile.intensity, 'Интенсивность', { min: 0, max: 100, integer: true })
  };
}

export function animationSettingsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Настройки анимации должны быть объектом.');
  const enabled = body.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new ValidationError('Поле «enabled» должно быть логическим значением.');
  const presetId = typeof body.preset_id === 'string' ? body.preset_id.trim() : 'single-promo-focus';
  if (!/^[a-z0-9-]{1,64}$/.test(presetId)) throw new ValidationError('Идентификатор профиля указан неверно.');
  return {
    enabled,
    preset_id: presetId,
    profile: animationProfileInput(body.profile ?? DEFAULT_ANIMATION_PROFILE),
    entity: sceneEntityInput(body.entity),
    announcement: announcementInput(body.announcement)
  };
}
