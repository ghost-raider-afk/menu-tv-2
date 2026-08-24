import { composeScenePrograms, createSceneProgram } from './scene-composer.js';

const GOLD_SHADOW = 'rgba(244,201,21,.58)';
const MENU_KINDS = new Set(['section', 'item', 'promotion', 'price', 'background']);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function effectFor(profile, kind) {
  if (kind === 'section') return profile.section_effect;
  if (kind === 'item') return profile.item_effect;
  if (kind === 'promotion') return profile.promotion_effect ?? profile.item_effect;
  if (kind === 'price') return profile.price_effect;
  if (kind === 'background') return profile.background_effect;
  return null;
}

function vectorFor(profile, travel, index) {
  switch (profile.flow_direction) {
    case 'right-to-left': return { x: -travel, y: 0 };
    case 'top-to-bottom': return { x: 0, y: travel };
    case 'bottom-to-top': return { x: 0, y: -travel };
    case 'alternate': return index % 2 === 0 ? { x: travel, y: -travel * 0.35 } : { x: -travel, y: travel * 0.35 };
    case 'none': return { x: 0, y: 0 };
    default: return { x: travel, y: 0 };
  }
}

function frame({
  offset,
  opacity = 1,
  x = 0,
  y = 0,
  z = 0,
  xPercent = null,
  scale = 1,
  skewXDeg = 0,
  transformOrder = 'translate-scale',
  brightness = 1,
  glowRadius = 0,
  glowColor = null
}) {
  return Object.freeze({
    offset,
    opacity,
    transform: Object.freeze({ x, y, z, xPercent, scale, skewXDeg, order: transformOrder }),
    appearance: Object.freeze({ brightness, glowRadius, glowColor })
  });
}

function baseFrame(offset) {
  return frame({ offset });
}

function peakFrame(profile, kind, effect, index, offset) {
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  const travel = (Number(profile.travel_px) || 0) * gain;
  const scaleAmount = (Number(profile.scale_amount) || 0) * gain;
  const brightness = 1 + (Number(profile.brightness_amount) || 0) * gain;
  const vector = vectorFor(profile, travel, index);
  const state = { offset, brightness };

  if (effect === 'wave') Object.assign(state, vector, { scale: 1 + scaleAmount * 0.35 });
  if (effect === 'lift') Object.assign(state, { x: vector.x * 0.45, y: vector.y || -travel, scale: 1 + scaleAmount * 0.45 });
  if (effect === 'breathe') state.scale = 1 + scaleAmount * 0.6;
  if (effect === 'focus') state.scale = 1 + scaleAmount;
  if (effect === 'pulse') state.scale = 1 + scaleAmount * (kind === 'price' ? 1.5 : 1);
  if (effect === 'pop') state.scale = 1 + scaleAmount * 1.8;
  if (effect === 'shimmer') Object.assign(state, { x: vector.x * 0.25, y: vector.y * 0.25, scale: 1 + scaleAmount * 0.25 });
  if (effect === 'glow' || effect === 'shimmer' || (kind === 'promotion' && effect === 'pulse')) {
    state.glowRadius = 4 + 18 * gain;
    state.glowColor = GOLD_SHADOW;
  }
  return frame(state);
}

function elementFrames(profile, kind, effect, index) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.05, 0.82);
  const peakOffset = eventFraction * 0.5;
  return [baseFrame(0), peakFrame(profile, kind, effect, index, peakOffset), baseFrame(eventFraction), baseFrame(1)];
}

function orderedIndex(profile, index, count) {
  if (profile.flow_direction === 'right-to-left' || profile.flow_direction === 'bottom-to-top') return Math.max(0, count - index - 1);
  if (profile.flow_direction === 'alternate') return index % 2 === 0 ? Math.floor(index / 2) : Math.ceil(count / 2) + Math.floor(index / 2);
  return index;
}

function targetDelay(profile, index, count, cycleMs) {
  if (profile.pattern === 'ambient' || profile.pattern === 'pulse' || profile.pattern === 'parallax') return 0;
  const phase = orderedIndex(profile, index, count) * (Number(profile.wave_stagger_ms) || 0);
  return cycleMs ? phase % cycleMs : 0;
}

function backgroundFrames(profile) {
  const intensity = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  const travel = (Number(profile.travel_px) || 0) * intensity;
  const depth = (Number(profile.background_zoom_percent) || 0) / 100;
  const baseScale = 1;
  const peakScale = baseScale + depth * Math.max(0.2, intensity);
  if (profile.background_effect === 'breathe' || profile.background_effect === 'zoom') {
    return [
      frame({ offset: 0, scale: baseScale, transformOrder: 'scale-translate' }),
      frame({ offset: 0.5, scale: peakScale, transformOrder: 'scale-translate' }),
      frame({ offset: 1, scale: baseScale, transformOrder: 'scale-translate' })
    ];
  }
  return [
    frame({ offset: 0, x: -travel * 0.45, y: travel * 0.2, scale: baseScale, transformOrder: 'scale-translate' }),
    frame({ offset: 0.5, x: travel, y: -travel * 0.45, scale: peakScale, transformOrder: 'scale-translate' }),
    frame({ offset: 1, x: -travel * 0.45, y: travel * 0.2, scale: baseScale, transformOrder: 'scale-translate' })
  ];
}

function shimmerFrames(profile) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.08, 0.72);
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  return [
    frame({ offset: 0, opacity: 0, xPercent: 0, skewXDeg: -18, transformOrder: 'translate-skew' }),
    frame({ offset: eventFraction * 0.15, opacity: 0, xPercent: 0, skewXDeg: -18, transformOrder: 'translate-skew' }),
    frame({ offset: eventFraction * 0.45, opacity: 0.28 * gain, xPercent: 320, skewXDeg: -18, transformOrder: 'translate-skew' }),
    frame({ offset: eventFraction, opacity: 0, xPercent: 720, skewXDeg: -18, transformOrder: 'translate-skew' }),
    frame({ offset: 1, opacity: 0, xPercent: 720, skewXDeg: -18, transformOrder: 'translate-skew' })
  ];
}

function timing(duration, delay, easing) {
  return Object.freeze({ duration, delay, easing, loop: true });
}

function menuTrackFor(node, profile, duration) {
  if (!MENU_KINDS.has(node.kind)) return null;
  const effect = effectFor(profile, node.kind);
  if (!effect || effect === 'none') return null;
  if (node.kind === 'background') {
    return Object.freeze({
      node,
      claims: Object.freeze(['transform']),
      keyframes: Object.freeze(backgroundFrames(profile)),
      timing: timing(duration, 0, profile.easing || 'smooth')
    });
  }
  return Object.freeze({
    node,
    claims: Object.freeze(['transform', 'opacity', 'appearance']),
    keyframes: Object.freeze(elementFrames(profile, node.kind, effect, node.order)),
    timing: timing(duration, targetDelay(profile, node.order, node.count, duration), profile.easing || 'smooth')
  });
}

export function compileMenuMotionProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Menu motion compiler requires a scene graph.');
  const profile = context.profile || context;
  const duration = Math.max(4000, Number(profile?.cycle_seconds) * 1000 || 12000);
  const tracks = scene.nodes.map((node) => menuTrackFor(node, profile || {}, duration)).filter(Boolean);
  return createSceneProgram({
    id: 'menu-motion',
    duration,
    tracks,
    metadata: { layer: 'menu', profileVersion: Number(profile?.motion_version) || null }
  });
}

export function compileAtmosphereProgram(scene, context = {}) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Atmosphere compiler requires a scene graph.');
  const profile = context.profile || context;
  const duration = Math.max(4000, Number(profile?.cycle_seconds) * 1000 || 12000);
  const shimmer = scene.nodes.find((node) => node.kind === 'shimmer');
  const enabled = shimmer && profile?.section_effect === 'shimmer';
  const tracks = enabled ? [Object.freeze({
    node: shimmer,
    claims: Object.freeze(['transform', 'opacity']),
    keyframes: Object.freeze(shimmerFrames(profile)),
    timing: timing(duration, 0, 'ease-in-out')
  })] : [];
  return createSceneProgram({
    id: 'atmosphere',
    duration,
    tracks,
    metadata: { layer: 'atmosphere' }
  });
}

export const DEFAULT_SCENE_COMPILERS = Object.freeze([
  compileMenuMotionProgram,
  compileAtmosphereProgram
]);

export function compileMotionPlan(scene, profile) {
  const context = Object.freeze({ profile: Object.freeze({ ...(profile || {}) }) });
  const programs = DEFAULT_SCENE_COMPILERS.map((compiler) => compiler(scene, context));
  return composeScenePrograms(scene, programs);
}
