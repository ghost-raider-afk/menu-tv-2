const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.7,.2,1)',
  smooth: 'cubic-bezier(.16,1,.3,1)',
  snappy: 'cubic-bezier(.2,.9,.15,1)',
  cinematic: 'cubic-bezier(.22,.61,.36,1)',
  elastic: 'cubic-bezier(.34,1.56,.64,1)'
});

const GOLD_SHADOW = 'rgba(244,201,21,.58)';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function effectFor(profile, kind) {
  if (kind === 'section') return profile.section_effect;
  if (kind === 'price') return profile.price_effect;
  if (kind === 'background') return profile.background_effect;
  if (kind === 'shimmer') return profile.section_effect === 'shimmer' ? 'shimmer' : 'none';
  return profile.item_effect;
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

function transform({ x = 0, y = 0, z = 0, scale = 1 } = {}) {
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

function baseFrame(offset) {
  return { offset, opacity: 1, transform: transform(), filter: 'brightness(1)' };
}

function peakFrame(profile, kind, effect, index, offset) {
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  const travel = (Number(profile.travel_px) || 0) * gain;
  const scaleAmount = (Number(profile.scale_amount) || 0) * gain;
  const brightness = 1 + (Number(profile.brightness_amount) || 0) * gain;
  const vector = vectorFor(profile, travel, index);
  const frame = { offset, opacity: 1, transform: transform(), filter: `brightness(${brightness.toFixed(3)})` };

  if (effect === 'wave') frame.transform = transform({ ...vector, scale: 1 + scaleAmount * 0.35 });
  if (effect === 'lift') frame.transform = transform({ x: vector.x * 0.45, y: vector.y || -travel, scale: 1 + scaleAmount * 0.45 });
  if (effect === 'breathe') frame.transform = transform({ scale: 1 + scaleAmount * 0.6 });
  if (effect === 'focus') frame.transform = transform({ scale: 1 + scaleAmount });
  if (effect === 'pulse') frame.transform = transform({ scale: 1 + scaleAmount * (kind === 'price' ? 1.5 : 1) });
  if (effect === 'pop') frame.transform = transform({ scale: 1 + scaleAmount * 1.8 });
  if (effect === 'shimmer') frame.transform = transform({ x: vector.x * 0.25, y: vector.y * 0.25, scale: 1 + scaleAmount * 0.25 });
  if (effect === 'glow' || effect === 'shimmer') {
    const radius = 4 + 18 * gain;
    frame.filter = `brightness(${brightness.toFixed(3)}) drop-shadow(0 0 ${radius.toFixed(1)}px ${GOLD_SHADOW})`;
  }
  return frame;
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
  const baseScale = 1.035 + depth * 0.35;
  const peakScale = baseScale + depth * Math.max(0.2, intensity);
  const base = `scale(${baseScale.toFixed(4)}) translate3d(0,0,0)`;
  if (profile.background_effect === 'breathe' || profile.background_effect === 'zoom') {
    return [{ transform: base }, { transform: `scale(${peakScale.toFixed(4)}) translate3d(0,0,0)` }, { transform: base }];
  }
  return [
    { transform: `scale(${baseScale.toFixed(4)}) translate3d(${-travel * 0.45}px, ${travel * 0.2}px, 0)` },
    { transform: `scale(${peakScale.toFixed(4)}) translate3d(${travel}px, ${-travel * 0.45}px, 0)` },
    { transform: `scale(${baseScale.toFixed(4)}) translate3d(${-travel * 0.45}px, ${travel * 0.2}px, 0)` }
  ];
}

function shimmerFrames(profile) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.08, 0.72);
  const gain = clamp(Number(profile.intensity) || 0, 0, 100) / 100;
  return [
    { offset: 0, opacity: 0, transform: 'translateX(0) skewX(-18deg)' },
    { offset: eventFraction * 0.15, opacity: 0, transform: 'translateX(0) skewX(-18deg)' },
    { offset: eventFraction * 0.45, opacity: 0.28 * gain, transform: 'translateX(320%) skewX(-18deg)' },
    { offset: eventFraction, opacity: 0, transform: 'translateX(720%) skewX(-18deg)' },
    { offset: 1, opacity: 0, transform: 'translateX(720%) skewX(-18deg)' }
  ];
}

function trackFor(node, profile, duration) {
  const effect = effectFor(profile, node.kind);
  if (!effect || effect === 'none') return null;
  if (node.kind === 'background') {
    return Object.freeze({
      node,
      channel: 'transform',
      keyframes: Object.freeze(backgroundFrames(profile)),
      timing: Object.freeze({ duration, delay: 0, easing: EASING[profile.easing] || EASING.smooth, iterations: Infinity, fill: 'both' })
    });
  }
  if (node.kind === 'shimmer') {
    return Object.freeze({
      node,
      channel: 'atmosphere',
      keyframes: Object.freeze(shimmerFrames(profile)),
      timing: Object.freeze({ duration, delay: 0, easing: 'ease-in-out', iterations: Infinity, fill: 'both' })
    });
  }
  const frameKind = node.kind === 'promotion' ? 'item' : node.kind;
  return Object.freeze({
    node,
    channel: 'motion',
    keyframes: Object.freeze(elementFrames(profile, frameKind, effect, node.order)),
    timing: Object.freeze({
      duration,
      delay: targetDelay(profile, node.order, node.count, duration),
      easing: EASING[profile.easing] || EASING.smooth,
      iterations: Infinity,
      fill: 'both'
    })
  });
}

export function compileMotionPlan(scene, profile) {
  if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Motion plan requires a scene graph.');
  const duration = Math.max(4000, Number(profile?.cycle_seconds) * 1000 || 12000);
  const tracks = scene.nodes.map((node) => trackFor(node, profile || {}, duration)).filter(Boolean);
  const owners = new Map();
  for (const track of tracks) {
    const key = `${track.node.id}:${track.channel}`;
    if (owners.has(key)) throw new Error(`Motion channel has multiple owners: ${key}`);
    owners.set(key, track.node.transformOwner);
  }
  return Object.freeze({
    version: 3,
    duration,
    profile: Object.freeze({ ...(profile || {}) }),
    tracks: Object.freeze(tracks),
    clock: Object.freeze({ duration, iterations: Infinity, fill: 'both' })
  });
}
