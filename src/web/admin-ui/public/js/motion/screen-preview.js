import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../editor/renderer.js';
import { parseResolution } from '../editor/settings.js';

function applyTypography(stage, layout) {
  const svg = stage.querySelector('svg.menu-table-svg');
  if (!(svg instanceof SVGElement)) return;
  svg.style.fontFamily = layout.typography.family;
  svg.style.fontWeight = String(layout.typography.weightFloor || 400);
  svg.dataset.fontKey = layout.typography.key;
}
function markPromotionTargets(stage) {
  stage.querySelectorAll('text.promotion').forEach((label) => {
    label.dataset.motion = 'promotion';
    label.style.transformBox = 'fill-box';
    label.style.transformOrigin = 'center';
    const shape = label.previousElementSibling;
    if (shape?.tagName?.toLowerCase() === 'path') {
      shape.dataset.motion = 'promotion';
      shape.style.transformBox = 'fill-box';
      shape.style.transformOrigin = 'center';
    }
    const row = label.closest('g.table-item');
    row?.querySelectorAll('text.price').forEach((price) => { price.dataset.promotionPrice = 'true'; });
  });
}
function markMotionTargets(stage) {
  stage.querySelectorAll('g.table-section').forEach((node) => { node.dataset.motion = 'section'; });
  stage.querySelectorAll('g.table-item, g.table-packaging').forEach((node) => { node.dataset.motion = 'item'; });
  stage.querySelectorAll('text.price, text.packaging-price').forEach((node) => { node.dataset.motion = 'price'; });
  markPromotionTargets(stage);
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
  markMotionTargets(stage);
  return { model, lines, layout };
}

export function renderAnimationScreenEmpty(stage, message = 'Создайте монитор, чтобы просматривать его анимацию.') {
  if (!stage) return;
  delete stage.dataset.screenId;
  delete stage.dataset.visualEffect;
  stage.style.aspectRatio = '16 / 9';
  stage.replaceChildren(Object.assign(document.createElement('p'), { className: 'animation-screen-empty', textContent: message }));
}
