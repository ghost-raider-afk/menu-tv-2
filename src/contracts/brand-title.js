import { ValidationError } from '../shared/errors.js';

export const BRAND_FONTS = Object.freeze(['inter', 'arial', 'montserrat', 'oswald', 'georgia']);
export const BRAND_EFFECTS = Object.freeze(['none', 'neon-pulse', 'breathe', 'float']);

export const DEFAULT_BRAND_TITLE = Object.freeze({
  enabled: false,
  text: 'MIRA-TV',
  x: 960,
  y: 96,
  font_family: 'inter',
  font_size: 72,
  vertical_scale: 1,
  letter_spacing: 2,
  text_color: '#FFFFFF',
  glow_color: '#35D9FF',
  glow_strength: 18,
  effect: 'neon-pulse',
  cycle_seconds: 5.5
});

function sourceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function color(value, fallback) {
  const text = String(value || '').toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : fallback;
}

export function completeBrandTitle(value = {}) {
  const source = sourceObject(value);
  return {
    enabled: source.enabled === true,
    text: String(source.text ?? DEFAULT_BRAND_TITLE.text).trim().slice(0, 80) || DEFAULT_BRAND_TITLE.text,
    x: clamp(source.x, DEFAULT_BRAND_TITLE.x, 0, 1920),
    y: clamp(source.y, DEFAULT_BRAND_TITLE.y, 0, 1080),
    font_family: BRAND_FONTS.includes(source.font_family) ? source.font_family : DEFAULT_BRAND_TITLE.font_family,
    font_size: clamp(source.font_size, DEFAULT_BRAND_TITLE.font_size, 18, 180),
    vertical_scale: clamp(source.vertical_scale, DEFAULT_BRAND_TITLE.vertical_scale, 0.5, 2.2),
    letter_spacing: clamp(source.letter_spacing, DEFAULT_BRAND_TITLE.letter_spacing, -2, 20),
    text_color: color(source.text_color, DEFAULT_BRAND_TITLE.text_color),
    glow_color: color(source.glow_color, DEFAULT_BRAND_TITLE.glow_color),
    glow_strength: clamp(source.glow_strength, DEFAULT_BRAND_TITLE.glow_strength, 0, 48),
    effect: BRAND_EFFECTS.includes(source.effect) ? source.effect : DEFAULT_BRAND_TITLE.effect,
    cycle_seconds: clamp(source.cycle_seconds, DEFAULT_BRAND_TITLE.cycle_seconds, 2, 30)
  };
}

export function brandTitleInput(value) {
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new ValidationError('Настройки названия бренда должны быть объектом.');
  }
  const result = completeBrandTitle(value);
  if (result.enabled && !result.text) throw new ValidationError('Введите название бренда или выключите его отображение.');
  return result;
}
