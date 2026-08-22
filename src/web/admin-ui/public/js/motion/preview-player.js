const EASING = Object.freeze({
  standard: 'cubic-bezier(.2,.7,.2,1)', smooth: 'cubic-bezier(.16,1,.3,1)', snappy: 'cubic-bezier(.2,.9,.15,1)',
  cinematic: 'cubic-bezier(.22,.61,.36,1)', elastic: 'cubic-bezier(.34,1.56,.64,1)'
});
const GOLD_SHADOW = 'rgba(244,201,21,.72)';
const PROMO_SHADOW = 'rgba(217,45,53,.95)';
const PROMO_ROW_TINT_MAX = 0.18;
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function finiteNumber(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function motionGain(profile) { return Math.sqrt(clamp(Number(profile.intensity) || 0, 0, 100) / 100); }
function formatTime(milliseconds) { return `${(milliseconds / 1000).toFixed(1)} с`; }
function effectFor(profile, kind) { if (kind === 'section') return profile.section_effect; if (kind === 'price') return profile.price_effect; return profile.item_effect; }
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
function transform({ x = 0, y = 0, scale = 1 } = {}) { return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`; }
function baseFrame(offset) { return { offset, opacity: 1, transform: transform(), filter: 'brightness(1)' }; }
function peakFrame(profile, kind, effect, index, offset) {
  const gain = motionGain(profile);
  const travel = (Number(profile.travel_px) || 0) * gain;
  const scaleAmount = (Number(profile.scale_amount) || 0) * gain;
  const brightness = 1 + (Number(profile.brightness_amount) || 0) * gain;
  const vector = vectorFor(profile, travel, index);
  const frame = { offset, opacity: 1, transform: transform(), filter: `brightness(${brightness.toFixed(3)})` };
  if (effect === 'wave') frame.transform = transform({ ...vector, scale: 1 + scaleAmount * 0.45 });
  if (effect === 'lift') frame.transform = transform({ x: vector.x * 0.5, y: vector.y || -travel, scale: 1 + scaleAmount * 0.55 });
  if (effect === 'breathe') frame.transform = transform({ scale: 1 + scaleAmount * 0.72 });
  if (effect === 'focus') frame.transform = transform({ scale: 1 + scaleAmount });
  if (effect === 'pulse') frame.transform = transform({ scale: 1 + scaleAmount * (kind === 'price' ? 1.55 : 1.08) });
  if (effect === 'pop') frame.transform = transform({ scale: 1 + scaleAmount * 1.9 });
  if (effect === 'shimmer') frame.transform = transform({ x: vector.x * 0.3, y: vector.y * 0.3, scale: 1 + scaleAmount * 0.35 });
  if (effect === 'glow' || effect === 'shimmer') {
    const radius = 8 + 28 * gain;
    frame.filter = `brightness(${brightness.toFixed(3)}) drop-shadow(0 0 ${radius.toFixed(1)}px ${GOLD_SHADOW})`;
  }
  return frame;
}
function elementFrames(profile, kind, effect, index) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.05, 0.82);
  return [baseFrame(0), peakFrame(profile, kind, effect, index, eventFraction * 0.5), baseFrame(eventFraction), baseFrame(1)];
}
function orderedIndex(profile, index, count) {
  if (profile.flow_direction === 'right-to-left' || profile.flow_direction === 'bottom-to-top') return Math.max(0, count - index - 1);
  if (profile.flow_direction === 'alternate') return index % 2 === 0 ? Math.floor(index / 2) : Math.ceil(count / 2) + Math.floor(index / 2);
  return index;
}
function targetDelay(profile, index, count, cycleMs) {
  if (profile.pattern === 'ambient' || profile.pattern === 'pulse' || profile.pattern === 'parallax') return 0;
  return cycleMs ? (orderedIndex(profile, index, count) * (Number(profile.wave_stagger_ms) || 0)) % cycleMs : 0;
}
function addAnimation(list, node, keyframes, options) {
  if (!node || typeof node.animate !== 'function') return null;
  const animation = node.animate(keyframes, { iterations: Infinity, fill: 'both', ...options });
  list.push(animation);
  return animation;
}
function shimmerFrames(profile) {
  const cycleMs = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
  const eventFraction = clamp((Number(profile.event_duration_ms) || 1800) / cycleMs, 0.08, 0.72);
  const gain = motionGain(profile);
  return [
    { offset: 0, opacity: 0, transform: 'translateX(0) skewX(-18deg)' },
    { offset: eventFraction * 0.12, opacity: 0, transform: 'translateX(0) skewX(-18deg)' },
    { offset: eventFraction * 0.45, opacity: 0.5 * gain, transform: 'translateX(320%) skewX(-18deg)' },
    { offset: eventFraction, opacity: 0, transform: 'translateX(720%) skewX(-18deg)' },
    { offset: 1, opacity: 0, transform: 'translateX(720%) skewX(-18deg)' }
  ];
}
function animateVisualFx(stage, profile, total, animations) {
  const effect = profile.visual_effect || 'none';
  stage.dataset.visualEffect = effect;
  if (effect === 'none') return;
  const gain = motionGain(profile);
  const easing = EASING[profile.easing] || EASING.smooth;
  if (effect === 'ocean-wave') {
    stage.querySelectorAll('.motion-fx-ocean i').forEach((node, index) => addAnimation(animations, node, [
      { transform: `translate3d(${-6 - index * 3}%,8%,0) scaleY(${0.92 + index * 0.04})`, opacity: 0.22 * gain },
      { transform: `translate3d(${6 + index * 4}%,-7%,0) scaleY(${1.08 - index * 0.03})`, opacity: 0.62 * gain },
      { transform: `translate3d(${-6 - index * 3}%,8%,0) scaleY(${0.92 + index * 0.04})`, opacity: 0.22 * gain }
    ], { duration: total * (index ? 1.15 : 1), easing }));
  } else if (effect === 'aurora') {
    stage.querySelectorAll('.motion-fx-aurora i').forEach((node, index) => addAnimation(animations, node, [
      { transform: `translate3d(${-12 + index * 4}%,-3%,0) rotate(${-9 + index * 7}deg) scale(.92)`, opacity: 0.28 * gain },
      { transform: `translate3d(${18 - index * 5}% ,7%,0) rotate(${8 - index * 5}deg) scale(1.16)`, opacity: 0.74 * gain },
      { transform: `translate3d(${-12 + index * 4}%,-3%,0) rotate(${-9 + index * 7}deg) scale(.92)`, opacity: 0.28 * gain }
    ], { duration: total * (1 + index * 0.12), easing }));
  } else if (effect === 'ripple') {
    stage.querySelectorAll('.motion-fx-ripple i').forEach((node, index) => addAnimation(animations, node, [
      { offset: 0, transform: 'scale(.25)', opacity: 0 }, { offset: 0.12, transform: 'scale(.35)', opacity: 0.7 * gain },
      { offset: 0.52, transform: 'scale(3.8)', opacity: 0.14 * gain }, { offset: 0.72, transform: 'scale(5)', opacity: 0 }, { offset: 1, transform: 'scale(5)', opacity: 0 }
    ], { duration: total, delay: index * total * 0.14, easing: 'cubic-bezier(.16,.8,.25,1)' }));
  } else if (effect === 'sun-sweep') {
    addAnimation(animations, stage.querySelector('.motion-fx-sun i'), [
      { offset: 0, transform: 'translateX(-120%) skewX(-18deg)', opacity: 0 }, { offset: 0.12, opacity: 0 },
      { offset: 0.35, transform: 'translateX(290%) skewX(-18deg)', opacity: 0.78 * gain }, { offset: 0.56, transform: 'translateX(590%) skewX(-18deg)', opacity: 0 },
      { offset: 1, transform: 'translateX(590%) skewX(-18deg)', opacity: 0 }
    ], { duration: total, easing: 'ease-in-out' });
  } else if (effect === 'spotlight') {
    addAnimation(animations, stage.querySelector('.motion-fx-spotlight i'), [
      { transform: 'translate3d(0,0,0) scale(.92)', opacity: 0.35 * gain }, { transform: 'translate3d(95%,15%,0) scale(1.12)', opacity: 0.62 * gain },
      { transform: 'translate3d(48%,58%,0) scale(1)', opacity: 0.48 * gain }, { transform: 'translate3d(0,0,0) scale(.92)', opacity: 0.35 * gain }
    ], { duration: total, easing });
  } else if (effect === 'liquid-glass') {
    addAnimation(animations, stage.querySelector('.motion-fx-glass i'), [
      { offset: 0, transform: 'translateX(-120%) skewX(-10deg) scaleX(.82)', opacity: 0 }, { offset: 0.12, opacity: 0 },
      { offset: 0.34, transform: 'translateX(250%) skewX(-7deg) scaleX(1.08)', opacity: 0.66 * gain }, { offset: 0.6, transform: 'translateX(530%) skewX(-12deg) scaleX(.9)', opacity: 0 },
      { offset: 1, transform: 'translateX(530%) skewX(-12deg) scaleX(.9)', opacity: 0 }
    ], { duration: total, easing });
  }
}
function promoBadgeFrames(style) {
  const peakScale = Number(style.badge_scale) || 1.08;
  const glow = clamp(Number(style.badge_glow) || 0, 0, 1);
  const peakFilter = `brightness(${(1.12 + glow * 0.38).toFixed(2)}) drop-shadow(0 0 ${(10 + glow * 28).toFixed(1)}px ${PROMO_SHADOW}) drop-shadow(0 0 ${(5 + glow * 14).toFixed(1)}px ${GOLD_SHADOW})`;
  if (style.badge_effect === 'static') return [{ opacity: 1, transform: 'scale(1)', filter: peakFilter }];
  if (style.badge_effect === 'glow') return [{ opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }, { opacity: 1, transform: 'scale(1.02)', filter: peakFilter }, { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }];
  if (style.badge_effect === 'pulse') return [{ opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }, { opacity: 1, transform: `scale(${peakScale})`, filter: peakFilter }, { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }];
  return [{ offset: 0, opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }, { offset: 0.22, opacity: 1, transform: `scale(${1 + (peakScale - 1) * 0.55})`, filter: peakFilter }, { offset: 0.48, opacity: 1, transform: 'scale(1)', filter: 'brightness(1.35)' }, { offset: 1, opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }];
}
function promoPriceFrames(effect, glow) {
  const shadow = `brightness(1.35) drop-shadow(0 0 ${(12 + glow * 26).toFixed(1)}px ${GOLD_SHADOW})`;
  if (effect === 'none') return null;
  if (effect === 'glow') return [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.04)', filter: shadow }, { transform: 'scale(1)', filter: 'brightness(1)' }];
  if (effect === 'pop') return [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.22)', filter: shadow }, { transform: 'scale(1)', filter: 'brightness(1)' }];
  return [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.13)', filter: shadow }, { transform: 'scale(1)', filter: 'brightness(1)' }];
}
function animatePromoStyle(stage, profile, animations) {
  const style = profile?.promo_style || {};
  const highlights = [...stage.querySelectorAll('[data-motion-promo-layer="highlight"]')];
  const sweeps = [...stage.querySelectorAll('[data-motion-promo-layer="sweep"]')];
  const badges = [...stage.querySelectorAll('g.promotion-badge-group[data-motion-promo-badge="true"]')];
  const prices = [...stage.querySelectorAll('[data-motion-promo-price="true"]')];
  const baseOpacity = style.enabled === false
    ? 0
    : clamp(finiteNumber(style.row_tint, PROMO_ROW_TINT_MAX), 0, PROMO_ROW_TINT_MAX);
  const rowGlow = clamp(finiteNumber(style.row_glow, 0), 0, 1);
  highlights.forEach((node) => node.setAttribute('opacity', String(baseOpacity)));
  if (style.enabled === false) return;
  const cycleMs = Math.max(3000, Number(style.cycle_seconds) * 1000 || 7500);
  const easing = EASING[profile.easing] || EASING.smooth;
  badges.forEach((node, index) => addAnimation(animations, node, promoBadgeFrames(style), { duration: cycleMs, delay: index * 90, easing }));
  const rowPeak = baseOpacity === 0 ? 0 : clamp(baseOpacity * (1 + rowGlow * 2), baseOpacity, 0.42);
  if (baseOpacity > 0 && (style.row_effect === 'glow' || style.row_effect === 'pulse' || style.row_effect === 'sweep')) {
    highlights.forEach((node, index) => addAnimation(animations, node, [
      { opacity: baseOpacity, filter: 'brightness(1)' },
      { opacity: rowPeak, filter: `brightness(1.3) drop-shadow(0 0 ${(12 + rowGlow * 30).toFixed(1)}px ${PROMO_SHADOW})` },
      { opacity: baseOpacity, filter: 'brightness(1)' }
    ], { duration: cycleMs, delay: index * 120, easing }));
  }
  if (style.row_effect === 'sweep') {
    const sweepMs = clamp(Number(style.sweep_seconds) * 1000 || 1400, 500, Math.max(500, cycleMs * 0.8));
    const sweepFraction = clamp(sweepMs / cycleMs, 0.08, 0.8);
    const start = 0.08;
    const mid = start + sweepFraction * 0.52;
    const end = Math.min(0.94, start + sweepFraction);
    sweeps.forEach((node, index) => addAnimation(animations, node, [
      { offset: 0, opacity: 0, transform: 'translateX(0)' },
      { offset: start, opacity: 0, transform: 'translateX(0)' },
      { offset: mid, opacity: 0.42 + rowGlow * 0.3, transform: 'translateX(250%)' },
      { offset: end, opacity: 0, transform: 'translateX(520%)' },
      { offset: 1, opacity: 0, transform: 'translateX(520%)' }
    ], { duration: cycleMs, delay: index * 220, easing: 'ease-in-out' }));
  }
  const priceFrames = promoPriceFrames(style.price_effect, rowGlow);
  if (priceFrames) prices.forEach((node, index) => addAnimation(animations, node, priceFrames, { duration: cycleMs, delay: index * 110, easing }));
}
function normalized(value) { return String(value || '').trim().toLocaleLowerCase('ru-RU'); }
function findBrandTarget(stage, text) {
  const needle = normalized(text);
  if (!needle) return null;
  const targets = [...stage.querySelectorAll('text[data-brand-target]')];
  return targets.find((node) => normalized(node.textContent).startsWith(needle)) || targets.find((node) => normalized(node.textContent).includes(needle)) || null;
}
function brandOrderRanks(length, order, text) {
  const indexes = Array.from({ length }, (_, index) => index);
  if (order === 'center') indexes.sort((a, b) => Math.abs(a - (length - 1) / 2) - Math.abs(b - (length - 1) / 2));
  if (order === 'wave') indexes.sort((a, b) => ((a % 2) * length + a) - ((b % 2) * length + b));
  if (order === 'random') indexes.sort((a, b) => ((text.charCodeAt(a) * 31 + a * 17) % 97) - ((text.charCodeAt(b) * 31 + b * 17) % 97));
  const ranks = new Array(length);
  indexes.forEach((index, rank) => { ranks[index] = rank; });
  return ranks;
}
function brandDestinations(stage, target, text) {
  const targetText = String(target.textContent || '');
  const start = targetText.toLocaleLowerCase('ru-RU').indexOf(text.toLocaleLowerCase('ru-RU'));
  if (start < 0 || typeof target.getStartPositionOfChar !== 'function' || typeof target.getScreenCTM !== 'function') return null;
  const matrix = target.getScreenCTM();
  const svg = target.ownerSVGElement;
  const stageRect = stage.getBoundingClientRect();
  if (!matrix || !svg) return null;
  return [...text].map((character, offset) => {
    const charIndex = start + offset;
    const point = svg.createSVGPoint();
    const origin = target.getStartPositionOfChar(charIndex);
    const extent = target.getExtentOfChar(charIndex);
    point.x = origin.x + extent.width / 2;
    point.y = origin.y + extent.height / 2;
    const screenPoint = point.matrixTransform(matrix);
    return { character, x: screenPoint.x - stageRect.left, y: screenPoint.y - stageRect.top };
  });
}
function reducedMotion() { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }

export class AnimationPreviewPlayer {
  constructor({ stage, timeline, timeLabel, playButton, pauseButton, replayButton }) {
    this.stage = stage; this.timeline = timeline; this.timeLabel = timeLabel; this.playButton = playButton; this.pauseButton = pauseButton; this.replayButton = replayButton;
    this.animations = []; this.master = null; this.total = 12000; this.raf = null; this.profile = null; this.hasStarted = false;
    this.brandCleanupTimer = null; this.brandIntervalTimer = null; this.brandOverlay = null; this.brandTarget = null; this.bindControls();
  }
  bindControls() {
    this.playButton?.addEventListener('click', () => this.play());
    this.pauseButton?.addEventListener('click', () => this.pause());
    this.replayButton?.addEventListener('click', () => this.replay());
    this.timeline?.addEventListener('input', () => { if (!this.master) return; const value = Number(this.timeline.value) / Number(this.timeline.max || 1000); this.seek(value * this.total); });
  }
  clearBrandOverlay() {
    if (this.brandCleanupTimer) clearTimeout(this.brandCleanupTimer);
    this.brandCleanupTimer = null;
    this.brandOverlay?.remove();
    this.brandOverlay = null;
    if (this.brandTarget) this.brandTarget.style.opacity = '';
    this.brandTarget = null;
  }
  clearBrandTimers() {
    if (this.brandIntervalTimer) clearTimeout(this.brandIntervalTimer);
    this.brandIntervalTimer = null;
    this.clearBrandOverlay();
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.animations.forEach((animation) => animation.cancel());
    this.animations = []; this.master = null;
    this.clearBrandTimers();
    if (this.stage) { delete this.stage.dataset.visualEffect; delete this.stage.dataset.motionMode; }
  }
  shouldRunBrand(reason) {
    const brand = this.profile?.brand_reveal;
    if (!brand?.enabled || !String(brand.text || '').trim() || reducedMotion()) return false;
    if (reason === 'preview') return true;
    return brand.trigger === reason;
  }
  scheduleBrandInterval() {
    const brand = this.profile?.brand_reveal;
    if (!brand?.enabled || brand.trigger !== 'interval' || reducedMotion()) return;
    if (this.brandIntervalTimer) clearTimeout(this.brandIntervalTimer);
    const delay = Math.max(30000, Number(brand.interval_seconds) * 1000 || 300000);
    this.brandIntervalTimer = setTimeout(() => {
      this.brandIntervalTimer = null;
      this.runBrandReveal();
      this.scheduleBrandInterval();
    }, delay);
  }
  runBrandReveal() {
    this.clearBrandOverlay();
    const brand = this.profile?.brand_reveal;
    const text = String(brand?.text || '').trim();
    if (!brand?.enabled || !text || reducedMotion()) return false;
    const target = findBrandTarget(this.stage, text);
    const destinations = target ? brandDestinations(this.stage, target, text) : null;
    if (!target || !destinations?.length) return false;
    const stageRect = this.stage.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const finalFontPx = Math.max(12, targetRect.height * 0.88);
    const startScale = clamp(Number(brand.start_scale) || 2.8, 1, 6);
    const startX = stageRect.width * clamp(Number(brand.start_x_percent) || 50, 0, 100) / 100;
    const startY = stageRect.height * clamp(Number(brand.start_y_percent) || 46, 0, 100) / 100;
    const spacing = finalFontPx * 0.68 * startScale;
    const ranks = brandOrderRanks(destinations.length, brand.order, text);
    const overlay = document.createElement('div');
    overlay.className = 'brand-reveal-overlay';
    Object.assign(overlay.style, { position: 'absolute', inset: '0', zIndex: '8', pointerEvents: 'none', overflow: 'visible' });
    this.stage.style.position ||= 'relative';
    this.stage.append(overlay);
    this.brandOverlay = overlay;
    this.brandTarget = target;
    target.style.opacity = '0';
    const hold = clamp(Number(brand.hold_ms) || 1200, 0, 6000);
    const flight = clamp(Number(brand.flight_ms) || 1600, 400, 6000);
    const stagger = clamp(Number(brand.stagger_ms) || 90, 0, 500);
    const rotation = clamp(Number(brand.rotation_deg) || 0, 0, 45);
    const glow = clamp(Number(brand.glow) || 0, 0, 1);
    const easing = EASING[brand.easing] || EASING.cinematic;
    let maxEnd = 0;
    destinations.forEach((destination, index) => {
      const span = document.createElement('span');
      span.textContent = destination.character;
      const initialX = startX + (index - (destinations.length - 1) / 2) * spacing;
      const initialY = startY;
      Object.assign(span.style, {
        position: 'absolute', left: `${initialX}px`, top: `${initialY}px`, transform: `translate(-50%,-50%) scale(${startScale}) rotate(${index % 2 ? rotation : -rotation}deg)`,
        transformOrigin: 'center', fontFamily: getComputedStyle(target).fontFamily, fontWeight: target.getAttribute('font-weight') || '700', fontSize: `${finalFontPx}px`,
        lineHeight: '1', color: target.getAttribute('fill') || '#FFFFFF', whiteSpace: 'pre', textShadow: `0 0 ${12 + glow * 28}px rgba(244,201,21,${0.45 + glow * 0.45})`
      });
      overlay.append(span);
      const delay = ranks[index] * stagger;
      const duration = hold + flight;
      maxEnd = Math.max(maxEnd, delay + duration);
      const holdOffset = duration ? clamp(hold / duration, 0, 0.88) : 0;
      span.animate([
        { offset: 0, left: `${initialX}px`, top: `${initialY}px`, opacity: 1, transform: `translate(-50%,-50%) scale(${startScale}) rotate(${index % 2 ? rotation : -rotation}deg)` },
        { offset: holdOffset, left: `${initialX}px`, top: `${initialY}px`, opacity: 1, transform: `translate(-50%,-50%) scale(${startScale}) rotate(0deg)` },
        { offset: 1, left: `${destination.x}px`, top: `${destination.y}px`, opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', textShadow: '0 0 0 rgba(244,201,21,0)' }
      ], { duration, delay, easing, fill: 'forwards' });
    });
    this.brandCleanupTimer = setTimeout(() => this.clearBrandOverlay(), maxEnd + 120);
    return true;
  }
  restart(profile, { reason = null } = {}) {
    const resolvedReason = reason || (this.hasStarted ? 'menu-update' : 'player-start');
    if (!reason) this.hasStarted = true;
    this.destroy();
    this.profile = structuredClone(profile || {});
    const intensity = clamp(Number(profile.intensity) || 0, 0, 100);
    this.stage.style.setProperty('--motion-intensity', String(intensity / 100));
    this.stage.dataset.motionMode = 'continuous';
    this.total = Math.max(4000, Number(profile.cycle_seconds) * 1000 || 12000);
    const byKind = {
      section: [...this.stage.querySelectorAll('[data-motion="section"]')],
      item: [...this.stage.querySelectorAll('[data-motion="item"]')],
      price: [...this.stage.querySelectorAll('[data-motion="price"]')]
    };
    for (const [kind, targets] of Object.entries(byKind)) {
      const effect = effectFor(profile, kind);
      if (!effect || effect === 'none') continue;
      targets.forEach((node, index) => addAnimation(this.animations, node, elementFrames(profile, kind, effect, index), {
        duration: this.total, delay: targetDelay(profile, index, targets.length, this.total), easing: EASING[profile.easing] || EASING.smooth
      }));
    }
    const shimmer = this.stage.querySelector('.animation-screen-shimmer');
    if (shimmer && profile.section_effect === 'shimmer') addAnimation(this.animations, shimmer, shimmerFrames(profile), { duration: this.total, easing: 'ease-in-out' });
    animatePromoStyle(this.stage, profile, this.animations);
    animateVisualFx(this.stage, profile, this.total, this.animations);
    this.master = this.stage.animate([{ opacity: 1 }, { opacity: 1 }], { duration: this.total, iterations: Infinity, fill: 'both' });
    this.animations.push(this.master);
    if (reducedMotion()) this.pause();
    else {
      if (this.shouldRunBrand(resolvedReason)) requestAnimationFrame(() => this.runBrandReveal());
      this.scheduleBrandInterval();
    }
    this.updateProgress();
  }
  play() { if (!this.master) return; this.animations.forEach((animation) => animation.play()); this.updateProgress(); }
  pause() { this.animations.forEach((animation) => animation.pause()); this.updateProgress(); }
  replay() { if (!this.master) return; this.animations.forEach((animation) => { animation.currentTime = 0; animation.play(); }); if (this.profile?.brand_reveal?.enabled && !reducedMotion()) this.runBrandReveal(); this.updateProgress(); }
  seek(milliseconds) { const time = Math.max(0, Math.min(this.total, milliseconds)); this.animations.forEach((animation) => { animation.currentTime = time; }); this.pause(); this.renderProgress(time); }
  renderProgress(time) {
    const normalizedTime = this.total ? ((time % this.total) + this.total) % this.total : 0;
    const progress = this.total ? Math.round((normalizedTime / this.total) * 1000) : 0;
    if (this.timeline) this.timeline.value = String(progress);
    if (this.timeLabel) this.timeLabel.textContent = `${formatTime(normalizedTime)} / ${formatTime(this.total)}`;
  }
  updateProgress() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.master) return;
      this.renderProgress(Number(this.master.currentTime) || 0);
      if (this.master.playState === 'running') this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
