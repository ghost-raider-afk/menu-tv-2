import { buildDisplayLines, buildRenderLayout, buildRenderModel, buildTableSvg } from '../editor/renderer.js';
import { parseResolution } from '../editor/settings.js';

function applyTypography(stage, layout) {
  const svg = stage.querySelector('svg.menu-table-svg');
  if (!(svg instanceof SVGElement)) return;
  svg.style.fontFamily = layout.typography.family;
  svg.style.fontWeight = String(layout.typography.weightFloor || 400);
  svg.dataset.fontKey = layout.typography.key;
}

function markMotionTarget(node, kind, order = null, count = null) {
  if (!(node instanceof SVGElement)) return;
  node.dataset.motion = kind;
  if (Number.isInteger(order)) node.dataset.motionOrder = String(order);
  if (Number.isInteger(count) && count > 0) node.dataset.motionCount = String(count);
}

function markMotionTargets(stage) {
  const sections = [...stage.querySelectorAll('g.table-section')];
  sections.forEach((node, index) => markMotionTarget(node, 'section', index, sections.length));

  const rows = [...stage.querySelectorAll('g.table-item, g.table-packaging')];
  rows.forEach((row, index) => {
    if (row.classList.contains('table-packaging')) {
      markMotionTarget(row, 'item', index, rows.length);
      return;
    }
    const content = row.querySelector(':scope > g.table-item-content');
    const promotion = row.querySelector(':scope > g.promotion-badge');
    markMotionTarget(content, 'item', index, rows.length);
    markMotionTarget(promotion, 'promotion', index, rows.length);
  });

  const prices = [...stage.querySelectorAll('text.price, text.packaging-price')];
  prices.forEach((node, index) => markMotionTarget(node, 'price', index, prices.length));
}

function backgroundStyle(layer, model, palette) {
  layer.style.backgroundColor = palette.background;
  layer.style.backgroundImage = model.settings.background_image_url ? `url("${model.settings.background_image_url}")` : '';
  layer.style.backgroundSize = 'cover';
  layer.style.backgroundPosition = 'center';
}

export function renderAnimationScreenPreview(stage, bundle) {
  if (!stage) return null;
  const screen = bundle?.screen;
  const draft = bundle?.draft || { rows: [], settings: {} };
  const resolution = parseResolution(screen?.resolution);

  if (!resolution) {
    stage.classList.add('is-invalid-resolution');
    stage.style.aspectRatio = '16 / 9';
    stage.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'animation-screen-empty',
      textContent: 'У экрана некорректное разрешение.'
    }));
    return { invalidResolution: true };
  }

  stage.classList.remove('is-invalid-resolution');
  const editorState = { rows: draft.rows || [], settings: draft.settings || {} };
  const model = buildRenderModel(editorState, resolution);
  const lines = buildDisplayLines(model, {
    products: bundle?.products || [],
    packaging: bundle?.packaging || [],
    fallbackTitle: 'Новый раздел'
  });
  const layout = buildRenderLayout(model, lines);

  stage.style.aspectRatio = `${model.viewport.width} / ${model.viewport.height}`;
  stage.dataset.screenId = String(screen.id);
  stage.dataset.menuFits = layout.vertical.fits ? 'true' : 'false';
  stage.dataset.fontKey = layout.typography.key;
  stage.innerHTML = `
    <div class="animation-screen-background" data-motion-background></div>
    <div class="animation-screen-canvas">${buildTableSvg(model, lines, layout)}</div>
    <div class="animation-screen-vignette" aria-hidden="true"></div>
    <div class="animation-screen-shimmer" aria-hidden="true"></div>`;

  backgroundStyle(stage.querySelector('.animation-screen-background'), model, layout.palette);
  applyTypography(stage, layout);
  markMotionTargets(stage);

  return { model, lines, layout };
}

export function renderAnimationScreenEmpty(stage, message = 'Создайте монитор, чтобы просматривать его анимацию.') {
  if (!stage) return;
  delete stage.dataset.screenId;
  stage.style.aspectRatio = '16 / 9';
  stage.replaceChildren(Object.assign(document.createElement('p'), {
    className: 'animation-screen-empty',
    textContent: message
  }));
}
