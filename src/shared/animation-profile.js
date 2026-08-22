export const ANIMATION_PROFILE_VERSION = 5;
export const ANIMATION_PATTERNS = Object.freeze(['ambient', 'wave', 'focus', 'pulse', 'spark', 'parallax']);
export const ANIMATION_FLOW_DIRECTIONS = Object.freeze(['none', 'left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'alternate']);
export const ANIMATION_EASINGS = Object.freeze(['standard', 'smooth', 'snappy', 'cinematic', 'elastic']);
export const SECTION_EFFECTS = Object.freeze(['none', 'glow', 'pulse', 'shimmer', 'lift', 'wave']);
export const ITEM_EFFECTS = Object.freeze(['none', 'breathe', 'wave', 'focus', 'lift']);
export const PRICE_EFFECTS = Object.freeze(['none', 'pulse', 'glow', 'wave', 'pop']);
export const VISUAL_EFFECTS = Object.freeze(['none', 'ocean-wave', 'aurora', 'ripple', 'sun-sweep', 'spotlight', 'liquid-glass']);
export const PROMO_BADGE_EFFECTS = Object.freeze(['static', 'glow', 'sheen', 'pulse']);
export const PROMO_ROW_EFFECTS = Object.freeze(['none', 'glow', 'sweep', 'pulse']);
export const PROMO_PRICE_EFFECTS = Object.freeze(['none', 'glow', 'pulse', 'pop']);
export const PROMO_ROW_TINT_MAX = 0.18;
export const BRAND_REVEAL_ORDERS = Object.freeze(['left-to-right', 'center', 'random', 'wave']);
export const BRAND_REVEAL_TRIGGERS = Object.freeze(['player-start', 'menu-update', 'interval']);

export const DEFAULT_PROMO_STYLE = Object.freeze({
  enabled: true,
  badge_effect: 'sheen',
  badge_scale: 1.08,
  badge_glow: 0.82,
  row_effect: 'sweep',
  row_glow: 0.48,
  row_tint: PROMO_ROW_TINT_MAX,
  price_effect: 'pulse',
  sweep_seconds: 1.4,
  cycle_seconds: 7.5
});

export const DEFAULT_BRAND_REVEAL = Object.freeze({
  enabled: false,
  text: '',
  start_x_percent: 50,
  start_y_percent: 46,
  start_scale: 2.8,
  hold_ms: 1200,
  flight_ms: 1600,
  stagger_ms: 90,
  easing: 'cinematic',
  order: 'center',
  rotation_deg: 8,
  glow: 0.7,
  trigger: 'player-start',
  interval_seconds: 300
});

export const DEFAULT_ANIMATION_PROFILE = Object.freeze({
  motion_version: ANIMATION_PROFILE_VERSION,
  pattern: 'wave',
  flow_direction: 'top-to-bottom',
  easing: 'smooth',
  cycle_seconds: 9.5,
  event_duration_ms: 1850,
  wave_stagger_ms: 190,
  travel_px: 11,
  scale_amount: 0.03,
  brightness_amount: 0.28,
  section_effect: 'glow',
  item_effect: 'focus',
  price_effect: 'glow',
  visual_effect: 'none',
  intensity: 72,
  promo_style: DEFAULT_PROMO_STYLE,
  brand_reveal: DEFAULT_BRAND_REVEAL
});

function sourceObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function oneOf(value, allowed, fallback) { return typeof value === 'string' && allowed.includes(value) ? value : fallback; }
function present(value, fallback) { return value === undefined ? fallback : value; }
function bool(value, fallback) { return typeof value === 'boolean' ? value : fallback; }

export function completePromoStyle(value = {}) {
  const source = sourceObject(value);
  return {
    enabled: bool(source.enabled, DEFAULT_PROMO_STYLE.enabled),
    badge_effect: oneOf(source.badge_effect, PROMO_BADGE_EFFECTS, DEFAULT_PROMO_STYLE.badge_effect),
    badge_scale: clamp(number(source.badge_scale, DEFAULT_PROMO_STYLE.badge_scale), 1, 1.35),
    badge_glow: clamp(number(source.badge_glow, DEFAULT_PROMO_STYLE.badge_glow), 0, 1),
    row_effect: oneOf(source.row_effect, PROMO_ROW_EFFECTS, DEFAULT_PROMO_STYLE.row_effect),
    row_glow: clamp(number(source.row_glow, DEFAULT_PROMO_STYLE.row_glow), 0, 1),
    row_tint: clamp(number(source.row_tint, DEFAULT_PROMO_STYLE.row_tint), 0, PROMO_ROW_TINT_MAX),
    price_effect: oneOf(source.price_effect, PROMO_PRICE_EFFECTS, DEFAULT_PROMO_STYLE.price_effect),
    sweep_seconds: clamp(number(source.sweep_seconds, DEFAULT_PROMO_STYLE.sweep_seconds), 0.5, 6),
    cycle_seconds: clamp(number(source.cycle_seconds, DEFAULT_PROMO_STYLE.cycle_seconds), 3, 30)
  };
}

export function completeBrandReveal(value = {}) {
  const source = sourceObject(value);
  return {
    enabled: bool(source.enabled, DEFAULT_BRAND_REVEAL.enabled),
    text: String(source.text ?? DEFAULT_BRAND_REVEAL.text).trim().slice(0, 80),
    start_x_percent: clamp(number(source.start_x_percent, DEFAULT_BRAND_REVEAL.start_x_percent), 0, 100),
    start_y_percent: clamp(number(source.start_y_percent, DEFAULT_BRAND_REVEAL.start_y_percent), 0, 100),
    start_scale: clamp(number(source.start_scale, DEFAULT_BRAND_REVEAL.start_scale), 1, 6),
    hold_ms: clamp(Math.round(number(source.hold_ms, DEFAULT_BRAND_REVEAL.hold_ms)), 0, 6000),
    flight_ms: clamp(Math.round(number(source.flight_ms, DEFAULT_BRAND_REVEAL.flight_ms)), 400, 6000),
    stagger_ms: clamp(Math.round(number(source.stagger_ms, DEFAULT_BRAND_REVEAL.stagger_ms)), 0, 500),
    easing: oneOf(source.easing, ANIMATION_EASINGS, DEFAULT_BRAND_REVEAL.easing),
    order: oneOf(source.order, BRAND_REVEAL_ORDERS, DEFAULT_BRAND_REVEAL.order),
    rotation_deg: clamp(number(source.rotation_deg, DEFAULT_BRAND_REVEAL.rotation_deg), 0, 45),
    glow: clamp(number(source.glow, DEFAULT_BRAND_REVEAL.glow), 0, 1),
    trigger: oneOf(source.trigger, BRAND_REVEAL_TRIGGERS, DEFAULT_BRAND_REVEAL.trigger),
    interval_seconds: clamp(Math.round(number(source.interval_seconds, DEFAULT_BRAND_REVEAL.interval_seconds)), 30, 3600)
  };
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
    visual_effect: present(source.visual_effect, DEFAULT_ANIMATION_PROFILE.visual_effect),
    intensity: present(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity),
    promo_style: completePromoStyle(source.promo_style),
    brand_reveal: completeBrandReveal(source.brand_reveal)
  };
}

function promoFromLegacy(source) {
  const old = source.promotion_effect;
  if (old === 'pulse-price') return completePromoStyle({ badge_effect: 'pulse', row_effect: 'glow', price_effect: 'pulse' });
  if (old === 'pulse') return completePromoStyle({ badge_effect: 'pulse', row_effect: 'pulse', price_effect: 'glow' });
  if (old === 'glow') return completePromoStyle({ badge_effect: 'glow', row_effect: 'glow', price_effect: 'glow' });
  return completePromoStyle({ badge_effect: 'sheen', row_effect: 'sweep', price_effect: 'pulse' });
}

function migrateV4Profile(source) {
  return canonicalCurrent({ ...source, promo_style: promoFromLegacy(source), brand_reveal: DEFAULT_BRAND_REVEAL });
}
function migrateV3Profile(source) { return migrateV4Profile(source); }
function migrateV2Profile(source) { return migrateV4Profile(source); }

function legacyDirection(value) { if (value === 'right') return 'right-to-left'; if (value === 'up') return 'bottom-to-top'; if (value === 'down') return 'top-to-bottom'; if (value === 'none') return 'none'; return 'left-to-right'; }
function legacyPattern(source) { if (['focus', 'zoom'].includes(source.entrance)) return 'focus'; if (['slide', 'cascade', 'wipe', 'reveal', 'diagonal', 'split'].includes(source.entrance)) return 'wave'; if (source.glow || source.shimmer) return 'spark'; return 'ambient'; }
function legacySectionEffect(source) { if (source.shimmer === true) return 'shimmer'; if (source.glow === true || source.section_emphasis === 'glow') return 'glow'; if (source.section_emphasis === 'pulse') return 'pulse'; if (['slide', 'wipe'].includes(source.section_emphasis)) return 'wave'; return 'none'; }
function legacyItemEffect(source) { if (['focus', 'zoom'].includes(source.entrance)) return 'focus'; if (['slide', 'cascade', 'wipe', 'reveal', 'diagonal', 'split'].includes(source.entrance)) return 'wave'; return 'none'; }
function legacyPriceEffect(source) { if (source.price_emphasis === 'pop') return 'pulse'; if (source.price_emphasis === 'slide') return 'wave'; if (source.price_emphasis === 'fade') return 'glow'; return 'none'; }

function migrateLegacyProfile(source) {
  const intensity = clamp(number(source.intensity, DEFAULT_ANIMATION_PROFILE.intensity), 0, 100);
  const oldScale = number(source.scale_from, 1);
  return canonicalCurrent({
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
    visual_effect: 'none',
    intensity,
    promo_style: DEFAULT_PROMO_STYLE,
    brand_reveal: DEFAULT_BRAND_REVEAL
  });
}

export function completeAnimationProfile(profile = {}) {
  const source = sourceObject(profile);
  if (Object.keys(source).length === 0) return canonicalCurrent(DEFAULT_ANIMATION_PROFILE);
  const version = Number(source.motion_version);
  if (version === ANIMATION_PROFILE_VERSION) return canonicalCurrent(source);
  if (version === 4) return migrateV4Profile(source);
  if (version === 3) return migrateV3Profile(source);
  if (version === 2) return migrateV2Profile(source);
  return migrateLegacyProfile(source);
}
