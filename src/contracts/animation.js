import { ValidationError } from '../shared/errors.js';
import {
  ANIMATION_DIRECTIONS,
  ANIMATION_EASINGS,
  ANIMATION_ENTRANCES,
  DEFAULT_ANIMATION_PROFILE,
  PRICE_EMPHASIS,
  SECTION_EMPHASIS,
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

export function animationProfileInput(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ValidationError('Профиль анимации должен быть объектом.');
  const profile = completeAnimationProfile(source);
  return {
    entrance: enumValue(profile.entrance, 'Тип появления', ANIMATION_ENTRANCES),
    direction: enumValue(profile.direction, 'Направление', ANIMATION_DIRECTIONS),
    easing: enumValue(profile.easing, 'Easing', ANIMATION_EASINGS),
    duration_ms: numberValue(profile.duration_ms, 'Длительность', { min: 300, max: 5000, integer: true }),
    stagger_ms: numberValue(profile.stagger_ms, 'Каскад', { min: 0, max: 500, integer: true }),
    distance_px: numberValue(profile.distance_px, 'Дистанция', { min: 0, max: 240, integer: true }),
    scale_from: numberValue(profile.scale_from, 'Начальный масштаб', { min: 0.7, max: 1.2 }),
    opacity_from: numberValue(profile.opacity_from, 'Начальная прозрачность', { min: 0, max: 1 }),
    blur_px: numberValue(profile.blur_px, 'Размытие', { min: 0, max: 30 }),
    section_delay_ms: numberValue(profile.section_delay_ms, 'Задержка разделов', { min: 0, max: 2000, integer: true }),
    item_delay_ms: numberValue(profile.item_delay_ms, 'Задержка строк', { min: 0, max: 2000, integer: true }),
    price_delay_ms: numberValue(profile.price_delay_ms, 'Задержка цен', { min: 0, max: 2000, integer: true }),
    section_emphasis: enumValue(profile.section_emphasis, 'Акцент разделов', SECTION_EMPHASIS),
    price_emphasis: enumValue(profile.price_emphasis, 'Акцент цен', PRICE_EMPHASIS),
    shimmer: booleanValue(profile.shimmer, 'Световой блик'),
    glow: booleanValue(profile.glow, 'Свечение'),
    background_motion: booleanValue(profile.background_motion, 'Движение фона'),
    ambient_speed_seconds: numberValue(profile.ambient_speed_seconds, 'Скорость фона', { min: 5, max: 90 }),
    intensity: numberValue(profile.intensity, 'Интенсивность', { min: 0, max: 100, integer: true }),
    hold_seconds: numberValue(profile.hold_seconds, 'Время показа', { min: 3, max: 60 })
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
