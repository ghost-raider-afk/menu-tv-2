import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../editor/renderer.js';
import { parseResolution } from '../editor/settings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyTypography(stage, layout) {
  const svg = stage.querySelector('svg.menu-table-svg');
  if (!(svg instanceof SVGElement)) return;
  svg.style.fontFamily = layout.typography.family;
  svg.style.fontWeight = String(layout.typography.weightFloor || 400);
  svg.dataset.fontKey = layout.typography.key;
}

function setSvgAttribute(node, name, value) {
  node.setAttribute(name, String(value));
}

function composePromoBadge(row) {
  if (!row) return null;
  const existing = row.querySelector('g.promotion-badge-group');
  if (existing) return existing;

  const shape = row.querySelector('path.promotion-badge');
  const label = row.querySelector('text.promotion');
  if (!shape || !label || shape.parentNode !== row || label.parentNode !== row) return null;

  const group = document.createElementNS(SVG_NS, 'g');
  group.classList.add('promotion-badge-group');
  row.insertBefore(group, shape);
  group.append(shape, label);
  return group;
}

function injectPromoRowLayer(row, box) {
  if (!row || !box || row.querySelector('.promotion-row-highlight')) return;
  const separator = row.querySelector('line.separator');
  const left = Number(separator?.getAttribute('x1'));
  const right = Number(separator?.getAttribute('x2'));
  const top = Number(box.top);
  const height = Number(box.height);
  if (![left, right, top, height].every(Number.isFinite) || right <= left || height <= 0) return;
  const width = right - left;

  const highlight = document.createElementNS(SVG_NS, 'rect');
  highlight.classList.add('promotion-row-highlight');
  setSvgAttribute(highlight, 'x', left);
  setSvgAttribute(highlight, 'y', top);
  setSvgAttribute(highlight, 'width', width);
  setSvgAttribute(highlight, 'height', height);
  setSvgAttribute(highlight, 'rx', 6);
  setSvgAttribute(highlight, 'fill', '#D92D35');
  setSvgAttribute(highlight, 'opacity', 0);
  highlight.dataset.motionPromoLayer = 'highlight';

  const sweep = document.createElementNS(SVG_NS, 'rect');
  sweep.classList.add('promotion-row-sweep');
  setSvgAttribute(sweep, 'x', left - width * 0.32);
  setSvgAttribute(sweep, 'y', top);
  setSvgAttribute(sweep, 'width', width * 0.28);
  setSvgAttribute(sweep, 'height', height);
  setSvgAttribute(sweep, 'rx', 6);
  setSvgAttribute(sweep, 'fill', '#F6C90E');
  setSvgAttribute(sweep, 'opacity', 0);
  sweep.dataset.motionPromoLayer = 'sweep';

  row.insertBefore(sweep, row.firstChild);
  row.insertBefore(highlight, row.firstChild);
  row.dataset.motionPromoRow = 'true';
  row.style.transformBox = 'fill-box';
  row.style.transformOrigin = 'center';
}

function markPromotionTargets(stage, lines, layout) {
  const itemRows = [...stage.querySelectorAll('g.table-item')];
  let itemRowIndex = 0;
  lines.forEach((line, lineIndex) => {
    if (line.kind !== 'item') return;
    const row = itemRows[itemRowIndex];
    itemRowIndex += 1;
    if (!row || line.promotion !== true) return;

    const badge = composePromoBadge(row);
    if (badge) {
      badge.dataset.motionPromoBadge = 'true';
      badge.style.transformBox = 'fill-box';
      badge.style.transformOrigin = 'center';
    }

    injectPromoRowLayer(row, layout?.vertical?.boxes?.[lineIndex]);
    row.querySelectorAll('text.price').forEach((price) => {
      price.dataset.motionPromoPrice = 'true';
      price.style.transformBox = 'fill-box';
      price.style.transformOrigin = 'center';
    });
  });
}

function markBrandTargets(stage) {
  stage.querySelectorAll('text.item-name').forEach((node, index) => {
    node.dataset.brandTarget = String(index);
  });
}

function markMotionTargets(stage, lines, layout) {
  stage.querySelectorAll('g.table-section').forEach((node) => { node.dataset.motion = 'section'; });
  stage.querySelectorAll('g.table-item, g.table-packaging').forEach((node) => { node.dataset.motion = 'item'; });
  stage.querySelectorAll('text.price, text.packaging-price').forEach((node) => { node.dataset.motion = 'price'; });
  markPromotionTargets(stage, lines, layout);
  markBrandTargets(stage);
}

function backgroundStyle(layer, model, palette, overrideUrl = null) {
  if (!layer) return;
  const backgroundUrl = overrideUrl === null ? model.settings.background_image_url : overrideUrl;
  layer.style.backgroundColor = palette.background;
  layer.style.backgroundImage = backgroundUrl ? `url(${JSON.stringify(backgroundUrl)})` : '';
  layer.style.backgroundSize = '100% 100%';
  layer.style.backgroundPosition = 'center';
}

function visualFxMarkup() {
  return `<div class="animation-screen-fx" data-motion-fx aria-hidden="true">
    <div class="motion-fx motion-fx-ocean"><i></i><i></i></div>
    <div class="motion-fx motion-fx-aurora"><i></i><i></i><i></i></div>
    <div class="motion-fx motion-fx-ripple"><i></i><i></i><i></i></div>
    <div class="motion-fx motion-fx-sun"><i></i></div>
    <div class="motion-fx motion-fx-spotlight"><i></i></div>
    <div class="motion-fx motion-fx-glass"><i></i></div>
  </div>`;
}

export function renderAnimationScreenPreview(stage, bundle, { fallbackTitle = 'Новый раздел', backgroundUrl = null } = {}) {
  if (!stage) return null;
  const screen = bundle?.screen;
  const draft = bundle?.draft || { rows: [], settings: {} };
  const resolution = parseResolution(screen?.resolution);
  if (!resolution) {
    stage.classList.add('is-invalid-resolution');
    stage.style.aspectRatio = '16 / 9';
    stage.replaceChildren(Object.assign(document.createElement('p'), { className: 'animation-screen-empty', textContent: 'У экрана некорректное разрешение.' }));
    return { invalidResolution: true };
  }
  stage.classList.remove('is-invalid-resolution');
  const editorState = { rows: draft.rows || [], settings: draft.settings || {} };
  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, { products: bundle?.products || [], packaging: bundle?.packaging || [], fallbackTitle });
  const layout = buildRenderLayout(model, lines);
  stage.style.aspectRatio = `${model.viewport.width} / ${model.viewport.height}`;
  stage.dataset.screenId = String(screen.id);
  stage.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
  stage.dataset.fontKey = layout.typography.key;
  stage.innerHTML = `
    <div class="animation-screen-background"></div>
    <div class="animation-screen-canvas">${buildTableSvg(model, lines, layout)}</div>
    ${visualFxMarkup()}
    <div class="animation-screen-vignette" aria-hidden="true"></div>
    <div class="animation-screen-shimmer" aria-hidden="true"></div>`;
  backgroundStyle(stage.querySelector('.animation-screen-background'), model, layout.palette, backgroundUrl);
  applyTypography(stage, layout);
  markMotionTargets(stage, lines, layout);
  return { model, lines, layout };
}

export function renderAnimationScreenEmpty(stage, message = 'Создайте монитор, чтобы просматривать его анимацию.') {
  if (!stage) return;
  delete stage.dataset.screenId;
  delete stage.dataset.visualEffect;
  stage.style.aspectRatio = '16 / 9';
  stage.replaceChildren(Object.assign(document.createElement('p'), { className: 'animation-screen-empty', textContent: message }));
}
