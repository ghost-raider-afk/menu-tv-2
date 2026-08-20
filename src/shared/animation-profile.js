export const ANIMATION_PROFILE_VERSION = 2;
export const ANIMATION_PATTERNS = Object.freeze(['ambient', 'wave', 'focus', 'pulse', 'spark', 'parallax']);
export const ANIMATION_FLOW_DIRECTIONS = Object.freeze(['none', 'left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'alternate']);
export const ANIMATION_EASINGS = Object.freeze(['standard', 'smooth', 'snappy', 'cinematic', 'elastic']);
export const SECTION_EFFECTS = Object.freeze(['none', 'glow', 'pulse', 'shimmer', 'lift', 'wave']);
export const ITEM_EFFECTS = Object.freeze(['none', 'breathe', 'wave', 'focus', 'lift']);
export const PRICE_EFFECTS = Object.freeze(['none', 'pulse', 'glow', 'wave', 'pop']);
export const BACKGROUND_EFFECTS = Object.freeze(['none', 'drift', 'breathe', 'zoom']);

export const DEFAULT_ANIMATION_PROFILE = Object.freeze({
  motion_version: ANIMATION_PROFILE_VERSION,
  pattern: 'ambient',
  flow_direction: 'left-to-right',
  easing: 'smooth',
  cycle_seconds: 12,
  event_duration_ms: 1800,
  wave_stagger_ms: 180,
  travel_px: 6,
  scale_amount: 0.012,
  brightness_amount: 0.16,
  section_effect: 'shimmer',
  item_effect: 'none',
  price_effect: 'none',
  background_effect: 'drift',
  background_zoom_percent: 2,
  intensity: 45
});

function sourceObject(profile) {
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function oneOf(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function present(value, fallback) {
  return value === undefined ? fallback : value;
}

function canonicalCurrent(source) {
  return {
    motion_version: ANIMATION_PROFILE_VERSION,
    pattern: present(source.pattern, DEFAULT_ANIMATION_PROFILE.pattern),
    flow_direction: present(source.flow_direction, DEFAULT_ANIMATION_PROFILE.flow_direction),
    easing: present(source.easing, DEFAULT_ANIMATION_PROFILE.easing),
    cycle_seconds: present(source.cycle_seconds, DEFAULT_ANIMATION_PROFILE.cycle_seconds),
    event_duration_ms: present(source.event_duration_ms, DEFAULT_ANIMATION_PROFILE.event_duration_ms),
    wave_stagger_ms: present(source.wave_stagger_ms, DEFAULT_ANIMATION_PROFILE.wave_stagger_ms),
    travel_px: present(source.travel_px, DEFAULT_ANIMATION_PROFILE.travel_px),
    scale_amount: present(source.scale_amount, DEFAULT_ANIMATION_PROFILE.scale_amount),
    brightness_amount: present(source.brightness_amount, DEFAULT_ANIMATION_PROFILE.brightness_amount),
    section_effect: present(source.section_effect, DEFAULT_ANIMATION_PROFILE.section_effect),
    item_effect: present(source.item_effect, DEFAULT_ANIMATION_PROFILE.item_effect),
    price_effect: present(source.price_effect, DEFAULT_ANIMATION_PROFILE.price_effect),
    background_effect: present(source.background_effect, DEFAULT_ANIMATION_PROFILE.background_effect),
    background_zoom_percent: present(source.background_zoom_percent, DEFAULT_ANIMATION_PROFILE.background_zoom_percent),
    intensity: present(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity)
  };
}

function legacyDirection(value) {
  if (value === 'right') return 'right-to-left';
  if (value === 'up') return 'bottom-to-top';
  if (value === 'down') return 'top-to-bottom';
  if (value === 'none') return 'none';
  return 'left-to-right';
}

function legacyPattern(source) {
  if (['focus', 'zoom'].includes(source.entrance)) return 'focus';
  if (['slide', 'cascade', 'wipe', 'reveal', 'diagonal', 'split'].includes(source.entrance)) return 'wave';
  if (source.glow || source.shimmer) return 'spark';
  return 'ambient';
}

function legacySectionEffect(source) {
  if (source.shimmer === true) return 'shimmer';
  if (source.glow === true || source.section_emphasis === 'glow') return 'glow';
  if (source.section_emphasis === 'pulse') return 'pulse';
  if (['slide', 'wipe'].includes(source.section_emphasis)) return 'wave';
  return 'none';
}

function legacyItemEffect(source) {
  if (['focus', 'zoom'].includes(source.entrance)) return 'focus';
  if (['slide', 'cascade', 'wipe', 'reveal', 'diagonal', 'split'].includes(source.entrance)) return 'wave';
  return 'none';
}

function legacyPriceEffect(source) {
  if (source.price_emphasis === 'pop') return 'pulse';
  if (source.price_emphasis === 'slide') return 'wave';
  if (source.price_emphasis === 'fade') return 'glow';
  return 'none';
}

function migrateLegacyProfile(source) {
  const intensity = clamp(number(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity), 0, 100);
  const oldScale = number(source.scale_from, 1);
  return {
    motion_version: ANIMATION_PROFILE_VERSION,
    pattern: legacyPattern(source),
    flow_direction: legacyDirection(source.direction),
    easing: oneOf(source.easing, ANIMATION_EASINGS, DEFAULT_ANIMATION_PROFILE.easing),
    cycle_seconds: clamp(number(source.ambient_speed_seconds, 14), 4, 60),
    event_duration_ms: clamp(Math.round(number(source.duration_ms, 1200) * 1.35), 400, 6000),
    wave_stagger_ms: clamp(Math.round(number(source.stagger_ms, 70) * 2), 0, 1000),
    travel_px: clamp(Math.round(number(source.distance_px, 0) * 0.12), 0, 24),
    scale_amount: clamp(Math.abs(1 - oldScale), 0, 0.08),
    brightness_amount: clamp(0.08 + intensity / 500, 0, 0.5),
    section_effect: legacySectionEffect(source),
    item_effect: legacyItemEffect(source),
    price_effect: legacyPriceEffect(source),
    background_effect: source.background_motion === false ? 'none' : 'drift',
    background_zoom_percent: source.background_motion === false ? 0 : 2,
    intensity
  };
}

export function completeAnimationProfile(profile = {}) {
  const source = sourceObject(profile);
  return Number(source.motion_version) === ANIMATION_PROFILE_VERSION
    ? canonicalCurrent(source)
    : migrateLegacyProfile(source);
}
