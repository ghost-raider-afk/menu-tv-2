import { composeScenePrograms, createSceneProgram } from './scene-composer.js';

const GOLD_SHADOW = 'rgba(244,201,21,.72)';
const MAIN_KINDS = new Set(['section', 'item', 'price']);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function effectFor(profile, kind) {
  if (kind === 'section') return profile.section_effect;
  if (kind === 'item') return profile.item_effect;
  if (kind === 'price') return profile.price_effect;
  return null;
}

function vectorFor(profile, travel, index) {
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

function mainFrames(profile, kind, effect, index) {
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  const travel = (Number(profile.travel_px) || 0) * gain;
  const scaleAmount = (Number(profile.scale_amount) || 0) * gain;
  const light = (Number(profile.brightness_amount) || 0) * gain;
  const vector = vectorFor(profile, travel, index);
  const priceGain = kind === 'price' ? 0.72 : 1;
  const sectionGain = kind === 'section' ? 0.82 : 1;
  const movementGain = priceGain * sectionGain;
  const x = vector.x * movementGain;
  const y = vector.y * movementGain;
  const scale = scaleAmount * movementGain;
  const brightness = light * (kind === 'price' ? 1.15 : 1);

  if (effect === 'breathe') {
    return [
      frame({ offset: 0, scale: 1 - scale * 0.18, brightness: 1 }),
      frame({ offset: 0.32, scale: 1 + scale * 0.72, brightness: 1 + brightness * 0.5 }),
      frame({ offset: 0.68, scale: 1 + scale * 0.18, brightness: 1 + brightness * 0.22 }),
      frame({ offset: 1, scale: 1 - scale * 0.18, brightness: 1 })
    ];
  }

  if (effect === 'focus' || effect === 'pulse' || effect === 'pop') {
    const multiplier = effect === 'pop' ? 1.55 : effect === 'pulse' ? 1.2 : 1;
    return [
      frame({ offset: 0, scale: 1 - scale * 0.12, brightness: 1 }),
      frame({ offset: 0.42, scale: 1 + scale * multiplier, brightness: 1 + brightness }),
      frame({ offset: 0.72, scale: 1 + scale * 0.2, brightness: 1 + brightness * 0.3 }),
      frame({ offset: 1, scale: 1 - scale * 0.12, brightness: 1 })
    ];
  }

  if (effect === 'glow' || effect === 'shimmer') {
    return [
      frame({ offset: 0, x: -x * 0.2, y: -y * 0.2, brightness: 1 }),
      frame({ offset: 0.38, x: x * 0.25, y: y * 0.25, scale: 1 + scale * 0.35, brightness: 1 + brightness, glowRadius: 4 + 10 * gain, glowColor: GOLD_SHADOW }),
      frame({ offset: 0.72, x: -x * 0.08, y: -y * 0.08, scale: 1 + scale * 0.12, brightness: 1 + brightness * 0.28 }),
      frame({ offset: 1, x: -x * 0.2, y: -y * 0.2, brightness: 1 })
    ];
  }

  if (effect === 'lift') {
    return [
      frame({ offset: 0, x: -x * 0.34, y: Math.abs(y) * 0.16 + travel * 0.12, scale: 1 - scale * 0.12, brightness: 1 }),
      frame({ offset: 0.36, x: x * 0.34, y: -Math.abs(y) * 0.36 - travel * 0.18, scale: 1 + scale * 0.58, brightness: 1 + brightness * 0.62 }),
      frame({ offset: 0.7, x: x * 0.08, y: -travel * 0.05, scale: 1 + scale * 0.12, brightness: 1 + brightness * 0.2 }),
      frame({ offset: 1, x: -x * 0.34, y: Math.abs(y) * 0.16 + travel * 0.12, scale: 1 - scale * 0.12, brightness: 1 })
    ];
  }

  const cinematic = effect === 'cinematic';
  const drift = cinematic ? 0.62 : 0.78;
  const lightGain = cinematic ? 0.78 : 0.58;
  return [
    frame({ offset: 0, x: -x * 0.42, y: -y * 0.42, scale: 1 - scale * 0.16, brightness: 1 }),
    frame({ offset: 0.24, x: x * 0.18, y: y * 0.18, scale: 1 + scale * 0.38, brightness: 1 + brightness * 0.32 }),
    frame({ offset: 0.5, x: x * drift, y: y * drift, scale: 1 + scale, brightness: 1 + brightness * lightGain }),
    frame({ offset: 0.76, x: -x * 0.06, y: -y * 0.06, scale: 1 + scale * 0.25, brightness: 1 + brightness * 0.22 }),
    frame({ offset: 1, x: -x * 0.42, y: -y * 0.42, scale: 1 - scale * 0.16, brightness: 1 })
  ];
}

function promotionFrames(profile) {
  const gain = clamp(Number(profile.promotion_intensity) || 0, 0, 100) / 100;
  const travel = (Number(profile.promotion_travel_px) || 0) * gain;
  const scale = (Number(profile.promotion_scale_amount) || 0) * gain;
  const brightness = (Number(profile.promotion_brightness_amount) || 0) * gain;
  const glow = (Number(profile.promotion_glow_radius) || 0) * gain;
  const effect = profile.promotion_effect || 'cinematic';
  const cycleMs = Math.max(2000, Number(profile.promotion_cycle_seconds) * 1000 || 5500);
  const eventFraction = clamp((Number(profile.promotion_event_duration_ms) || 1700) / cycleMs, 0.12, 0.82);
  const a = eventFraction * 0.16;
  const b = eventFraction * 0.36;
  const c = eventFraction * 0.56;
  const d = eventFraction * 0.78;

  if (effect === 'none') return null;
  if (effect === 'glow' || effect === 'sweep') {
    return [
      frame({ offset: 0 }),
      frame({ offset: a, brightness: 1 + brightness * 0.28, glowRadius: glow * 0.35, glowColor: GOLD_SHADOW }),
      frame({ offset: b, x: effect === 'sweep' ? travel : 0, scale: 1 + scale * 0.36, brightness: 1 + brightness, glowRadius: glow, glowColor: GOLD_SHADOW }),
      frame({ offset: d, x: effect === 'sweep' ? -travel * 0.2 : 0, scale: 1 + scale * 0.08, brightness: 1 + brightness * 0.25, glowRadius: glow * 0.28, glowColor: GOLD_SHADOW }),
      frame({ offset: eventFraction }),
      frame({ offset: 1 })
    ];
  }

  const bounce = effect === 'bounce';
  const pop = effect === 'pop';
  const pulse = effect === 'pulse';
  const punch = pop ? 1.28 : bounce ? 1.12 : pulse ? 0.82 : 1;
  return [
    frame({ offset: 0 }),
    frame({ offset: a, y: travel * 0.18, scale: 1 - scale * 0.12, brightness: 1 + brightness * 0.12, glowRadius: glow * 0.12, glowColor: GOLD_SHADOW }),
    frame({ offset: b, y: -travel, scale: 1 + scale * punch, brightness: 1 + brightness, glowRadius: glow, glowColor: GOLD_SHADOW }),
    frame({ offset: c, y: bounce ? travel * 0.38 : -travel * 0.2, scale: 1 + scale * 0.42, brightness: 1 + brightness * 0.48, glowRadius: glow * 0.58, glowColor: GOLD_SHADOW }),
    frame({ offset: d, y: -travel * 0.08, scale: 1 + scale * 0.12, brightness: 1 + brightness * 0.2, glowRadius: glow * 0.24, glowColor: GOLD_SHADOW }),
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
  const phase = orderedIndex(profile, index, count) * (Number(profile.wave_stagger_ms) || 0);
  return cycleMs ? phase % cycleMs : 0;
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
  const duration = Math.max(4000, Number(profile?.cycle_seconds) * 1000 || 9000);
  const tracks = scene.nodes.map((node) => menuTrackFor(node, profile || {}, duration)).filter(Boolean);
  return createSceneProgram({
    id: 'menu-motion',
    duration,
    tracks,
    metadata: { layer: 'menu', profileVersion: Number(profile?.motion_version) || null, backgroundStatic: true }
  });
}

export function compilePromotionMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Promotion motion compiler requires a scene graph.');
  const profile = context.profile || context;
  const duration = Math.max(2000, Number(profile?.promotion_cycle_seconds) * 1000 || 5500);
  const keyframes = promotionFrames(profile || {});
  const promotions = scene.nodes.filter((node) => node.kind === 'promotion');
  const tracks = keyframes ? promotions.map((node) => Object.freeze({
    node,
    claims: Object.freeze(['transform', 'appearance']),
    keyframes: Object.freeze(keyframes),
    timing: timing(duration, (node.order % 3) * 120, profile?.promotion_easing || 'elastic')
  })) : [];
  return createSceneProgram({
    id: 'promotion-motion',
    duration,
    tracks,
    metadata: { layer: 'menu', role: 'promotion-attention' }
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
