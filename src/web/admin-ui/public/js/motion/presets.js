import { completeAnimationProfile, DEFAULT_ANIMATION_PROFILE } from '../../../../shared/animation-profile.js';

const BASE_PROFILE = Object.freeze(completeAnimationProfile({
  ...DEFAULT_ANIMATION_PROFILE,
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
  intensity: 72
}));

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
  return { ...(PRESET_BY_ID.get(id) || PRESET_BY_ID.get(DEFAULT_PRESET_ID)).profile };
}
