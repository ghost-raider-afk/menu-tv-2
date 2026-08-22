import { ValidationError } from '../shared/errors.js';
import {
  ANIMATION_EASINGS,
  ANIMATION_FLOW_DIRECTIONS,
  ANIMATION_PATTERNS,
  ANIMATION_PROFILE_VERSION,
  BRAND_REVEAL_ORDERS,
  BRAND_REVEAL_TRIGGERS,
  DEFAULT_ANIMATION_PROFILE,
  ITEM_EFFECTS,
  PRICE_EFFECTS,
  PROMO_BADGE_EFFECTS,
  PROMO_PRICE_EFFECTS,
  PROMO_ROW_EFFECTS,
  PROMO_ROW_TINT_MAX,
  SECTION_EFFECTS,
  VISUAL_EFFECTS,
  completeAnimationProfile
} from '../shared/animation-profile.js';

function enumValue(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`Поле «${field}» содержит неподдерживаемое значение.`);
  return value;
}
function numberValue(value, field, { min, max, integer = false }) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new ValidationError(`Поле «${field}» должно быть числом от ${min} до ${max}.`);
  return number;
}
function booleanValue(value, field) {
  if (typeof value !== 'boolean') throw new ValidationError(`Поле «${field}» должно быть логическим значением.`);
  return value;
}
function promoStyleInput(source) {
  return {
    enabled: booleanValue(source.enabled, 'Акция включена'),
    badge_effect: enumValue(source.badge_effect, 'Эффект плашки акции', PROMO_BADGE_EFFECTS),
    badge_scale: numberValue(source.badge_scale, 'Масштаб плашки акции', { min: 1, max: 1.35 }),
    badge_glow: numberValue(source.badge_glow, 'Свечение плашки акции', { min: 0, max: 1 }),
    row_effect: enumValue(source.row_effect, 'Эффект строки акции', PROMO_ROW_EFFECTS),
    row_glow: numberValue(source.row_glow, 'Свечение строки акции', { min: 0, max: 1 }),
    row_tint: numberValue(source.row_tint, 'Подложка строки акции', { min: 0, max: PROMO_ROW_TINT_MAX }),
    price_effect: enumValue(source.price_effect, 'Акцент цены акции', PROMO_PRICE_EFFECTS),
    sweep_seconds: numberValue(source.sweep_seconds, 'Скорость блика акции', { min: 0.5, max: 6 }),
    cycle_seconds: numberValue(source.cycle_seconds, 'Период акции', { min: 3, max: 30 })
  };
}
function brandRevealInput(source) {
  return {
    enabled: booleanValue(source.enabled, 'Brand Reveal включён'),
    text: String(source.text ?? '').trim().slice(0, 80),
    start_x_percent: numberValue(source.start_x_percent, 'Brand Reveal X', { min: 0, max: 100 }),
    start_y_percent: numberValue(source.start_y_percent, 'Brand Reveal Y', { min: 0, max: 100 }),
    start_scale: numberValue(source.start_scale, 'Стартовый масштаб Brand Reveal', { min: 1, max: 6 }),
    hold_ms: numberValue(source.hold_ms, 'Пауза Brand Reveal', { min: 0, max: 6000, integer: true }),
    flight_ms: numberValue(source.flight_ms, 'Полёт Brand Reveal', { min: 400, max: 6000, integer: true }),
    stagger_ms: numberValue(source.stagger_ms, 'Шаг букв Brand Reveal', { min: 0, max: 500, integer: true }),
    easing: enumValue(source.easing, 'Easing Brand Reveal', ANIMATION_EASINGS),
    order: enumValue(source.order, 'Порядок букв Brand Reveal', BRAND_REVEAL_ORDERS),
    rotation_deg: numberValue(source.rotation_deg, 'Поворот букв Brand Reveal', { min: 0, max: 45 }),
    glow: numberValue(source.glow, 'Свечение Brand Reveal', { min: 0, max: 1 }),
    trigger: enumValue(source.trigger, 'Запуск Brand Reveal', BRAND_REVEAL_TRIGGERS),
    interval_seconds: numberValue(source.interval_seconds, 'Интервал Brand Reveal', { min: 30, max: 3600, integer: true })
  };
}
export function animationProfileInput(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ValidationError('Профиль анимации должен быть объектом.');
  const profile = completeAnimationProfile(source);
  const currentVersion = Number(source.motion_version) === ANIMATION_PROFILE_VERSION;
  const promoSource = currentVersion && source.promo_style && typeof source.promo_style === 'object' && !Array.isArray(source.promo_style)
    ? source.promo_style
    : profile.promo_style;
  const brandSource = currentVersion && source.brand_reveal && typeof source.brand_reveal === 'object' && !Array.isArray(source.brand_reveal)
    ? source.brand_reveal
    : profile.brand_reveal;
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
    visual_effect: enumValue(profile.visual_effect, 'Визуальный эффект', VISUAL_EFFECTS),
    intensity: numberValue(profile.intensity, 'Интенсивность', { min: 0, max: 100, integer: true }),
    promo_style: promoStyleInput(promoSource),
    brand_reveal: brandRevealInput(brandSource)
  };
}
export function animationSettingsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Настройки анимации должны быть объектом.');
  const enabled = body.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new ValidationError('Поле «enabled» должно быть логическим значением.');
  const presetId = typeof body.preset_id === 'string' ? body.preset_id.trim() : '';
  if (!/^[a-z0-9-]{1,64}$/.test(presetId)) throw new ValidationError('Идентификатор пресета указан неверно.');
  return { enabled, preset_id: presetId, profile: animationProfileInput(body.profile ?? DEFAULT_ANIMATION_PROFILE) };
}
export function customAnimationPresetInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Пользовательский пресет должен быть объектом.');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 80) throw new ValidationError('Название пресета должно содержать от 1 до 80 символов.');
  return { name, profile: animationProfileInput(body.profile ?? DEFAULT_ANIMATION_PROFILE) };
}
