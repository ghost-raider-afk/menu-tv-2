import { composeScenePrograms, createSceneProgram } from './scene-composer.js';

const GOLD_SHADOW = 'rgba(244,201,21,.76)';
const MAIN_KINDS = new Set(['section', 'item', 'price']);

const PATTERN_TUNING = Object.freeze({
  cinematic: Object.freeze({ travel: 1, scale: 1, light: 1, phase: 1 }),
  ambient: Object.freeze({ travel: 0.46, scale: 0.72, light: 0.56, phase: 0.35 }),
  wave: Object.freeze({ travel: 1.16, scale: 0.76, light: 0.86, phase: 1.15 }),
  focus: Object.freeze({ travel: 0.38, scale: 1.2, light: 1.02, phase: 1.6 }),
  pulse: Object.freeze({ travel: 0.08, scale: 1.3, light: 0.96, phase: 0 }),
  spark: Object.freeze({ travel: 0.28, scale: 0.62, light: 1.38, phase: 0.78 }),
  parallax: Object.freeze({ travel: 1.3, scale: 0.66, light: 0.48, phase: 0.52 })
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function effectFor(profile, kind) {
  if (kind === 'section') return profile.section_effect;
  if (kind === 'item') return profile.item_effect;
  if (kind === 'price') return profile.price_effect;
  return null;
}

function tuningFor(profile) {
  return PATTERN_TUNING[profile?.pattern] || PATTERN_TUNING.cinematic;
}

function vectorFor(profile, travel, index) {
  const pattern = profile?.pattern || 'cinematic';
  if (pattern === 'pulse') return { x: 0, y: 0 };
  if (pattern === 'parallax' && profile.flow_direction === 'none') {
    return index % 2 === 0
      ? { x: travel, y: -travel * 0.22 }
      : { x: -travel, y: travel * 0.22 };
  }
  switch (profile.flow_direction) {
    case 'right-to-left': return { x: -travel, y: travel * 0.08 };
    case 'top-to-bottom': return { x: travel * 0.08, y: travel };
    case 'bottom-to-top': return { x: -travel * 0.08, y: -travel };
    case 'alternate': return index % 2 === 0
      ? { x: travel, y: -travel * 0.28 }
      : { x: -travel, y: travel * 0.28 };
    case 'none': return { x: 0, y: 0 };
    default: return { x: travel, y: -travel * 0.08 };
  }
}

function frame({ offset, x = 0, y = 0, z = 0, scale = 1, brightness = 1, glowRadius = 0, glowColor = null }) {
  return Object.freeze({
    offset,
    opacity: 1,
    transform: Object.freeze({ x, y, z, xPercent: null, scale, skewXDeg: 0, order: 'translate-scale' }),
    appearance: Object.freeze({ brightness, glowRadius, glowColor })
  });
}

function eventOffsets(profile) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 8500);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 6900) / cycleMs, 0.38, 0.94);
  return Object.freeze({
    a: eventFraction * 0.22,
    b: eventFraction * 0.5,
    c: eventFraction * 0.76,
    d: eventFraction,
    end: 1
  });
}

function mainFrames(profile, kind, effect, index) {
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  const tuning = tuningFor(profile);
  const kindTravel = kind === 'price' ? 0.58 : kind === 'section' ? 0.78 : 1;
  const kindScale = kind === 'price' ? 0.62 : kind === 'section' ? 0.78 : 1;
  const kindLight = kind === 'price' ? 1.08 : kind === 'section' ? 0.9 : 1;
  const travel = (Number(profile.travel_px) || 0) * gain * tuning.travel * kindTravel;
  const scaleAmount = (Number(profile.scale_amount) || 0) * gain * tuning.scale * kindScale;
  const light = (Number(profile.brightness_amount) || 0) * gain * tuning.light * kindLight;
  const vector = vectorFor(profile, travel, index);
  const { a, b, c, d, end } = eventOffsets(profile);
  const base = { x: -vector.x * 0.42, y: -vector.y * 0.42, scale: 1 - scaleAmount * 0.16, brightness: 1 };

  if (effect === 'breathe') {
    return [
      frame({ offset: 0, ...base }),
      frame({ offset: a, x: vector.x * 0.08, y: vector.y * 0.08, scale: 1 + scaleAmount * 0.46, brightness: 1 + light * 0.28 }),
      frame({ offset: b, x: vector.x * 0.18, y: vector.y * 0.18, scale: 1 + scaleAmount, brightness: 1 + light * 0.62 }),
      frame({ offset: c, x: -vector.x * 0.08, y: -vector.y * 0.08, scale: 1 + scaleAmount * 0.3, brightness: 1 + light * 0.22 }),
      frame({ offset: d, scale: 1 - scaleAmount * 0.04, brightness: 1 + light * 0.08 }),
      frame({ offset: end, ...base })
    ];
  }

  if (effect === 'focus' || effect === 'pulse' || effect === 'pop') {
    const multiplier = effect === 'pop' ? 1.55 : effect === 'pulse' ? 1.22 : 1;
    return [
      frame({ offset: 0, ...base }),
      frame({ offset: a, x: vector.x * 0.08, y: vector.y * 0.08, scale: 1 + scaleAmount * 0.28, brightness: 1 + light * 0.26 }),
      frame({ offset: b, x: vector.x * 0.22, y: vector.y * 0.22, scale: 1 + scaleAmount * multiplier, brightness: 1 + light }),
      frame({ offset: c, x: -vector.x * 0.05, y: -vector.y * 0.05, scale: 1 + scaleAmount * 0.34, brightness: 1 + light * 0.32 }),
      frame({ offset: d, scale: 1 + scaleAmount * 0.08, brightness: 1 + light * 0.1 }),
      frame({ offset: end, ...base })
    ];
  }

  if (effect === 'glow' || effect === 'shimmer') {
    return [
      frame({ offset: 0, ...base }),
      frame({ offset: a, x: vector.x * 0.08, y: vector.y * 0.08, scale: 1 + scaleAmount * 0.18, brightness: 1 + light * 0.28 }),
      frame({ offset: b, x: vector.x * 0.28, y: vector.y * 0.28, scale: 1 + scaleAmount * 0.42, brightness: 1 + light, glowRadius: 5 + 14 * gain * tuning.light, glowColor: GOLD_SHADOW }),
      frame({ offset: c, x: -vector.x * 0.08, y: -vector.y * 0.08, scale: 1 + scaleAmount * 0.16, brightness: 1 + light * 0.34, glowRadius: 2 + 6 * gain, glowColor: GOLD_SHADOW }),
      frame({ offset: d, brightness: 1 + light * 0.08 }),
      frame({ offset: end, ...base })
    ];
  }

  if (effect === 'lift') {
    return [
      frame({ offset: 0, ...base }),
      frame({ offset: a, x: -vector.x * 0.12, y: Math.abs(vector.y) * 0.12 + travel * 0.1, scale: 1 + scaleAmount * 0.08, brightness: 1 + light * 0.18 }),
      frame({ offset: b, x: vector.x * 0.42, y: -Math.abs(vector.y) * 0.4 - travel * 0.22, scale: 1 + scaleAmount * 0.7, brightness: 1 + light * 0.72 }),
      frame({ offset: c, x: vector.x * 0.1, y: -travel * 0.08, scale: 1 + scaleAmount * 0.22, brightness: 1 + light * 0.24 }),
      frame({ offset: d, x: -vector.x * 0.06, y: travel * 0.03, scale: 1 + scaleAmount * 0.05, brightness: 1 + light * 0.08 }),
      frame({ offset: end, ...base })
    ];
  }

  const cinematic = effect === 'cinematic';
  const peakTravel = cinematic ? 0.78 : 0.92;
  const peakLight = cinematic ? 0.82 : 0.68;
  return [
    frame({ offset: 0, ...base }),
    frame({ offset: a, x: vector.x * 0.16, y: vector.y * 0.16, scale: 1 + scaleAmount * 0.34, brightness: 1 + light * 0.3 }),
    frame({ offset: b, x: vector.x * peakTravel, y: vector.y * peakTravel, scale: 1 + scaleAmount, brightness: 1 + light * peakLight }),
    frame({ offset: c, x: -vector.x * 0.12, y: -vector.y * 0.12, scale: 1 + scaleAmount * 0.28, brightness: 1 + light * 0.24 }),
    frame({ offset: d, x: -vector.x * 0.26, y: -vector.y * 0.26, scale: 1 + scaleAmount * 0.04, brightness: 1 + light * 0.08 }),
    frame({ offset: end, ...base })
  ];
}

function promotionFrames(profile) {
  const gain = clamp(Number(profile.promotion_intensity) || 0, 0, 100) / 100;
  const travel = (Number(profile.promotion_travel_px) || 0) * gain;
  const scale = (Number(profile.promotion_scale_amount) || 0) * gain;
  const brightness = (Number(profile.promotion_brightness_amount) || 0) * gain;
  const glow = (Number(profile.promotion_glow_radius) || 0) * gain;
  const effect = profile.promotion_effect || 'cinematic';
  const cycleMs = Math.max(2000, Number(profile.promotion_cycle_seconds) * 1000 || 4800);
  const eventFraction = clamp((Number(profile.promotion_event_duration_ms) || 1800) / cycleMs, 0.14, 0.82);
  const a = eventFraction * 0.16;
  const b = eventFraction * 0.36;
  const c = eventFraction * 0.56;
  const d = eventFraction * 0.78;

  if (effect === 'none') return null;
  if (effect === 'glow' || effect === 'sweep') {
    return [
      frame({ offset: 0 }),
      frame({ offset: a, brightness: 1 + brightness * 0.3, glowRadius: glow * 0.36, glowColor: GOLD_SHADOW }),
      frame({ offset: b, x: effect === 'sweep' ? travel : 0, scale: 1 + scale * 0.4, brightness: 1 + brightness, glowRadius: glow, glowColor: GOLD_SHADOW }),
      frame({ offset: d, x: effect === 'sweep' ? -travel * 0.22 : 0, scale: 1 + scale * 0.1, brightness: 1 + brightness * 0.26, glowRadius: glow * 0.3, glowColor: GOLD_SHADOW }),
      frame({ offset: eventFraction }),
      frame({ offset: 1 })
    ];
  }

  const bounce = effect === 'bounce';
  const pop = effect === 'pop';
  const pulse = effect === 'pulse';
  const punch = pop ? 1.32 : bounce ? 1.16 : pulse ? 0.86 : 1.06;
  return [
    frame({ offset: 0 }),
    frame({ offset: a, y: travel * 0.22, scale: 1 - scale * 0.14, brightness: 1 + brightness * 0.14, glowRadius: glow * 0.14, glowColor: GOLD_SHADOW }),
    frame({ offset: b, y: -travel, scale: 1 + scale * punch, brightness: 1 + brightness, glowRadius: glow, glowColor: GOLD_SHADOW }),
    frame({ offset: c, y: bounce ? travel * 0.42 : -travel * 0.22, scale: 1 + scale * 0.46, brightness: 1 + brightness * 0.5, glowRadius: glow * 0.62, glowColor: GOLD_SHADOW }),
    frame({ offset: d, y: -travel * 0.08, scale: 1 + scale * 0.14, brightness: 1 + brightness * 0.22, glowRadius: glow * 0.28, glowColor: GOLD_SHADOW }),
    frame({ offset: eventFraction }),
    frame({ offset: 1 })
  ];
}

function orderedIndex(profile, index, count) {
  if (profile.flow_direction === 'right-to-left' || profile.flow_direction === 'bottom-to-top') return Math.max(0, count - index - 1);
  if (profile.flow_direction === 'alternate') return index % 2 === 0 ? Math.floor(index / 2) : Math.ceil(count / 2) + Math.floor(index / 2);
  return index;
}

function targetDelay(profile, index, count, cycleMs) {
  if (!cycleMs || count <= 1) return 0;
  const tuning = tuningFor(profile);
  const pattern = profile.pattern || 'cinematic';
  if (pattern === 'pulse') return 0;
  if (pattern === 'ambient') return -Math.round((index / count) * cycleMs * 0.14);
  if (pattern === 'parallax') return -Math.round((index % 2) * cycleMs * 0.24 + Math.floor(index / 2) * 90);
  const phase = orderedIndex(profile, index, count) * (Number(profile.wave_stagger_ms) || 0) * tuning.phase;
  return -Math.round(phase % cycleMs);
}

function timing(duration, delay, easing) {
  return Object.freeze({ duration, delay, easing, loop: true });
}

function menuTrackFor(node, profile, duration) {
  if (!MAIN_KINDS.has(node.kind)) return null;
  const effect = effectFor(profile, node.kind);
  if (!effect || effect === 'none') return null;
  return Object.freeze({
    node,
    claims: Object.freeze(['transform', 'appearance']),
    keyframes: Object.freeze(mainFrames(profile, node.kind, effect, node.order)),
    timing: timing(duration, targetDelay(profile, node.order, node.count, duration), profile.easing || 'cinematic')
  });
}

export function compileMenuMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Menu motion compiler requires a scene graph.');
  const profile = context.profile || context;
  const duration = Math.max(4000, Number(profile?.cycle_seconds) * 1000 || 8500);
  const tracks = scene.nodes.map((node) => menuTrackFor(node, profile || {}, duration)).filter(Boolean);
  return createSceneProgram({
    id: 'menu-motion',
    duration,
    tracks,
    metadata: { layer: 'menu', profileVersion: Number(profile?.motion_version) || null, backgroundStatic: true, continuous: true }
  });
}

export function compilePromotionMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Promotion motion compiler requires a scene graph.');
  const profile = context.profile || context;
  const duration = Math.max(2000, Number(profile?.promotion_cycle_seconds) * 1000 || 4800);
  const keyframes = promotionFrames(profile || {});
  const promotions = scene.nodes.filter((node) => node.kind === 'promotion');
  const tracks = keyframes ? promotions.map((node) => Object.freeze({
    node,
    claims: Object.freeze(['transform', 'appearance']),
    keyframes: Object.freeze(keyframes),
    timing: timing(duration, -((node.order % 3) * 140), profile?.promotion_easing || 'elastic')
  })) : [];
  return createSceneProgram({
    id: 'promotion-motion',
    duration,
    tracks,
    metadata: { layer: 'menu', role: 'promotion-attention', independent: true }
  });
}

export const DEFAULT_SCENE_COMPILERS = Object.freeze([
  compileMenuMotionProgram,
  compilePromotionMotionProgram
]);

export function compileMotionPlan(scene, profile) {
  const context = Object.freeze({ profile: Object.freeze({ ...(profile || {}) }) });
  const programs = DEFAULT_SCENE_COMPILERS.map((compiler) => compiler(scene, context));
  return composeScenePrograms(scene, programs);
}
