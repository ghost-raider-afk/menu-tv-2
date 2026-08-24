const HEX_COLOR = /^#[0-9A-F]{6}$/i;

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function color(value, fallback) {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

export function normaliseTickerView(ticker = {}) {
  return Object.freeze({
    enabled: ticker?.enabled === true,
    text: typeof ticker?.text === 'string' ? ticker.text.trim().slice(0, 220) : '',
    y_percent: clamp(number(ticker?.y_percent, 91), 0, 100),
    height_percent: clamp(number(ticker?.height_percent, 7), 2, 25),
    font_size_percent: clamp(number(ticker?.font_size_percent, 3.1), 1, 12),
    depth: clamp(Math.round(number(ticker?.depth, 12)), -20, 40),
    direction: ticker?.direction === 'left-to-right' ? 'left-to-right' : 'right-to-left',
    cycle_seconds: clamp(number(ticker?.cycle_seconds, 14), 3, 90),
    text_color: color(ticker?.text_color, '#FFFFFF'),
    background_color: color(ticker?.background_color, '#101828'),
    background_opacity: clamp(Math.round(number(ticker?.background_opacity, 82)), 0, 100)
  });
}

function applyPlacement(placement, ticker) {
  placement.style.top = `${ticker.y_percent}%`;
  placement.style.height = `${ticker.height_percent}%`;
  placement.style.zIndex = String(30 + ticker.depth);
  placement.style.backgroundColor = ticker.background_color;
  placement.style.setProperty('--ticker-background-opacity', String(ticker.background_opacity / 100));
  placement.dataset.tickerDepth = String(ticker.depth);
}

function applyTarget(target, text, ticker) {
  target.dataset.tickerDirection = ticker.direction;
  target.dataset.tickerCycle = String(ticker.cycle_seconds);
  text.textContent = ticker.text;
  text.style.color = ticker.text_color;
  text.style.fontSize = `${ticker.font_size_percent}cqh`;
}

export function renderDomTicker(root, source) {
  if (!(root instanceof Element)) return { visible: false, targetChanged: false, placement: null, target: null };
  const layer = root.querySelector('[data-ticker-layer]');
  if (!(layer instanceof Element)) return { visible: false, targetChanged: false, placement: null, target: null };
  const ticker = normaliseTickerView(source);
  let placement = layer.querySelector(':scope > [data-ticker-placement]');

  if (!ticker.enabled || !ticker.text) {
    const changed = Boolean(placement);
    layer.replaceChildren();
    return { visible: false, targetChanged: changed, placement: null, target: null };
  }

  let targetChanged = false;
  if (!(placement instanceof HTMLElement)) {
    placement = document.createElement('div');
    placement.className = 'motion-ticker-placement';
    placement.dataset.tickerPlacement = '';
    const target = document.createElement('div');
    target.className = 'motion-ticker-target';
    target.dataset.motionTicker = '';
    const text = document.createElement('span');
    text.className = 'motion-ticker-text';
    target.append(text);
    placement.append(target);
    layer.replaceChildren(placement);
    targetChanged = true;
  }

  applyPlacement(placement, ticker);
  const target = placement.querySelector(':scope > [data-motion-ticker]');
  const text = target?.querySelector(':scope > .motion-ticker-text');
  if (target instanceof HTMLElement && text instanceof HTMLElement) applyTarget(target, text, ticker);
  return { visible: true, targetChanged, placement, target };
}

export function updateDomTickerPlacement(root, source) {
  if (!(root instanceof Element)) return null;
  const placement = root.querySelector('[data-ticker-placement]');
  const target = placement?.querySelector(':scope > [data-motion-ticker]');
  const text = target?.querySelector(':scope > .motion-ticker-text');
  if (!(placement instanceof HTMLElement) || !(target instanceof HTMLElement) || !(text instanceof HTMLElement)) return null;
  const ticker = normaliseTickerView(source);
  applyPlacement(placement, ticker);
  applyTarget(target, text, ticker);
  return placement;
}
