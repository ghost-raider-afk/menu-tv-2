export const ANIMATION_ENTRANCES = Object.freeze(['fade', 'slide', 'cascade', 'zoom', 'wipe', 'split', 'focus', 'diagonal', 'reveal']);
export const ANIMATION_DIRECTIONS = Object.freeze(['none', 'left', 'right', 'up', 'down', 'diagonal']);
export const ANIMATION_EASINGS = Object.freeze(['standard', 'smooth', 'snappy', 'cinematic', 'elastic']);
export const SECTION_EMPHASIS = Object.freeze(['none', 'slide', 'wipe', 'glow', 'pulse']);
export const PRICE_EMPHASIS = Object.freeze(['none', 'fade', 'slide', 'pop']);

export const DEFAULT_ANIMATION_PROFILE = Object.freeze({
  entrance: 'cascade',
  direction: 'left',
  easing: 'smooth',
  duration_ms: 900,
  stagger_ms: 70,
  distance_px: 54,
  scale_from: 0.98,
  opacity_from: 0,
  blur_px: 0,
  section_delay_ms: 0,
  item_delay_ms: 150,
  price_delay_ms: 220,
  section_emphasis: 'slide',
  price_emphasis: 'fade',
  shimmer: false,
  glow: false,
  background_motion: true,
  ambient_speed_seconds: 28,
  intensity: 55,
  hold_seconds: 8
});

export function completeAnimationProfile(profile = {}) {
  return { ...DEFAULT_ANIMATION_PROFILE, ...(profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {}) };
}
