const BASE_PROFILE = Object.freeze({
  motion_version: 5,
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
  promo_style: Object.freeze({
    enabled: true,
    badge_effect: 'sheen',
    badge_scale: 1.08,
    badge_glow: 0.82,
    row_effect: 'sweep',
    row_glow: 0.48,
    row_tint: 0.18,
    price_effect: 'pulse',
    sweep_seconds: 1.4,
    cycle_seconds: 7.5
  }),
  brand_reveal: Object.freeze({
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
  })
});

export const ANIMATION_PRESETS = Object.freeze([
  Object.freeze({
    id: 'custom-base',
    name: 'Редактируемый стиль',
    category: 'Editable',
    description: 'Один канонический стиль. Все параметры, акция и Brand Reveal редактируются и сохраняются как собственные пресеты.',
    profile: BASE_PROFILE
  })
]);

export const PRESET_BY_ID = new Map(ANIMATION_PRESETS.map((item) => [item.id, item]));
export const DEFAULT_PRESET_ID = 'custom-base';
export function profileForPreset(id = DEFAULT_PRESET_ID) {
  const source = (PRESET_BY_ID.get(id) || PRESET_BY_ID.get(DEFAULT_PRESET_ID)).profile;
  return structuredClone(source);
}
